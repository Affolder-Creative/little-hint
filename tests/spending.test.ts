import { spendingAvailable } from "../src/server/deployment";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { emptyState } from "../src/shared/model";
import { command, stamp, world, idempotent } from "../src/server/domain";
import {
  spendingView,
  spendingHistory,
  syncContributions,
  syncSpending,
  reconcileSpending,
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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
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
    expect(spendingTotals(f.s.spendingRecords)).toMatchObject({
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
    expect(spendingTotals(records)).toMatchObject({
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
    expect(
      spendingTotals(spendingView(f.s, f.actors[0]).records),
    ).toMatchObject({
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
    syncContributions(f.s, [contribution.id]);
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
    expect(personal(1)).toMatchObject({ spent: 0, planned: 4000, missing: 0 });
    expect(together().planned).toBe(10000);
    gift.buy(10000);
    command(f.s, f.actors[1], "contributions.update", {
      id: contribution.id,
      revision: contribution.revision,
      status: "sent",
    });
    syncContributions(f.s, [contribution.id]);
    expect(personal(0).spent).toBe(10000);
    expect(personal(1).spent).toBe(4000);
    expect(together().spent).toBe(10000);
    command(f.s, f.actors[0], "contributions.update", {
      id: contribution.id,
      revision: contribution.revision,
      status: "received",
    });
    syncContributions(f.s, [contribution.id]);
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

describe("spending availability and linked entry", () => {
  it("defaults to available and disables only false", () => {
    for (const value of [undefined, "", "true", "0", "other"])
      expect(spendingAvailable({ SPENDING_ENABLED: value })).toBe(true);
    for (const value of ["false", " FALSE "])
      expect(spendingAvailable({ SPENDING_ENABLED: value })).toBe(false);
  });
  it("hides capability and blocks reads/writes while keeping ordinary buying and saved settings", () => {
    const f = fixture();
    const gift = reserved(f);
    gift.buy(4200);
    const before = structuredClone(f.s.spendingRecords);
    vi.stubEnv("SPENDING_ENABLED", "false");
    expect(world(f.s, f.actors[0])).toMatchObject({
      spendingAvailable: false,
      spendingEnabled: false,
      spendingInvitation: false,
    });
    expect(() => spendingView(f.s, f.actors[0])).toThrow("unavailable");
    expect(() => f.add()).toThrow("unavailable");
    expect(() =>
      f.run(0, "settings", { enabled: false, summaries: false }),
    ).toThrow("unavailable");
    command(f.s, f.actors[0], "reservations.update", {
      id: gift.reservation.id,
      revision: gift.reservation.revision,
      quantity: 2,
      purchased: 2,
    });
    syncSpending(f.s, f.actors[0]);
    syncContributions(f.s);
    expect(f.s.spendingRecords).toEqual(before);
    expect(f.s.spendingSettings[0].enabled).toBe(true);
    vi.stubEnv("SPENDING_ENABLED", "");
    expect(reconcileSpending(f.s, f.actors[0])).toBe(true);
    expect(reconcileSpending(f.s, f.actors[0])).toBe(false);
    const purchases = f.s.spendingRecords.filter((r) => r.kind === "purchase");
    expect(purchases).toHaveLength(2);
    expect(purchases[0].amountCents).toBe(4200);
    expect(purchases[1]).toMatchObject({
      amountCents: null,
      date: null,
      sharing: "private",
    });
    expect(world(f.s, f.actors[0]).spendingEnabled).toBe(true);
  });
  it("separates known zero from missing actual and planned values", () => {
    const f = fixture();
    f.add(0, undefined, 0);
    f.add(0, undefined, null);
    const gift = reserved(f);
    gift.plan().amountCents = null;
    expect(spendingTotals(f.s.spendingRecords)).toMatchObject({
      spent: 0,
      planned: 0,
      knownActual: 1,
      missingActual: 1,
      knownPlanned: 0,
      missingPlanned: 1,
    });
    const actual = spendingHistory(f.s, f.actors[0], {
      missingAmounts: "actual",
    });
    expect(actual.records).toHaveLength(1);
    expect(actual.records[0].kind).toBe("purchase");
    const planned = spendingHistory(f.s, f.actors[0], {
      missingAmounts: "planned",
    });
    expect(planned.records).toHaveLength(1);
    expect(planned.records[0].id).toBe(gift.plan().id);
    expect(
      spendingHistory(f.s, f.actors[1], { missingAmounts: "actual" }).records,
    ).toHaveLength(0);
  });
  it("creates a linked purchased reservation and derives source metadata", () => {
    const f = fixture();
    const old = reserved(f);
    command(f.s, f.actors[0], "reservations.update", {
      id: old.reservation.id,
      revision: old.reservation.revision,
      quantity: 0,
      purchased: 0,
    });
    const result = f.run(0, "purchase", {
      itemId: old.gift.id,
      itemRevision: old.gift.revision,
      title: "Ignored title",
      recipientIds: [f.s.people[1].id],
      amountCents: 0,
      date: "2026-11-02",
      quantity: 1,
    }) as { id: string };
    const payment = f.s.spendingRecords.find((r) => r.id === result.id)!;
    expect(payment).toMatchObject({
      title: "Books",
      recipientIds: [f.s.people[2].id],
      amountCents: 0,
      listId: old.gift.listId,
    });
    expect(
      f.s.reservations.find((r) => r.id === payment.reservationId),
    ).toMatchObject({ purchased: 1, quantity: 1 });
    expect(
      f.s.spendingRecords.filter((r) => r.kind === "purchase"),
    ).toHaveLength(1);
  });
  it("applies personal-occasion sharing to a newly linked gift and respects its private override", () => {
    const f = fixture();
    const c = f.connect();
    const occasion = f.run(0, "occasion", {
      name: "Birthday",
      shared: true,
    }) as { id: string };
    f.run(0, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "rules",
      rules: ["occasion:" + occasion.id],
    });
    const gift = reserved(f);
    command(f.s, f.actors[0], "reservations.update", {
      id: gift.reservation.id,
      revision: gift.reservation.revision,
      quantity: 0,
      purchased: 0,
    });
    const payload = {
      itemId: gift.gift.id,
      itemRevision: gift.gift.revision,
      title: "Books",
      recipientIds: gift.gift.recipientIds,
      amountCents: 5000,
      date: "2026-11-02",
      quantity: 1,
      occasionId: occasion.id,
    };
    const first = f.run(0, "purchase", payload) as { id: string };
    expect(
      spendingView(f.s, f.actors[1]).records.some((r) => r.id === first.id),
    ).toBe(true);
    const second = f.run(0, "purchase", { ...payload, keepPrivate: true }) as {
      id: string;
    };
    expect(
      spendingView(f.s, f.actors[1]).records.some((r) => r.id === second.id),
    ).toBe(false);
  });
  it("does not inherit a new reservation's sharing for a backdated purchase", () => {
    const f = fixture();
    const c = f.connect();
    f.run(0, "connection", {
      id: c.id,
      revision: c.revision,
      operation: "rules",
      rules: ["person:" + f.s.people[2].id],
    });
    const gift = reserved(f);
    command(f.s, f.actors[0], "reservations.update", {
      id: gift.reservation.id,
      revision: gift.reservation.revision,
      quantity: 0,
      purchased: 0,
    });
    const payment = f.run(0, "purchase", {
      itemId: gift.gift.id,
      itemRevision: gift.gift.revision,
      title: "Books",
      recipientIds: gift.gift.recipientIds,
      amountCents: 5000,
      date: "2020-11-02",
      quantity: 1,
    }) as { id: string };
    expect(
      spendingView(f.s, f.actors[1]).records.some((r) => r.id === payment.id),
    ).toBe(false);
  });
  it("keeps contribution backfills private even when current automatic sharing rules match", () => {
    const f = fixture();
    const c = f.connect();
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
    vi.stubEnv("SPENDING_ENABLED", "false");
    const result = command(f.s, f.actors[1], "contributions.create", {
      reservationId: gift.reservation.id,
      amountCents: 4000,
    }) as { id: string };
    syncContributions(f.s, [result.id]);
    vi.stubEnv("SPENDING_ENABLED", "");
    reconcileSpending(f.s, f.actors[0]);
    const entry = f.s.spendingRecords.find((r) => r.sourceId === result.id)!;
    expect(entry.sharing).toBe("private");
    expect(
      spendingView(f.s, f.actors[0]).records.some((r) => r.id === entry.id),
    ).toBe(false);
    expect(reconcileSpending(f.s, f.actors[0])).toBe(false);
  });
  it("does not duplicate a linked purchase when the same save is retried", () => {
    const f = fixture();
    const gift = reserved(f);
    command(f.s, f.actors[0], "reservations.update", {
      id: gift.reservation.id,
      revision: gift.reservation.revision,
      quantity: 0,
      purchased: 0,
    });
    const payload = {
      itemId: gift.gift.id,
      itemRevision: gift.gift.revision,
      title: "Books",
      recipientIds: gift.gift.recipientIds,
      amountCents: null,
      date: "2026-11-02",
      quantity: 1,
    };
    idempotent(
      f.s,
      f.actors[0],
      "linked_purchase_retry",
      "spending.purchase",
      payload,
    );
    expect(
      idempotent(
        f.s,
        f.actors[0],
        "linked_purchase_retry",
        "spending.purchase",
        payload,
      ),
    ).toMatchObject({ replayed: true });
    expect(f.s.reservations.reduce((total, r) => total + r.purchased, 0)).toBe(
      1,
    );
    expect(
      f.s.spendingRecords.filter((r) => r.kind === "purchase"),
    ).toHaveLength(1);
    expect(() =>
      command(f.s, f.actors[2], "spending.purchase", payload),
    ).toThrow("not available");
  });
  it("rejects existing reservations, stale items, unavailable quantities and invalid occasions before creating records", () => {
    const f = fixture();
    const gift = reserved(f);
    const payload = {
      itemId: gift.gift.id,
      itemRevision: gift.gift.revision,
      title: "Books",
      recipientIds: gift.gift.recipientIds,
      amountCents: 4200,
      date: "2026-11-02",
      quantity: 1,
    };
    expect(() => f.run(0, "purchase", payload)).toThrow("existing reservation");
    command(f.s, f.actors[0], "reservations.update", {
      id: gift.reservation.id,
      revision: gift.reservation.revision,
      quantity: 0,
      purchased: 0,
    });
    const before = structuredClone(f.s);
    expect(() => f.run(0, "purchase", { ...payload, itemRevision: 0 })).toThrow(
      "changed",
    );
    expect(() => f.run(0, "purchase", { ...payload, quantity: 3 })).toThrow(
      "reserved that quantity",
    );
    expect(() =>
      f.run(0, "purchase", { ...payload, occasionId: stamp().id }),
    ).toThrow("Occasion not available");
    expect(f.s).toEqual(before);
  });
});

describe("unique gift counts", () => {
  it("counts a partial plan, purchases, and refunds as one reserved gift", () => {
    const f = fixture(),
      gift = reserved(f, 3);
    gift.buy(4200);
    gift.buy(4500);
    const purchase = f.s.spendingRecords.find((r) => r.kind === "purchase")!;
    f.run(0, "refund", {
      id: purchase.id,
      revision: purchase.revision,
      amountCents: 1000,
      date: "2026-11-02",
    });
    const history = spendingHistory(f.s, f.actors[0], {});
    expect(history.total).toBe(4);
    expect(history.giftCount).toBe(1);
    expect(history.summary).toMatchObject({ spent: 7700, planned: 5000 });
  });

  it("counts manual refunds with their purchase across periods, without merging same-name purchases", () => {
    const f = fixture();
    f.add();
    const purchase = f.s.spendingRecords[0];
    purchase.date = "2025-12-31";
    f.run(0, "refund", {
      id: purchase.id,
      revision: purchase.revision,
      amountCents: 1000,
      date: "2026-01-01",
    });
    f.run(0, "refund", {
      id: purchase.id,
      revision: purchase.revision,
      amountCents: 500,
      date: "2026-02-01",
    });
    expect(spendingHistory(f.s, f.actors[0], {})).toMatchObject({
      total: 3,
      giftCount: 1,
    });
    expect(spendingHistory(f.s, f.actors[0], { year: 2026 })).toMatchObject({
      total: 2,
      giftCount: 1,
    });
    f.add();
    expect(spendingHistory(f.s, f.actors[0], {})).toMatchObject({
      total: 4,
      giftCount: 2,
    });
  });

  it("counts across pages and respects recipient filters and visibility", () => {
    const f = fixture();
    for (let i = 0; i < 31; i++) f.add();
    f.add(0, [f.s.people[1].id]);
    f.add(1);
    const first = spendingHistory(f.s, f.actors[0], {});
    const second = spendingHistory(f.s, f.actors[0], { page: 2 });
    expect(first.records).toHaveLength(30);
    expect(second.records).toHaveLength(2);
    expect(first).toMatchObject({ total: 32, giftCount: 32 });
    expect(second.giftCount).toBe(32);
    expect(
      spendingHistory(f.s, f.actors[0], { person: f.s.people[2].id }).giftCount,
    ).toBe(31);
    expect(spendingHistory(f.s, f.actors[1], {}).giftCount).toBe(1);
    expect(spendingHistory(f.s, f.actors[2], {}).giftCount).toBe(0);
  });

  it("counts shared contributions and their linked purchase once", () => {
    const f = fixture(),
      connection = f.connect();
    for (const i of [0, 1])
      f.run(i, "connection", {
        id: connection.id,
        revision: connection.revision,
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
    syncContributions(f.s, [result.id]);
    gift.buy(10000);
    const shared = spendingHistory(f.s, f.actors[0], { shared: "true" });
    expect(shared.total).toBe(2);
    expect(shared.giftCount).toBe(1);
    expect(spendingHistory(f.s, f.actors[1], {}).giftCount).toBe(1);
  });
});
