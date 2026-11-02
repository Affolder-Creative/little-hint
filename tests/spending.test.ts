import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { emptyState } from "../src/shared/model";
import { command, stamp, world } from "../src/server/domain";
import {
  spendingView,
  spendingHistory,
  syncContributions,
  syncSpending,
} from "../src/server/spending";
import {
  spendingTotals,
  allocatedCents,
  spendingMatches,
} from "../src/shared/spending";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
function fixture() {
  const s = emptyState();
  const actors = ["Alex", "Jamie", "Emma"].map((name) => ({
    id: stamp().id,
    name,
    email: name + "@example.test",
  }));
  s.people = actors.map((a) => ({
    ...stamp(),
    name: a.name,
    userId: a.id,
    guardians: [],
  }));
  s.groups.push({
    ...stamp(),
    name: "Family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  });
  for (const a of actors)
    command(s, a, "spending.settings", { enabled: true, summaries: true });
  const run = (i: number, action: string, p: unknown) =>
    command(s, actors[i], "spending." + action, p);
  const add = (
    i = 0,
    recipients = [s.people[2].id],
    amountCents: number | null = 4500,
  ) =>
    run(i, "purchase", {
      title: "Gift",
      recipientIds: recipients,
      amountCents,
      date: "2026-11-02",
    });
  const connect = () => {
    run(0, "connect", { userId: actors[1].id });
    const c = s.spendingConnections[0];
    run(1, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "accept",
    });
    return c;
  };
  return { s, actors, run, add, connect };
}
describe("private spending", () => {
  it("keeps actual costs out of public world and other accounts", () => {
    const f = fixture();
    f.add();
    expect(spendingView(f.s, f.actors[0]).records).toHaveLength(1);
    expect(spendingView(f.s, f.actors[1]).records).toHaveLength(0);
    expect(JSON.stringify(world(f.s, f.actors[1]))).not.toContain("4500");
  });
  it("distinguishes missing amounts and records refunds independently", () => {
    const f = fixture();
    f.add();
    f.add(0, undefined, null);
    const r = f.s.spendingRecords[0];
    f.run(0, "refund", {
      id: r.id,
      revision: r.revision,
      amountCents: 500,
      date: "2026-11-02",
    });
    expect(spendingTotals(f.s.spendingRecords)).toEqual({
      spent: 4000,
      planned: 0,
      missing: 1,
    });
  });
  it("requires both parties for sharing and editing; disconnect revokes access", () => {
    const f = fixture();
    f.add();
    const r = f.s.spendingRecords[0];
    const c = f.connect();
    f.run(0, "share", { id: r.id, revision: r.revision, shared: true });
    expect(spendingView(f.s, f.actors[1]).records[0].canEdit).toBe(false);
    f.run(0, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "edit-on",
    });
    expect(spendingView(f.s, f.actors[1]).records[0].canEdit).toBe(false);
    f.run(1, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "edit-on",
    });
    expect(spendingView(f.s, f.actors[1]).records[0].canEdit).toBe(true);
    f.run(1, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "disconnect",
    });
    expect(spendingView(f.s, f.actors[1]).records).toHaveLength(0);
  });
  it("never shares a gift for either partner, including joint recipients", () => {
    const f = fixture();
    f.connect();
    f.add(0, [f.s.people[1].id, f.s.people[2].id]);
    const r = f.s.spendingRecords[0];
    expect(() =>
      f.run(0, "share", { id: r.id, revision: r.revision, shared: true }),
    ).toThrow("cannot be shared");
    expect(spendingView(f.s, f.actors[1]).records).toHaveLength(0);
  });
  it("only shares new eligible entries and withdrawal removes rule-granted access", () => {
    const f = fixture();
    f.add();
    const c = f.connect();
    f.run(0, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "rules",
      rules: ["person:" + f.s.people[2].id],
    });
    f.add();
    expect(spendingView(f.s, f.actors[1]).records).toHaveLength(1);
    f.run(0, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "rules",
      rules: [],
    });
    expect(spendingView(f.s, f.actors[1]).records).toHaveLength(0);
  });
  it("rejects stale edits and preserves payer when a partner edits", () => {
    const f = fixture();
    f.add();
    const r = f.s.spendingRecords[0];
    const c = f.connect();
    f.run(0, "share", { id: r.id, revision: r.revision, shared: true });
    for (const i of [0, 1])
      f.run(i, "connection", {
        id: c.id,
        revision: c.revision,
        operation: "edit-on",
      });
    const old = r.revision;
    f.run(1, "record", {
      id: r.id,
      revision: old,
      amountCents: 4800,
      date: "2026-11-02",
      planningYear: 2026,
      splits: [1],
    });
    expect(r.ownerId).toBe(f.actors[0].id);
    expect(() =>
      f.run(0, "record", {
        id: r.id,
        revision: old,
        amountCents: 4900,
        date: "2026-11-02",
        planningYear: 2026,
        splits: [1],
      }),
    ).toThrow("changed");
  });
  it("splits odd cents exactly once", () => {
    const f = fixture();
    f.add(0, [f.s.people[1].id, f.s.people[2].id], 12001);
    const r = f.s.spendingRecords[0];
    expect(r.recipientIds.map((id) => allocatedCents(r, id))).toEqual([
      6001, 6000,
    ]);
    expect(spendingTotals([r]).spent).toBe(12001);
  });
  it("pauses sharing without deleting personal records", () => {
    const f = fixture();
    f.add();
    const c = f.connect();
    const r = f.s.spendingRecords[0];
    f.run(0, "share", { id: r.id, revision: r.revision, shared: true });
    f.run(0, "settings", { enabled: false, summaries: true });
    expect(spendingView(f.s, f.actors[1]).records).toHaveLength(0);
    f.run(0, "settings", { enabled: true, summaries: true });
    expect(spendingView(f.s, f.actors[1]).records).toHaveLength(0);
    expect(spendingView(f.s, f.actors[0]).records).toHaveLength(1);
  });
});

