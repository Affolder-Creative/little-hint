import { describe, it, expect } from "vitest";
import { fixture } from "./privacy-fixture";
import { command, world, archiveDueLists } from "../src/server/domain";
import { activityAllowed, inbox } from "../src/server/activity";
import { syncContributions, spendingView } from "../src/server/spending";
import { spendingTotals } from "../src/shared/spending";
import type { Contribution, Reservation } from "../src/shared/model";
function setup() {
  const f = fixture(),
    [owner, buyer, donor] = f.actors,
    s = f.state;
  const created = command(s, buyer, "reservations.create", {
    itemId: f.item.id,
    quantity: 2,
  }) as Reservation;
  const r = s.reservations.find((r) => r.id === created.id)!;
  command(s, buyer, "reservations.update", { ...r, poolTargetCents: 10000 });
  const c = command(s, donor, "contributions.create", {
    reservationId: r.id,
    amountCents: 4000,
  }) as Contribution;
  const remove = (action: string) =>
    command(s, owner, action, {
      id: f.item.id,
      revision: f.item.revision,
      archived: true,
    });
  return { ...f, s, owner, buyer, donor, r, c, remove };
}
describe("private gift lifecycle", () => {
  it("notifies financial participants, keeps owner blind, and retains settlement after purge", () => {
    const f = setup();
    f.s.notices = [];
    f.remove("items.trash");
    expect(f.s.notices.map((n) => n.userId).sort()).toEqual(
      [f.buyer.id, f.donor.id].sort(),
    );
    expect(inbox(f.s, f.owner).unreadCount).toBe(0);
    expect(inbox(f.s, f.donor).entries[0].href).toBe(
      `/buying?contribution=${f.c.id}`,
    );
    expect(inbox(f.s, f.buyer).entries[0].href).toBe(
      `/buying?reservation=${f.r.id}`,
    );
    const count = f.s.notices.length;
    f.remove("items.purge");
    expect(f.s.notices).toHaveLength(count);
    expect(f.s.notices.every((n) => activityAllowed(f.s, n))).toBe(true);
    expect(world(f.s, f.owner).buying).toEqual([]);
    expect(() =>
      command(f.s, f.donor, "contributions.update", { ...f.c, status: "sent" }),
    ).toThrow("Review");
    command(f.s, f.donor, "reservations.review", {
      id: f.r.id,
      sourceVersion: f.r.sourceVersion,
    });
    command(f.s, f.donor, "contributions.update", { ...f.c, status: "sent" });
    expect(
      f.s.notices.some((n) => n.action === "sent" && activityAllowed(f.s, n)),
    ).toBe(true);
  });
  it("requires archive review and invalidates it after restoration and rearchive", () => {
    const f = setup();
    f.remove("items.archive");
    const version = f.r.sourceVersion;
    expect(() =>
      command(f.s, f.buyer, "reservations.update", { ...f.r, purchased: 1 }),
    ).toThrow("Review");
    command(f.s, f.buyer, "reservations.review", {
      id: f.r.id,
      sourceVersion: version,
    });
    command(f.s, f.buyer, "reservations.update", { ...f.r, purchased: 1 });
    command(f.s, f.owner, "items.archive", {
      id: f.item.id,
      revision: f.item.revision,
      archived: false,
    });
    expect(f.s.notices.some((n) => n.lifecycle?.state === "active")).toBe(true);
    f.remove("items.archive");
    expect(() =>
      command(f.s, f.buyer, "reservations.review", {
        id: f.r.id,
        sourceVersion: version,
      }),
    ).toThrow("changed again");
  });
  it("groups list changes and deduplicates worker archive runs", () => {
    const f = setup();
    command(f.s, f.buyer, "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
    });
    f.s.notices = [];
    f.lists[0].archiveAfter = "2020-01-01";
    archiveDueLists(f.s);
    const count = f.s.notices.length;
    expect(
      f.s.notices.find((n) => n.userId === f.buyer.id)?.lifecycle
        ?.reservationIds,
    ).toHaveLength(2);
    archiveDueLists(f.s);
    expect(f.s.notices).toHaveLength(count);
  });
  it("records partial returns with per-party dates, limits and immutable confirmation", () => {
    const f = setup();
    for (const a of [f.buyer, f.donor])
      command(f.s, a, "spending.settings", { enabled: true, summaries: true });
    command(f.s, f.donor, "contributions.update", { ...f.c, status: "sent" });
    command(f.s, f.buyer, "contributions.update", {
      ...f.c,
      status: "received",
    });
    f.remove("items.trash");
    f.remove("items.purge");
    command(f.s, f.buyer, "contributions.return", {
      id: f.c.id,
      revision: f.c.revision,
      amountCents: 1500,
      date: "2026-12-31",
    });
    const ret = f.c.returns![0];
    expect(() =>
      command(f.s, f.buyer, "contributions.return", {
        id: f.c.id,
        revision: f.c.revision,
        amountCents: 3000,
        date: "2026-12-31",
      }),
    ).toThrow("remaining");
    syncContributions(f.s);
    expect(
      f.s.spendingRecords.find(
        (r) => r.contributionReturnId === ret.id && r.ownerId === f.donor.id,
      ),
    ).toBeUndefined();
    command(f.s, f.donor, "contributions.return-update", {
      id: f.c.id,
      revision: f.c.revision,
      returnId: ret.id,
      status: "received",
      date: "2027-01-01",
    });
    syncContributions(f.s);
    const records = f.s.spendingRecords.filter(
      (r) => r.contributionReturnId === ret.id,
    );
    expect(records.map((r) => [r.ownerId, r.kind, r.date])).toEqual(
      expect.arrayContaining([
        [f.buyer.id, "contribution", "2026-12-31"],
        [f.donor.id, "refund", "2027-01-01"],
      ]),
    );
    expect(spendingTotals(spendingView(f.s, f.donor).records).spent).toBe(2500);
    expect(() =>
      command(f.s, f.buyer, "contributions.return-update", {
        id: f.c.id,
        revision: f.c.revision,
        returnId: ret.id,
        status: "voided",
      }),
    ).toThrow("settled");
    expect(() =>
      command(f.s, f.owner, "contributions.return", {
        id: f.c.id,
        revision: f.c.revision,
        amountCents: 1,
        date: "2027-01-01",
      }),
    ).toThrow("not found");
  });
});

