import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyState,
  type Actor,
  type Group,
  type GroupEvent,
  type Item,
  type List,
  type Person,
} from "../src/shared/model";
import {
  archiveDueLists,
  command,
  giftSummary,
  giftView,
  idempotent,
  stamp,
  world,
} from "../src/server/domain";
import {
  canManageGroupEvents,
  peopleForGroup,
} from "../src/shared/group-events";

function fixture() {
  const state = emptyState();
  const actors: Actor[] = [
    "Owner",
    "Leader",
    "Member",
    "Shopper",
    "Outsider",
  ].map((name) => ({
    id: stamp().id,
    name,
    email: `${name.toLowerCase()}@example.test`,
  }));
  const people: Person[] = actors.map((actor) => ({
    ...stamp(),
    name: actor.name,
    userId: actor.id,
    guardians: [],
  }));
  const child: Person = {
    ...stamp(),
    name: "Child",
    guardians: [actors[2].id],
  };
  state.people.push(...people, child);
  const group = command(state, actors[0], "groups.create", {
    name: "Family",
  }) as Group;
  group.memberIds.push(...actors.slice(1, 4).map((actor) => actor.id));
  const create = (overrides = {}, actor = actors[0]) => {
    const result = command(state, actor, "group-events.create", {
      groupId: group.id,
      name: "Christmas 2026",
      mode: "surprise",
      participantIds: [people[2].id, child.id],
      ...overrides,
    }) as { id: string };
    return state.groupEvents.find((event) => event.id === result.id)!;
  };
  const update = (event: GroupEvent, overrides = {}, actor = actors[0]) =>
    command(state, actor, "group-events.update", { ...event, ...overrides });
  const leaders = (userIds: string[], actor = actors[0]) =>
    command(state, actor, "groups.event-leaders", {
      groupId: group.id,
      revision: group.revision,
      userIds,
    });
  const lists = (event: GroupEvent) =>
    state.lists.filter((list) => list.groupEventId === event.id);
  return {
    state,
    actors,
    people,
    child,
    group,
    create,
    update,
    leaders,
    lists,
  };
}
afterEach(() => vi.useRealTimers());

describe("event leadership", () => {
  it("defaults old groups to owner-only and only lets owners appoint current members", () => {
    const f = fixture();
    expect(canManageGroupEvents(f.group, f.actors[0].id)).toBe(true);
    expect(canManageGroupEvents(f.group, f.actors[1].id)).toBe(false);
    expect(() => f.leaders([f.actors[1].id], f.actors[1])).toThrow();
    expect(() => f.leaders([f.actors[4].id])).toThrow("current members");
    expect(() => f.leaders([f.actors[0].id])).toThrow("current members");
    expect(() => f.leaders([f.actors[1].id, f.actors[1].id])).toThrow();
    f.leaders([f.actors[1].id]);
    const event = f.create({}, f.actors[1]);
    expect(world(f.state, f.actors[1]).groupEvents[0].canManage).toBe(true);
    f.update(event, { name: "Winter gifts" }, f.actors[1]);
    f.leaders([]);
    expect(() => f.update(event, {}, f.actors[1])).toThrow();
    expect(world(f.state, f.actors[1]).groupEvents[0].canManage).toBe(false);
  });
  it("does not grant event leaders group membership powers or global administrators event powers", () => {
    const f = fixture();
    f.leaders([f.actors[1].id]);
    expect(() =>
      command(f.state, f.actors[1], "groups.invite", {
        groupId: f.group.id,
        email: "new@example.test",
      }),
    ).toThrow();
    expect(() =>
      command(f.state, f.actors[1], "groups.remove", {
        groupId: f.group.id,
        userId: f.actors[2].id,
      }),
    ).toThrow();
    f.people[4].admin = true;
    expect(() => f.create({}, f.actors[4])).toThrow();
    expect(() => f.create({}, f.actors[2])).toThrow();
  });
  it("transfers event authority with accepted group ownership and revokes it on departure", () => {
    const f = fixture();
    const event = f.create();
    command(f.state, f.actors[0], "groups.transfer", {
      groupId: f.group.id,
      userId: f.actors[1].id,
      email: f.actors[1].email,
    });
    command(f.state, f.actors[1], "links.accept", { id: f.state.links[0].id });
    expect(() => f.update(event, {}, f.actors[0])).toThrow();
    f.update(event, {}, f.actors[1]);
    f.leaders([f.actors[0].id], f.actors[1]);
    f.update(event, {}, f.actors[0]);
    command(f.state, f.actors[0], "groups.remove", {
      groupId: f.group.id,
      userId: f.actors[0].id,
    });
    expect(f.group.eventLeaderIds).toEqual([]);
    expect(() => f.update(event, {}, f.actors[0])).toThrow();
  });
});

