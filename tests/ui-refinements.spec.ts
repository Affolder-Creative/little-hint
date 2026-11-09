import { test, expect, webkit, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spendingView } from "../src/server/spending";
import { itemPage } from "../src/server/collections";
import { shoppingChoices } from "../src/client/shopping-context";
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
  const originalListId = gift.listId;
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
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1/", "");
    if (path === "items" && route.request().method() === "GET")
      return route.fulfill({
        json: await itemPage(
          state,
          actor,
          Object.fromEntries(url.searchParams),
          async () => {},
        ),
      });
    if (path === "admin/profiles")
      return route.fulfill({ json: { rows: [], total: 0 } });
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
    if (path === "spending")
      return route.fulfill({ json: spendingView(state, actor) });
    if (path === "buying/contributions" || path === "buying/cancelled")
      return route.fulfill({ json: { rows: [], nextCursor: null } });
    if (path === "reservations")
      return route.fulfill({
        json: command(
          state,
          actor,
          "reservations.create",
          route.request().postDataJSON(),
        ),
      });
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
  return { state, actor, gift, originalListId };
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
      .getByRole("button", { name: "Save draft" })
      .boundingBox();
    await page.waitForTimeout(600);
    await expect(page.locator(".draft-save-feedback")).toHaveText(
      "Private draft saved",
    );
    const after = await page
      .getByRole("button", { name: "Save draft" })
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

