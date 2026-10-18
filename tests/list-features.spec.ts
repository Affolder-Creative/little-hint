import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { login, post } from "./browser-helpers";

// Browser contexts fetch the app assets independently. Respect the real server
// limiter rather than disabling it for this suite.
test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/health");
  if (
    response.status() === 429 ||
    Number(response.headers()["x-ratelimit-remaining"]) < 120
  ) {
    test.setTimeout(Math.max(test.info().timeout, 120000));
    const seconds = Math.min(
      60,
      Number(response.headers()["x-ratelimit-reset"]) || 60,
    );
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
});

test("list dates lock at sharing, archives restore, and controls fit desktop and mobile", async ({
  page,
}) => {
  await login(page, "alex@example.test");
  await mkdir("test-results/visual", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/lists");
  await page
    .getByRole("button", { name: "Create a list", exact: true })
    .click();
  const title = `Birthday planning ${Date.now()}`;
  await page.getByLabel("List name", { exact: true }).fill(title);
  await page
    .getByLabel("Reveal gifts after", { exact: true })
    .fill("2099-10-18");
  await page.getByLabel("Archive after", { exact: true }).fill("2099-10-20");
  await page
    .getByLabel("List timezone", { exact: true })
    .selectOption("America/New_York");
  await page
    .getByLabel("Reveal purchased exchange gifts after this date", {
      exact: true,
    })
    .check();
  await page.getByLabel("The Morgan circle", { exact: true }).check();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page
      .getByLabel("Reveal gifts after", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/visual/list-dates-${name}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page }).include("dialog").analyze();
    expect(result.violations).toEqual([]);
  }
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create list", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("link", { name: new RegExp(title) }).click();
  const world = await (await page.request.get("/api/v1/world")).json();
  const list = world.lists.find((l: any) => l.name === title);
  expect(
    (await page.request.get(`/api/v1/lists/${list.id}/gift-summary`)).status(),
  ).toBe(409);
  await page
    .getByRole("button", { name: "List settings", exact: true })
    .click();
  await expect(
    page.getByLabel("List timezone", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Reveal purchased exchange gifts after this date", {
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Reveal gifts after", { exact: true }),
  ).toHaveAttribute("min", "2099-10-18");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Archive list", exact: true }).click();
  await expect(
    page.getByText(
      "This list is archived. Existing purchase history is preserved.",
    ),
  ).toBeVisible();
  await page.goto("/lists");
  await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "Restore list", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Archive list", exact: true }),
  ).toBeVisible();
  const restored = (
    await (await page.request.get("/api/v1/world")).json()
  ).lists.find((l: any) => l.id === list.id);
  expect(restored.archiveAfter).toBeNull();
  expect(restored.revealAfter).toBe("2099-10-18");
});

test("gift summaries are owner-only, omit financial data, and remain available in archives", async ({
  page,
  browser,
}) => {
  await login(page, "alex@example.test");
  const world = await (await page.request.get("/api/v1/world")).json();
  const list = await post(page, "lists", {
    name: `Past celebration ${Date.now()}`,
    ownerIds: [world.people.find((p: any) => p.userId === world.me.id).id],
    groupIds: [world.groups[0].id],
    mode: "surprise",
    revealAfter: "2020-01-01",
    timeZone: "UTC",
    revealExchangeGivers: false,
  });
  const gift = await post(page, "items", {
    title: "A shared coffee grinder",
    allowDuplicate: true,
    listId: list.id,
    quantity: 2,
    priceCents: 9900,
  });
  const buyer = await browser.newContext();
  const bp = await buyer.newPage();
  const contributor = await browser.newContext();
  const cp = await contributor.newPage();
  try {
    await login(bp, "sam@example.test");
    const created = await post(bp, "reservations", {
      itemId: gift.id,
      quantity: 1,
    });
    const r = (
      await (await bp.request.get("/api/v1/world")).json()
    ).buying.find((r: any) => r.id === created.id);
    await post(bp, "reservations/update", {
      id: r.id,
      revision: r.revision,
      quantity: 1,
      purchased: 1,
      poolTargetCents: 9900,
    });
    await post(bp, "comments", {
      itemId: gift.id,
      body: "A private note that must never appear to Alex",
    });
    await login(cp, "jamie@example.test");
    const c = await post(cp, "contributions", {
      reservationId: r.id,
      amountCents: 2300,
    });
    await post(cp, "contributions/update", {
      id: c.id,
      revision: c.revision,
      status: "sent",
    });
    expect(
      (await bp.request.get(`/api/v1/lists/${list.id}/gift-summary`)).status(),
    ).toBe(404);
    const response = await page.request.get(
      `/api/v1/lists/${list.id}/gift-summary`,
    );
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const dto = await response.json();
    expect(dto.gifts[0].buyerName).toBe("Sam Morgan");
    expect(dto.gifts[0].contributors[0]).toMatchObject({
      name: "Jamie Chen",
      status: "sent",
    });
    expect(JSON.stringify(dto)).not.toMatch(
      /amountCents|poolTargetCents|priceCents|private note|2300|9900/,
    );
    await page.goto(`/lists/${list.id}`);
    await page
      .getByRole("button", { name: "Gift summary", exact: true })
      .click();
    await expect(
      page.getByText("Jamie Chen · Sent · Awaiting confirmation", {
        exact: true,
      }),
    ).toBeVisible();
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.screenshot({
        path: `test-results/visual/gift-summary-${name}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await page
      .getByRole("button", { name: "Archive list", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "People to thank", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("A private note that must never appear to Alex"),
    ).toHaveCount(0);
  } finally {
    await buyer.close();
    await contributor.close();
  }
});

test("provider selection is editable without exposing API keys", async ({
  page,
}) => {
  await login(page, "alex@example.test");
  await page.goto("/settings");
  const section = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Product import provider" }),
  });
  await section.locator("summary").click();
  await section
    .getByLabel("Paid import provider", { exact: true })
    .selectOption("scrapingfish");
  await section
    .getByRole("button", { name: "Save setting", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Setting saved." }),
  ).toBeVisible();
  const response = await page.request.get("/api/v1/admin/settings");
  const settings = await response.json();
  expect(settings.find((s: any) => s.key === "SCRAPING_PROVIDER").value).toBe(
    "scrapingfish",
  );
  expect(
    settings
      .filter((s: any) => s.key.endsWith("API_KEY"))
      .every((s: any) => !Object.hasOwn(s, "value")),
  ).toBe(true);
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await section.screenshot({
      path: `test-results/visual/import-provider-${name}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await section
    .getByLabel("Paid import provider", { exact: true })
    .selectOption("none");
  await section
    .getByRole("button", { name: "Save setting", exact: true })
    .click();
});
