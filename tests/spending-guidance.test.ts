import { describe, expect, it } from "vitest";
import { command, stamp, world, noticeAllowed } from "../src/server/domain";
import { inbox } from "../src/server/activity";
import {
  emptyState,
  type Group,
  type Item,
  type Contribution,
} from "../src/shared/model";
import {
  eventSpendingContext,
  giftEstimate,
  reservationSpendingContext,
  spendingSummary,
  spendingGuideline,
} from "../src/shared/spending-guidance";

function fixture() {
  const s = emptyState();
  const people = ["Alex", "Sam", "Jamie", "Riley"].map((name) => ({
    ...stamp(),
    name,
    userId: stamp().id,
    guardians: [] as string[],
  }));
  s.people.push(...people);
  const actors = people.map((p) => ({
    id: p.userId,
    name: p.name,
    email: `${p.name}@example.test`,
  }));
  const group = command(s, actors[0], "groups.create", {
    name: "Family",
  }) as Group;
  group.memberIds = actors.map((a) => a.id);
  const eventId = command(s, actors[0], "group-events.create", {
    groupId: group.id,
    name: "Christmas",
    participantIds: people.map((p) => p.id),
    mode: "surprise",
    spendingGuidelineCents: 5000,
  }) as { id: string };
  const event = s.groupEvents.find((e) => e.id === eventId.id)!;
  function item(price: number | null, recipient = 0, quantity = 5) {
    const list = s.lists.find(
      (l) =>
        l.groupEventId === event.id &&
        l.ownerIds.includes(people[recipient].id),
    )!;
    const result = command(s, actors[recipient], "items.create", {
      listId: list.id,
      title: `Gift ${s.items.length}`,
      description: "",
      url: "",
      image: "",
      tags: [],
      quantity,
      priceCents: price,
    }) as { id: string };
    return s.items.find((i) => i.id === result.id)!;
  }
  function reserve(gift: Item, buyer = 1, extra = {}) {
    const result = command(s, actors[buyer], "reservations.create", {
      itemId: gift.id,
      quantity: 1,
      ...extra,
    }) as { id: string };
    return s.reservations.find((r) => r.id === result.id)!;
  }
  function exchange(draw = true, count = 1) {
    const result = command(s, actors[0], "exchanges.create", {
      name: "Secret Christmas",
      groupId: group.id,
      participantIds: people.map((p) => p.id),
      count,
      excludeHousehold: false,
      spendingGuidelineCents: 5000,
    }) as { id: string };
    const e = s.exchanges.find((e) => e.id === result.id)!;
    if (draw)
      command(s, actors[0], "exchanges.draw", {
        id: e.id,
        revision: e.revision,
      });
    return e;
  }
  function summary(actor = 1, recipient = 0, preview = {}) {
    return spendingSummary(
      world(s, actors[actor]),
      { kind: "event", id: event.id, recipientId: people[recipient].id },
      preview,
    );
  }
  return { s, people, actors, group, event, item, reserve, exchange, summary };
}

