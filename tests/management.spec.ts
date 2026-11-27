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
  await expect(page.locator(".gift-card .gift-title").first()).toHaveText(
    "Ceramic mug",
  );
  await page.getByRole("button", { name: "Reorder items" }).click();
  await page
    .getByRole("button", { name: "Move Poetry book up", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move Poetry book up", exact: true })
    .click();
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".gift-card .gift-title").first()).toHaveText(
    "Poetry book",
  );
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
  await expect(page.locator(".gift-card .gift-title").last()).toHaveText(
    "Poetry book",
  );
  for (const title of ["Alpine jacket", "Ceramic mug"]) {
    await page.getByLabel(`Actions for ${title}`, { exact: true }).click();
    await page
      .getByRole("button", { name: "Archive item", exact: true })
      .click();
    await expect(
      page.locator(".gift-card .gift-title").filter({ hasText: title }),
    ).toHaveCount(0);
  }
  await expect(page.locator(".gift-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Archived items", exact: true })
    .click();
  await expect(page.locator(".gift-card .gift-title")).toHaveText([
    "Ceramic mug",
    "Alpine jacket",
  ]);
  await expect(page.locator(".browse-summary")).toHaveText("Newest archived");
  await page.getByRole("button", { name: /^Sort & filter/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Sort & filter", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue(
    "archived-newest",
  );
  await expect(
    page.getByLabel("Sort by", { exact: true }).locator("option"),
  ).toHaveText([
    "Newest archived",
    "Oldest archived",
    "Priority",
    "Name A–Z",
    "Name Z–A",
    "Price low–high",
    "Price high–low",
  ]);
  await expect(
    page.getByRole("button", { name: "Reorder items", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Filter by tag", { exact: true })).toBeVisible();
  await mkdir("test-results/visual", { recursive: true });
  await page.screenshot({
    path: "test-results/visual/archived-sort-options.png",
  });
  await page
    .getByLabel("Sort by", { exact: true })
    .selectOption("archived-oldest");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".gift-card .gift-title")).toHaveText([
    "Alpine jacket",
    "Ceramic mug",
  ]);
  await page.reload();
  await page
    .getByRole("button", { name: "Archived items", exact: true })
    .click();
  await page.getByRole("button", { name: /^Sort & filter/ }).click();
  await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue(
    "archived-oldest",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Search items", { exact: true }).fill("mug");
  await expect(page.locator(".gift-card .gift-title")).toHaveText([
    "Ceramic mug",
  ]);
  await page.getByLabel("Search items", { exact: true }).fill("");
  await expect(page.locator(".gift-card")).toHaveCount(2);
  for (const title of ["Alpine jacket", "Ceramic mug"]) {
    await page.getByLabel(`Actions for ${title}`, { exact: true }).click();
    await page
      .getByRole("button", { name: "Restore item", exact: true })
      .click();
    await expect(
      page.locator(".gift-card .gift-title").filter({ hasText: title }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("group", { name: "Item status", exact: true })
    .getByRole("button", { name: "Active items", exact: true })
    .click();
  await page.getByRole("button", { name: /^Sort & filter/ }).click();
  await expect(page.getByLabel("Sort by", { exact: true })).toHaveValue(
    "price-desc",
  );
  await expect(
    page.getByRole("button", { name: "Reorder items", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const restoredList = (await readWorld(page)).lists.find(
    (l) => l.id === list.id,
  )!;
  expect(restoredList.itemOrder).toEqual([
    items[2].id,
    items[0].id,
    items[1].id,
  ]);
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
  const child = await post(page, "people", {
    name: "Managed recipient",
    managedGroupIds: [group.id],
  });
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
  ).not.toBeVisible();
  await entry
    .getByLabel(`Event actions for ${eventName}`, { exact: true })
    .click();
  await entry
    .getByRole("button", { name: "Other wish lists", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: /Managed recipient.*wish list/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await entry
    .getByLabel(`Event actions for ${eventName}`, { exact: true })
    .click();
  await expect(
    entry.getByText(`Shared with: ${group.name}`, { exact: false }),
  ).toBeVisible();
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

for (const local of [false, true])
  test(`Archived person sorting shares priority preferences with gift ideas (${local ? "local" : "paged"})`, async ({
    page,
  }) => {
    if (local)
      await page.route("**/api/v1/world", async (route) => {
        const headers = { ...route.request().headers() };
        delete headers["x-little-hint-world"];
        await route.continue({ headers });
      });
    await login(page, "alex@example.test");
    const world = await readWorld(page);
    const group = world.groups.find((g) => g.name === "The Morgan circle")!;
    const person = await post(page, "people", {
      name: `Archive sorts ${Date.now()}`,
      managedGroupIds: [group.id],
    });
    const list = await post(page, "lists", {
      name: "Archived sorting",
      ownerIds: [person.id],
      groupIds: [group.id],
      mode: "surprise",
    });
    for (const fields of [
      { listId: list.id, title: "A wish", priority: "most-wanted" },
      { listId: list.id, title: "Z wish", priority: "nice-to-have" },
      { recipientIds: [person.id], title: "Z idea", priority: "nice-to-have" },
      { recipientIds: [person.id], title: "A idea", priority: "most-wanted" },
    ]) {
      const item = await post(page, "items", fields);
      await post(page, "items/archive", {
        id: item.id,
        revision: item.revision,
        archived: true,
      });
    }
    const enterArchive = async () => {
      await page
        .getByRole("button", { name: "Archived items", exact: true })
        .click();
      await page.getByRole("button", { name: /^Sort & filter/ }).click();
    };
    const closeSort = () =>
      page.getByRole("button", { name: "Done", exact: true }).click();
    const sort = page.getByLabel("Sort by", { exact: true });
    const titles = page.locator(".gift-card .gift-title");
    await page.goto(`/people/${person.id}`);
    await enterArchive();
    await expect(sort).toHaveValue("archived-newest");
    await sort.selectOption("priority");
    await closeSort();
    await expect(titles).toHaveText(["A wish", "Z wish"]);
    await page.getByRole("tab", { name: /^Gift ideas for/ }).click();
    await enterArchive();
    await expect(sort).toHaveValue("priority");
    await expect(sort.locator('option[value="priority"]')).toHaveCount(1);
    await expect(sort.locator("option")).toHaveCount(7);
    await closeSort();
    await expect(titles).toHaveText(["A idea", "Z idea"]);
    await expect(page.locator(".browse-summary")).toHaveText("Priority");
    const archiveScope = `items:person:${person.id}:archived`;
    expect(
      (await readWorld(page)).organization?.find(
        (p) => p.scope === archiveScope,
      )?.sort,
    ).toBe("priority");
    await page
      .getByRole("tab", { name: "On their wish lists", exact: true })
      .click();
    await enterArchive();
    await expect(sort).toHaveValue("priority");
    await closeSort();
    await page.getByRole("tab", { name: /^Gift ideas for/ }).click();
    await enterArchive();
    await sort.selectOption("name-desc");
    await closeSort();
    await expect(titles).toHaveText(["Z idea", "A idea"]);
    await page
      .getByRole("tab", { name: "On their wish lists", exact: true })
      .click();
    await enterArchive();
    await expect(sort).toHaveValue("name-desc");
    await closeSort();
    await expect(titles).toHaveText(["Z wish", "A wish"]);
    await page.reload();
    await enterArchive();
    await expect(sort).toHaveValue("name-desc");
    await closeSort();
    await page.goto(`/lists/${list.id}`);
    await enterArchive();
    await expect(sort).toHaveValue("archived-newest");
  });

test("editing inside an archived wish list preserves individual archive state", async ({
  page,
}) => {
  await login(page, "alex@example.test");
  const world = await readWorld(page);
  const person = world.people.find((p) => p.userId === world.me.id)!;
  const list = await post(page, "lists", {
    name: `Archived wishes ${Date.now()}`,
    ownerIds: [person.id],
    groupIds: [],
    mode: "surprise",
  });
  const item = await post(page, "items", {
    listId: list.id,
    title: "Retained book",
  });
  await post(page, "lists/update", { ...list, archived: true });
  await page.goto(`/lists/${list.id}`);
  await page.getByLabel("Actions for Retained book", { exact: true }).click();
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await expect(
    page.getByLabel("Archive this item", { exact: true }),
  ).not.toBeChecked();
  await page
    .getByLabel("Item name", { exact: true })
    .fill("Retained book, edited");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const edited = (await readWorld(page)).items.find((i) => i.id === item.id)!;
  expect(edited.archived).toBe(true);
  expect(edited.individuallyArchived).toBe(false);
  expect(edited.archivedAt).toBeUndefined();
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
      ).not.toBeAttached();
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

for (const local of [false, true])
  test(`Gift idea priority editing and filtering (${local ? "local" : "paged"})`, async ({
    page,
  }) => {
    if (local)
      await page.route("**/api/v1/world", async (route) => {
        const headers = { ...route.request().headers() };
        delete headers["x-little-hint-world"];
        await route.continue({ headers });
      });
    await login(page, "alex@example.test");
    const person = await post(page, "people", {
      name: `Priority recipient ${Date.now()}`,
    });
    for (const [title, priority] of [
      ["First idea", "would-love"],
      ["Favorite idea", "most-wanted"],
      ["Unranked idea", null],
    ] as const)
      await post(page, "items", { title, recipientIds: [person.id], priority });
    await page.goto(`/people/${person.id}?tab=ideas`);
    await page.getByRole("tab", { name: /^Gift ideas for/ }).click();
    await page.getByRole("button", { name: /^Sort & filter/ }).click();
    await page.getByLabel("Sort by", { exact: true }).selectOption("priority");
    await page.getByLabel("Filter by priority").selectOption("most-wanted");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(".gift-card .gift-title")).toHaveText([
      "Favorite idea",
    ]);
    await page.getByRole("link", { name: /Favorite idea/ }).click();
    await expect(page.locator(".gift-detail-info .item-priority")).toHaveText(
      "Most wanted",
    );
    await page.goBack();
    await page.getByRole("button", { name: /^Sort & filter/ }).click();
    await expect(page.getByLabel("Filter by priority")).toHaveValue(
      "most-wanted",
    );
    await page.getByLabel("Filter by priority").selectOption("none");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.locator(".gift-card .gift-title")).toHaveText([
      "Unranked idea",
    ]);
    await page.getByLabel("Actions for Unranked idea", { exact: true }).click();
    await page
      .getByRole("button", { name: "Set priority", exact: true })
      .click();
    await page
      .getByLabel("Priority", { exact: true })
      .selectOption("nice-to-have");
    await page
      .getByRole("button", { name: "Save priority", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(".gift-card")).toHaveCount(0);
    await page
      .getByRole("region", { name: "Results", exact: true })
      .getByRole("button", { name: "Clear filters", exact: true })
      .click();
    await expect(page.locator(".gift-card .gift-title")).toHaveText([
      "Favorite idea",
      "First idea",
      "Unranked idea",
    ]);
    await page.getByLabel("Actions for Unranked idea", { exact: true }).click();
    await page
      .getByRole("button", { name: "Edit gift idea", exact: true })
      .click();
    await expect(page.getByLabel("Priority", { exact: true })).toHaveValue(
      "nice-to-have",
    );
    await page.getByLabel("Priority", { exact: true }).selectOption("");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    for (const [width, theme] of [
      [1280, "light"],
      [768, "light"],
      [390, "light"],
      [390, "dark"],
    ] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await page.screenshot({
        path: `test-results/visual/priority-cards-${local ? "local" : "paged"}-${width}-${theme}.png`,
      });
      await page.getByRole("button", { name: /^Sort & filter/ }).click();
      await expect(page.getByLabel("Filter by priority")).toBeVisible();
      await expect(page.getByRole("dialog")).toBeVisible();
      await mkdir("test-results/visual", { recursive: true });
      await page.screenshot({
        path: `test-results/visual/priority-${local ? "local" : "paged"}-${width}-${theme}.png`,
      });
      expect(
        await page
          .getByRole("dialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      await page.getByRole("button", { name: "Done", exact: true }).click();
    }
  });