describe("event lists and permissions", () => {
  it("creates one immediately shared list per account or managed profile, visible to unselected shoppers", () => {
    const f = fixture();
    expect(peopleForGroup(f.state.people, f.group)).toHaveLength(5);
    const event = f.create();
    expect(f.lists(event)).toHaveLength(2);
    for (const list of f.lists(event)) {
      expect(list.groupIds).toEqual([f.group.id]);
      expect(list.pendingOwnerIds).toEqual([]);
      expect(list.modeLocked).toBe(true);
    }
    expect(world(f.state, f.actors[3]).lists).toHaveLength(2);
    expect(world(f.state, f.actors[3]).groupEvents).toHaveLength(1);
    expect(world(f.state, f.actors[4]).groupEvents).toEqual([]);
    expect(world(f.state, f.actors[4]).lists).toEqual([]);
    expect(
      world(f.state, f.actors[2]).lists.every(
        (list) => list.canEdit && !list.canManageSettings,
      ),
    ).toBe(true);
    expect(
      world(f.state, f.actors[0]).lists.every(
        (list) => !list.canEdit && !list.canManageSettings,
      ),
    ).toBe(true);
  });
  it("rejects ineligible people, empty creation and duplicates before creating any records", () => {
    const f = fixture();
    for (const participantIds of [
      [f.people[4].id],
      [],
      [f.child.id, f.child.id],
    ])
      expect(() => f.create({ participantIds })).toThrow();
    expect(f.state.groupEvents).toEqual([]);
    expect(f.state.lists).toEqual([]);
  });
  it("preserves recipient gift editing but blocks individual list settings and leaders editing others’ gifts", () => {
    const f = fixture();
    const event = f.create();
    const list = f.lists(event)[0];
    const gift = command(f.state, f.actors[2], "items.create", {
      listId: list.id,
      title: "A book",
    }) as Item;
    const storedGift = f.state.items.find((item) => item.id === gift.id)!;
    command(f.state, f.actors[2], "items.update", {
      ...storedGift,
      title: "Two books",
    });
    expect(() =>
      command(f.state, f.actors[0], "items.update", {
        ...storedGift,
        title: "Leader edit",
      }),
    ).toThrow();
    expect(() =>
      command(f.state, f.actors[0], "items.create", {
        listId: list.id,
        title: "Leader gift",
      }),
    ).toThrow();
    for (const patch of [
      { name: "Rename" },
      { archived: true },
      { groupIds: [] },
      { mode: "transparent" },
    ])
      expect(() =>
        command(f.state, f.actors[2], "lists.update", { ...list, ...patch }),
      ).toThrow("managed through");
    f.update(event, { name: "Winter", description: "Family wishes" });
    expect(
      f
        .lists(event)
        .every(
          (list) =>
            list.name === "Winter" && list.description === "Family wishes",
        ),
    ).toBe(true);
    const personal = command(f.state, f.actors[2], "lists.create", {
      name: "Personal",
      ownerIds: [f.people[2].id],
      groupIds: [],
      mode: "surprise",
    }) as List;
    command(f.state, f.actors[2], "lists.update", {
      ...personal,
      name: "Still mine",
    });
    expect(
      world(f.state, f.actors[2]).lists.find((list) => list.id === personal.id)
        ?.canManageSettings,
    ).toBe(true);
  });
  it("keeps purchase details hidden from recipient leaders and guardians", () => {
    const f = fixture();
    f.leaders([f.actors[2].id]);
    const event = f.create();
    for (const list of f.lists(event)) {
      const gift = command(f.state, f.actors[2], "items.create", {
        listId: list.id,
        title: `Gift ${list.id}`,
      }) as Item;
      const stored = f.state.items.find((item) => item.id === gift.id)!;
      const before = giftView(f.state, f.actors[2], stored);
      const reservation = command(f.state, f.actors[3], "reservations.create", {
        itemId: gift.id,
        quantity: 1,
      }) as any;
      command(f.state, f.actors[3], "reservations.update", {
        ...f.state.reservations.find((r) => r.id === reservation.id)!,
        purchased: 1,
      });
      command(f.state, f.actors[3], "comments.create", {
        itemId: gift.id,
        body: "Hidden planning",
      });
      expect(giftView(f.state, f.actors[2], stored)).toEqual(before);
      expect(JSON.stringify(world(f.state, f.actors[2]))).not.toContain(
        "Hidden planning",
      );
      expect(() => giftSummary(f.state, f.actors[0], list.id)).toThrow();
    }
  });
  it("keeps privacy/reveal policies locked and applies changes to every linked list", () => {
    const f = fixture();
    const event = f.create({
      revealAfter: "2099-12-25",
      timeZone: "America/New_York",
    });
    for (const patch of [
      { mode: "transparent" },
      { timeZone: "UTC" },
      { revealExchangeGivers: true },
      { revealAfter: null },
      { revealAfter: "2099-12-24" },
    ])
      expect(() => f.update(event, patch)).toThrow();
    f.update(event, { revealAfter: "2099-12-26" });
    expect(
      f.lists(event).every((list) => list.revealAfter === "2099-12-26"),
    ).toBe(true);
    const noReveal = f.create();
    expect(() => f.update(noReveal, { revealAfter: "2099-12-26" })).toThrow();
    expect(() => f.create({ revealExchangeGivers: true })).toThrow(
      "reveal date",
    );
  });
  it("reveals ordinary event purchases to recipients and guardians without exchange opt-in", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-10-18T12:00:00Z"));
    const f = fixture();
    const event = f.create({
      revealAfter: "2030-10-18",
      timeZone: "America/New_York",
      revealExchangeGivers: false,
    });
    f.leaders([f.actors[1].id]);
    for (const list of f.lists(event)) {
      const gift = command(f.state, f.actors[2], "items.create", {
        listId: list.id,
        title: "A birthday book",
      }) as Item;
      const reservation = command(f.state, f.actors[3], "reservations.create", {
        itemId: gift.id,
        quantity: 1,
      }) as { id: string };
      command(f.state, f.actors[3], "reservations.update", {
        ...f.state.reservations.find((r) => r.id === reservation.id)!,
        purchased: 1,
        poolTargetCents: 2500,
      });
      f.state.contributions.push({
        ...stamp(),
        reservationId: reservation.id,
        userId: f.actors[1].id,
        amountCents: 1000,
        status: "sent",
      });
      vi.setSystemTime(new Date("2030-10-19T03:59:59Z"));
      expect(() => giftSummary(f.state, f.actors[2], list.id)).toThrow(
        "before this list's reveal date",
      );
      vi.setSystemTime(new Date("2030-10-19T04:00:00Z"));
      const summary = giftSummary(f.state, f.actors[2], list.id);
      expect(summary.gifts).toHaveLength(1);
      expect(summary.gifts[0]).toMatchObject({
        buyerName: "Shopper",
        exchange: false,
        contributors: [{ name: "Leader", status: "sent" }],
      });
      expect(JSON.stringify(summary)).not.toMatch(
        /amountCents|poolTargetCents/,
      );
      for (const actor of [f.actors[0], f.actors[1], f.actors[3]])
        expect(() => giftSummary(f.state, actor, list.id)).toThrow(
          "List not found",
        );
      const stored = f.state.items.find((item) => item.id === gift.id)!;
      expect(
        giftView(f.state, f.actors[2], stored).reservations,
      ).toBeUndefined();
    }
  });
  it("rejects stale event and leadership edits and creates no duplicate lists on retry", () => {
    const f = fixture();
    const payload = {
      groupId: f.group.id,
      name: "Christmas",
      mode: "surprise",
      participantIds: [f.child.id],
    };
    const key = stamp().id;
    idempotent(f.state, f.actors[0], key, "group-events.create", payload);
    expect(
      idempotent(f.state, f.actors[0], key, "group-events.create", payload),
    ).toEqual({ ok: true, replayed: true });
    expect(f.state.lists).toHaveLength(1);
    const event = f.state.groupEvents[0];
    const revision = event.revision;
    f.update(event, { name: "Updated" });
    expect(() =>
      f.update(event, { revision, participantIds: [f.people[0].id] }),
    ).toThrow("changed since");
    expect(f.state.lists).toHaveLength(1);
    const groupRevision = f.group.revision;
    f.leaders([f.actors[1].id]);
    expect(() =>
      command(f.state, f.actors[0], "groups.event-leaders", {
        groupId: f.group.id,
        revision: groupRevision,
        userIds: [],
      }),
    ).toThrow("changed since");
  });
});

