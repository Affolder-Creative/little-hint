import { commandWithAudience as command } from "./discussion-command";
import { expect, it, vi } from "vitest";
vi.mock("../src/server/db", () => ({
  hydrateCollectionItems: vi.fn(async () => {}),
  readCollectionState: vi.fn(),
}));
import { itemPage } from "../src/server/collections";
import { stamp, world } from "../src/server/domain";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { spendingAssignmentPreview } from "../src/server/spending";
import type { Item } from "../src/shared/model";

function setup() {
  const { state, actors } = stagingFixtures();
  const actor = actors[0];
  const visible = world(state, actor);
  const wish = state.items.find((i) =>
    visible.items.some(
      (v) => v.id === i.id && !v.isRecipient && !v.archived && v.listId,
    ),
  )!;
  const list = state.lists.find((l) => l.id === wish.listId)!;
  const idea = {
    ...wish,
    ...stamp(),
    listId: undefined,
    creatorId: actor.id,
    visibility: "private" as const,
    title: "Assigned idea",
    spendingListId: list.id,
  };
  state.items.push(idea);
  state.reservations = [];
  return { state, actors, actor, wish, list, idea };
}
it("includes only the viewer's explicitly assigned ideas, before paging and filtering", async () => {
  const f = setup();
  const wishes = f.state.items.filter((i) => i.listId === f.list.id);
  f.state.items = [
    ...wishes,
    ...Array.from({ length: 26 }, (_, n) => ({
      ...f.idea,
      ...stamp(),
      title: `Idea ${n}`,
      tags: n === 25 ? ["Last idea"] : [],
    })),
    { ...f.idea, ...stamp(), spendingListId: null, title: "Unassigned" },
    {
      ...f.idea,
      ...stamp(),
      creatorId: f.actors[1].id,
      visibility: "visible",
      title: "Another creator",
    },
  ];
  const query = {
    scope: "list",
    id: f.list.id,
    includeIdeas: "true",
    type: "idea",
    available: "false",
  };
  const first = await itemPage(f.state, f.actor, query);
  const second = await itemPage(f.state, f.actor, { ...query, page: 2 });
  expect(first.total).toBe(26);
  expect(first.rows).toHaveLength(24);
  expect(second.rows).toHaveLength(2);
  expect(new Set([...first.rows, ...second.rows].map((i) => i.id)).size).toBe(
    26,
  );
  expect(
    (
      await itemPage(f.state, f.actor, { ...query, tag: "Last idea", page: 9 })
    ).rows.map((i) => i.title),
  ).toEqual(["Idea 25"]);
  expect(
    (await itemPage(f.state, f.actor, { ...query, includeIdeas: "false" }))
      .total,
  ).toBe(0);
  for (const actor of f.actors.slice(1)) {
    if (!world(f.state, actor).lists.some((l) => l.id === f.list.id)) continue;
    const page = await itemPage(f.state, actor, query);
    expect(page.rows.some((i) => i.title.startsWith("Idea "))).toBe(false);
    expect(page.tags).not.toContain("Last idea");
  }
});
it("keeps wish order, sorts ideas newest first, and honors individual archive state", async () => {
  const f = setup();
  f.state.items = [
    f.wish,
    f.idea,
    {
      ...f.idea,
      ...stamp(),
      title: "Newest idea",
      createdAt: "2099-01-01T00:00:00Z",
    },
  ];
  f.list.itemOrder = [f.wish.id];
  const q = {
    scope: "list",
    id: f.list.id,
    includeIdeas: "true",
    available: "false",
  };
  expect(
    (await itemPage(f.state, f.actor, q)).rows.map((i) => i.title),
  ).toEqual([f.wish.title, "Newest idea", f.idea.title]);
  f.idea.archived = true;
  expect(
    (await itemPage(f.state, f.actor, { ...q, status: "archived" })).rows.map(
      (i) => i.id,
    ),
  ).toEqual([f.idea.id]);
  expect(
    (await itemPage(f.state, f.actor, { ...q, publicationState: "draft" }))
      .rows,
  ).toEqual([]);
});
it("deduplicates joint recipient assignments and excludes inaccessible lists", async () => {
  const f = setup();
  f.idea.spendingAllocations = f.idea.recipientIds.map((recipientId) => ({
    recipientId,
    share: 1,
    listId: f.list.id,
  }));
  const page = await itemPage(f.state, f.actor, {
    scope: "list",
    id: f.list.id,
    includeIdeas: "true",
    type: "idea",
  });
  expect(page.rows.map((i) => i.id)).toEqual([f.idea.id]);
  await expect(
    itemPage(
      f.state,
      { id: "stranger", name: "Stranger", email: "s@example.test" },
      { scope: "list", id: f.list.id, includeIdeas: "true" },
    ),
  ).rejects.toThrow("Wish list not found");
});
it.each([false, true])(
  "saves list organization while tracking is off, deployment disabled=%s, without changing history",
  (disabled) => {
    const f = setup();
    command(f.state, f.actor, "spending.settings", {
      enabled: true,
      summaries: true,
    });
    const result = command(f.state, f.actor, "items.create", {
      title: "New private plan",
      recipientIds: f.wish.recipientIds,
      visibility: "private",
      groupIds: [],
      priceCents: 2000,
    }) as Item;
    const item = f.state.items.find((i) => i.id === result.id)!;
    command(f.state, f.actor, "reservations.create", {
      itemId: item.id,
      quantity: 1,
      ordinary: true,
    });
    command(f.state, f.actor, "spending.settings", {
      enabled: false,
      summaries: true,
    });
    const before = JSON.stringify(f.state.spendingRecords);
    if (disabled) vi.stubEnv("SPENDING_ENABLED", "false");
    try {
      for (const invalidList of [
        "11111111-1111-4111-8111-111111111111",
        f.state.lists.find((l) => !l.ownerIds.includes(item.recipientIds[0]))!
          .id,
      ])
        expect(() =>
          command(f.state, f.actor, "items.update", {
            ...item,
            spendingListId: invalidList,
          }),
        ).toThrow("Choose an available wish list");
      command(f.state, f.actor, "items.update", {
        ...item,
        spendingListId: f.list.id,
      });
      expect(item.spendingListId).toBe(f.list.id);
      expect(JSON.stringify(f.state.spendingRecords)).toBe(before);
      command(f.state, f.actor, "items.update", {
        ...item,
        spendingListId: null,
      });
      expect(item.spendingListId).toBeNull();
      expect(JSON.stringify(f.state.spendingRecords)).toBe(before);
    } finally {
      vi.unstubAllEnvs();
    }
    command(f.state, f.actor, "spending.settings", {
      enabled: true,
      summaries: true,
    });
    expect(() =>
      command(f.state, f.actor, "items.update", {
        ...item,
        spendingListId: f.list.id,
      }),
    ).toThrow("Review the affected");
    const preview = spendingAssignmentPreview(f.state, f.actor, {
      item: item.id,
      list: f.list.id,
    });
    command(f.state, f.actor, "items.update", {
      ...item,
      spendingListId: f.list.id,
      spendingAssignmentToken: preview.token,
    });
    expect(f.state.spendingRecords.some((r) => r.listId === f.list.id)).toBe(
      true,
    );
  },
);
