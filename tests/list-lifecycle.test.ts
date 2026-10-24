import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyState, type List } from "../src/shared/model";
import {
  archiveDueLists,
  command,
  giftSummary,
  giftView,
  stamp,
  world,
} from "../src/server/domain";
import { dateHasElapsed, validCalendarDate } from "../src/shared/list-dates";

function fixture(options: Partial<List> = {}, shared = true) {
  const s = emptyState();
  const actors = ["Alex", "Sam", "Jamie", "Riley"].map((name) => ({
    id: name,
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
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  };
  s.groups.push(group);
  const list = command(s, actors[0], "lists.create", {
    name: "Birthday",
    ownerIds: [s.people[0].id],
    groupIds: shared ? [group.id] : [],
    mode: "surprise",
    revealAfter: "2030-10-18",
    timeZone: "America/New_York",
    ...options,
  }) as List;
  const item = command(s, actors[0], "items.create", {
    title: "A book",
    listId: list.id,
    quantity: 4,
    priceCents: 2900,
  }) as any;
  const update = (changes: Partial<List>) =>
    command(s, actors[0], "lists.update", { ...list, ...changes });
  const reserve = (buyer = 1) => {
    const result = command(s, actors[buyer], "reservations.create", {
      itemId: item.id,
      quantity: 1,
    }) as any;
    return s.reservations.find((r) => r.id === result.id)!;
  };
  return { s, actors, list, item, group, update, reserve };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-10-18T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("calendar-day schedules", () => {
  it.each([
    ["2026-03-08", "2026-03-09T03:59:59Z", false],
    ["2026-03-08", "2026-03-09T04:00:00Z", true],
    ["2026-11-01", "2026-11-02T04:59:59Z", false],
    ["2026-11-01", "2026-11-02T05:00:00Z", true],
  ])("ends %s in its timezone at %s", (day, now, expected) => {
    expect(dateHasElapsed(day, "America/New_York", new Date(now))).toBe(
      expected,
    );
  });
  it("validates real dates and timezones", () => {
    expect(validCalendarDate("2028-02-29")).toBe(true);
    expect(validCalendarDate("2026-02-29")).toBe(false);
    expect(() => fixture({ timeZone: "Mars/Olympus" })).toThrow();
    expect(() => fixture({ archiveAfter: "2030-02-31" })).toThrow();
  });
});

describe("archive and restoration", () => {
  it("hides due lists and blocks new gifts, reservations, pools, and comments without a worker", () => {
    const f = fixture();
    const r = f.reserve();
    f.update({ archiveAfter: "2030-10-18" });
    vi.setSystemTime(new Date("2030-10-19T04:00:00Z"));
    expect(f.list.archived).toBe(false);
    expect(world(f.s, f.actors[0]).lists[0].archived).toBe(true);
    expect(giftView(f.s, f.actors[0], f.item).archived).toBe(true);
    expect(() => f.reserve(2)).toThrow("archived");
    expect(() =>
      command(f.s, f.actors[0], "items.create", {
        listId: f.list.id,
        title: "Too late",
      }),
    ).toThrow("List not found");
    expect(() =>
      command(f.s, f.actors[1], "comments.create", {
        itemId: f.item.id,
        body: "Late",
      }),
    ).toThrow();
    expect(() =>
      command(f.s, f.actors[1], "reservations.update", {
        ...r,
        poolTargetCents: 1000,
      }),
    ).toThrow();
    // Existing buyers can still correct their purchase record after archiving.
    command(f.s, f.actors[1], "reservations.update", { ...r, purchased: 1 });
    expect(r.purchased).toBe(1);
    f.update({ archived: false });
    expect(f.list.archiveAfter).toBeNull();
    expect(world(f.s, f.actors[0]).lists[0].archived).toBe(false);
    expect(f.s.reservations[0]).toBe(r);
  });
  it("persists archiving once and preserves eligible summaries when restored", () => {
    const f = fixture();
    const r = f.reserve();
    r.purchased = 1;
    f.update({ archiveAfter: "2030-10-18" });
    vi.setSystemTime(new Date("2030-10-19T04:00:00Z"));
    archiveDueLists(f.s);
    const revision = f.list.revision;
    archiveDueLists(f.s);
    expect(f.list.archived).toBe(true);
    expect(f.list.revision).toBe(revision);
    const summary = giftSummary(f.s, f.actors[0], f.list.id);
    f.update({ archived: false });
    expect(giftSummary(f.s, f.actors[0], f.list.id)).toEqual(summary);
  });
});

describe("reveal policy locks", () => {
  it("allows private configuration but only a later date after sharing", () => {
    const f = fixture({}, false);
    f.update({ revealAfter: "2030-10-20", revealExchangeGivers: true });
    f.update({ groupIds: [f.group.id] });
    f.update({ revealAfter: "2030-10-21" });
    expect(() => f.update({ revealAfter: "2030-10-20" })).toThrow(
      "only move later",
    );
    expect(() => f.update({ revealAfter: null })).toThrow();
    expect(() => f.update({ timeZone: "UTC" })).toThrow(
      "time zone cannot change",
    );
    expect(() => f.update({ revealExchangeGivers: false })).toThrow(
      "summary cannot change",
    );
    f.update({ groupIds: [], archived: true });
    f.update({ archived: false });
    expect(() => f.update({ revealAfter: "2030-10-19" })).toThrow();
    expect(() => f.update({ mode: "transparent" })).toThrow(
      "This privacy choice cannot change after sharing",
    );
  });
  it("keeps legacy shared lists private and accepts old clients omitting added fields", () => {
    const f = fixture({ revealAfter: undefined });
    delete f.list.timeZone;
    delete f.list.revealExchangeGivers;
    expect(() => f.update({ revealAfter: "2030-12-01" })).toThrow();
    expect(() => giftSummary(f.s, f.actors[0], f.list.id)).toThrow();
    command(f.s, f.actors[0], "lists.update", {
      id: f.list.id,
      revision: f.list.revision,
      name: "Renamed",
      groupIds: [f.group.id],
      mode: "surprise",
      archived: false,
      description: "",
    });
    expect(f.list.revealAfter).toBeUndefined();
    const scheduled = fixture();
    command(scheduled.s, scheduled.actors[0], "lists.update", {
      id: scheduled.list.id,
      revision: scheduled.list.revision,
      name: "Renamed",
      groupIds: [scheduled.group.id],
      mode: "surprise",
      archived: false,
      description: "",
    });
    expect(scheduled.list.revealAfter).toBe("2030-10-18");
  });
  it("cannot postpone a date that already elapsed or reveal exchange gifts without a date", () => {
    const f = fixture();
    vi.setSystemTime(new Date("2030-10-19T04:00:00Z"));
    expect(() => f.update({ revealAfter: "2030-12-01" })).toThrow();
    expect(() =>
      fixture({ revealAfter: null, revealExchangeGivers: true }),
    ).toThrow("Choose a reveal date");
  });
  it("rejects stale revisions and updates from nonowners", () => {
    const f = fixture();
    const old = { ...f.list };
    f.update({ revealAfter: "2030-10-20" });
    expect(() => command(f.s, f.actors[0], "lists.update", old)).toThrow();
    expect(() =>
      command(f.s, f.actors[1], "lists.update", {
        ...f.list,
        revealAfter: "2030-10-21",
      }),
    ).toThrow("List not found");
  });
});

describe("owner gift summaries", () => {
  it("allows only owners after midnight and never changes the ordinary surprise projection", () => {
    const f = fixture();
    const before = giftView(f.s, f.actors[0], f.item);
    const r = f.reserve();
    r.purchased = 1;
    r.poolTargetCents = 99999;
    for (const [n, status] of [
      "sent",
      "received",
      "pledged",
      "cancelled",
    ].entries()) {
      f.s.contributions.push({
        ...stamp(),
        reservationId: r.id,
        userId: f.actors[n].id,
        amountCents: 12345,
        status: status as any,
      });
    }
    f.s.comments.push({
      ...stamp(),
      itemId: f.item.id,
      authorId: f.actors[1].id,
      body: "Never reveal this",
    });
    f.reserve(2); // An unpurchased reservation must not appear.
    vi.setSystemTime(new Date("2030-10-19T03:59:59Z"));
    expect(() => giftSummary(f.s, f.actors[0], f.list.id)).toThrow();
    vi.setSystemTime(new Date("2030-10-19T04:00:00Z"));
    expect(() => giftSummary(f.s, f.actors[1], f.list.id)).toThrow(
      "List not found",
    );
    expect(() => giftSummary(f.s, f.actors[0], stamp().id)).toThrow(
      "List not found",
    );
    const dto = giftSummary(f.s, f.actors[0], f.list.id);
    expect(dto.gifts).toHaveLength(1);
    expect(dto.gifts[0]).toEqual({
      id: r.id,
      itemId: f.item.id,
      title: "A book",
      purchased: 1,
      buyerName: "Sam",
      exchange: false,
      contributors: f.s.contributions.slice(0, 2).map((c, n) => ({
        id: c.id,
        name: f.actors[n].name,
        status: c.status,
      })),
    });
    for (const forbidden of [
      "amountCents",
      "poolTargetCents",
      "priceCents",
      "Never reveal this",
      "comments",
      "quantity",
      "buyerId",
    ])
      expect(JSON.stringify(dto)).not.toContain(forbidden);
    expect(giftView(f.s, f.actors[0], f.item)).toEqual(before);
    expect(before.priceCents).toBe(2900);
  });
  it.each([false, true])(
    "respects the locked exchange choice: %s",
    (revealExchangeGivers) => {
      const f = fixture({ revealExchangeGivers });
      const r = f.reserve();
      r.purchased = 1;
      r.exchangeId = stamp().id;
      r.giverId = f.s.people[1].id;
      vi.setSystemTime(new Date("2030-10-19T04:00:00Z"));
      const dto = giftSummary(f.s, f.actors[0], f.list.id);
      expect(dto.gifts).toHaveLength(revealExchangeGivers ? 1 : 0);
      if (revealExchangeGivers) expect(dto.gifts[0].buyerName).toBe("Sam");
      expect(JSON.stringify(dto)).not.toContain("assignments");
      expect(
        giftView(f.s, f.actors[2], f.item).reservations![0].buyerName,
      ).toBe("Exchange giver");
    },
  );
  it("supports joint owners and guardians, and masks former buyers", () => {
    const f = fixture();
    const r = f.reserve();
    r.purchased = 1;
    r.former = true;
    f.list.ownerIds.push(f.s.people[2].id);
    f.s.people[0].guardians.push(f.actors[3].id);
    vi.setSystemTime(new Date("2030-10-19T04:00:00Z"));
    for (const n of [0, 2, 3])
      expect(giftSummary(f.s, f.actors[n], f.list.id).gifts[0].buyerName).toBe(
        "Former member",
      );
  });
  it("preserves Transparent list status while giving it the same protected summary", () => {
    const f = fixture({ mode: "transparent" });
    f.reserve();
    expect(giftView(f.s, f.actors[0], f.item).reservations).toHaveLength(1);
    expect(() => giftSummary(f.s, f.actors[0], f.list.id)).toThrow();
  });
});
