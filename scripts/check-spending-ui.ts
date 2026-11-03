import { existsSync } from "node:fs";
/** Isolated domain-backed browser verification; never accesses real account data. */
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { emptyState } from "../src/shared/model";
import { command, stamp, world } from "../src/server/domain";
import {
  spendingView,
  syncSpending,
  syncContributions,
  spendingHistory,
} from "../src/server/spending";
const s = emptyState();
const users = ["Alex", "Jamie", "Emma"].map((name) => ({
  id: stamp().id,
  name,
  email: name + "@example.test",
}));
s.people = users.map((u) => ({
  ...stamp(),
  name: u.name,
  userId: u.id,
  guardians: [],
}));
s.groups.push({
  ...stamp(),
  name: "Family",
  ownerId: users[0].id,
  memberIds: users.map((u) => u.id),
});
const a = users[0];
const run = (action: string, body: unknown) => command(s, a, action, body);
for (const user of users)
  command(s, user, "spending.settings", { enabled: true, summaries: true });
const occasion = run("spending.occasion", { name: "Christmas 2026" }) as {
  id: string;
};
for (const [title, amountCents] of [
  ["Watercolor set", 4500],
  ["Storybook collection", 4000],
] as const)
  run("spending.purchase", {
    title,
    amountCents,
    date: "2026-10-28",
    recipientIds: [s.people[2].id],
    occasionId: occasion.id,
  });
