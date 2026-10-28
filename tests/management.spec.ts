import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { login, post } from "./browser-helpers";
import type { World } from "../src/shared/model";
const readWorld = async (
  page: import("@playwright/test").Page,
): Promise<World> => (await page.request.get("/api/v1/world")).json();

test("priorities, shared ordering, Trash, and event preservation", async ({
  page,
}) => {
  test.setTimeout(120000);
  await login(page, "alex@example.test");
  let world = await readWorld(page);
  const person = world.people.find((p) => p.userId === world.me.id)!;
  const group = world.groups.find((g) => g.name === "The Morgan circle")!;
  const name = `Management wishes ${Date.now()}`;
  const list = await post(page, "lists", {
    name,
    ownerIds: [person.id],
    groupIds: [group.id],
    mode: "surprise",
  });
  const items = [];
  for (const [title, priceCents] of [
    ["Alpine jacket", 10000],
    ["Ceramic mug", 2000],
    ["Poetry book", null],
  ] as const)
    items.push(
      await post(page, "items", {
        listId: list.id,
        title,
        priceCents,
        allowDuplicate: true,
      }),
    );
  await page.goto(`/lists/${list.id}`);
  await page.getByLabel("Actions for Ceramic mug", { exact: true }).click();
  await page.getByRole("button", { name: "Set priority", exact: true }).click();
  await page
    .getByLabel("Priority", { exact: true })
    .selectOption("most-wanted");
  await page
    .getByRole("button", { name: "Save priority", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /^Sort & filter/ }).click();
  await page.getByLabel("Sort by", { exact: true }).selectOption("priority");
  await expect(page.locator(".gift-card h3").first()).toHaveText("Ceramic mug");
  await page.getByRole("button", { name: "Reorder items" }).click();
  await page
    .getByRole("button", { name: "Move Poetry book up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move Poetry book up", exact: true })
    .click();
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".gift-card h3").first()).toHaveText("Poetry book");
  await expect(
    page
      .locator(".gift-card")
      .filter({ hasText: "Ceramic mug" })
      .getByText("Most wanted"),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Sort & filter/ }).click();
  await page.getByLabel("Sort by", { exact: true }).selectOption("price-desc");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /^Sort & filter/ }).click();
  await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue(
    "price-desc",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".gift-card h3").last()).toHaveText("Poetry book");
  await page.getByLabel("Actions for Ceramic mug", { exact: true }).click();
  await page.getByRole("button", { name: "Archive item", exact: true }).click();
  await expect(page.locator(".gift-card")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Archived items", exact: true })
    .click();
  await expect(page.locator(".gift-card h3")).toHaveText(["Ceramic mug"]);
  await page.getByLabel("Actions for Ceramic mug", { exact: true }).click();
  await page.getByRole("button", { name: "Restore item", exact: true }).click();
  await page.getByRole("button", { name: "Active items", exact: true }).click();
  await page.getByLabel("Actions for Ceramic mug", { exact: true }).click();
  await page
    .getByRole("button", { name: "Move to Trash", exact: true })
    .last()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(page.locator(".gift-card")).toHaveCount(2);
  await page.goto("/lists?view=trash");
  let row = page.locator(".trash-row").filter({ hasText: "Ceramic mug" });
  await row.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(row).toHaveCount(0);
  world = await readWorld(page);
  const child = await post(page, "people", { name: "Managed recipient" });
  const eventName = `Family celebration ${Date.now()}`;
  const event = await post(page, "group-events", {
    groupId: group.id,
    name: eventName,
    participantIds: [person.id, child.id],
    mode: "surprise",
  });
  await page.goto("/lists");
  const entry = page.locator(".event-entry").filter({ hasText: eventName });
  await expect(
    page.getByRole("heading", { name: eventName, exact: true }),
  ).toHaveCount(1);
  await expect(
    entry.getByRole("link", { name: "Your wish list", exact: true }),
  ).toBeVisible();
  await expect(
    entry.getByRole("link", { name: /Managed recipient.*wish list/ }),
  ).toBeVisible();
  await expect(
    entry.getByText(`Shared with: ${group.name}`, { exact: false }),
  ).toBeVisible();
  await entry
    .getByLabel(`Event actions for ${eventName}`, { exact: true })
    .click();
  await entry
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  row = page.locator(".trash-row").filter({ hasText: eventName });
  await row
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Participants keep their wish lists",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(row).toHaveCount(0);
  world = await readWorld(page);
  expect(world.groupEvents.some((e) => e.id === event.id)).toBe(false);
  expect(
    world.lists
      .filter((l) => l.name === eventName)
      .every((l) => l.archived && !l.groupEventId && l.canManageSettings),
  ).toBe(true);
});

