import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { command, stamp, world } from "../src/server/domain";

async function setup(page: Page) {
  const { state, actors } = stagingFixtures();
  const actor = actors[0];
  const visible = world(state, actor);
  const gift = state.items.find((item) =>
    visible.items.some(
      (view) => view.id === item.id && !view.isRecipient && !view.archived,
    ),
  )!;
  delete gift.listId;
  gift.creatorId = actor.id;
  gift.visibility = "private";
  gift.title = "A thoughtful gift idea";
  gift.priceCents = null;
  gift.url = "https://shop.example/gift";
  gift.description =
    "A saved gift without a price. Its description stays close to the price label.";
  gift.image = "/api/v1/media/photo-fixture";
  const ownList = visible.lists.find((list) => list.canEdit && !list.archived)!;
  for (const status of ["running", "complete", "failed"] as const) {
    command(state, actor, "imports.create", {
      url: `https://shop.example/${status}`,
      draft: { listId: ownList.id, fields: {}, touched: [] },
    });
    const job = state.imports.at(-1)!;
    job.status = status;
    if (status === "complete")
      job.result = {
        title: "A ready-to-review gift with a longer product name",
        priceCents: 4500,
      };
  }
  await page.addInitScript(() =>
    localStorage.setItem("little-hint:install", "never"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/",
      "",
    );
    if (path === "world")
      return route.fulfill({
        json: {
          ...world(state, actor),
          giftPreferences: [],
          environment: "test",
          priceChecksEnabled: true,
        },
      });
    if (path.startsWith("media/"))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="white"/><rect x="90" y="150" width="220" height="160" fill="#dce4d6"/><text x="200" y="240" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#486348">Photo fixture</text></svg>',
      });
    if (path.startsWith("imports/") && route.request().method() === "GET")
      return route.fulfill({
        json: state.imports.find((job) => job.id === path.split("/").at(-1)),
      });
    if (["imports/update", "imports/retry", "imports/discard"].includes(path)) {
      return route.fulfill({
        json: command(
          state,
          actor,
          path.replace("/", "."),
          route.request().postDataJSON(),
        ),
      });
    }
    if (path === "admin/jobs")
      return route.fulfill({
        json: {
          workerLastSeen: Date.now(),
          imports: [],
          notifications: [],
          backupProvider: "external",
          prices: {
            enabled: true,
            time: "03:00",
            zone: "America/Indiana/Indianapolis",
            pending: 1,
            failed: 19,
            dailyUsed: 7,
            daily: 100,
            monthlyUsed: 20,
            monthly: 3000,
            providerUsage: [
              { source: "brightdata-scraper", count: 9 },
              { source: "brightdata-unlocker", count: 11 },
            ],
            lastRun: Date.now(),
          },
        },
      });
    if (path === "account/closure")
      return route.fulfill({
        json: {
          candidates: [{ id: actors[1].id, name: actors[1].name }],
          requests: [],
          blockers: [
            {
              kind: "admin",
              id: "admin",
              title: "Hand off app administration",
              detail:
                "Another account must accept administration before the last administrator can leave.",
              href: "/settings?section=security",
            },
            {
              kind: "group",
              id: "group",
              title: "Transfer your family group",
              detail:
                "Ask another member to accept ownership in Family groups.",
              href: "/settings?section=groups",
            },
            {
              kind: "commitments",
              id: "gifts",
              title: "Settle your gift commitments",
              detail:
                "Resolve unpurchased reservations and pledged or sent contributions.",
              href: "/buying",
            },
          ],
        },
      });
    if (path === "push")
      return route.fulfill({ json: { publicKey: null, devices: [] } });
    return route.fulfill({ json: [] });
  });
  return { state, actor, gift };
}

