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
  const { state, actor, listId } = fixture(25);
  const list = state.lists.find((l) => l.id === listId)!;
  list.itemOrder = [...state.items].reverse().map((i) => i.id);
  list.archived = true;
  state.items[0].archived = true;
  const page = await itemPage(state, actor, { scope: "list", id: listId });
  expect(page.total).toBe(25);
  expect(page.rows[0].id).toBe(state.items[24].id);
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
  expect(page.counts).toEqual({ all: 49, purchased: 19, needsBuying: 30 });
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