test("management screens remain clear on desktop and mobile in both themes", async ({
  page,
}) => {
  test.setTimeout(180000);
  await mkdir("test-results/visual", { recursive: true });
  await login(page, "alex@example.test");
  const world = await readWorld(page),
    person = world.people.find((p) => p.userId === world.me.id)!;
  const group = world.groups.find((g) => g.name === "The Morgan circle")!;
  const event = await post(page, "group-events", {
    groupId: group.id,
    name: "Winter celebration with the people we know best",
    participantIds: [
      person.id,
      world.people.find(
        (p) =>
          p.userId &&
          p.userId !== world.me.id &&
          group.memberIds.includes(p.userId),
      )!.id,
    ],
    mode: "surprise",
  });
  const w = await readWorld(page),
    list = w.lists.find((l) => l.groupEventId === event.id && l.canEdit)!;
  for (const [title, priority] of [
    ["A good book for a quiet afternoon", "most-wanted"],
    ["Coffee for slow mornings", "would-love"],
    ["A warm scarf", "nice-to-have"],
  ] as const)
    await post(page, "items", {
      title,
      listId: list.id,
      priority,
      allowDuplicate: true,
    });
  const exchange = await post(page, "exchanges", {
    name: "Winter gift exchange",
    groupId: group.id,
    participantIds: world.people
      .filter((p) => p.userId && group.memberIds.includes(p.userId))
      .map((p) => p.id),
    count: 1,
    excludeHousehold: false,
  });
  await post(page, "exchanges/draw", { id: exchange.id, revision: 1 });
  for (const [width, theme] of [
    [1440, "light"],
    [390, "light"],
    [390, "dark"],
    [320, "dark"],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(
      (theme) => localStorage.setItem("little-hint:theme", theme),
      theme,
    );
    for (const [name, route] of [
      ["lists", "/lists"],
      ["items", `/lists/${list.id}`],
      ["exchanges", "/exchanges"],
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(
        page.getByText("Created by Affolder Creative", { exact: true }),
      ).toBeAttached();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect
        .soft(
          (
            await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze()
          ).violations,
        )
        .toEqual([]);
      await page.screenshot({
        path: `test-results/visual/management-${name}-${width}-${theme}.png`,
        fullPage: true,
      });
      if (name === "exchanges") {
        const panel = page
          .locator(".exchange-panel")
          .filter({ hasText: "Winter gift exchange" })
          .last();
        const status = await panel
          .locator(".exchange-notifications")
          .boundingBox();
        const actions = await panel.locator(":scope > .actions").boundingBox();
        expect(actions!.y + actions!.height).toBeLessThanOrEqual(status!.y);
      }
    }
  }
});

test("exchange archive, Trash, and restore remain separate actions", async ({
  page,
}) => {
  await login(page, "alex@example.test");
  const world = await readWorld(page),
    group = world.groups.find((g) => g.name === "The Morgan circle")!;
  const name = `Recoverable exchange ${Date.now()}`;
  const exchange = await post(page, "exchanges", {
    name,
    groupId: group.id,
    participantIds: world.people
      .filter((p) => p.userId && group.memberIds.includes(p.userId))
      .map((p) => p.id),
    count: 1,
    excludeHousehold: false,
  });
  await page.goto("/exchanges");
  const panel = page.locator(`#exchange-${exchange.id}`);
  await panel
    .getByLabel(`Exchange actions for ${name}`, { exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Archive exchange", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Archived", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Draw names", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByLabel(`Exchange actions for ${name}`, { exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Restore exchange", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Current", exact: true }).click();
  await panel
    .getByLabel(`Exchange actions for ${name}`, { exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move to Trash", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Trash", exact: true }).click();
  const row = page.locator(".trash-row").filter({ hasText: name });
  await row.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.getByRole("button", { name: "Current", exact: true }).click();
  await expect(panel).toBeVisible();
});
