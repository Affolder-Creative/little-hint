import { expect, it } from "vitest";
import { emptyState, type ImportJob } from "../src/shared/model";
import { command, stamp, world } from "../src/server/domain";
import { hydrateWorld } from "../src/shared/world";
import {
  cancelledBuying,
  contributionHistory,
} from "../src/server/buying-history";
function fixture() {
  const s = emptyState();
  const actors = ["recipient", "buyer", "contributor", "stranger"].map(
    (id) => ({ id, name: id, email: `${id}@example.test` }),
  );
  s.people = actors.map((a) => ({
    ...stamp(),
    name: a.name,
    userId: a.id,
    guardians: [],
  }));
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[0].id,
    memberIds: actors.slice(0, 3).map((a) => a.id),
  };
  s.groups.push(group);
  const list = command(s, actors[0], "lists.create", {
    name: "Wishes",
    ownerIds: [s.people[0].id],
    groupIds: [group.id],
    mode: "surprise",
  }) as { id: string };
  const item = command(s, actors[0], "items.create", {
    listId: list.id,
    title: "Private gift",
    quantity: 3,
  }) as { id: string };
  const reservation = command(s, actors[1], "reservations.create", {
    itemId: item.id,
    quantity: 2,
  }) as { id: string };
  const r = s.reservations.find((r) => r.id === reservation.id)!;
  command(s, actors[1], "reservations.update", {
    id: r.id,
    revision: r.revision,
    quantity: 2,
    purchased: 1,
    poolTargetCents: 5000,
  });
  command(s, actors[2], "contributions.create", {
    reservationId: r.id,
    amountCents: 2500,
  });
  return { s, actors, r, list };
}
it("compact snapshots reuse authorized gift projections and omit history, preserving legacy clients", () => {
  const f = fixture();
  f.s.reservations.push({ ...f.r, ...stamp(), quantity: 0, purchased: 0 });
  const base = {
    ...stamp(),
    userId: f.actors[1].id,
    url: "https://example.test/gift",
    status: "complete" as const,
  };
  f.s.imports.push(base);
  for (const state of ["active", "saved", "discarded"] as const)
    f.s.imports.push({
      ...base,
      ...stamp(),
      draft: {
        revision: 1,
        kind: "item",
        listId: f.list.id,
        fields: { title: state },
        touched: [],
        state,
      },
    } as ImportJob);
  const full = world(f.s, f.actors[1]),
    compact = world(f.s, f.actors[1], true),
    hydrated = hydrateWorld(compact);
  expect(full.imports).toHaveLength(4);
  expect(compact.imports.map((j) => j.draft?.state)).toEqual(["active"]);
  expect(full.buying).toHaveLength(2);
  expect(compact.buying).toHaveLength(1);
  expect(compact.buying[0].item).toBeUndefined();
  expect(hydrated.buying[0].item).toEqual(full.buying[0].item);
  expect(hydrated.buying[0].item).toBe(hydrated.items[0]);
  expect(compact.contributionHistory).toEqual([]);
  expect(full.contributionHistory).toHaveLength(1);
  expect(hydrateWorld(full)).toBe(full);
  f.s.groups[0].memberIds = [f.actors[0].id];
  expect(
    hydrateWorld(world(f.s, f.actors[1], true)).buying[0].item,
  ).toBeUndefined();
});
it("history authorizes buyers and contributors without exposing recipient or stranger data", () => {
  const f = fixture();
  f.r.quantity = 0;
  expect(cancelledBuying(f.s, f.actors[1], {}).rows).toHaveLength(1);
  expect(contributionHistory(f.s, f.actors[1], {}).rows[0].purchaser).toBe(
    true,
  );
  expect(contributionHistory(f.s, f.actors[2], {}).rows[0].purchaser).toBe(
    false,
  );
  for (const actor of [f.actors[0], f.actors[3]]) {
    expect(cancelledBuying(f.s, actor, {}).rows).toEqual([]);
    expect(contributionHistory(f.s, actor, {}).rows).toEqual([]);
    expect(world(f.s, actor, true).items.every((i) => !i.reservations)).toBe(
      true,
    );
  }
  // Historical snapshots survive access revocation, but only for the people involved.
  f.s.items = [];
  f.s.groups = [];
  expect(contributionHistory(f.s, f.actors[2], {}).rows[0].title).toBe(
    "Private gift",
  );
});
it("cursor pages are bounded, stable on tied timestamps, and unaffected by newer insertions", () => {
  const f = fixture();
  f.s.reservations = [];
  for (let i = 0; i < 105; i++)
    f.s.reservations.push({
      ...f.r,
      ...stamp(),
      createdAt: "2026-01-01T00:00:00.000Z",
      quantity: 0,
    });
  const first = cancelledBuying(f.s, f.actors[1], {});
  expect(first.rows).toHaveLength(50);
  f.s.reservations.push({ ...f.r, ...stamp(), quantity: 0 });
  const second = cancelledBuying(f.s, f.actors[1], {
    cursor: first.nextCursor,
  });
  const third = cancelledBuying(f.s, f.actors[1], {
    cursor: second.nextCursor,
  });
  expect(
    new Set([...first.rows, ...second.rows, ...third.rows].map((r) => r.id))
      .size,
  ).toBe(105);
  expect(third.nextCursor).toBeNull();
  expect(
    cancelledBuying(f.s, f.actors[3], { cursor: first.nextCursor }).rows,
  ).toEqual([]);
  for (const raw of [
    { limit: 101 },
    { limit: 0 },
    { cursor: "not-json" },
    { cursor: '{"id":"bad"}' },
  ])
    expect(() => cancelledBuying(f.s, f.actors[1], raw)).toThrow();
});
it("historical imports and cancelled reservations no longer inflate the recurring payload", () => {
  const f = fixture();
  for (let i = 0; i < 1000; i++) {
    f.s.imports.push({
      ...stamp(),
      userId: f.actors[1].id,
      url: "https://example.test/product",
      status: "complete",
      result: { description: "Synthetic detail ".repeat(100) },
    });
    f.s.reservations.push({ ...f.r, ...stamp(), quantity: 0 });
  }
  const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v));
  expect(bytes(world(f.s, f.actors[1], true))).toBeLessThan(
    bytes(world(f.s, f.actors[1])) * 0.1,
  );
});
it("extracted commands retain revision and authorization checks through the public dispatcher", () => {
  const f = fixture();
  const list = f.s.lists[0];
  expect(() => command(f.s, f.actors[3], "lists.update", { ...list })).toThrow(
    "List not found",
  );
  expect(() =>
    command(f.s, f.actors[0], "lists.update", { ...list, revision: 99 }),
  ).toThrow("changed since");
  expect(() =>
    command(f.s, f.actors[3], "reservations.update", {
      id: f.r.id,
      revision: f.r.revision,
      quantity: 1,
      purchased: 1,
    }),
  ).toThrow("Reservation not found");
  expect(() =>
    command(f.s, f.actors[1], "reservations.update", {
      id: f.r.id,
      revision: 99,
      quantity: 1,
      purchased: 1,
    }),
  ).toThrow("changed since");
  expect(() =>
    command(f.s, f.actors[3], "exchanges.create", {
      name: "Exchange",
      groupId: f.s.groups[0].id,
      participantIds: f.s.people.slice(0, 2).map((p) => p.id),
      count: 1,
      excludeHousehold: false,
    }),
  ).toThrow("Exchange management");
});
