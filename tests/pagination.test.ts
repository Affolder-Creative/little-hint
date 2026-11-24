import { expect, it, vi } from "vitest";
vi.mock("../src/server/db", () => ({
  hydrateCollectionItems: vi.fn(async () => {}),
  readCollectionState: vi.fn(),
}));
import { hydrateCollectionItems } from "../src/server/db";
import { itemPage, buyingPage } from "../src/server/collections";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { stamp, world } from "../src/server/domain";
import { pageRows } from "../src/shared/pagination";
import { orderedArchivedItems } from "../src/shared/organization";
function fixture(n = 49) {
  const { state, actors } = stagingFixtures();
  const actor = actors[1];
  const original = state.items.find((i) =>
    world(state, actor).items.some(
      (v) => v.id === i.id && !v.isRecipient && v.listId,
    ),
  )!;
  state.items = Array.from({ length: n }, (_, index) => ({
    ...original,
    ...stamp(),
    title: `Gift ${String(index).padStart(4, "0")}`,
    archived: false,
    tags: index === n - 1 ? ["Last"] : [],
    description: "Detail",
  }));
  state.reservations = [];
  state.contributions = [];
  return { state, actor, listId: original.listId! };
}
it.each([0, 1, 24, 25, 49])("bounds and clamps %i entries", (n) => {
  const page = pageRows(
    Array.from({ length: n }, (_, i) => i),
    999,
  );
  expect(page.rows.length).toBeLessThanOrEqual(24);
  expect(page.page).toBe(Math.max(1, Math.ceil(n / 24)));
  expect(page.total).toBe(n);
});
it("filters before paging and hydrates only the chosen page", async () => {
  const { state, actor, listId } = fixture();
  const one = await itemPage(state, actor, {
    scope: "list",
    id: listId,
    sort: "name-asc",
  });
  const two = await itemPage(state, actor, {
    scope: "list",
    id: listId,
    sort: "name-asc",
    page: 2,
  });
  expect(one.rows).toHaveLength(24);
  expect(two.rows).toHaveLength(24);
  expect(new Set([...one.rows, ...two.rows].map((i) => i.id)).size).toBe(48);
  expect(one.total).toBe(49);
  expect(one.tags).toContain("Last");
  expect(one.rows[0].description).toBe("");
  expect(one.rows[0].comments).toBeUndefined();
  expect(hydrateCollectionItems).toHaveBeenLastCalledWith(
    state,
    two.rows.map((i) => i.id),
  );
  const filtered = await itemPage(state, actor, {
    scope: "list",
    id: listId,
    tag: "Last",
    page: 9,
  });
  expect(filtered.total).toBe(1);
  expect(filtered.page).toBe(1);
  expect(filtered.rows[0].title).toBe("Gift 0048");
});
it("denies strangers and hides availability from surprise recipients", async () => {
  const { state, actor, listId } = fixture();
  await expect(
    itemPage(
      state,
      { id: "stranger", name: "S", email: "s@example.test" },
      { scope: "list", id: listId },
    ),
  ).rejects.toThrow();
  const list = state.lists.find((l) => l.id === listId)!;
  list.mode = "surprise";
  const person = state.people.find((p) => p.id === list.ownerIds[0])!;
  const owner = {
    id: person.userId!,
    name: person.name,
    email: "owner@example.test",
  };
  const page = await itemPage(state, owner, {
    scope: "list",
    id: listId,
    available: "true",
  });
  expect(page.showAvailability).toBe(false);
  expect(page.total).toBe(49);
  expect(page.rows.every((i) => i.available === undefined)).toBe(true);
});
it("preserves manual order and all archived-list entries", async () => {
  const { state, listId } = fixture(25);
  const list = state.lists.find((l) => l.id === listId)!;
  const person = state.people.find((p) => p.id === list.ownerIds[0])!;
  const owner = {
    id: person.userId!,
    name: person.name,
    email: "owner@example.test",
  };
  list.itemOrder = [...state.items].reverse().map((i) => i.id);
  list.archived = true;
  state.items[0].archived = true;
  state.items[0].archivedAt = "2026-01-01T00:00:00.000Z";
  const page = await itemPage(state, owner, {
    scope: "list",
    id: listId,
    status: "archived",
  });
  expect(page.total).toBe(25);
  expect(page.rows[0].id).toBe(state.items[24].id);
});
it("orders archive times before pagination and retains legacy order across pages", async () => {
  const { state, listId } = fixture(51);
  const list = state.lists.find((l) => l.id === listId)!;
  const person = state.people.find((p) => p.id === list.ownerIds[0])!;
  const owner = {
    id: person.userId!,
    name: person.name,
    email: "owner@example.test",
  };
  list.itemOrder = [...state.items].reverse().map((i) => i.id);
  state.items.forEach((item, n) => {
    item.archived = true;
    item.createdAt = new Date(Date.UTC(2025, 0, n + 1)).toISOString();
  });
  state.items[0].archivedAt = "2026-01-03T00:00:00.000Z";
  state.items[1].archivedAt = "2026-01-02T00:00:00.000Z";
  state.items[2].archivedAt = state.items[1].archivedAt;
  const expected = [
    state.items[0],
    state.items[2],
    state.items[1],
    ...state.items.slice(3).reverse(),
  ].map((item) => item.id);
  for (const sort of [
    "manual",
    "newest",
    "oldest",
    "archived-newest",
    "archived-oldest",
  ]) {
    const expectedOrder =
      sort === "archived-oldest"
        ? [
            state.items[2],
            state.items[1],
            state.items[0],
            ...state.items.slice(3).reverse(),
          ].map((i) => i.id)
        : expected;
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        itemPage(state, owner, {
          scope: "list",
          id: listId,
          status: "archived",
          sort,
          page,
        }),
      ),
    );
    expect(pages.flatMap((page) => page.rows.map((i) => i.id))).toEqual(
      expectedOrder,
    );
    expect(pages[0].rows[0].archivedAt).toBeDefined();
    expect(pages[0].total).toBe(51);
  }
  expect(
    orderedArchivedItems(world(state, owner).items, list.itemOrder).map(
      (i) => i.id,
    ),
  ).toEqual(expected);
  const filtered = await itemPage(state, owner, {
    scope: "list",
    id: listId,
    status: "archived",
    tag: "Last",
    page: 3,
  });
  expect(filtered.rows.map((i) => i.id)).toEqual([state.items[50].id]);
  expect(filtered.page).toBe(1);
});
it("sorts dated and undated archives together by name, priority, and price", async () => {
  const { state, listId } = fixture(4);
  const list = state.lists.find((l) => l.id === listId)!;
  const person = state.people.find((p) => p.id === list.ownerIds[0])!;
  const owner = {
    id: person.userId!,
    name: person.name,
    email: "owner@example.test",
  };
  const [a, b, c, d] = state.items;
  state.items.forEach((i) => {
    i.archived = true;
  });
  a.archivedAt = "2026-01-02T00:00:00.000Z";
  c.archivedAt = "2026-01-01T00:00:00.000Z";
  a.title = "Zebra";
  b.title = "apple";
  c.title = "Book 10";
  d.title = "Book 2";
  a.priceCents = 100;
  b.priceCents = 100;
  c.priceCents = null;
  d.priceCents = 500;
  a.priority = "would-love";
  b.priority = "most-wanted";
  c.priority = null;
  d.priority = "nice-to-have";
  list.itemOrder = [d.id, c.id, b.id, a.id];
  for (const [sort, expected] of [
    ["name-asc", [b, d, c, a]],
    ["name-desc", [a, c, d, b]],
    ["price-asc", [b, a, d, c]],
    ["price-desc", [d, b, a, c]],
    ["priority", [b, a, d, c]],
  ] as const) {
    const page = await itemPage(state, owner, {
      scope: "list",
      id: listId,
      status: "archived",
      sort,
    });
    expect(page.rows.map((i) => i.id)).toEqual(expected.map((i) => i.id));
    expect(
      orderedArchivedItems(world(state, owner).items, list.itemOrder, sort).map(
        (i) => i.id,
      ),
    ).toEqual(expected.map((i) => i.id));
  }
});
it("sorts archived gift ideas by priority", async () => {
  const { state, actor } = fixture(3);
  state.items.forEach((item, n) => {
    delete item.listId;
    item.creatorId = actor.id;
    item.visibility = "private";
    item.archived = true;
    item.createdAt = new Date(Date.UTC(2025, 0, n + 1)).toISOString();
  });
  state.items[0].archivedAt = "2026-01-02T00:00:00.000Z";
  state.items[1].archivedAt = "2026-01-01T00:00:00.000Z";
  state.items[2].priority = "most-wanted";
  const page = await itemPage(state, actor, {
    scope: "person",
    id: state.items[0].recipientIds[0],
    tab: "ideas",
    status: "archived",
    sort: "priority",
  });
  expect(page.rows.map((i) => i.id)).toEqual(
    [state.items[2], state.items[0], state.items[1]].map((i) => i.id),
  );
});
it("keeps purchase counts independent of pages", async () => {
  const { state, actor } = fixture();
  state.reservations = state.items.map((i, n) => ({
    ...stamp(),
    itemId: i.id,
    buyerId: actor.id,
    quantity: 1,
    purchased: n < 30 ? 0 : 1,
    former: false,
    titleSnapshot: i.title,
  }));
  const page = await buyingPage(state, actor, { page: 2 });
  expect(page.rows).toHaveLength(6);
  expect(page.counts).toEqual({
    all: 49,
    purchased: 19,
    needsBuying: 30,
    awaiting: 0,
    inHand: 0,
  });
  expect(page.total).toBe(30);
});
it("omits item and reservation collections in negotiated world, retaining older clients", () => {
  const { state, actor } = fixture();
  const shell = world(state, actor, true, true);
  expect(shell.items).toEqual([]);
  expect(shell.buying).toEqual([]);
  expect(shell.watches).toEqual([]);
  expect(world(state, actor, true).items).toHaveLength(49);
});