describe("spending guideline settings", () => {
  it("persists optional amounts, preserves omissions, and clears with null", () => {
    const f = fixture(),
      e = f.exchange(false);
    expect(world(f.s, f.actors[1]).exchanges[0].spendingGuidelineCents).toBe(
      5000,
    );
    const { spendingGuidelineCents: ignored, ...edit } = e;
    command(f.s, f.actors[0], "exchanges.update", { ...edit, name: "Renamed" });
    expect(e.spendingGuidelineCents).toBe(5000);
    command(f.s, f.actors[0], "exchanges.update", {
      ...e,
      spendingGuidelineCents: null,
    });
    expect(e.spendingGuidelineCents).toBeNull();
    const { spendingGuidelineCents: omitted, ...eventEdit } = f.event;
    command(f.s, f.actors[0], "group-events.update", eventEdit);
    expect(f.event.spendingGuidelineCents).toBe(5000);
    command(f.s, f.actors[0], "group-events.update", {
      ...f.event,
      spendingGuidelineCents: null,
    });
    expect(f.event.spendingGuidelineCents).toBeNull();
    delete e.spendingGuidelineCents;
    expect(
      spendingGuideline(world(f.s, f.actors[0]), {
        kind: "exchange",
        id: e.id,
        recipientId: f.people[1].id,
      }),
    ).toBeNull();
  });

  it.each([0, -1, 1.5, 100000001, "50", Infinity, NaN])(
    "rejects invalid guideline %s",
    (amount) => {
      const f = fixture(),
        e = f.exchange();
      expect(() =>
        command(f.s, f.actors[0], "exchanges.guideline", {
          id: e.id,
          revision: e.revision,
          spendingGuidelineCents: amount,
        }),
      ).toThrow();
      expect(() =>
        command(f.s, f.actors[0], "group-events.update", {
          ...f.event,
          spendingGuidelineCents: amount,
        }),
      ).toThrow();
    },
  );

  it("changes only the guideline after drawing and sends private, linked updates", () => {
    const f = fixture(),
      e = f.exchange();
    const before = structuredClone(e);
    f.s.notices = [];
    const update = {
      id: e.id,
      revision: e.revision,
      spendingGuidelineCents: 7000,
    };
    expect(() =>
      command(f.s, f.actors[1], "exchanges.guideline", update),
    ).toThrow("not found");
    expect(() =>
      command(f.s, f.actors[0], "exchanges.guideline", {
        ...update,
        assignments: [],
      }),
    ).toThrow();
    command(f.s, f.actors[0], "exchanges.guideline", update);
    expect(e).toEqual({
      ...before,
      spendingGuidelineCents: 7000,
      revision: before.revision + 1,
    });
    expect(() =>
      command(f.s, f.actors[0], "exchanges.guideline", update),
    ).toThrow("changed since");
    expect(f.s.notices).toHaveLength(4);
    expect(inbox(f.s, f.actors[1]).entries[0]).toMatchObject({
      message: "The spending guideline has changed",
      href: `/exchanges#exchange-${e.id}`,
    });
    const revision = e.revision;
    command(f.s, f.actors[0], "exchanges.guideline", { ...update, revision });
    expect(e.revision).toBe(revision);
    expect(f.s.notices).toHaveLength(4);
    command(f.s, f.actors[0], "exchanges.guideline", {
      ...update,
      revision,
      spendingGuidelineCents: null,
    });
    expect(e.spendingGuidelineCents).toBeNull();
    e.archived = true;
    expect(() =>
      command(f.s, f.actors[0], "exchanges.guideline", {
        ...update,
        revision: e.revision,
      }),
    ).toThrow();
    e.archived = false;
    e.status = "cancelled";
    expect(() =>
      command(f.s, f.actors[0], "exchanges.guideline", {
        ...update,
        revision: e.revision,
      }),
    ).toThrow();
  });

  it("lets event leaders edit and revokes update access when someone leaves", () => {
    const f = fixture();
    f.s.notices = [];
    expect(() =>
      command(f.s, f.actors[1], "group-events.update", {
        ...f.event,
        spendingGuidelineCents: 6000,
      }),
    ).toThrow();
    f.group.eventLeaderIds = [f.actors[1].id];
    command(f.s, f.actors[1], "group-events.update", {
      ...f.event,
      spendingGuidelineCents: 6000,
    });
    expect(f.s.notices).toHaveLength(3);
    expect(inbox(f.s, f.actors[2]).entries[0]).toMatchObject({
      message: "The spending guideline has changed",
      href: `/events/${f.event.id}`,
    });
    const n = f.s.notices.find((n) => n.userId === f.actors[2].id)!;
    expect(noticeAllowed(f.s, n)).toBe(true);
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[2].id);
    expect(noticeAllowed(f.s, n)).toBe(false);
    f.event.deletedAt = new Date().toISOString();
    expect(inbox(f.s, f.actors[0]).entries).toEqual([]);
  });
});