function reserved(
  f: ReturnType<typeof fixture>,
  quantity = 2,
  priceCents = 5000,
) {
  const list = command(f.s, f.actors[2], "lists.create", {
    name: "Emma wishes",
    ownerIds: [f.s.people[2].id],
    groupIds: [f.s.groups[0].id],
    mode: "surprise",
  }) as { id: string };
  const result = command(f.s, f.actors[2], "items.create", {
    title: "Books",
    listId: list.id,
    quantity,
    priceCents,
  }) as { id: string };
  const gift = f.s.items.find((i) => i.id === result.id)!;
  const response = command(f.s, f.actors[0], "reservations.create", {
    itemId: gift.id,
    quantity,
  }) as { id: string };
  const reservation = f.s.reservations.find((r) => r.id === response.id)!;
  const plan = () =>
    f.s.spendingRecords.find(
      (r) =>
        r.reservationId === reservation.id &&
        r.kind === "plan" &&
        !r.sourceId &&
        r.ownerId === f.actors[0].id,
    )!;
  const buy = (amountCents: number | null, date = "2026-11-02", extra = {}) =>
    f.run(0, "purchase", {
      reservationId: reservation.id,
      planRevision: plan().revision,
      title: gift.title,
      recipientIds: [f.s.people[2].id],
      quantity: 1,
      amountCents,
      date,
      ...extra,
    });
  return { gift, reservation, plan, buy };
}