it("exposes a reviewable effective version when the archive worker is offline", async () => {
  const { sourceView } = await import("../src/server/gift-lifecycle");
  const f = setup();
  f.lists[0].archiveAfter = "2020-01-01";
  const view = sourceView(f.s, f.r, f.buyer);
  expect(view.sourceState).toBe("archived");
  command(f.s, f.buyer, "reservations.review", {
    id: f.r.id,
    sourceVersion: view.sourceVersion,
  });
  command(f.s, f.buyer, "reservations.update", { ...f.r, purchased: 1 });
  expect(f.r.purchased).toBe(1);
});
it("keeps return details between financial participants and supports correcting a pending entry", () => {
  const f = setup();
  command(f.s, f.donor, "contributions.update", { ...f.c, status: "sent" });
  command(f.s, f.buyer, "contributions.update", { ...f.c, status: "received" });
  command(f.s, f.buyer, "contributions.return", {
    id: f.c.id,
    revision: f.c.revision,
    amountCents: 500,
    date: "2026-10-01",
  });
  const ret = f.c.returns![0];
  expect(JSON.stringify(world(f.s, f.actors[3]))).not.toContain(ret.id);
  const stale = f.c.revision;
  command(f.s, f.buyer, "contributions.return-update", {
    id: f.c.id,
    revision: stale,
    returnId: ret.id,
    status: "voided",
  });
  expect(() =>
    command(f.s, f.donor, "contributions.return-update", {
      id: f.c.id,
      revision: stale,
      returnId: ret.id,
      status: "received",
      date: "2026-10-02",
    }),
  ).toThrow("changed since");
  expect(ret.status).toBe("voided");
});
it("does not double-count internal returned contributions or inflate shared plans", () => {
  const base = {
    id: "p",
    revision: 1,
    createdAt: "2026-01-01",
    ownerId: "buyer",
    title: "Gift",
    recipientIds: [],
    recipientNames: [],
    reservationId: "r",
    quantity: 1,
    amountCents: 10000,
    date: "2026-12-01",
    planningYear: 2026,
    kind: "purchase" as const,
    sharing: "private" as const,
    splits: [],
    history: [],
  };
  const donor = {
    ...base,
    id: "d",
    ownerId: "donor",
    kind: "contribution" as const,
    amountCents: 4000,
    sourceId: "c",
  };
  const credit = {
    ...base,
    id: "credit",
    kind: "refund" as const,
    amountCents: 4000,
    sourceId: "c",
  };
  const sent = {
    ...base,
    id: "sent",
    kind: "contribution" as const,
    amountCents: 1500,
    sourceId: "ret",
    contributionId: "c",
    contributionReturnId: "ret",
  };
  const received = {
    ...sent,
    id: "received",
    ownerId: "donor",
    kind: "refund" as const,
    date: "2027-01-01",
  };
  const records = [base, donor, credit, sent, received];
  expect(spendingTotals(records, undefined, true).spent).toBe(10000);
  expect(spendingTotals([received], undefined, true, records).spent).toBe(0);
  expect(
    spendingTotals(
      [
        { ...base, kind: "plan", promisedCents: 2500 },
        donor,
        credit,
        sent,
        received,
      ],
      undefined,
      true,
    ).planned,
  ).toBe(10000);
});

it("does not resume lifecycle updates for a contributor whose sharing was revoked", () => {
  const f = setup();
  f.group.memberIds = f.group.memberIds.filter((id) => id !== f.donor.id);
  f.s.notices = [];
  f.remove("items.archive");
  expect(f.s.notices.filter((n) => n.lifecycle).map((n) => n.userId)).toEqual([
    f.buyer.id,
  ]);
});