describe("advisory spending estimates", () => {
  it("keeps a guardian's own and managed-profile exchange plans separate", () => {
    const f = fixture();
    f.people[2].guardians.push(f.actors[1].id);
    const e = f.exchange();
    for (const giver of [f.people[1], f.people[2]]) {
      const receiver = e.assignments.find(([g]) => g === giver.id)![1];
      const gift = f.item(
        giver.id === f.people[1].id ? 2000 : 6000,
        f.people.findIndex((p) => p.id === receiver),
      );
      f.reserve(gift, 1, { exchangeId: e.id, giverId: giver.id });
    }
    const w = world(f.s, f.actors[1]);
    expect(w.exchanges[0].myAssignments).toHaveLength(2);
    expect(
      w.buying.map(
        (r) => spendingSummary(w, reservationSpendingContext(w, r)!).cents,
      ),
    ).toEqual([2000, 6000]);
    // Purchases made by the guardian are not exposed in the managed person's Buying view.
    const otherBuyer = world(f.s, f.actors[2]);
    expect(otherBuyer.buying).toEqual([]);
  });
  it("totals several gifts and quantity once, and allows over-guideline purchases", () => {
    const f = fixture(),
      game = f.item(3500),
      book = f.item(2500);
    const r = f.reserve(game);
    expect(f.summary(1, 0, { itemId: book.id, quantity: 1 }).cents).toBe(6000);
    f.reserve(book);
    command(f.s, f.actors[1], "reservations.update", { ...r, purchased: 1 });
    expect(f.summary().cents).toBe(6000);
    const extra = f.reserve(book, 1, { quantity: 2 });
    expect(f.summary().cents).toBe(11000);
    command(f.s, f.actors[1], "reservations.update", {
      ...extra,
      quantity: 0,
      purchased: 0,
    });
    expect(f.summary().cents).toBe(6000);
    expect(f.summary(2).cents).toBe(0);
    expect(f.summary(1, 2).cents).toBe(0);
  });

  it("counts personal shares separately from the full shared gift and retains the goal cap", () => {
    const f = fixture(),
      gift = f.item(9000),
      r = f.reserve(gift);
    command(f.s, f.actors[1], "reservations.update", {
      ...r,
      poolTargetCents: 9000,
    });
    expect(
      f.summary(2, 0, { contributionReservationId: r.id, amountCents: 3000 })
        .cents,
    ).toBe(3000);
    const c = command(f.s, f.actors[2], "contributions.create", {
      reservationId: r.id,
      amountCents: 3000,
    }) as Contribution;
    command(f.s, f.actors[3], "contributions.create", {
      reservationId: r.id,
      amountCents: 3000,
    });
    for (const actor of [1, 2, 3]) expect(f.summary(actor).cents).toBe(3000);
    expect(
      giftEstimate(gift.priceCents, r.quantity, r.poolTargetCents).cents,
    ).toBe(9000);
    command(f.s, f.actors[2], "contributions.update", { ...c, status: "sent" });
    command(f.s, f.actors[1], "contributions.update", {
      ...c,
      status: "received",
    });
    expect(f.summary(2).cents).toBe(3000);
    expect(() =>
      command(f.s, f.actors[3], "contributions.create", {
        reservationId: r.id,
        amountCents: 4000,
      }),
    ).toThrow("more than this gift still needs");
    expect(() =>
      command(f.s, f.actors[1], "reservations.update", {
        ...r,
        poolTargetCents: 5000,
      }),
    ).toThrow("contributions already promised");
    expect(
      f.summary(1, 0, { poolReservationId: r.id, poolTargetCents: 12000 })
        .cents,
    ).toBe(6000);
    c.status = "cancelled";
    expect(f.summary(1).cents).toBe(6000);
    expect(f.summary(2).cents).toBe(0);
    r.quantity = 0;
    expect(f.summary(3).cents).toBe(0);
  });

  it("marks missing prices, uses goals as lower bounds, and excludes inaccessible sources", () => {
    const f = fixture(),
      r = f.reserve(f.item(null));
    expect(f.summary()).toMatchObject({ cents: 0, unknown: 1 });
    command(f.s, f.actors[1], "reservations.update", {
      ...r,
      poolTargetCents: 7000,
    });
    expect(f.summary()).toMatchObject({ cents: 7000, unknown: 1 });
    const list = f.s.lists.find((l) => l.id === f.s.items[0].listId)!;
    list.groupIds = [];
    expect(f.summary()).toMatchObject({ cents: 0, unknown: 0 });
    expect(world(f.s, f.actors[1]).buying[0].item).toBeUndefined();
  });

  it("prioritizes selected exchanges, preserves assignment privacy and separates recipients", () => {
    const f = fixture(),
      e = f.exchange(true, 2);
    const assigned = e.assignments.filter(([g]) => g === f.people[1].id);
    const receiver = f.people.findIndex((p) => p.id === assigned[0][1]);
    const gift = f.item(6000, receiver);
    const r = f.reserve(gift, 1, { exchangeId: e.id, giverId: f.people[1].id });
    expect(r.exchangeRecipientId).toBe(assigned[0][1]);
    const w = world(f.s, f.actors[1]);
    const ctx = reservationSpendingContext(w, w.buying[0])!;
    expect(spendingSummary(w, ctx).cents).toBe(6000);
    expect(
      spendingSummary(w, { ...ctx, recipientId: assigned[1][1] }).cents,
    ).toBe(0);
    expect(f.summary(1, receiver).cents).toBe(0);
    expect(() =>
      command(f.s, f.actors[1], "reservations.update", {
        ...r,
        poolTargetCents: 6000,
      }),
    ).toThrow("not available");
    const receiverView = world(f.s, f.actors[receiver]);
    expect(
      receiverView.items.find((i) => i.id === gift.id)?.reservations,
    ).toBeUndefined();
    expect(receiverView.exchanges[0]).not.toHaveProperty("assignments");
    expect(receiverView.buying).toEqual([]);
    expect(spendingSummary(receiverView, ctx).cents).toBe(0);
    const organizerView = world(f.s, f.actors[0]);
    expect(organizerView.buying).toEqual([]);
    expect(
      organizerView.items.find((i) => i.id === gift.id)?.reservations?.[0],
    ).not.toHaveProperty("exchangeRecipientId");
    delete r.exchangeRecipientId;
    expect(
      reservationSpendingContext(
        world(f.s, f.actors[1]),
        world(f.s, f.actors[1]).buying[0],
      ),
    ).toEqual(ctx);
    gift.recipientIds = assigned.map(([, receiver]) => receiver);
    expect(
      reservationSpendingContext(
        world(f.s, f.actors[1]),
        world(f.s, f.actors[1]).buying[0],
      ),
    ).toBeUndefined();
    expect(spendingSummary(world(f.s, f.actors[1]), ctx)).toMatchObject({
      cents: 0,
      unattributed: 1,
    });
    expect(() =>
      f.reserve(gift, 1, { exchangeId: e.id, giverId: f.people[1].id }),
    ).toThrow("Buying for");
    expect(() =>
      f.reserve(gift, 1, {
        exchangeId: e.id,
        giverId: f.people[1].id,
        exchangeRecipientId: f.people[1].id,
      }),
    ).toThrow();
    expect(
      f.reserve(gift, 1, {
        exchangeId: e.id,
        giverId: f.people[1].id,
        exchangeRecipientId: assigned[1][1],
      }).exchangeRecipientId,
    ).toBe(assigned[1][1]);
  });
});