describe("spending ledger regressions", () => {
  it("records partial purchases on separate dates and removes only purchased quantities from plans", () => {
    const f = fixture(),
      gift = reserved(f, 3);
    gift.buy(4200, "2026-10-30");
    gift.buy(null, "2026-11-02");
    const records = spendingView(f.s, f.actors[0]).records;
    expect(
      records
        .filter((r) => r.kind === "purchase")
        .map((r) => [r.quantity, r.amountCents, r.date]),
    ).toEqual([
      [1, 4200, "2026-10-30"],
      [1, null, "2026-11-02"],
    ]);
    expect(gift.reservation.purchased).toBe(2);
    expect(spendingTotals(records)).toEqual({
      spent: 4200,
      planned: 5000,
      missing: 1,
    });
  });
  it("preserves edited estimates after a partial purchase", () => {
    const f = fixture(),
      gift = reserved(f);
    f.run(0, "record", {
      id: gift.plan().id,
      revision: gift.plan().revision,
      amountCents: 8000,
      date: null,
      planningYear: 2026,
      splits: [1],
    });
    gift.buy(4000);
    expect(spendingTotals(spendingView(f.s, f.actors[0]).records)).toEqual({
      spent: 4000,
      planned: 4000,
      missing: 0,
    });
  });
  it("rejects a stale purchase form before changing quantities or writing another payment", () => {
    const f = fixture(),
      gift = reserved(f, 3),
      oldRevision = gift.plan().revision;
    gift.buy(4000);
    expect(() =>
      gift.buy(4000, "2026-11-02", { planRevision: oldRevision }),
    ).toThrow("changed");
    expect(gift.reservation.purchased).toBe(1);
    expect(
      f.s.spendingRecords.filter((r) => r.kind === "purchase"),
    ).toHaveLength(1);
  });
  it("keeps donor contribution plans separate when buyer tracking starts later", () => {
    const f = fixture();
    f.run(0, "settings", { enabled: false, summaries: true });
    const gift = reserved(f, 1, 10000);
    command(f.s, f.actors[0], "reservations.update", {
      id: gift.reservation.id,
      revision: gift.reservation.revision,
      quantity: 1,
      purchased: 0,
      poolTargetCents: 10000,
    });
    const contribution = command(f.s, f.actors[1], "contributions.create", {
      reservationId: gift.reservation.id,
      amountCents: 4000,
    }) as { id: string };
    syncContributions(f.s);
    const donor = f.s.spendingRecords.find(
      (r) => r.sourceId === contribution.id,
    )!;
    const before = structuredClone(donor);
    f.run(0, "settings", { enabled: true, summaries: true });
    expect(donor).toEqual(before);
    expect(gift.plan().ownerId).toBe(f.actors[0].id);
    expect(gift.plan().sourceId).toBeUndefined();
    gift.buy(10000);
    expect(donor).toEqual(before);
    expect(
      spendingView(f.s, f.actors[1]).records.find(
        (r) => r.sourceId === contribution.id,
      )?.amountCents,
    ).toBe(4000);
  });
  it("keeps rule provenance through purchases and refunds, so deselecting a person revokes the whole sequence", () => {
    const f = fixture(),
      c = f.connect();
    f.run(0, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "rules",
      rules: ["person:" + f.s.people[2].id],
    });
    const gift = reserved(f, 1);
    gift.buy(4500);
    const purchase = f.s.spendingRecords.find((r) => r.kind === "purchase")!;
    f.run(0, "refund", {
      id: purchase.id,
      revision: purchase.revision,
      amountCents: 500,
      date: "2026-11-02",
    });
    expect(
      spendingView(f.s, f.actors[1]).records.filter((r) => !r.voided),
    ).toHaveLength(2);
    f.run(0, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "rules",
      rules: [],
    });
    expect(spendingView(f.s, f.actors[1]).records).toHaveLength(0);
  });
  it("withdraws derived refunds when a purchase is kept private", () => {
    const f = fixture();
    f.connect();
    f.add();
    const purchase = f.s.spendingRecords[0];
    f.run(0, "share", {
      id: purchase.id,
      revision: purchase.revision,
      shared: true,
    });
    f.run(0, "refund", {
      id: purchase.id,
      revision: purchase.revision,
      amountCents: 500,
      date: "2026-11-02",
    });
    f.run(0, "share", {
      id: purchase.id,
      revision: purchase.revision,
      shared: false,
    });
    expect(spendingView(f.s, f.actors[1]).records).toHaveLength(0);
  });
  it("allocates rounding pennies by fractional remainder without charging zero-share recipients", () => {
    const f = fixture();
    f.add();
    const base = f.s.spendingRecords[0];
    const zero = {
      ...base,
      amountCents: 1,
      recipientIds: ["zero", "a", "b"],
      splits: [0, 1, 1],
    };
    expect(zero.recipientIds.map((id) => allocatedCents(zero, id))).toEqual([
      0, 1, 0,
    ]);
    const unequal = {
      ...base,
      amountCents: 2,
      recipientIds: ["a", "b", "c"],
      splits: [1, 2, 3],
    };
    expect(
      unequal.recipientIds.map((id) => allocatedCents(unequal, id)),
    ).toEqual([0, 1, 1]);
  });
  it("does not count internal partner transfers in a later settlement year", () => {
    const f = fixture();
    f.add();
    const base = f.s.spendingRecords[0];
    const rows = [
      {
        ...base,
        id: "paid",
        ownerId: f.actors[0].id,
        reservationId: "r",
        kind: "purchase" as const,
        amountCents: 10000,
        date: "2026-12-30",
      },
      {
        ...base,
        id: "sent",
        ownerId: f.actors[1].id,
        reservationId: "r",
        kind: "contribution" as const,
        sourceId: "c",
        amountCents: 4000,
        date: "2026-12-31",
      },
      {
        ...base,
        id: "received",
        ownerId: f.actors[0].id,
        reservationId: "r",
        kind: "refund" as const,
        sourceId: "c",
        amountCents: 4000,
        date: "2027-01-01",
      },
    ];
    expect(
      spendingTotals(
        rows.filter((r) => spendingMatches(r, { year: 2026 })),
        undefined,
        true,
        rows,
      ).spent,
    ).toBe(10000);
    expect(
      spendingTotals(
        rows.filter((r) => spendingMatches(r, { year: 2027 })),
        undefined,
        true,
        rows,
      ).spent,
    ).toBe(0);
  });
  it("keeps authorized historical snapshots when source metadata changes after access is lost", () => {
    const f = fixture(),
      gift = reserved(f);
    const old = structuredClone(gift.plan());
    f.s.groups[0].memberIds = f.s.groups[0].memberIds.filter(
      (id) => id !== f.actors[0].id,
    );
    gift.gift.priceCents = 99999;
    gift.gift.recipientIds = [f.s.people[1].id];
    syncSpending(f.s, f.actors[0]);
    expect(gift.plan().amountCents).toBe(old.amountCents);
    expect(gift.plan().recipientIds).toEqual(old.recipientIds);
  });
  it("does not import newly inaccessible metadata when tracking is enabled after losing source access", () => {
    const f = fixture();
    f.run(0, "settings", { enabled: false, summaries: true });
    const gift = reserved(f);
    f.s.groups[0].memberIds = f.s.groups[0].memberIds.filter(
      (id) => id !== f.actors[0].id,
    );
    gift.gift.priceCents = 99999;
    gift.gift.recipientIds = [f.s.people[1].id];
    f.run(0, "settings", { enabled: true, summaries: true });
    expect(gift.plan().recipientIds).toEqual([]);
    expect(gift.plan().amountCents).toBeNull();
    expect(gift.plan().listId).toBeUndefined();
    expect(gift.plan().title).toBe("Books");
  });
  it("records date and split changes as well as amount changes in the audit history", () => {
    const f = fixture();
    f.add(0, [f.s.people[1].id, f.s.people[2].id]);
    const r = f.s.spendingRecords[0];
    f.run(0, "record", {
      id: r.id,
      revision: r.revision,
      amountCents: 4500,
      date: "2026-11-01",
      planningYear: 2027,
      splits: [1, 3],
    });
    const audit = JSON.stringify(r.history.at(-1));
    expect(audit).toContain("2026-11-01");
    expect(audit).toContain("2027");
    expect(audit).toMatch(/split/i);
  });
});

