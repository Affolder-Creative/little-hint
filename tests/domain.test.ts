import { describe, it, expect } from "vitest";
import {
  emptyState,
  type Actor,
  type State,
  type Item,
  type Exchange,
} from "../src/shared/model";
import {
  stamp,
  command,
  giftView,
  itemVisible,
  world,
  idempotent,
  noticeAllowed,
} from "../src/server/domain";
import { matchExchange } from "../src/server/exchange";
function fixture() {
  const s = emptyState();
  const people = ["Alex", "Sam", "Jamie", "Riley"].map((name, n) => ({
    ...stamp(),
    name,
    userId: `user-${n}`,
    guardians: [],
    household: "",
  }));
  s.people.push(...people);
  const actors = people.map((p) => ({
    id: p.userId,
    email: `${p.name}@example.test`.toLowerCase(),
    name: p.name,
  }));
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  };
  s.groups.push(group);
  const list = command(s, actors[0], "lists.create", {
    name: "Wishes",
    ownerIds: [people[0].id],
    groupIds: [group.id],
    mode: "surprise",
  }) as any;
  const gift = command(s, actors[0], "items.create", {
    listId: list.id,
    title: "Coffee grinder",
    quantity: 2,
    url: "https://example.com/grinder",
    tags: ["Coffee"],
  }) as any;
  return {
    s,
    actors,
    people,
    group,
    list,
    item: s.items.find((i) => i.id === gift.id)!,
  };
}
const reserve = (f: ReturnType<typeof fixture>, buyer = 1, quantity = 1) => {
  const r = command(f.s, f.actors[buyer], "reservations.create", {
    itemId: f.item.id,
    quantity,
  }) as any;
  return f.s.reservations.find((x) => x.id === r.id)!;
};
describe("surprise privacy", () => {
  it("returns identical recipient gift data before and after reservations, purchases and discussion", () => {
    const f = fixture();
    const before = giftView(f.s, f.actors[0], f.item);
    const r = reserve(f);
    command(f.s, f.actors[1], "reservations.update", {
      id: r.id,
      revision: r.revision,
      quantity: 1,
      purchased: 1,
      poolTargetCents: 5000,
    });
    command(f.s, f.actors[2], "comments.create", {
      itemId: f.item.id,
      body: "Keep this secret.",
    });
    expect(giftView(f.s, f.actors[0], f.item)).toEqual(before);
    expect(JSON.stringify(world(f.s, f.actors[0]))).not.toContain(
      "Keep this secret.",
    );
    expect(Object.keys(before)).not.toContain("reservations");
    expect(f.s.notices.some((n) => n.userId === f.actors[0].id)).toBe(false);
  });
  it("allows transparent status but excludes private conversation and pool details", () => {
    const f = fixture();
    f.list.mode = "transparent";
    const r = reserve(f);
    r.poolTargetCents = 5000;
    command(f.s, f.actors[2], "comments.create", {
      itemId: f.item.id,
      body: "Private plans",
    });
    const dto = giftView(f.s, f.actors[0], f.item);
    expect(dto.reserved).toBe(1);
    expect(dto.reservations![0].buyerName).toBe("Sam");
    expect(dto).not.toHaveProperty("comments");
    expect(dto.reservations![0]).not.toHaveProperty("poolTargetCents");
    expect(dto.reservations![0]).not.toHaveProperty("contributions");
  });
  it("does not reveal hidden ideas through duplicate warnings", () => {
    const f = fixture();
    command(f.s, f.actors[1], "items.create", {
      title: "Secret gift",
      recipientIds: [f.people[0].id],
      groupIds: [f.group.id],
      visibility: "hidden",
    });
    const response = command(f.s, f.actors[0], "items.create", {
      title: "Secret gift",
      listId: f.list.id,
    }) as any;
    expect(response.duplicate).toBeUndefined();
    expect(f.s.items.filter((i) => i.title === "Secret gift")).toHaveLength(2);
    expect(
      f.s.items.filter((i) => itemVisible(f.s, f.actors[0], i)),
    ).toHaveLength(2);
  });
  it("applies the same recipient policy to guardians and joint owners", () => {
    const f = fixture();
    const child = {
      ...stamp(),
      name: "Child",
      guardians: [f.actors[0].id],
      household: "",
    };
    f.s.people.push(child as any);
    f.item.recipientIds = [child.id, f.people[2].id];
    reserve(f);
    for (const a of [f.actors[0], f.actors[2]])
      expect(giftView(f.s, a, f.item)).not.toHaveProperty("available");
  });
  it("keeps privacy mode locked after unsharing", () => {
    const f = fixture();
    command(f.s, f.actors[0], "lists.update", {
      id: f.list.id,
      revision: f.list.revision,
      name: "Wishes",
      groupIds: [],
      mode: "surprise",
      archived: false,
      description: "",
    });
    expect(() =>
      command(f.s, f.actors[0], "lists.update", {
        id: f.list.id,
        revision: f.list.revision,
        name: "Wishes",
        groupIds: [],
        mode: "transparent",
        archived: false,
        description: "",
      }),
    ).toThrow("locked");
  });
  it("rechecks authorization when a queued notification is delivered", () => {
    const f = fixture();
    reserve(f);
    const n = f.s.notices.find((n) => n.userId === f.actors[2].id)!;
    expect(noticeAllowed(f.s, n)).toBe(true);
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[2].id);
    expect(noticeAllowed(f.s, n)).toBe(false);
  });
});
describe("buying coordination", () => {
  it("shares one quantity across groups and rejects oversubscription", () => {
    const f = fixture();
    const other = {
      ...stamp(),
      name: "Friends",
      ownerId: f.actors[2].id,
      memberIds: [f.actors[2].id, f.actors[0].id],
    };
    f.s.groups.push(other);
    f.list.groupIds.push(other.id);
    reserve(f, 1, 2);
    expect(() => reserve(f, 2, 1)).toThrow("already reserved");
  });
  it("preserves commitments when a recipient reduces quantity, without a signaling error", () => {
    const f = fixture();
    reserve(f, 1, 2);
    command(f.s, f.actors[0], "items.update", { ...f.item, quantity: 1 });
    expect(f.s.reservations[0].quantity).toBe(2);
    expect(giftView(f.s, f.actors[0], f.item)).not.toHaveProperty("reserved");
    expect(() => reserve(f, 2)).toThrow("already reserved");
  });
  it("releases unpurchased units only when the last access path disappears", () => {
    const f = fixture();
    const r = reserve(f, 1, 2);
    r.purchased = 1;
    const extra = {
      ...stamp(),
      name: "Other",
      ownerId: f.actors[0].id,
      memberIds: [f.actors[0].id, f.actors[1].id],
    };
    f.s.groups.push(extra);
    f.list.groupIds.push(extra.id);
    command(f.s, f.actors[0], "groups.remove", {
      groupId: f.group.id,
      userId: f.actors[1].id,
    });
    expect(r.quantity).toBe(2);
    command(f.s, f.actors[0], "groups.remove", {
      groupId: extra.id,
      userId: f.actors[1].id,
    });
    expect(r.quantity).toBe(1);
    expect(r.former).toBe(true);
  });
  it("prevents duplicate requests and does not replay stale private payloads", () => {
    const f = fixture(),
      body = { itemId: f.item.id, quantity: 1 };
    idempotent(
      f.s,
      f.actors[1],
      "request_1234567890",
      "reservations.create",
      body,
    );
    expect(
      idempotent(
        f.s,
        f.actors[1],
        "request_1234567890",
        "reservations.create",
        body,
      ),
    ).toEqual({ ok: true, replayed: true });
    expect(f.s.reservations).toHaveLength(1);
    expect(() =>
      idempotent(
        f.s,
        f.actors[1],
        "request_1234567890",
        "reservations.create",
        { ...body, quantity: 2 },
      ),
    ).toThrow("another action");
  });
  it("requires the purchaser to confirm money received and caps pledges", () => {
    const f = fixture(),
      r = reserve(f);
    r.poolTargetCents = 2000;
    const c = command(f.s, f.actors[2], "contributions.create", {
      reservationId: r.id,
      amountCents: 1500,
    }) as any;
    expect(() =>
      command(f.s, f.actors[3], "contributions.create", {
        reservationId: r.id,
        amountCents: 1000,
      }),
    ).toThrow("remaining");
    command(f.s, f.actors[2], "contributions.update", {
      id: c.id,
      revision: c.revision,
      status: "sent",
    });
    expect(() =>
      command(f.s, f.actors[2], "contributions.update", {
        id: c.id,
        revision: c.revision,
        status: "received",
      }),
    ).toThrow();
    command(f.s, f.actors[1], "contributions.update", {
      id: c.id,
      revision: c.revision,
      status: "received",
    });
    expect(c.status).toBe("received");
  });
  it("archives without deleting history and prevents new reservations", () => {
    const f = fixture();
    reserve(f);
    command(f.s, f.actors[0], "items.update", { ...f.item, archived: true });
    expect(f.s.reservations).toHaveLength(1);
    expect(() => reserve(f, 2)).toThrow("archived");
  });
});
describe("exchanges", () => {
  it.each([1, 2, 3])(
    "balances %s gifts per participant with no self matches",
    (count) => {
      const f = fixture();
      const e = {
        ...stamp(),
        name: "Exchange",
        groupId: f.group.id,
        organizerId: f.actors[0].id,
        participantIds: f.people.map((p) => p.id),
        count,
        excludeHousehold: false,
        exclusions: [],
        status: "draft",
        assignments: [],
      } as Exchange;
      const result = matchExchange(e, f.people);
      expect(result).toHaveLength(count * 4);
      expect(new Set(result.map((p) => p.join(":"))).size).toBe(result.length);
      for (const p of f.people) {
        expect(result.filter(([g]) => g === p.id)).toHaveLength(count);
        expect(result.filter(([, r]) => r === p.id)).toHaveLength(count);
      }
      expect(result.every(([g, r]) => g !== r)).toBe(true);
    },
  );
  it("rejects infeasible exclusions and avoids previous matches where possible", () => {
    const f = fixture();
    const e = {
      ...stamp(),
      name: "Exchange",
      groupId: f.group.id,
      organizerId: f.actors[0].id,
      participantIds: f.people.map((p) => p.id),
      count: 1,
      excludeHousehold: false,
      exclusions: [],
      status: "draft",
      assignments: [],
    } as Exchange;
    const old = matchExchange(e, f.people),
      next = matchExchange(e, f.people, old);
    expect(
      next.some(([g, r]) => old.some(([a, b]) => g === a && r === b)),
    ).toBe(false);
    e.count = 3;
    e.exclusions = [[f.people[0].id, f.people[1].id]];
    expect(() => matchExchange(e, f.people)).toThrow("balanced");
  });
  it("does not expose another giver identity or purchase progress", () => {
    const f = fixture();
    const e = {
      ...stamp(),
      name: "Exchange",
      groupId: f.group.id,
      organizerId: f.actors[0].id,
      participantIds: f.people.map((p) => p.id),
      count: 1,
      excludeHousehold: false,
      exclusions: [],
      status: "drawn",
      assignments: [[f.people[1].id, f.people[0].id]],
    } as Exchange;
    f.s.exchanges.push(e);
    const r = command(f.s, f.actors[1], "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
      exchangeId: e.id,
      giverId: f.people[1].id,
    }) as any;
    f.s.reservations.find((v) => v.id === r.id)!.purchased = 1;
    const view = giftView(f.s, f.actors[2], f.item);
    expect(view.reservations![0].buyerName).toBe("Exchange giver");
    expect(view.reservations![0]).not.toHaveProperty("purchased");
    expect(world(f.s, f.actors[0]).exchanges[0]).not.toHaveProperty(
      "assignments",
    );
    expect(world(f.s, f.actors[0]).exchanges[0].myAssignments).toHaveLength(0);
  });
});

