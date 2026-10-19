import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { login, post, expectDialogFieldsToFit } from "./browser-helpers";

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

test("mobile shell clears safe areas, resizing, and date dialogs", async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 300000 : 120000);
  await login(page, "alex@example.test");
  await mkdir("test-results/visual", { recursive: true });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await expect(page.locator(".topbar")).toBeVisible();
    for (const [width, height, top, bottom] of [
      [393, 852, 59, 34],
      [320, 740, 0, 0],
      [852, 393, 0, 21],
    ]) {
      await page.setViewportSize({ width, height });
      // Desktop automation has no hardware safe areas. Exercise the same CSS
      // variables with iPhone-sized insets, including padding-only nav changes.
      await page.evaluate(
        ({ top, bottom }) => {
          document.documentElement.style.setProperty(
            "--safe-area-top",
            `${top}px`,
          );
          document.documentElement.style.setProperty(
            "--safe-area-bottom",
            `${bottom}px`,
          );
        },
        { top, bottom },
      );
      const expectFooterClear = async () => {
        await expect
          .poll(async () =>
            page.evaluate(() => {
              window.scrollTo(0, document.documentElement.scrollHeight);
              const nav = document
                .querySelector(".mobile-nav")!
                .getBoundingClientRect();
              const footer = document
                .querySelector(".app-footer")!
                .getBoundingClientRect();
              return nav.top - footer.bottom;
            }),
          )
          .toBeGreaterThanOrEqual(15);
      };
      await expectFooterClear();
      if (width === 393) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `test-results/visual/mobile-home-${colorScheme}.png`,
        });
      }
      await page
        .locator("main")
        .evaluate((el) => (el.style.minHeight = "1600px"));
      await expectFooterClear();
      await expect(page.locator(".topbar")).toHaveCSS("position", "sticky");
      const headerControls = await page
        .locator(".topbar .logo, .topbar .actions > *")
        .evaluateAll((elements) =>
          elements.map((el) => {
            const rect = el.getBoundingClientRect();
            return { top: rect.top, left: rect.left, right: rect.right };
          }),
        );
      for (const rect of headerControls) {
        expect(rect.top).toBeGreaterThanOrEqual(top);
        expect(rect.left).toBeGreaterThanOrEqual(0);
        expect(rect.right).toBeLessThanOrEqual(width);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 393) {
        await page.screenshot({
          path: `test-results/visual/mobile-footer-${colorScheme}.png`,
        });
      }
      // The observer must also respond to text growth, not just viewport width.
      await page
        .locator(".mobile-nav")
        .evaluate((el) => (el.style.paddingBottom = "70px"));
      await expectFooterClear();
      await page
        .locator(".mobile-nav")
        .evaluate((el) => el.style.removeProperty("padding-bottom"));
      await page
        .locator(".mobile-nav a")
        .evaluateAll((links) =>
          links.forEach(
            (link) => ((link as HTMLElement).style.fontSize = "16px"),
          ),
        );
      await expectFooterClear();
      const labels = await page
        .locator(".mobile-nav a span")
        .evaluateAll((elements) =>
          elements.map((el) => {
            const rect = el.getBoundingClientRect();
            return { left: rect.left, right: rect.right };
          }),
        );
      for (let i = 0; i < labels.length; i++) {
        expect(labels[i].left).toBeGreaterThanOrEqual(0);
        expect(labels[i].right).toBeLessThanOrEqual(width);
        if (i)
          expect(labels[i].left).toBeGreaterThanOrEqual(labels[i - 1].right);
      }
      await page
        .locator(".mobile-nav a")
        .evaluateAll((links) =>
          links.forEach((link) =>
            (link as HTMLElement).style.removeProperty("font-size"),
          ),
        );
      await page
        .locator("main")
        .evaluate((el) => el.style.removeProperty("min-height"));
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".main-wrap")).toHaveCSS("padding-bottom", "0px");
  await expect
    .poll(async () =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--mobile-nav-height"),
      ),
    )
    .toBe("0px");

  await page.goto("/lists");
  for (const button of ["Create a list", "Create event"]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    for (const width of [1440, 393, 320]) {
      await page.setViewportSize({
        width,
        height: width === 1440 ? 1000 : 852,
      });
      await expectDialogFieldsToFit(page);
      for (const name of ["Archive after", "Gift summary available after"]) {
        await page.getByLabel(name, { exact: true }).fill("2099-12-25");
      }
      await expectDialogFieldsToFit(page);
      await page
        .getByLabel("Gift summary available after", { exact: true })
        .scrollIntoViewIfNeeded();
      if (width !== 1440) {
        expect(
          await page.getByRole("dialog").evaluate((el) => el.scrollTop),
        ).toBeGreaterThan(0);
      }
      if (width === 320) {
        const submit = page.locator("dialog .form > button[type=submit]");
        await submit.evaluate((el) => {
          el.style.fontSize = `${parseFloat(getComputedStyle(el).fontSize) * 2}px`;
        });
        await expectDialogFieldsToFit(page);
        const fits = await submit.evaluate((el) => {
          const button = el.getBoundingClientRect();
          const form = el.closest("form")!.getBoundingClientRect();
          return button.left >= form.left && button.right <= form.right;
        });
        expect(fits, "enlarged submit label stays inside the form").toBe(true);
        await submit.evaluate((el) => el.style.removeProperty("font-size"));
      }
    }
    await page.screenshot({
      path: `test-results/visual/${button === "Create event" ? "event" : "list"}-dates-narrow.png`,
    });
    await page.getByRole("button", { name: "Close dialog" }).click();
  }
  await page.goto("/exchanges");
  await page
    .getByRole("button", { name: "Create exchange", exact: true })
    .click();
  await expectDialogFieldsToFit(page);
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
    .getByLabel("Gift summary available after", { exact: true })
    .fill("2099-10-18");
  await page.getByLabel("Archive after", { exact: true }).fill("2099-10-20");
  await page
    .getByLabel("List timezone", { exact: true })
    .selectOption("America/New_York");
  await page
    .getByLabel("Include secret exchange gifts and giver names", {
      exact: true,
    })
    .check();
  await page.getByLabel("The Morgan circle", { exact: true }).check();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 393, 852],
    ["narrow", 320, 740],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page
      .getByLabel("Gift summary available after", { exact: true })
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
    await expectDialogFieldsToFit(page);
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
  expect(list.mode).toBe("transparent");
  expect(list.revealExchangeGivers).toBe(true);
  expect(
    (await page.request.get(`/api/v1/lists/${list.id}/gift-summary`)).status(),
  ).toBe(409);
  await page
    .getByRole("button", { name: "List settings", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: /See the plans/ }),
  ).toBeChecked();
  await expect(
    page.getByLabel("List timezone", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Include secret exchange gifts and giver names", {
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Gift summary available after", { exact: true }),
  ).toHaveAttribute("min", "2099-10-18");
  await expectDialogFieldsToFit(page);
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

test.describe("touch reveal settings", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 393, height: 852 },
  });

  test("a reveal date enables exchange inclusion and clearing it disables inclusion", async ({
    page,
  }) => {
    await login(page, "alex@example.test");
    await page.goto("/lists");
    for (const button of ["Create a list", "Create event"]) {
      await page.getByRole("button", { name: button, exact: true }).tap();
      await expect(page.locator('input[name="mode"]').first()).toHaveValue(
        "transparent",
      );
      await expect(
        page.getByRole("radio", { name: /See the plans/ }),
      ).toBeChecked();
      await page.getByRole("radio", { name: /Keep it a surprise/ }).check();
      await expect(
        page.getByRole("radio", { name: /Keep it a surprise/ }),
      ).toBeChecked();
      await expect(
        page.getByLabel("Reveal gifts after", { exact: true }),
      ).toHaveAccessibleDescription(/even with Keep it a surprise/);
      await page.getByRole("radio", { name: /See the plans/ }).check();
      const date = page.getByLabel("Gift summary available after", {
        exact: true,
      });
      await expect(date).toHaveAccessibleDescription(
        /Purchase activity is already visible with See the plans/,
      );
      const checkbox = page.getByLabel(
        "Include secret exchange gifts and giver names",
        { exact: true },
      );
      const label = page.locator("label.check").filter({ has: checkbox });
      await expect(checkbox).toBeDisabled();
      await expect(checkbox).toHaveAccessibleDescription(
        /Choose a gift summary date above/,
      );
      const disabledColor = await label.evaluate(
        (el) => getComputedStyle(el).color,
      );
      await expectDialogFieldsToFit(page);

      await date.fill("2099-12-25");
      await expect(checkbox).toBeEnabled();
      expect(await label.evaluate((el) => getComputedStyle(el).color)).not.toBe(
        disabledColor,
      );
      await label.tap();
      await expect(checkbox).toBeChecked();
      await page.getByRole("radio", { name: /Keep it a surprise/ }).check();
      await expect(
        page.getByLabel("Reveal gifts after", { exact: true }),
      ).toHaveValue("2099-12-25");
      await expect(checkbox).toBeChecked();
      await page.getByRole("radio", { name: /See the plans/ }).check();
      expect(
        await checkbox.evaluate((el) =>
          new FormData(el.closest("form")!).get("revealExchangeGivers"),
        ),
      ).toBe("on");
      await label.tap();
      await expect(checkbox).not.toBeChecked();
      await label.tap();
      await date.fill("");
      await expect(checkbox).toBeDisabled();
      await expect(checkbox).not.toBeChecked();
      expect(
        await checkbox.evaluate((el) =>
          new FormData(el.closest("form")!).get("revealExchangeGivers"),
        ),
      ).toBeNull();
      await expectDialogFieldsToFit(page);
      if (button === "Create event") {
        const name = `Visible plans ${Date.now()}`;
        await page.getByLabel("Event name", { exact: true }).fill(name);
        await page
          .getByRole("button", { name: /^Create \d+ wish lists?$/ })
          .tap();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        const world = await (await page.request.get("/api/v1/world")).json();
        const event = world.groupEvents.find(
          (event: any) => event.name === name,
        );
        expect(event.mode).toBe("transparent");
        const lists = world.lists.filter(
          (list: any) => list.groupEventId === event.id,
        );
        expect(lists.length).toBeGreaterThan(0);
        expect(lists.every((list: any) => list.mode === "transparent")).toBe(
          true,
        );
      } else {
        await page.getByRole("button", { name: "Close dialog" }).tap();
      }
    }
  });
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