it("defaults to available gifts, while search, explicit all, and archives recover taken gifts", async () => {
  const { state, actor, listId } = fixture(3);
  const taken = state.items[0];
  state.reservations.push({
    ...stamp(),
    itemId: taken.id,
    titleSnapshot: taken.title,
    buyerId: actor.id,
    quantity: taken.quantity,
    purchased: taken.quantity,
    former: false,
  });
  const scope = { scope: "list", id: listId };
  expect(
    (await itemPage(state, actor, scope)).rows.map((item) => item.id),
  ).not.toContain(taken.id);
  expect(
    (await itemPage(state, actor, { ...scope, search: taken.title })).rows[0]
      .id,
  ).toBe(taken.id);
  expect(
    (await itemPage(state, actor, { ...scope, available: "false" })).total,
  ).toBe(3);
  taken.quantity++;
  expect((await itemPage(state, actor, scope)).total).toBe(3);
  taken.quantity--;
  state.lists.find((list) => list.id === listId)!.archived = true;
  expect((await itemPage(state, actor, scope)).total).toBe(3);
});
it("filters wishes and ideas before pagination without losing collection facets", async () => {
  const { state, actor } = fixture(30);
  const idea = state.items[29];
  delete idea.listId;
  idea.creatorId = actor.id;
  idea.visibility = "private";
  const page = await itemPage(state, actor, { type: "idea", page: 2 });
  expect(page.total).toBe(1);
  expect(page.page).toBe(1);
  expect(page.rows[0].id).toBe(idea.id);
  expect(page.collectionTotal).toBe(30);
  expect((await itemPage(state, actor, { type: "wish" })).total).toBe(29);
});
it("preserves hidden-availability wishes in a collection with transparent wishes", async () => {
  const { state, listId } = fixture(2);
  const list = state.lists.find((list) => list.id === listId)!;
  list.mode = "surprise";
  const person = state.people.find((person) => person.id === list.ownerIds[0])!;
  const owner = {
    id: person.userId!,
    name: person.name,
    email: "owner@example.test",
  };
  const transparent = { ...list, ...stamp(), mode: "transparent" as const };
  state.lists.push(transparent);
  state.items[1].listId = transparent.id;
  state.reservations.push({
    ...stamp(),
    itemId: state.items[0].id,
    titleSnapshot: state.items[0].title,
    buyerId: "other",
    quantity: state.items[0].quantity,
    purchased: 1,
    former: false,
  });
  const page = await itemPage(state, owner, { scope: "person", id: person.id });
  expect(page.showAvailability).toBe(true);
  expect(page.total).toBe(2);
  expect(
    page.rows.find((item) => item.id === state.items[0].id)!.available,
  ).toBeUndefined();
});

