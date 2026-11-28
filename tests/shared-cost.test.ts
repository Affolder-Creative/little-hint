import { commandWithAudience as command } from "./discussion-command";
import { describe, expect, it } from "vitest";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { stamp, world } from "../src/server/domain";
import { recordedGiftCost } from "../src/server/shared-cost";
import { syncSpending } from "../src/server/spending";

function fixture() {
  const { state: s, actors } = stagingFixtures();
  const a = actors[0];
  command(s, a, "spending.settings", { enabled: true, summaries: true });
  const gift = world(s, a).items.find(
    (i) => !i.isRecipient && !i.archived && i.available! > 0 && i.canShop,
  )!;
  command(s, a, "reservations.create", {
    itemId: gift.id,
    quantity: 1,
    ordinary: true,
  });
  const r = s.reservations.at(-1)!;
  command(s, a, "reservations.update", {
    id: r.id,
    revision: r.revision,
    quantity: 1,
    purchased: 1,
  });
  syncSpending(s, a);
  const p = s.spendingRecords.find(
    (p) => p.reservationId === r.id && p.kind === "purchase",
  )!;
  p.amountCents = 10699;
  const save = (extra = {}) =>
    command(s, a, "reservations.update", {
      id: r.id,
      revision: r.revision,
      quantity: 1,
      purchased: 1,
      poolTotalCents: 10699,
      poolOwnContributionCents: 6699,
      poolCostSource: "recorded-spending",
      costToken: recordedGiftCost(s, r).token,
      ...extra,
    });
  const edit = (amountCents: number | null) =>
    command(s, a, "spending.record", {
      id: p.id,
      revision: p.revision,
      amountCents,
      date: p.date,
      planningYear: p.planningYear,
      splits: p.splits,
    });
  return { s, a, r, p, save, edit, actors };
}
describe("recorded shared gift costs", () => {
  it("updates the buyer share after a corrected purchase, preserving the outside goal", () => {
    const f = fixture();
    f.save();
    f.edit(11699);
    expect(f.r.poolTotalCents).toBe(11699);
    expect(f.r.poolOwnContributionCents).toBe(7699);
    expect(f.r.poolTargetCents).toBe(4000);
  });
  it("waits for complete amounts and resumes when complete", () => {
    const f = fixture();
    f.save();
    f.edit(null);
    expect(recordedGiftCost(f.s, f.r).status).toBe("incomplete");
    expect(f.r.poolTotalCents).toBe(10699);
    f.edit(12000);
    expect(f.r.poolTotalCents).toBe(12000);
  });
  it("subtracts shop refunds and pauses rather than creating a negative buyer share", () => {
    const f = fixture();
    f.save();
    command(f.s, f.a, "spending.refund", {
      id: f.p.id,
      revision: f.p.revision,
      amountCents: 8000,
      date: "2026-11-27",
    });
    expect(recordedGiftCost(f.s, f.r).totalCents).toBe(2699);
    expect(f.r.poolCostReview).toBe(true);
    expect(f.r.poolOwnContributionCents).toBe(6699);
    f.save({ poolTotalCents: 2699, poolOwnContributionCents: 0 });
    expect(f.r.poolCostReview).toBe(false);
  });
  it("keeps manual overrides manual and rejects stale source previews", () => {
    const f = fixture();
    const token = recordedGiftCost(f.s, f.r).token;
    f.edit(11000);
    expect(() => f.save({ costToken: token })).toThrow(/changed/);
    f.save({ poolCostSource: "manual" });
    f.edit(15000);
    expect(f.r.poolTotalCents).toBe(10699);
  });
  it("does not expose private cost previews to another shopper", () => {
    const f = fixture();
    f.save();
    expect(JSON.stringify(world(f.s, f.actors[1]).items)).not.toContain(
      recordedGiftCost(f.s, f.r).token,
    );
  });
  it("excludes partner purchases and unknown refunds, and accepts a known zero", () => {
    const f = fixture();
    f.p.ownerId = f.actors[1].id;
    expect(recordedGiftCost(f.s, f.r).status).toBe("incomplete");
    f.p.ownerId = f.a.id;
    f.p.amountCents = 0;
    f.save({ poolTotalCents: 0, poolOwnContributionCents: 0 });
    expect(f.r.poolTotalCents).toBe(0);
    f.s.spendingRecords.push({
      ...f.p,
      ...stamp(),
      kind: "refund",
      sourceId: f.p.id,
      quantity: 0,
      amountCents: null,
    });
    expect(recordedGiftCost(f.s, f.r).status).toBe("incomplete");
  });
  it("reconciles only the completed compound save, without a transient refund conflict", () => {
    const f = fixture();
    f.r.quantity = 2;
    f.r.purchased = 2;
    const second = { ...f.p, ...stamp(), amountCents: 5000 };
    f.s.spendingRecords.push(second);
    f.save({
      quantity: 2,
      purchased: 2,
      poolTotalCents: 15699,
      poolOwnContributionCents: 1699,
    });
    command(f.s, f.a, "spending.update-purchase", {
      reservationId: f.r.id,
      reservationRevision: f.r.revision,
      purchased: 2,
      records: [
        {
          id: f.p.id,
          revision: f.p.revision,
          date: f.p.date,
          planningYear: f.p.planningYear,
          splits: f.p.splits,
          amountCents: 5000,
        },
        {
          id: second.id,
          revision: second.revision,
          date: second.date,
          planningYear: second.planningYear,
          splits: second.splits,
          amountCents: 10000,
        },
      ],
    });
    const saved = f.s.reservations.find((r) => r.id === f.r.id)!;
    expect(saved.poolCostReview).toBe(false);
    expect(saved.poolTotalCents).toBe(15000);
    expect(saved.poolOwnContributionCents).toBe(1000);
    expect(saved.poolTargetCents).toBe(14000);
  });
});