describe("privacy and reconciliation edge cases", () => {
  it("requires explicit opt-in for transparent recipient notifications", () => {
    const f = fixture();
    f.list.mode = "transparent";
    const notice = {
      ...stamp(),
      userId: f.actors[0].id,
      itemId: f.item.id,
      event: "purchase" as const,
      status: "pending" as const,
      attempts: 0,
      delivered: [],
    };
    expect(noticeAllowed(f.s, notice)).toBe(false);
    command(f.s, f.actors[0], "preferences.update", {
      email: true,
      telegram: false,
      sms: false,
      recipientUpdates: true,
      events: ["purchase"],
    });
    expect(noticeAllowed(f.s, notice)).toBe(true);
    f.list.mode = "surprise";
    expect(noticeAllowed(f.s, notice)).toBe(false);
  });
  it("retains sent contribution reconciliation after the buyer loses all access", () => {
    const f = fixture(),
      r = reserve(f);
    r.poolTargetCents = 2000;
    const c = command(f.s, f.actors[2], "contributions.create", {
      reservationId: r.id,
      amountCents: 1000,
    }) as any;
    command(f.s, f.actors[2], "contributions.update", {
      id: c.id,
      revision: c.revision,
      status: "sent",
    });
    command(f.s, f.actors[0], "groups.remove", {
      groupId: f.group.id,
      userId: f.actors[1].id,
    });
    expect(r.quantity).toBe(0);
    expect(
      world(f.s, f.actors[1]).contributionHistory[0].contribution.status,
    ).toBe("sent");
    expect(world(f.s, f.actors[0]).contributionHistory).toEqual([]);
    command(f.s, f.actors[1], "contributions.update", {
      id: c.id,
      revision: c.revision,
      status: "received",
    });
    expect(
      world(f.s, f.actors[2]).contributionHistory[0].contribution.status,
    ).toBe("received");
  });
  it("prevents pool targets below existing contributions and allows archived purchase corrections", () => {
    const f = fixture(),
      r = reserve(f);
    r.poolTargetCents = 2000;
    command(f.s, f.actors[2], "contributions.create", {
      reservationId: r.id,
      amountCents: 1000,
    });
    expect(() =>
      command(f.s, f.actors[1], "reservations.update", {
        id: r.id,
        revision: r.revision,
        quantity: 1,
        purchased: 0,
        poolTargetCents: 500,
      }),
    ).toThrow("existing contributions");
    f.item.archived = true;
    command(f.s, f.actors[1], "reservations.update", {
      id: r.id,
      revision: r.revision,
      quantity: 1,
      purchased: 1,
    });
    expect(r.purchased).toBe(1);
    expect(r.purchasedAt).toBeTruthy();
  });
  it("keeps exchange giver notes and purchase notifications private", () => {
    const f = fixture(),
      r = reserve(f);
    r.exchangeId = stamp().id;
    r.giverId = f.people[1].id;
    f.s.notices = [];
    command(f.s, f.actors[1], "comments.create", {
      itemId: f.item.id,
      body: "Secret exchange purchase",
    });
    command(f.s, f.actors[1], "reservations.update", {
      id: r.id,
      revision: r.revision,
      quantity: 1,
      purchased: 1,
    });
    expect(giftView(f.s, f.actors[2], f.item).comments).toEqual([]);
    expect(giftView(f.s, f.actors[1], f.item).comments).toHaveLength(1);
    expect(f.s.notices).toHaveLength(0);
    expect(
      giftView(f.s, f.actors[2], f.item).reservations![0],
    ).not.toHaveProperty("purchasedAt");
  });
});