describe("shared purchase and contribution integration", () => {
  it("requires joint editing before a partner can complete a reservation and retains the actual payer", () => {
    const f = fixture(),
      c = f.connect();
    const gift = reserved(f, 1);
    f.run(0, "share", {
      id: gift.plan().id,
      revision: gift.plan().revision,
      shared: true,
    });
    const payload = () => ({
      reservationId: gift.reservation.id,
      planRevision: gift.plan().revision,
      title: "Books",
      recipientIds: [f.s.people[2].id],
      amountCents: 4800,
      date: "2026-11-02",
      quantity: 1,
      payerId: f.actors[1].id,
    });
    expect(() => f.run(1, "purchase", payload())).toThrow("not available");
    expect(gift.reservation.purchased).toBe(0);
    for (const i of [0, 1])
      f.run(i, "connection", {
        id: c.id,
        revision: c.revision,
        operation: "edit-on",
      });
    f.run(1, "purchase", payload());
    expect(gift.reservation.buyerId).toBe(f.actors[0].id);
    expect(gift.reservation.purchased).toBe(1);
    const purchase = f.s.spendingRecords.find((r) => r.kind === "purchase")!;
    expect(purchase.ownerId).toBe(f.actors[1].id);
    expect(purchase.history[0].actorId).toBe(f.actors[1].id);
    expect(
      f.s.spendingRecords.filter((r) => r.kind === "purchase"),
    ).toHaveLength(1);
  });
  it("keeps promised, sent, and received contributions distinct without doubling a shared gift", () => {
    const f = fixture(),
      c = f.connect();
    for (const i of [0, 1])
      f.run(i, "connection", {
        id: c.id,
        revision: c.revision,
        operation: "rules",
        rules: ["person:" + f.s.people[2].id],
      });
    const gift = reserved(f, 1, 10000);
    command(f.s, f.actors[0], "reservations.update", {
      id: gift.reservation.id,
      revision: gift.reservation.revision,
      quantity: 1,
      purchased: 0,
      poolTargetCents: 10000,
    });
    const result = command(f.s, f.actors[1], "contributions.create", {
      reservationId: gift.reservation.id,
      amountCents: 4000,
    }) as { id: string };
    const contribution = f.s.contributions.find((c) => c.id === result.id)!;
    syncContributions(f.s);
    const personal = (i: number) =>
      spendingTotals(
        spendingView(f.s, f.actors[i]).records.filter(
          (r) => r.ownerId === f.actors[i].id,
        ),
      );
    const together = () =>
      spendingTotals(
        spendingView(f.s, f.actors[0]).records.filter(
          (r) => r.connectionId === c.id,
        ),
        undefined,
        true,
      );
    expect(personal(0).planned).toBe(6000);
    expect(personal(1)).toEqual({ spent: 0, planned: 4000, missing: 0 });
    expect(together().planned).toBe(10000);
    gift.buy(10000);
    command(f.s, f.actors[1], "contributions.update", {
      id: contribution.id,
      revision: contribution.revision,
      status: "sent",
    });
    syncContributions(f.s);
    expect(personal(0).spent).toBe(10000);
    expect(personal(1).spent).toBe(4000);
    expect(together().spent).toBe(10000);
    command(f.s, f.actors[0], "contributions.update", {
      id: contribution.id,
      revision: contribution.revision,
      status: "received",
    });
    syncContributions(f.s);
    expect(personal(0).spent).toBe(6000);
    expect(together().spent).toBe(10000);
  });
});

