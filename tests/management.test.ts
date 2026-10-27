import { describe, expect, it } from "vitest";
import {
  emptyState,
  type Item,
  type List,
  type Exchange,
  type GroupEvent,
} from "../src/shared/model";
import {
  command,
  stamp,
  world,
  giftSummary,
  idempotent,
} from "../src/server/domain";
import { trash } from "../src/server/management";
import { ordered } from "../src/shared/organization";
import { activityAllowed } from "../src/server/activity";

function fixture() {
  const s = emptyState();
  const actors = ["Alex", "Sam", "Jamie", "Outsider"].map((name) => ({
    id: stamp().id,
    name,
    email: `${name}@example.test`,
  }));
  s.people = actors.map((a) => ({
    ...stamp(),
    name: a.name,
    userId: a.id,
    guardians: [],
  }));
  const group = {
    ...stamp(),
    name: "Family",
    memberIds: actors.slice(0, 3).map((a) => a.id),
    ownerId: actors[0].id,
  };
  s.groups.push(group);
  const lists = actors.slice(0, 3).map(
    (a, n) =>
      command(s, a, "lists.create", {
        name: `${a.name}'s wishes`,
        ownerIds: [s.people[n].id],
        groupIds: [group.id],
        mode: "surprise",
      }) as List,
  );
  const list = lists[0];
  const add = (title: string) => {
    const view = command(s, actors[0], "items.create", {
      title,
      listId: list.id,
      quantity: 5,
    }) as Item;
    return s.items.find((i) => i.id === view.id)!;
  };
  const item = add("Book");
  const run = (
    action: string,
    row: { id: string; revision: number },
    extra = {},
    actor = actors[0],
  ) =>
    command(s, actor, action, { id: row.id, revision: row.revision, ...extra });
  const exchange = () => {
    const result = command(s, actors[0], "exchanges.create", {
      name: "Winter draw",
      groupId: group.id,
      participantIds: s.people.slice(0, 3).map((p) => p.id),
      count: 1,
      excludeHousehold: false,
    }) as Exchange;
    return s.exchanges.find((e) => e.id === result.id)!;
  };
  return { s, actors, group, lists, list, item, add, run, exchange };
}
describe("recoverable and permanent deletion", () => {
  it("cannot accept ownership while a list is in Trash", () => {
    const f = fixture();
    f.list.pendingOwnerIds = [f.s.people[1].id];
    f.run("lists.trash", f.list);
    expect(() =>
      command(f.s, f.actors[1], "lists.accept", { id: f.list.id }),
    ).toThrow("not found");
    f.run("lists.restore", f.list);
    command(f.s, f.actors[1], "lists.accept", { id: f.list.id });
    expect(f.list.ownerIds).toContain(f.s.people[1].id);
  });
  it("limits Trash and lifecycle mutations to managers, including direct requests", () => {
    const f = fixture();
    for (const actor of f.actors.slice(1))
      expect(() => f.run("items.trash", f.item, {}, actor)).toThrow(
        "not found",
      );
    expect(() => f.run("items.purge", f.item)).toThrow("Trash");
    f.run("items.trash", f.item);
    expect(world(f.s, f.actors[0]).items).toEqual([]);
    expect(world(f.s, f.actors[1]).items).toEqual([]);
    expect(trash(f.s, f.actors[0]).map((r) => r.id)).toEqual([f.item.id]);
    expect(trash(f.s, f.actors[1])).toEqual([]);
    expect(() => command(f.s, f.actors[0], "items.update", f.item)).toThrow(
      "not found",
    );
    f.run("items.restore", f.item);
    expect(world(f.s, f.actors[0]).items).toHaveLength(1);
  });
  it("restores a list without restoring individually removed or archived items", () => {
    const f = fixture(),
      second = f.add("Mug"),
      third = f.add("Sweater");
    f.run("items.trash", second);
    f.run("items.archive", third, { archived: true });
    f.run("lists.trash", f.list);
    expect(trash(f.s, f.actors[0]).map((r) => r.kind)).toEqual(["lists"]);
    expect(() => f.add("Hidden")).toThrow("not found");
    f.run("lists.restore", f.list);
    expect(
      world(f.s, f.actors[0]).items.map((i) => [i.title, i.archived]),
    ).toEqual([
      ["Book", false],
      ["Sweater", true],
    ]);
    expect(trash(f.s, f.actors[0]).map((r) => r.id)).toEqual([second.id]);
  });
  it("keeps purchase and contribution history usable when its source is permanently removed", () => {
    const f = fixture();
    const created = command(f.s, f.actors[1], "reservations.create", {
      itemId: f.item.id,
      quantity: 2,
    }) as { id: string };
    const reservation = f.s.reservations.find((r) => r.id === created.id)!;
    f.run(
      "reservations.update",
      reservation,
      { quantity: 2, purchased: 1, poolTargetCents: 10000 },
      f.actors[1],
    );
    const c = command(f.s, f.actors[2], "contributions.create", {
      reservationId: reservation.id,
      amountCents: 1000,
    }) as { id: string };
    const contribution = f.s.contributions.find((r) => r.id === c.id)!;
    command(f.s, f.actors[1], "comments.create", {
      itemId: f.item.id,
      body: "Private discussion",
    });
    f.run("lists.trash", f.list);
    f.run("lists.purge", f.list);
    expect(f.s.items).toEqual([]);
    expect(f.s.comments).toEqual([]);
    const buying = world(f.s, f.actors[1]).buying[0];
    expect(buying.titleSnapshot).toBe("Book");
    expect(buying.item).toBeUndefined();
    expect(buying.purchased).toBe(1);
    expect(() =>
      f.run(
        "reservations.update",
        reservation,
        { quantity: 2, purchased: 2 },
        f.actors[1],
      ),
    ).toThrow("new purchases");
    f.run(
      "reservations.update",
      reservation,
      { quantity: 2, purchased: 0 },
      f.actors[1],
    );
    f.run(
      "contributions.update",
      contribution,
      { status: "sent" },
      f.actors[2],
    );
    f.run(
      "contributions.update",
      contribution,
      { status: "received" },
      f.actors[1],
    );
    expect(
      world(f.s, f.actors[2]).contributionHistory[0].contribution.status,
    ).toBe("received");
  });
  it("never discloses hidden buying activity through deletion results or Trash entries", () => {
    const f = fixture();
    const clone = structuredClone(f.s);
    command(clone, f.actors[1], "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
    });
    const payload = { id: f.item.id, revision: f.item.revision };
    expect(command(clone, f.actors[0], "items.trash", payload)).toEqual(
      command(f.s, f.actors[0], "items.trash", payload),
    );
    expect(trash(clone, f.actors[0]).map(({ deletedAt, ...r }) => r)).toEqual(
      trash(f.s, f.actors[0]).map(({ deletedAt, ...r }) => r),
    );
    expect(world(clone, f.actors[0]).buying).toEqual([]);
  });
  it("protects stale mutations and accepts an idempotent retry", () => {
    const f = fixture();
    const payload = { id: f.item.id, revision: f.item.revision };
    idempotent(f.s, f.actors[0], "trash_retry_key_123", "items.trash", payload);
    expect(
      idempotent(
        f.s,
        f.actors[0],
        "trash_retry_key_123",
        "items.trash",
        payload,
      ),
    ).toMatchObject({ replayed: true });
    expect(() => command(f.s, f.actors[0], "items.restore", payload)).toThrow(
      "changed",
    );
  });
  it("keeps joint-owner and guardian permissions without granting group-wide item editing", () => {
    const f = fixture();
    f.s.people[0].guardians.push(f.actors[2].id);
    f.run("items.trash", f.item, {}, f.actors[2]);
    f.run("items.restore", f.item);
    f.list.ownerIds.push(f.s.people[1].id);
    f.run("lists.trash", f.list, {}, f.actors[1]);
    expect(trash(f.s, f.actors[2])).toHaveLength(1);
  });
  it("suppresses removed gift notifications and retains media referenced elsewhere", () => {
    const f = fixture();
    const media = { ...stamp(), userId: f.actors[0].id, file: "test.webp" };
    f.s.media.push(media);
    f.item.image = `/api/v1/media/${media.id}`;
    const other = f.add("Shared photo");
    other.image = f.item.image;
    const notice = {
      ...stamp(),
      userId: f.actors[1].id,
      event: "wishlist" as const,
      status: "pending" as const,
      attempts: 0,
      delivered: [],
      itemId: f.item.id,
    };
    f.s.notices.push(notice);
    f.run("items.trash", f.item);
    expect(activityAllowed(f.s, notice)).toBe(false);
    f.run("items.purge", f.item);
    expect(f.s.media[0].deletedAt).toBeUndefined();
    expect(f.s.notices).toEqual([]);
    f.run("items.trash", other);
    f.run("items.purge", other);
    expect(f.s.media[0].deletedAt).toBeTruthy();
  });
});
describe("events and exchanges", () => {
  it("archives event lists, restores eligible participants, and detaches lists on permanent deletion", () => {
    const f = fixture();
    const result = command(f.s, f.actors[0], "group-events.create", {
      groupId: f.group.id,
      name: "Birthday",
      participantIds: f.s.people.slice(0, 3).map((p) => p.id),
      mode: "surprise",
    }) as GroupEvent;
    const event = f.s.groupEvents.find((e) => e.id === result.id)!;
    const lists = f.s.lists.filter((l) => l.groupEventId === event.id);
    command(f.s, f.actors[1], "items.create", {
      listId: lists[1].id,
      title: "Sam's item",
    });
    expect(() => f.run("lists.trash", lists[1], {}, f.actors[1])).toThrow(
      "not found",
    );
    f.run("group-events.trash", event);
    expect(world(f.s, f.actors[0]).groupEvents).toEqual([]);
    expect(lists.every((l) => l.archived)).toBe(true);
    expect(
      world(f.s, f.actors[1]).items.some((i) => i.title === "Sam's item"),
    ).toBe(true);
    f.run("group-events.restore", event);
    expect(lists.every((l) => !l.archived)).toBe(true);
    f.run("group-events.trash", event);
    f.run("group-events.purge", event);
    expect(
      lists.every((l) => l.archived && !l.groupEventId && l.modeLocked),
    ).toBe(true);
    expect(
      world(f.s, f.actors[1]).lists.find((l) => l.id === lists[1].id)
        ?.canManageSettings,
    ).toBe(true);
    expect(f.s.items.some((i) => i.title === "Sam's item")).toBe(true);
  });
  it("does not reactivate removed participants when restoring an event", () => {
    const f = fixture();
    const { id } = command(f.s, f.actors[0], "group-events.create", {
      groupId: f.group.id,
      name: "Birthday",
      participantIds: f.s.people.slice(0, 3).map((p) => p.id),
      mode: "surprise",
    }) as GroupEvent;
    const event = f.s.groupEvents.find((e) => e.id === id)!;
    command(f.s, f.actors[0], "group-events.update", {
      ...event,
      participantIds: event.participantIds.slice(0, 2),
    });
    f.run("group-events.trash", event);
    f.run("group-events.restore", event);
    expect(
      f.s.lists.find(
        (l) => l.groupEventId === id && l.ownerIds[0] === f.s.people[2].id,
      )?.archived,
    ).toBe(true);
  });
  it("requires cancellation before trashing a draw and never restores cancelled assignments", () => {
    const f = fixture(),
      e = f.exchange();
    f.run("exchanges.draw", e);
    f.run("exchanges.archive", e, { archived: true });
    expect(world(f.s, f.actors[0]).exchanges[0].myAssignments).toHaveLength(1);
    expect(() => f.run("exchanges.trash", e)).toThrow("Cancel");
    f.run("exchanges.cancel", e);
    f.run("exchanges.trash", e);
    expect(world(f.s, f.actors[0]).exchanges).toEqual([]);
    f.run("exchanges.restore", e);
    expect(world(f.s, f.actors[0]).exchanges[0].myAssignments).toEqual([]);
    f.run("exchanges.trash", e);
    f.run("exchanges.purge", e);
    expect(f.s.exchanges).toEqual([]);
  });
});
describe("priorities and organization", () => {
  it("shares list order while keeping priority and personal sorting independent", () => {
    const f = fixture(),
      b = f.add("Mug");
    f.run("items.organize", f.item, { priority: "most-wanted" });
    f.run("items.organize", b, { priority: "most-wanted" });
    f.run("lists.reorder", f.list, { order: [b.id, f.item.id] });
    expect(world(f.s, f.actors[1]).lists[0].itemOrder).toEqual([
      b.id,
      f.item.id,
    ]);
    expect(
      ordered([f.item, b], "priority", f.list.itemOrder).map((i) => i.id),
    ).toEqual([b.id, f.item.id]);
    command(f.s, f.actors[1], "organization.update", {
      scope: `items:list:${f.list.id}`,
      revision: 0,
      sort: "name-asc",
    });
    expect(world(f.s, f.actors[0]).organization).toEqual([]);
    expect(world(f.s, f.actors[1]).organization?.[0].sort).toBe("name-asc");
    expect(() =>
      f.run("lists.reorder", f.list, { order: [f.item.id, b.id] }, f.actors[1]),
    ).toThrow("not found");
    const legacy = { ...f.item };
    delete legacy.priority;
    command(f.s, f.actors[0], "items.update", legacy);
    expect(f.item.priority).toBe("most-wanted");
  });
  it("preserves inactive positions and rejects incomplete or duplicate reorder requests", () => {
    const f = fixture(),
      b = f.add("Mug"),
      c = f.add("Sweater");
    f.run("lists.reorder", f.list, { order: [f.item.id, b.id, c.id] });
    f.run("items.trash", b);
    f.run("lists.reorder", f.list, { order: [c.id, f.item.id] });
    f.run("items.restore", b);
    expect(f.list.itemOrder).toEqual([c.id, b.id, f.item.id]);
    expect(() => f.run("lists.reorder", f.list, { order: [c.id] })).toThrow(
      "complete list",
    );
    expect(() =>
      f.run("lists.reorder", f.list, { order: [c.id, c.id, c.id] }),
    ).toThrow();
  });
  it("keeps personal collection positions through Trash and restore", () => {
    const f = fixture();
    const makeList = (name: string) =>
      command(f.s, f.actors[0], "lists.create", {
        name,
        ownerIds: [f.s.people[0].id],
        groupIds: [f.group.id],
        mode: "surprise",
      }) as List;
    const b = makeList("Second"),
      c = makeList("Third");
    command(f.s, f.actors[0], "organization.update", {
      scope: "lists",
      revision: 0,
      sort: "manual",
      order: [f.list.id, b.id, c.id],
    });
    f.run("lists.trash", b);
    command(f.s, f.actors[0], "organization.update", {
      scope: "lists",
      revision: 1,
      sort: "manual",
      order: [c.id, f.list.id],
    });
    f.run("lists.restore", b);
    expect(f.s.organization[0].order).toEqual([c.id, b.id, f.list.id]);
    expect(() =>
      command(f.s, f.actors[0], "organization.update", {
        scope: "lists",
        revision: 2,
        sort: "manual",
        order: [f.lists[1].id],
      }),
    ).toThrow("access");
  });
  it("sorts missing prices last in either direction and never mutates source rows", () => {
    const f = fixture(),
      b = f.add("Mug"),
      c = f.add("Sweater");
    f.item.priceCents = 100;
    b.priceCents = null;
    c.priceCents = 500;
    const rows = [b, c, f.item];
    expect(ordered(rows, "price-asc").map((i) => i.id)).toEqual([
      f.item.id,
      c.id,
      b.id,
    ]);
    expect(ordered(rows, "price-desc").map((i) => i.id)).toEqual([
      c.id,
      f.item.id,
      b.id,
    ]);
    expect(rows[0]).toBe(b);
  });
});