for (const [width, kind] of [
  [393, "idea"],
  [1440, "wish"],
] as const) {
  test(`reservation context and Buying confirmation for ${kind} at ${width}px`, async ({
    page,
  }, info) => {
    const {
      state,
      actor,
      gift: fixtureGift,
      originalListId,
    } = await setup(page);
    if (kind === "wish") {
      expect(originalListId).toBeDefined();
      fixtureGift.listId = originalListId;
    }
    const gift = world(state, actor).items.find(
      (item) =>
        (kind !== "wish" || Boolean(item.listId)) &&
        !item.isRecipient &&
        !item.archived &&
        (item.available ?? 0) > 0 &&
        shoppingChoices(world(state, actor), item).length > 0,
    )!;
    expect(gift).toBeDefined();
    if (kind === "idea") {
      const item = state.items.find((item) => item.id === gift.id)!;
      delete item.listId;
      item.visibility = "private";
      item.creatorId = actor.id;
    }
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/gift/${gift.id}`);
    const selector = page
      .locator(".reserve-panel")
      .getByLabel("Buying for", { exact: true });
    await expect(selector).toBeVisible();
    await expect(page.locator(".back-link + .gift-detail")).toBeVisible();
    await selector.selectOption("ordinary");
    await selector.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("reservation-context.png") });
    await page.clock.install();
    await page
      .getByRole("button", { name: "Reserve gift", exact: true })
      .click();
    const toast = page.locator(".toast");
    const link = toast.getByRole("link", { name: "Open Buying", exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/buying");
    await page.clock.fastForward(6000);
    await expect(link).toBeVisible();
    await link.hover();
    await page.clock.runFor(100);
    await page.clock.fastForward(11000);
    await expect(link).toBeVisible();
    await link.focus();
    await page.mouse.move(0, 0);
    await page.clock.runFor(100);
    await page.clock.fastForward(11000);
    await expect(link).toBeVisible();
    await page.screenshot({
      path: info.outputPath("reservation-confirmation.png"),
    });
    await link.click();
    await expect(page).toHaveURL(/\/buying$/);
    await expect(
      page.getByRole("heading", { name: "Your gift plans", exact: true }),
    ).toBeVisible();
    await expect(toast).toHaveCount(0);
  });
}

test("draft review stays clean across repeated save-and-reopen cycles", async ({
  page,
}) => {
  const { state, actor } = await setup(page);
  const job = state.imports.find((j) => j.status === "complete")!;
  job.draft!.kind = "idea";
  job.draft!.recipientId = world(state, actor).people.find(
    (p) => p.userId && p.userId !== actor.id,
  )!.id;
  delete job.draft!.listId;
  let writes = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/imports/update")) writes++;
  });
  await page.goto(`/people/${job.draft!.recipientId}?tab=ideas`);
  const dialog = page.getByRole("dialog");
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole("button", { name: "Review and add" }).click();
    await expect(
      dialog.getByLabel("Gift idea name", { exact: true }),
    ).toHaveValue(cycle ? "My revised gift" : job.result!.title!);
    const before = writes;
    await page.waitForTimeout(1200);
    expect(writes).toBe(before);
    await expect(dialog.locator(".draft-save-feedback")).toHaveCount(0);
    if (!cycle)
      await dialog
        .getByLabel("Gift idea name", { exact: true })
        .fill("My revised gift");
    await dialog.getByRole("button", { name: "Save for later" }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect(writes).toBe(1);
  expect(job.draft!.fields.title).toBe("My revised gift");
});

test("draft saves serialize edits made during a slow request and recover from real conflicts", async ({
  page,
}) => {
  const { state, actor } = await setup(page);
  const job = state.imports.find((j) => j.status === "complete")!;
  let release!: () => void;
  const delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  await page.route("**/api/v1/imports/update", async (route) => {
    writes++;
    if (writes === 1) await delay;
    try {
      await route.fulfill({
        json: command(
          state,
          actor,
          "imports.update",
          route.request().postDataJSON(),
        ),
      });
    } catch (e) {
      await route.fulfill({
        status: 409,
        json: { error: (e as Error).message },
      });
    }
  });
  await page.goto(`/lists/${job.draft!.listId}`);
  await page.getByRole("button", { name: "Review and add" }).click();
  const dialog = page.getByRole("dialog");
  const name = dialog.getByLabel("Item name", { exact: true });
  await name.fill("First edit");
  await expect.poll(() => writes).toBe(1);
  await name.fill("Latest edit during save");
  await page.getByRole("button", { name: "Close dialog" }).click();
  release();
  await expect(dialog).toHaveCount(0);
  expect(job.draft!.fields.title).toBe("Latest edit during save");
  expect(writes).toBe(2);
  await page.getByRole("button", { name: "Review and add" }).click();
  await expect(name).toHaveValue("Latest edit during save");
  command(state, actor, "imports.update", {
    id: job.id,
    revision: job.draft!.revision,
    fields: { ...job.draft!.fields, title: "Changed in another session" },
    touched: ["title"],
  });
  await name.fill("Unsaved local edit");
  await expect(dialog.getByRole("alert")).toContainText("newer changes");
  const failedWrites = writes;
  await page.waitForTimeout(1400);
  expect(writes).toBe(failedWrites);
  await expect(name).toHaveValue("Unsaved local edit");
  await dialog.getByRole("button", { name: "Reload latest" }).click();
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(name).toHaveValue("Unsaved local edit");
  await dialog.getByRole("button", { name: "Reload latest" }).click();
  await dialog
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(name).toHaveValue("Changed in another session");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(dialog).toHaveCount(0);
});

for (const engine of ["chromium", "webkit"] as const)
  test(`touch People selection survives focus moving to a portaled option in ${engine}`, async ({
    browser: chromiumBrowser,
    baseURL,
  }) => {
    const safari =
      engine === "webkit"
        ? await webkit.launch({
            executablePath: webkit.executablePath(),
            channel: "",
          })
        : undefined;
    const browser = safari ?? chromiumBrowser;
    const context = await browser.newContext({
      hasTouch: true,
      viewport: { width: 393, height: 700 },
      baseURL,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    if (safari)
      await page.route("**/*", async (route) => {
        if (route.request().resourceType() !== "document")
          return route.continue();
        const response = await route.fetch();
        const headers = response.headers();
        // CI serves HTTP. WebKit otherwise upgrades built assets to HTTPS.
        if (headers["content-security-policy"])
          headers["content-security-policy"] = headers[
            "content-security-policy"
          ].replace(/upgrade-insecure-requests;?/g, "");
        await route.fulfill({ response, headers });
      });
    try {
      const { state, gift } = await setup(page);
      const person = state.people.find((p) => p.id === gift.recipientIds[0])!;
      await page.goto("/");
      await page.getByRole("button", { name: /^Sort & filter/ }).tap();
      const input = page.getByRole("combobox", { name: "People", exact: true });
      await input.fill(person.name);
      const option = page.getByRole("option", {
        name: person.name,
        exact: true,
      });
      await option.tap();
      await expect(option).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("dialog").locator(".purchase-chip"),
      ).toContainText([person.name]);
      await page.getByRole("button", { name: "Done", exact: true }).tap();
      await page.getByRole("button", { name: /^Sort & filter/ }).tap();
      await expect(
        page.getByRole("dialog").locator(".purchase-chip"),
      ).toContainText([person.name]);
    } finally {
      await context.close();
      await safari?.close();
    }
  });

for (const [width, theme] of [
  [320, "light"],
  [393, "dark"],
  [768, "light"],
  [1440, "light"],
] as const) {
  test(`polished Buying, security and member menus at ${width}px ${theme}`, async ({
    page,
  }, info) => {
    const { state, actor, gift } = await setup(page);
    state.reservations = [];
    command(state, actor, "reservations.create", {
      itemId: gift.id,
      quantity: 1,
      ordinary: true,
    });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      (theme) => localStorage.setItem("little-hint:theme", theme),
      theme,
    );
    await page.route("**/*list-user-passkeys*", (route) =>
      route.fulfill({
        json: [
          {
            id: "key",
            name: "1Password on my personal phone",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );
    await page.goto("/buying");
    const row = page.locator(".buying-row").filter({ hasText: gift.title });
    await expect(row.getByRole("heading").getByRole("link")).toHaveAttribute(
      "href",
      `/gift/${gift.id}`,
    );
    const help = row.getByRole("button", { name: "About only me" });
    await help.locator(".private-idea-badge").click();
    await expect(
      page.getByRole("dialog", { name: "Only me", exact: true }),
    ).toContainText(
      "Only you can see this idea, including reservations and purchases.",
    );
    await page.screenshot({
      path: info.outputPath("buying-help.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(help).toBeFocused();
    await help.locator(".info-help-icon").click();
    await page.getByRole("button", { name: "Close help" }).click();
    await expect(help).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Only me", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await row.locator("summary").click();
    await expect(
      row.getByRole("button", { name: "Cancel reservation", exact: true }),
    ).toHaveClass(/danger/);
    await page.screenshot({
      path: info.outputPath("buying-menu.png"),
      fullPage: true,
    });
    await page.goto("/settings?section=security");
    await expect(
      page.getByRole("heading", { name: "Passkeys", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".passkey-label")).toHaveText(
      "1Password on my personal phone",
    );
    const keyRow = page.locator(".passkey-row");
    const keyMenu = keyRow.locator("summary");
    const nameBounds = await keyRow.locator(".passkey-label").boundingBox();
    const menuBounds = await keyMenu.boundingBox();
    expect(menuBounds!.x).toBeGreaterThan(nameBounds!.x + nameBounds!.width);
    expect(menuBounds!.height).toBeGreaterThanOrEqual(44);
    await expect(keyRow).toHaveCSS("border-top-width", "0px");
    await keyMenu.click();
    await expect(keyRow.getByRole("button", { name: /^Rename/ })).toBeVisible();
    await expect(
      keyRow.getByRole("button", { name: /^Remove passkey/ }),
    ).toHaveClass(/danger/);
    await expect(
      keyRow.getByRole("button", { name: /^Remove passkey/ }),
    ).toHaveCSS(
      "color",
      theme === "dark" ? "rgb(255, 177, 162)" : "rgb(159, 51, 39)",
    );
    const separators = await keyRow
      .locator(".entry-actions-content")
      .evaluate(
        (menu) =>
          Array.from(menu.querySelectorAll("*")).filter(
            (element) =>
              parseFloat(getComputedStyle(element).borderTopWidth) > 0,
          ).length,
      );
    expect(separators).toBe(1);
    await page.screenshot({
      path: info.outputPath("security-menu.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await expect(keyMenu).toBeFocused();
    await page.screenshot({
      path: info.outputPath("security.png"),
      fullPage: true,
    });
    await page.goto("/settings?section=groups");
    const member = page
      .locator(".member-list > div")
      .filter({ has: page.locator("summary") })
      .first();
    const identity = await member
      .locator(":scope > span:not(.avatar)")
      .boundingBox();
    const trigger = await member.locator("summary").boundingBox();
    expect(trigger!.x).toBeGreaterThan(identity!.x);
    expect(trigger!.y).toBeLessThan(identity!.y + identity!.height);
    await member.locator("summary").click();
    await expect(
      member.getByRole("button", { name: /^Transfer ownership to/ }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("member-menu.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("administration searches on demand and keeps the selected profile current after renaming", async ({
  page,
}) => {
  await setup(page);
  const profiles = Array.from({ length: 120 }, (_, n) => ({
    id: `profile-${n}`,
    revision: 1,
    name: `Directory Person ${String(n).padStart(3, "0")}`,
    managed: true,
    admin: false,
  }));
  let searches = 0;
  await page.route("**/api/v1/admin/profiles?*", async (route) => {
    searches++;
    const query = new URL(route.request().url()).searchParams;
    const found = profiles.filter((p) =>
      p.name.toLowerCase().includes(query.get("search")!.toLowerCase()),
    );
    const page = Number(query.get("page"));
    await route.fulfill({
      json: {
        rows: found.slice((page - 1) * 24, page * 24),
        total: found.length,
      },
    });
  });
  await page.route("**/api/v1/admin/profiles/update", async (route) => {
    const body = route.request().postDataJSON();
    const p = profiles.find((p) => p.id === body.id)!;
    expect(body.revision).toBe(p.revision);
    p.name = body.name;
    p.revision++;
    await route.fulfill({ json: p });
  });
  await page.goto("/settings?section=admin");
  const directory = page.getByRole("region", { name: "Users and profiles" });
  await expect(directory).toContainText("Start typing");
  expect(searches).toBe(0);
  await directory.getByRole("searchbox").fill("Directory");
  await expect(directory.locator(".admin-profile-match")).toHaveCount(24);
  await directory.getByRole("button", { name: "Next", exact: true }).click();
  await expect(directory.locator(".admin-profile-match").first()).toHaveText(
    "Directory Person 024Managed profile",
  );
  await directory.locator(".admin-profile-match").first().click();
  await directory.getByRole("button", { name: /^Edit name for/ }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Renamed Person");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(directory.locator(".admin-profile-detail")).toContainText(
    "Renamed Person",
  );
  await directory.getByRole("button", { name: /^Edit name for/ }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Renamed Again");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(directory.locator(".admin-profile-detail")).toContainText(
    "Renamed Again",
  );
});

test("passkey menus rename, recover from failure, and restore focus after removal", async ({
  page,
}) => {
  await setup(page);
  let keys = [
    { id: "first", name: "Phone" },
    { id: "second", name: "Laptop" },
  ];
  let fail = true;
  await page.route("**/*list-user-passkeys*", (route) =>
    route.fulfill({ json: keys }),
  );
  await page.route("**/*update-passkey", (route) => {
    const data = route.request().postDataJSON();
    keys = keys.map((key) =>
      key.id === data.id ? { ...key, name: data.name } : key,
    );
    return route.fulfill({ json: { status: true } });
  });
  await page.route("**/*delete-passkey", (route) => {
    if (fail)
      return route.fulfill({ status: 500, json: { message: "Try again" } });
    keys = keys.filter((key) => key.id !== route.request().postDataJSON().id);
    return route.fulfill({ json: { status: true } });
  });
  await page.goto("/settings?section=security");
  const first = page.locator(".passkey-row").first();
  await first.locator("summary").click();
  await first
    .getByRole("button", { name: "Rename Phone", exact: true })
    .click();
  await page.getByLabel("Passkey name", { exact: true }).fill("Personal phone");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(first.locator(".passkey-label")).toHaveText("Personal phone");
  await expect(first.locator("summary")).toBeFocused();
  await first.locator("summary").click();
  await first.getByRole("button", { name: /^Remove passkey/ }).click();
  await expect(first.getByRole("alert")).toBeVisible();
  await expect(page.locator(".passkey-row")).toHaveCount(2);
  fail = false;
  await first.getByRole("button", { name: /^Remove passkey/ }).click();
  await expect(page.locator(".passkey-row")).toHaveCount(1);
  await expect(first.locator("summary")).toBeFocused();
  await first.locator("summary").click();
  await first.getByRole("button", { name: /^Remove passkey/ }).click();
  await expect(page.locator(".passkey-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add a passkey", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("No passkeys yet. Add one on a trusted device."),
  ).toBeVisible();
});

test("managed profile creation keeps sharing compact", async ({
  page,
}, info) => {
  await setup(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/people");
  await page
    .getByRole("button", { name: "Managed profile", exact: true })
    .click();
  const group = page.locator(".profile-sharing");
  await expect(group.getByRole("checkbox")).not.toBeChecked();
  await expect(group).toHaveCSS("margin-top", "8px");
  await expect(group.locator("legend")).toHaveCSS("margin-bottom", "12px");
  await page.screenshot({
    path: info.outputPath("create-profile.png"),
    fullPage: true,
  });
  await group.getByRole("checkbox").check();
  await expect(
    group.getByRole("combobox", { name: "Find family groups" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("create-profile-sharing.png"),
    fullPage: true,
  });
});