for (const [width, theme] of [
  [320, "dark"],
  [393, "light"],
  [768, "light"],
  [1440, "dark"],
] as const) {
  test(`refined browsing, help, drafts, and administration at ${width}px ${theme}`, async ({
    page,
  }, info) => {
    const { state, actor, gift } = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      (theme) => localStorage.setItem("little-hint:theme", theme),
      theme,
    );
    const capture = async (name: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`${name}.png`),
        fullPage: true,
      });
    };
    await page.goto("/");
    await expect(page.locator(".browse-summary")).toContainText(
      "Available to give",
    );
    await expect(
      page.locator(".gift-kind").filter({ hasText: "Gift idea" }).first(),
    ).toBeVisible();
    await capture("home");
    await page.getByRole("button", { name: /^Sort & filter/ }).click();
    await page
      .getByRole("combobox", { name: "Item type", exact: true })
      .selectOption("idea");
    const people = page.getByRole("combobox", { name: "People", exact: true });
    const recipient = state.people.find(
      (person) => person.id === gift.recipientIds[0],
    )!;
    await people.fill(recipient.name);
    await expect(
      page
        .getByRole("listbox", { name: "People", exact: true })
        .getByRole("option")
        .first(),
    ).toContainText(recipient.name);
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("listbox", { name: "People", exact: true })
        .getByRole("option")
        .first(),
    ).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Sort & filter" }),
    ).toBeVisible();
    await capture("filters");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.locator(".gift-kind").filter({ hasText: /^Wish$/ }),
    ).toHaveCount(0);
    await page.getByRole("searchbox").fill(gift.title);
    await expect(page.locator(".browse-summary")).toContainText(
      "Search includes taken-care-of gifts",
    );
    await page.goto(`/gift/${gift.id}`);
    await expect(page.locator(".detail-price")).toHaveText("Price not added");
    await expect(
      page.getByText("Price not yet checked", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".price-controls")).toHaveCount(0);
    const gap = await page
      .locator(".description")
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top -
          document.querySelector(".item-price")!.getBoundingClientRect().bottom,
      );
    expect(gap).toBeLessThanOrEqual(20);
    await capture("missing-price");
    gift.priceCents = 4500;
    await page.reload();
    const help = page.getByRole("button", {
      name: "About price-drop notifications",
    });
    const check = page.getByLabel("Notify me of price drops", { exact: true });
    await help.click();
    await expect(check).not.toBeChecked();
    await expect(
      page.getByRole("dialog", { name: "Price-drop notifications" }),
    ).toContainText("5% and $1");
    await capture("price-help");
    await page.keyboard.press("Escape");
    await expect(help).toBeFocused();
    await expect(
      page.getByRole("dialog", { name: "Price-drop notifications" }),
    ).not.toBeVisible();
    await page.goto("/lists");
    await expect(page.locator(".draft-row")).toHaveCount(3);
    const ready = page.locator(".draft-ready");
    await expect(ready.getByRole("link")).toHaveAttribute("target", "_blank");
    await expect(ready.getByRole("link")).toHaveAttribute(
      "href",
      "https://shop.example/complete",
    );
    await expect(
      page
        .locator(".draft-needs-details")
        .getByRole("button", { name: "Add details" }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".working-dots > span").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    await capture("drafts");
    await ready.getByRole("button", { name: "Review and add" }).click();
    await page
      .getByLabel("Item name", { exact: true })
      .fill("My saved draft title");
    await expect(page.locator(".draft-save-feedback")).toHaveText(
      "Private draft saved",
    );
    const before = await page
      .getByRole("button", { name: "Save for later" })
      .boundingBox();
    await expect(page.locator(".draft-save-feedback")).toHaveText("", {
      timeout: 5000,
    });
    const after = await page
      .getByRole("button", { name: "Save for later" })
      .boundingBox();
    expect(after).toEqual(before);
    await capture("draft-editor");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.goto("/settings?section=admin");
    await expect(
      page.getByRole("region", { name: "Background jobs" }),
    ).toContainText("Worker active");
    await page.getByText("Provider attempts", { exact: true }).click();
    await capture("jobs");
    await page.goto("/settings?section=security");
    await page
      .getByRole("button", { name: "Close account", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Resolve these first" })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("link", { name: "Open family groups", exact: true }),
    ).toBeVisible();
    await capture("closure");
    expect(
      (await new AxeBuilder({ page }).include("dialog").analyze()).violations,
    ).toEqual([]);
  });
}