it("Home uses others before filters and falls back to owned wishes only when others are absent", async () => {
  const { state, actors } = stagingFixtures();
  const actor = actors[0];
  const visible = world(state, actor);
  const own = visible.items.find(
    (i) => i.isRecipient && !i.archived && i.listId,
  )!;
  const other = visible.items.find((i) => !i.isRecipient && !i.archived)!;
  expect(world(state, actor, true, true).homeFeedMode).toBe("gifting");
  const filtered = await itemPage(state, actor, {
    scope: "home",
    search: "no-such-wish-unique",
  });
  expect(filtered.total).toBe(0);
  expect(world(state, actor, true, true).homeFeedMode).toBe("gifting");
  state.items = state.items.filter((i) => i.id === own.id || i.id === other.id);
  const gifting = await itemPage(state, actor, { scope: "home" });
  expect(gifting.rows.map((i) => i.id)).toEqual([other.id]);
  state.items = state.items.filter((i) => i.id === own.id);
  expect(world(state, actor, true, true).homeFeedMode).toBe("own");
  const fallback = await itemPage(state, actor, { scope: "home" });
  expect(fallback.rows.map((i) => i.id)).toEqual([own.id]);
});

it("filters list visibility before pagination and accounts for other managers", async () => {
  const { state, listId } = fixture(49);
  const list = state.lists.find((l) => l.id === listId)!;
  const person = state.people.find((p) => p.id === list.ownerIds[0])!;
  const owner = {
    id: person.userId!,
    name: person.name,
    email: "owner@example.test",
  };
  list.ownerIds = [person.id];
  list.groupIds = [];
  person.guardians = [];
  state.coManagement = [];
  const privatePage = await itemPage(state, owner, {
    scope: "list",
    id: listId,
    visibility: "only-me",
  });
  expect(privatePage.total).toBe(49);
  expect(privatePage.rows).toHaveLength(24);
  expect(
    (
      await itemPage(state, owner, {
        scope: "list",
        id: listId,
        visibility: "shared",
      })
    ).total,
  ).toBe(0);
  person.guardians.push(
    state.people.find((p) => p.userId && p.userId !== owner.id)!.userId!,
  );
  expect(
    (
      await itemPage(state, owner, {
        scope: "list",
        id: listId,
        visibility: "shared",
        page: 3,
      })
    ).rows,
  ).toHaveLength(1);
});