describe("event lifecycle", () => {
  it("archives removed participants without losing gifts or reservations and reuses their list when re-added", () => {
    const f = fixture();
    const event = f.create();
    const list = f.lists(event)[0];
    const gift = command(f.state, f.actors[2], "items.create", {
      listId: list.id,
      title: "A book",
    }) as Item;
    const reservation = command(f.state, f.actors[3], "reservations.create", {
      itemId: gift.id,
      quantity: 1,
    }) as any;
    f.update(event, { participantIds: [f.child.id] });
    expect(list.archived).toBe(true);
    expect(f.state.items).toHaveLength(1);
    expect(f.state.reservations).toHaveLength(1);
    expect(world(f.state, f.actors[3]).lists).toHaveLength(2);
    expect(() =>
      command(f.state, f.actors[2], "items.create", {
        listId: list.id,
        title: "Late gift",
      }),
    ).toThrow();
    expect(() =>
      command(f.state, f.actors[0], "reservations.create", {
        itemId: gift.id,
        quantity: 1,
      }),
    ).toThrow("archived");
    command(f.state, f.actors[3], "reservations.update", {
      ...f.state.reservations.find((r) => r.id === reservation.id)!,
      purchased: 1,
    });
    f.update(event, { participantIds: [f.people[2].id, f.child.id] });
    expect(list.archived).toBe(false);
    expect(f.lists(event)).toHaveLength(2);
    expect(f.state.reservations[0].purchased).toBe(1);
  });
  it("archives and restores the whole event without restoring removed participants", () => {
    const f = fixture();
    const event = f.create();
    f.update(event, { participantIds: [f.child.id] });
    f.update(event, { archived: true });
    expect(f.lists(event).every((list) => list.archived)).toBe(true);
    f.update(event, { archived: false });
    expect(
      f.lists(event).find((list) => list.ownerIds[0] === f.child.id)?.archived,
    ).toBe(false);
    expect(
      f.lists(event).find((list) => list.ownerIds[0] === f.people[2].id)
        ?.archived,
    ).toBe(true);
    f.update(event, { participantIds: [] });
    expect(f.lists(event).every((list) => list.archived)).toBe(true);
  });
  it("enforces scheduled archiving without a worker and persists it only once", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-12-25T12:00:00Z"));
    const f = fixture();
    const event = f.create({
      archiveAfter: "2030-12-25",
      timeZone: "America/New_York",
    });
    vi.setSystemTime(new Date("2030-12-26T05:00:00Z"));
    expect(world(f.state, f.actors[2]).groupEvents[0].archived).toBe(true);
    expect(
      world(f.state, f.actors[2]).lists.every((list) => list.archived),
    ).toBe(true);
    expect(() =>
      command(f.state, f.actors[2], "items.create", {
        listId: f.lists(event)[0].id,
        title: "Late",
      }),
    ).toThrow();
    archiveDueLists(f.state);
    const snapshot = JSON.stringify(f.state);
    archiveDueLists(f.state);
    expect(JSON.stringify(f.state)).toBe(snapshot);
    f.update(event, { archived: false });
    expect(event.archiveAfter).toBeNull();
    expect(
      world(f.state, f.actors[2]).lists.every((list) => !list.archived),
    ).toBe(true);
  });
  it("does not enroll new members or profiles and archives only profiles losing their last group controller", () => {
    const f = fixture();
    f.child.guardians.push(f.actors[1].id);
    const event = f.create();
    command(f.state, f.actors[0], "groups.invite", {
      groupId: f.group.id,
      email: f.actors[4].email,
    });
    command(f.state, f.actors[4], "invitations.accept", {
      id: f.state.invitations[0].id,
    });
    command(f.state, f.actors[4], "people.create", { name: "New child" });
    expect(event.participantIds).toEqual([f.people[2].id, f.child.id]);
    command(f.state, f.actors[2], "groups.remove", {
      groupId: f.group.id,
      userId: f.actors[2].id,
    });
    expect(event.participantIds).toEqual([f.child.id]);
    expect(world(f.state, f.actors[2]).groupEvents).toEqual([]);
    expect(
      world(f.state, f.actors[2]).lists.find((list) =>
        list.ownerIds.includes(f.people[2].id),
      )?.archived,
    ).toBe(true);
    command(f.state, f.actors[1], "groups.remove", {
      groupId: f.group.id,
      userId: f.actors[1].id,
    });
    expect(event.participantIds).toEqual([]);
    expect(f.lists(event).every((list) => list.archived)).toBe(true);
  });
  it("preserves a claimed managed profile's list and reconciles its new controller’s membership", () => {
    const f = fixture();
    const event = f.create();
    command(f.state, f.actors[2], "people.link", {
      id: f.child.id,
      email: f.actors[4].email,
    });
    command(f.state, f.actors[4], "links.accept", { id: f.state.links[0].id });
    expect(event.participantIds).not.toContain(f.child.id);
    expect(
      world(f.state, f.actors[4]).lists.find((list) =>
        list.ownerIds.includes(f.child.id),
      )?.archived,
    ).toBe(true);
    expect(f.lists(event)).toHaveLength(2);
  });
});