s.spendingRecords.find((r) => r.title === "Storybook collection")!.history = [];
s.spendingRecords.find((r) => r.title === "Watercolor set")!.splits = [3];
run("spending.budget", {
  scope: "all",
  year: null,
  amountCents: 20000,
  shared: false,
});
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch(
  existsSync(chrome) ? { executablePath: chrome } : {},
);
const out = ".impeccable/review";
await mkdir(out, { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 960 },
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    localStorage.setItem("little-hint:install", "never");
    if (!localStorage.getItem("little-hint:theme"))
      localStorage.setItem("little-hint:theme", "light");
  });
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/",
      "",
    );
    try {
      if (path === "world") return route.fulfill({ json: world(s, a) });
      if (path === "spending")
        return route.fulfill({ json: spendingView(s, a) });
      if (path === "spending/history")
        return route.fulfill({
          json: spendingHistory(
            s,
            a,
            Object.fromEntries(new URL(route.request().url()).searchParams),
          ),
        });
      if (path.startsWith("spending/") && route.request().method() === "POST") {
        const result = run(
          path.replace("/", "."),
          route.request().postDataJSON(),
        );
        syncSpending(s, a);
        syncContributions(s);
        return route.fulfill({ json: result });
      }
      return route.fulfill({
        status: 404,
        json: { error: "Not available in isolated preview" },
      });
    } catch (e) {
      return route.fulfill({
        status: 400,
        json: { error: (e as Error).message },
      });
    }
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(server.resolvedUrls!.local[0] + "buying/spending");
  await expect(
    page.getByRole("heading", { name: "Your spending" }),
  ).toBeVisible();
  await expect(page.locator(".spending-numbers")).toContainText("$85");
  await page.screenshot({ path: out + "/desktop.png", fullPage: true });
  const documentBox = async (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const b = el.getBoundingClientRect();
      return {
        x: b.x + scrollX,
        y: b.y + scrollY,
        width: b.width,
        height: b.height,
      };
    });
  const checkFilters = async (name: string) => {
    const button = page.getByRole("button", { name: /^More filters/ });
    await button.scrollIntoViewIfNeeded();
    const before = await button.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + scrollX, y: b.y + scrollY, width: b.width };
    });
    const selects = await page
      .locator(".spending-filters select")
      .evaluateAll((elements) =>
        elements.map((el) => {
          const b = el.getBoundingClientRect();
          return { x: b.x + scrollX, y: b.y + scrollY, width: b.width };
        }),
      );
    await button.click();
    await expect(page.getByLabel("Wish list", { exact: true })).toBeVisible();
    const after = await button.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + scrollX, y: b.y + scrollY, width: b.width };
    });
    expect(after).toEqual(before);
    expect(
      await page.locator(".spending-filters select").evaluateAll((elements) =>
        elements.map((el) => {
          const b = el.getBoundingClientRect();
          return { x: b.x + scrollX, y: b.y + scrollY, width: b.width };
        }),
      ),
    ).toEqual(selects);
    await page.screenshot({
      path: out + "/filters-open-" + name + ".png",
      fullPage: true,
    });
    await button.click();
    await expect(page.getByLabel("Wish list", { exact: true })).toBeHidden();
  };
  await checkFilters("desktop");
  const legacyRow = page.locator(".spending-row").filter({
    has: page.getByRole("heading", {
      name: "Storybook collection",
      exact: true,
    }),
  });
  await expect(
    legacyRow.getByRole("button", { name: "Record refund", exact: true }),
  ).toBeVisible();
  await expect(legacyRow.locator(".entry-actions")).toHaveCount(0);
  const knownRow = page.locator(".spending-row").filter({
    has: page.getByRole("heading", { name: "Watercolor set", exact: true }),
  });
  const rowHeight = (await knownRow.boundingBox())!.height;
  await knownRow.locator(".entry-actions > summary").click();
  expect((await knownRow.boundingBox())!.height).toBe(rowHeight);
  await page.screenshot({ path: out + "/actions-desktop.png" });
  await knownRow
    .getByRole("button", { name: "View history", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Recorded purchase");
  await page.screenshot({ path: out + "/purchase-history-desktop.png" });
  await page.keyboard.press("Escape");
  await knownRow
    .getByRole("button", { name: "Edit purchase", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Watercolor set", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Split between recipients", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: out + "/edit-single-desktop.png",
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    s.spendingRecords.find((r) => r.title === "Watercolor set")!.splits,
  ).toEqual([3]);

  const personFilter = page.getByLabel("Person", { exact: true });
  await personFilter.focus();
  await personFilter.selectOption(s.people[2].id);
  await expect(personFilter).toBeFocused();
  await expect(page.locator(".spending-numbers")).toContainText("$85");
  await personFilter.selectOption("");
  await expect(personFilter).toBeFocused();
  await page.getByRole("button", { name: "Add purchase", exact: true }).click();
  const paymentFields = page.locator(".purchase-payment input");
  const amountRect = (await paymentFields.nth(0).boundingBox())!;
  const dateRect = (await paymentFields.nth(1).boundingBox())!;
  expect(Math.abs(amountRect.y - dateRect.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(amountRect.height - dateRect.height)).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: out + "/purchase-desktop.png",
  });
  await page.getByLabel("Gift name").fill("Art easel");
  await page.getByRole("combobox", { name: "Search people" }).fill("Emma");
  await page.getByRole("dialog").getByRole("option", { name: /Emma/ }).click();
  await page.getByLabel("Amount paid in USD, optional").fill("60");
  await page
    .getByRole("button", { name: "Save purchase", exact: true })
    .click();
  await expect(page.locator(".spending-numbers")).toContainText("$145");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: out + "/mobile.png", fullPage: true });
  await checkFilters("mobile");
  const mobileRowHeight = (await knownRow.boundingBox())!.height;
  await knownRow.locator(".entry-actions > summary").click();
  expect((await knownRow.boundingBox())!.height).toBe(mobileRowHeight);
  await page.screenshot({ path: out + "/actions-mobile.png" });
  await page.keyboard.press("Escape");
  await page.goto(server.resolvedUrls!.local[0] + "settings?section=spending");
  await expect(
    page.getByRole("heading", { name: "Spending", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: out + "/settings-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const saveSettings = page.getByRole("button", {
    name: "Save spending settings",
    exact: true,
  });
  const viewSpending = page.getByRole("link", {
    name: "View your spending",
    exact: true,
  });
  const saveBox = (await saveSettings.boundingBox())!;
  const viewBox = (await viewSpending.boundingBox())!;
  const formBox = await documentBox(".spending-settings > .form:first-of-type");
  expect(Math.abs(saveBox.x - formBox.x)).toBeLessThanOrEqual(1);
  expect(saveBox.x + saveBox.width).toBeLessThan(viewBox.x);
  expect(
    await saveSettings.evaluate(
      (el) =>
        !!(
          el.compareDocumentPosition(el.parentElement!.querySelector("a")!) &
          Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  const checkbox = page.getByRole("checkbox", {
    name: "Track my spending",
    exact: true,
  });
  const checkBox = (await checkbox.boundingBox())!;
  const labelBox = (await checkbox.locator("..").boundingBox())!;
  expect(
    Math.abs(
      checkBox.y + checkBox.height / 2 - labelBox.y - labelBox.height / 2,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: out + "/settings-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.evaluate(() => localStorage.setItem("little-hint:theme", "dark"));
  await page.goto(server.resolvedUrls!.local[0] + "buying/spending");
  await expect(page.locator(".spending-numbers")).toContainText("$145");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: out + "/mobile-dark.png", fullPage: true });
  // Connected state, unknown cost, planning, consent and prospective privacy.
  run("spending.connect", { userId: users[1].id });
  const connection = s.spendingConnections[0];
  command(s, users[1], "spending.connection", {
    id: connection.id,
    revision: connection.revision,
    operation: "accept",
  });
  run("spending.connection", {
    id: connection.id,
    revision: connection.revision,
    operation: "rules",
    rules: ["person:" + s.people[2].id],
  });
  for (const r of s.spendingRecords.filter((r) => r.kind === "purchase"))
    run("spending.share", { id: r.id, revision: r.revision, shared: true });
  run("spending.purchase", {
    title: "Gift with amount to add",
    recipientIds: [s.people[2].id],
    amountCents: null,
    date: new Date().toISOString().slice(0, 10),
  });
  const list = command(s, users[2], "lists.create", {
    name: "Emma’s Christmas",
    ownerIds: [s.people[2].id],
    groupIds: [s.groups[0].id],
    mode: "surprise",
  }) as { id: string };
  const gift = command(s, users[2], "items.create", {
    title: "Art supplies",
    listId: list.id,
    priceCents: 6000,
    quantity: 2,
  }) as { id: string };
  run("reservations.create", { itemId: gift.id, quantity: 2 });
  await page.evaluate(() => localStorage.setItem("little-hint:theme", "light"));
  await page.goto(
    server.resolvedUrls!.local[0] + "buying/spending?view=shared",
  );
  await expect(page.locator(".spending-numbers")).toContainText("$120");
  await expect(page.locator(".spending-numbers")).toContainText("amount");
  await page.screenshot({ path: out + "/shared-mobile.png" });
  await page
    .getByRole("button", { name: "Mark purchased", exact: true })
    .click();
  await page.getByLabel("Quantity bought").fill("2");
  await expect(page.getByLabel("Amount paid in USD, optional")).toHaveValue("");
  await page.getByRole("button", { name: "Use $120", exact: true }).click();
  await expect(page.getByLabel("Amount paid in USD, optional")).toHaveValue(
    "120",
  );
  await expect(
    page.getByRole("dialog").locator(".spending-privacy"),
  ).toContainText("Shared with Jamie");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Mark as purchased", exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: out + "/purchase-mobile.png" });
  await page
    .getByRole("checkbox", { name: "Keep this purchase private" })
    .check();
  await expect(
    page.getByRole("dialog").locator(".spending-privacy"),
  ).toContainText("Only me");
  await page
    .getByRole("button", { name: "Save purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const privateRecord = s.spendingRecords.find(
    (r) => r.title === "Art supplies" && r.kind === "purchase",
  );
  if (privateRecord?.sharing !== "private")
    throw new Error("Keep private was not enforced");
  const linkedGift = command(s, users[2], "items.create", {
    title: "Linked watercolor brushes",
    listId: list.id,
    priceCents: 2500,
    quantity: 1,
  }) as { id: string };
  await page.goto(server.resolvedUrls!.local[0] + "buying/spending");
  await page.getByRole("button", { name: "Add purchase", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Gift name" })
    .fill("Linked watercolor");
  await page
    .getByRole("dialog")
    .getByRole("option", { name: /Linked watercolor brushes/ })
    .click();
  await expect(page.getByLabel("Amount paid in USD, optional")).toHaveValue("");
  await page
    .getByRole("button", { name: "Save purchase", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const linkedReservation = s.reservations.find(
    (r) => r.itemId === linkedGift.id,
  );
  if (
    linkedReservation?.purchased !== 1 ||
    !s.spendingRecords.some(
      (r) =>
        r.reservationId === linkedReservation.id &&
        r.kind === "purchase" &&
        r.amountCents === null,
    )
  )
    throw new Error(
      "Linked purchase did not atomically preserve unknown cost and update status",
    );
  await page.goto(server.resolvedUrls!.local[0] + "settings?section=spending");
  await page
    .getByRole("button", { name: "Allow joint editing", exact: true })
    .click();
  await expect(
    page.getByText("Waiting for your partner to allow joint editing."),
  ).toBeVisible();
  await page
    .getByRole("heading", { name: "Spending partner", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/connected-settings-mobile.png" });
  await page
    .getByRole("heading", { name: "Joint editing", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/joint-editing-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.goto(server.resolvedUrls!.local[0] + "people/" + s.people[2].id);
  await expect(page.locator(".spending-quick")).toBeVisible();
  await expect(
    page
      .locator(".spending-quick")
      .getByRole("link", { name: /View spending/ }),
  ).toBeVisible();
  await page.screenshot({ path: out + "/person-desktop.png", fullPage: true });

  const joint = run("spending.purchase", {
    title: "Joint picnic hamper",
    recipientIds: [s.people[1].id, s.people[2].id],
    amountCents: 9000,
    date: "2026-11-02",
  }) as { id: string };
  await page.goto(server.resolvedUrls!.local[0] + "buying/spending");
  const jointRow = page.locator(".spending-row").filter({
    has: page.getByRole("heading", {
      name: "Joint picnic hamper",
      exact: true,
    }),
  });
  await jointRow
    .getByRole("button", { name: "Edit purchase", exact: true })
    .click();
  await expect(
    page.getByText("Split between recipients", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Jamie", { exact: true }).fill("2");
  await page.getByLabel("Emma", { exact: true }).fill("1");
  await page.screenshot({
    path: out + "/edit-multiple-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({
    path: out + "/edit-multiple-mobile.png",
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(s.spendingRecords.find((r) => r.id === joint.id)!.splits).toEqual([
    2, 1,
  ]);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await page.goto(server.resolvedUrls!.local[0] + "buying/spending");
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow) throw new Error("Spending overflows at 320px");
  await page.keyboard.press("Tab");
  // Assignment and layout regression checks use only this isolated fixture.
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(server.resolvedUrls!.local[0] + "buying/spending");
    await page
      .getByRole("button", { name: "Add purchase", exact: true })
      .click();
    const save = page.getByRole("button", {
      name: "Save purchase",
      exact: true,
    });
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    expect(
      Math.abs((await save.boundingBox())!.y - (await cancel.boundingBox())!.y),
    ).toBeLessThan(2);
    await page
      .getByRole("combobox", { name: "Gift name" })
      .fill("Example manual gift");
    await expect(
      page.getByRole("option", { name: /as a manual purchase/ }),
    ).toBeVisible();
    await page.screenshot({ path: out + `/gift-search-${width}.png` });
    if (width === 390) {
      await page.setViewportSize({ width, height: 400 });
      await expect(page.locator("dialog")).toHaveAttribute(
        "data-compact",
        "true",
      );
      expect(
        (await page.locator(".form-content").boundingBox())!.height,
      ).toBeGreaterThan(180);
      await page.screenshot({ path: out + "/purchase-keyboard-height.png" });
    }
  }
  await page.goto(server.resolvedUrls!.local[0] + "buying/spending");
  const assignmentRow = page.locator(".spending-row").filter({
    has: page.getByRole("heading", { name: "Watercolor set", exact: true }),
  });
  await assignmentRow
    .getByRole("button", { name: "Edit purchase", exact: true })
    .click();
  await page
    .getByLabel("Wish list, optional", { exact: true })
    .selectOption(list.id);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(
    s.spendingRecords.find((r) => r.title === "Watercolor set")!.listId,
  ).toBe(list.id);
  await assignmentRow.locator("summary").click();
  for (const button of await assignmentRow
    .locator(".entry-actions-content button")
    .all())
    expect(
      await button.evaluate((el) => getComputedStyle(el).textDecorationLine),
    ).toBe("none");
  process.env.SPENDING_ENABLED = "false";
  await page.goto(server.resolvedUrls!.local[0] + "buying/spending");
  await expect(page).toHaveURL(/\/buying$/);
  await expect(page.locator(".spending-quick")).toHaveCount(0);
  await page.goto(server.resolvedUrls!.local[0] + "settings?section=spending");
  await expect(
    page.getByRole("link", { name: "Spending", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Track my spending", { exact: true }),
  ).toHaveCount(0);
  delete process.env.SPENDING_ENABLED;
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Spending browser checks passed; desktop, mobile, settings and dark captures saved.",
  );
} finally {
  await browser.close();
  await server.close();
}