it("filters private and shared ideas across pages without exposing other authors' private ideas", async () => {
  const { state, actor } = fixture(51);
  const group = state.groups.find((g) => g.memberIds.includes(actor.id))!;
  state.items.forEach((i, n) => {
    delete i.listId;
    i.creatorId = actor.id;
    i.visibility = n < 25 ? "private" : "hidden";
    i.groupIds = n < 25 ? [] : [group.id];
  });
  const privatePage = await itemPage(state, actor, {
    visibility: "only-me",
    available: "false",
    page: 2,
  });
  expect(privatePage.total).toBe(25);
  expect(privatePage.rows).toHaveLength(1);
  const shared = await itemPage(state, actor, {
    visibility: "shared",
    available: "false",
    page: 2,
  });
  expect(shared.total).toBe(26);
  expect(shared.rows).toHaveLength(2);
  state.items[0].creatorId = "someone-else";
  expect(
    (
      await itemPage(state, actor, {
        visibility: "only-me",
        available: "false",
      })
    ).total,
  ).toBe(24);
});

it("filters priorities before paging, including missing and null priorities", async () => {
  const { state, actor, listId } = fixture(49);
  state.items.forEach((item, n) => {
    item.priority = n < 25 ? "most-wanted" : n < 47 ? "would-love" : null;
  });
  delete state.items[48].priority;
  const query = { scope: "list", id: listId, available: "false" };
  const page = await itemPage(state, actor, {
    ...query,
    priority: "most-wanted",
    page: 2,
  });
  expect(page.total).toBe(25);
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0].priority).toBe("most-wanted");
  const none = await itemPage(state, actor, {
    ...query,
    priority: "none",
    page: 9,
  });
  expect(none.total).toBe(2);
  expect(none.page).toBe(1);
  const combined = await itemPage(state, actor, {
    ...query,
    priority: "none",
    tag: "Last",
  });
  expect(combined.total).toBe(1);
  await expect(
    itemPage(state, actor, { ...query, priority: "invalid" }),
  ).rejects.toThrow();
});

it.each([false, true])(
  "filters gift ideas by priority with archived=%s",
  async (archived) => {
    const { state, actor } = fixture(3);
    state.items.forEach((item, n) => {
      delete item.listId;
      item.creatorId = actor.id;
      item.visibility = "private";
      item.archived = archived;
      item.priority = n === 0 ? "most-wanted" : n === 1 ? "nice-to-have" : null;
    });
    const query = {
      scope: "person",
      id: state.items[0].recipientIds[0],
      tab: "ideas",
      status: archived ? "archived" : "active",
      sort: "priority",
    };
    const filtered = await itemPage(state, actor, {
      ...query,
      priority: "nice-to-have",
    });
    expect(filtered.rows.map((i) => i.id)).toEqual([state.items[1].id]);
    expect(
      (await itemPage(state, actor, { ...query, priority: "none" })).rows.map(
        (i) => i.id,
      ),
    ).toEqual([state.items[2].id]);
  },
);
it("sorts Buying globally before paging and never sorts by hidden prices", async () => {
  const { state, actor } = fixture(49);
  state.items.forEach((i, n) => {
    i.priceCents = (49 - n) * 100;
  });
  state.reservations = state.items.map((i, n) => ({
    ...stamp(),
    createdAt: new Date(Date.UTC(2026, 0, n + 1)).toISOString(),
    itemId: i.id,
    buyerId: actor.id,
    quantity: 1,
    purchased: 0,
    former: false,
    titleSnapshot: i.title,
  }));
  const newest = await buyingPage(state, actor, {});
  expect(newest.rows[0].id).toBe(state.reservations[48].id);
  const cheap = await buyingPage(state, actor, { sort: "price-asc", page: 2 });
  expect(cheap.rows[0].item?.priceCents).toBe(2500);
  state.items[48].visibility = "private";
  state.items[48].listId = undefined;
  state.items[48].creatorId = "unavailable";
  const hidden = await buyingPage(state, actor, { sort: "price-asc", page: 3 });
  expect(hidden.rows.at(-1)?.item).toBeUndefined();
});