describe("authorized spending history API", () => {
  it("paginates records while totals and filter metadata use only the complete authorized shared ledger", () => {
    const f = fixture(),
      c = f.connect();
    for (let i = 0; i < 31; i++) {
      f.add(0, undefined, 100);
      const r = f.s.spendingRecords.at(-1)!;
      r.title = "Shared gift " + i;
      f.run(0, "share", { id: r.id, revision: r.revision, shared: true });
    }
    f.add(0, [f.s.people[1].id], 99999);
    const hidden = f.s.spendingRecords.at(-1)!;
    hidden.title = "Secret partner gift";
    hidden.date = "2024-11-02";
    const first = spendingHistory(f.s, f.actors[1], {
      shared: "true",
      page: "1",
    });
    const second = spendingHistory(f.s, f.actors[1], {
      shared: "true",
      page: "2",
    });
    expect(first.records).toHaveLength(30);
    expect(second.records).toHaveLength(1);
    expect(
      new Set([...first.records, ...second.records].map((r) => r.id)).size,
    ).toBe(31);
    expect(first.total).toBe(31);
    expect(second.summary.spent).toBe(3100);
    expect(first.recipients).toEqual([{ id: f.s.people[2].id, name: "Emma" }]);
    expect(first.years).not.toContain(2024);
    expect(JSON.stringify(first)).not.toContain("Secret partner gift");
    f.run(0, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "disconnect",
    });
    const disconnected = spendingHistory(f.s, f.actors[1], { shared: "true" });
    expect(disconnected.total).toBe(0);
    expect(disconnected.summary.spent).toBe(0);
    expect(disconnected.recipients).toEqual([]);
  });
  it("classifies cross-year internal transfers before applying history filters", () => {
    const f = fixture(),
      c = f.connect();
    f.add();
    const base = f.s.spendingRecords[0];
    const purchase = {
      ...base,
      id: stamp().id,
      connectionId: c.id,
      sharing: "explicit" as const,
      reservationId: stamp().id,
      amountCents: 10000,
      date: "2026-12-30",
    };
    const sourceId = stamp().id;
    f.s.spendingRecords = [
      purchase,
      {
        ...purchase,
        id: stamp().id,
        ownerId: f.actors[1].id,
        kind: "contribution",
        sourceId,
        amountCents: 4000,
        date: "2026-12-31",
      },
      {
        ...purchase,
        id: stamp().id,
        kind: "refund",
        sourceId,
        amountCents: 4000,
        date: "2027-01-01",
      },
    ];
    expect(
      spendingHistory(f.s, f.actors[0], { shared: "true", year: "2026" })
        .summary.spent,
    ).toBe(10000);
    expect(
      spendingHistory(f.s, f.actors[0], { shared: "true", year: "2027" })
        .summary.spent,
    ).toBe(0);
  });
  it("rejects keeping a delegated partner payment private before changing the reservation", () => {
    const f = fixture(),
      c = f.connect(),
      gift = reserved(f, 1);
    f.run(0, "share", {
      id: gift.plan().id,
      revision: gift.plan().revision,
      shared: true,
    });
    for (const i of [0, 1])
      f.run(i, "connection", {
        id: c.id,
        revision: c.revision,
        operation: "edit-on",
      });
    expect(() =>
      gift.buy(4500, "2026-11-02", {
        payerId: f.actors[1].id,
        keepPrivate: true,
      }),
    ).toThrow("must stay shared");
    expect(gift.reservation.purchased).toBe(0);
    expect(
      f.s.spendingRecords.filter((r) => r.kind === "purchase"),
    ).toHaveLength(0);
  });
});
