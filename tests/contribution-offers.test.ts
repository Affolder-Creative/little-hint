import { closurePlan } from "../src/server/account-closure-domain";
import { accountExport } from "../src/server/account-export";
import { takeOverProfile } from "../src/server/profile-takeover";
import { describe, expect, it } from "vitest";
import { fixture, connect } from "./privacy-fixture";
import { command, giftView, idempotent } from "../src/server/domain";
import type { ContributionOffer } from "../src/shared/model";
import {
  spendingView,
  syncContributions,
  syncSpending,
} from "../src/server/spending";
import { spendingTotals } from "../src/shared/spending";
import { contributionOfferHistory } from "../src/server/buying-history";
import { activityAllowed } from "../src/server/activity";
import { accountCsv } from "../src/server/account-csv";
function setup() {
  const f = fixture();
  const [owner, buyer, donor, other] = f.actors;
  const offer = (amountCents = 2500, actor = donor) =>
    command(f.state, actor, "contribution-offers.create", {
      itemId: f.item.id,
      amountCents,
    }) as ContributionOffer;
  const reserve = (
    offers: ContributionOffer[] = [],
    actor = buyer,
    target = 7500,
  ) => {
    const result = command(f.state, actor, "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
      poolTotalCents: target,
      poolOwnContributionCents: 0,
      acceptedOffers: offers.map((o) => ({ id: o.id, revision: o.revision })),
    }) as { id: string };
    return f.state.reservations.find((r) => r.id === result.id)!;
  };
  return { ...f, owner, buyer, donor, other, offer, reserve };
}
describe("contribution offers", () => {
  it("preserves surprise data and quantity while recording an editable offer", () => {
    const f = setup(),
      s = f.state;
    const before = giftView(s, f.owner, f.item);
    const o = f.offer();
    expect(giftView(s, f.owner, f.item)).toEqual(before);
    expect(giftView(s, f.buyer, f.item).available).toBe(4);
    expect(
      giftView(s, f.buyer, f.item).contributionOffers?.[0].amountCents,
    ).toBe(2500);
    expect(s.notices.filter((n) => n.userId === f.owner.id)).toHaveLength(0);
    expect(() => f.offer()).toThrow(/already/);
    expect(() => f.offer(100, f.owner)).toThrow();
    expect(() =>
      command(s, f.other, "contribution-offers.update", {
        id: o.id,
        revision: o.revision,
        amountCents: 10,
      }),
    ).toThrow();
    command(s, f.donor, "contribution-offers.update", {
      id: o.id,
      revision: o.revision,
      amountCents: 3000,
    });
    expect(o.amountCents).toBe(3000);
    expect(contributionOfferHistory(s, f.donor, {}).rows).toHaveLength(1);
    expect(contributionOfferHistory(s, f.other, {}).rows).toHaveLength(0);
    expect(accountCsv(s, f.donor, "buying").content).toContain(
      "Contribution offer",
    );
  });
  it("accepts once, retains a single planning record, then follows payment states", () => {
    const f = setup(),
      s = f.state;
    command(s, f.donor, "spending.settings", {
      enabled: true,
      summaries: true,
    });
    const o = f.offer();
    syncContributions(s);
    const pending = spendingView(s, f.donor).records.find(
      (r) => r.sourceId === o.id,
    )!;
    expect(pending.canEdit).toBe(false);
    expect(pending.canShare).toBe(false);
    expect(spendingTotals([pending]).planned).toBe(2500);
    const r = f.reserve([o]);
    syncContributions(s);
    expect(o.status).toBe("accepted");
    const rows = spendingView(s, f.donor).records;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(pending.id);
    expect(rows[0].sourceId).toBe(o.contributionId);
    expect(spendingTotals(rows).planned).toBe(2500);
    expect(() => f.reserve([o], f.other)).toThrow();
    expect(s.contributions).toHaveLength(1);
    const c = s.contributions[0];
    command(s, f.donor, "contributions.update", {
      id: c.id,
      revision: c.revision,
      status: "sent",
    });
    command(s, f.buyer, "contributions.update", {
      id: c.id,
      revision: c.revision,
      status: "received",
    });
    syncContributions(s);
    expect(spendingTotals(spendingView(s, f.donor).records).spent).toBe(2500);
    expect(
      s.notices.some(
        (n) =>
          n.userId === f.donor.id &&
          n.action === "offer-accepted" &&
          activityAllowed(s, n),
      ),
    ).toBe(true);
    expect(contributionOfferHistory(s, f.donor, {}).rows).toHaveLength(0);
    expect(r.poolTargetCents).toBe(7500);
  });
  it("rejects stale edits and overfunding before reserving anything", () => {
    const f = setup(),
      s = f.state,
      o = f.offer();
    const stale = { ...o };
    command(s, f.donor, "contribution-offers.update", {
      id: o.id,
      revision: o.revision,
      amountCents: 4000,
    });
    expect(() => f.reserve([stale])).toThrow();
    expect(() => f.reserve([o], f.buyer, 3000)).toThrow(/exceed/);
    expect(s.reservations).toHaveLength(0);
    expect(s.contributions).toHaveLength(0);
    expect(o.status).toBe("open");
  });
  it("lets an existing buyer accept later and closes a buyer's own offer", () => {
    const f = setup(),
      s = f.state,
      own = f.offer(1000, f.buyer),
      r = f.reserve();
    expect(own.status).toBe("cancelled");
    expect(() => f.offer(1000, f.buyer)).toThrow(/already buying/);
    const o = f.offer();
    command(s, f.buyer, "reservations.update", {
      id: r.id,
      revision: r.revision,
      quantity: r.quantity,
      purchased: 1,
      acceptedOffers: [{ id: o.id, revision: o.revision }],
    });
    expect(o.status).toBe("accepted");
    expect(r.purchased).toBe(1);
  });
  it("cancels on archive or access loss without resurrecting offers", () => {
    const f = setup(),
      s = f.state,
      o = f.offer();
    command(s, f.owner, "items.update", { ...f.item, archived: true });
    expect(o.status).toBe("cancelled");
    command(s, f.owner, "items.update", { ...f.item, archived: false });
    expect(o.status).toBe("cancelled");
    const next = f.offer();
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.donor.id);
    syncContributions(s);
    expect(next.status).toBe("cancelled");
  });
  it("keeps pending plans private and rebuilds them after enabling tracking", () => {
    const f = setup(),
      s = f.state,
      o = f.offer();
    syncContributions(s);
    expect(s.spendingRecords).toHaveLength(0);
    connect(f, 2, 3, s.people[0].id);
    syncContributions(s);
    const record = spendingView(s, f.donor).records.find(
      (r) => r.sourceId === o.id,
    )!;
    expect(record.amountCents).toBe(2500);
    expect(
      spendingView(s, f.other).records.some((r) => r.sourceId === o.id),
    ).toBe(false);
    for (const action of ["spending.record", "spending.share", "spending.void"])
      expect(() =>
        command(s, f.donor, action, {
          id: record.id,
          revision: record.revision,
          shared: true,
        }),
      ).toThrow(/Buying/);
    command(s, f.donor, "contribution-offers.update", {
      id: o.id,
      revision: o.revision,
      status: "cancelled",
    });
    syncContributions(s);
    expect(spendingTotals(spendingView(s, f.donor).records).planned).toBe(0);
  });
  it("uses safe offer snapshots when acceptance predates spending activation", () => {
    const f = setup(),
      s = f.state,
      o = f.offer(),
      r = f.reserve([o]);
    command(s, f.donor, "spending.settings", {
      enabled: true,
      summaries: true,
    });
    syncContributions(s);
    const record = spendingView(s, f.donor).records.find(
      (v) => v.sourceId === o.contributionId,
    )!;
    expect(record.listId).toBe(f.item.listId);
    expect(record.reservationId).toBe(r.id);
    expect(record.contributionOfferId).toBeUndefined();
  });
  it("makes offer creation retry-safe", () => {
    const f = setup(),
      s = f.state,
      p = { itemId: f.item.id, amountCents: 1000 };
    idempotent(
      s,
      f.donor,
      "offer-creation-idempotent",
      "contribution-offers.create",
      p,
    );
    idempotent(
      s,
      f.donor,
      "offer-creation-idempotent",
      "contribution-offers.create",
      p,
    );
    expect(s.contributionOffers).toHaveLength(1);
  });
  it("tracks offers in closure review and exports without exposing another donor", () => {
    const f = setup(),
      s = f.state,
      o = f.offer();
    expect(
      closurePlan(s, f.donor).blockers.some((b) => b.kind === "commitments"),
    ).toBe(true);
    expect(accountExport(s, f.donor).contributionOffers).toHaveLength(1);
    expect(accountExport(s, f.other).contributionOffers).toHaveLength(0);
    command(s, f.donor, "contribution-offers.update", {
      id: o.id,
      revision: o.revision,
      status: "cancelled",
    });
    expect(
      closurePlan(s, f.donor).blockers.some((b) => b.kind === "commitments"),
    ).toBe(false);
  });
  it("keeps a contributor from taking over the intended recipient profile", () => {
    const f = setup(),
      s = f.state;
    f.offer();
    const recipient = s.people[0];
    delete recipient.userId;
    recipient.guardians = [f.owner.id];
    expect(() => takeOverProfile(s, f.donor, recipient, "account")).toThrow(
      /gift plans/,
    );
  });
  it("notifies contributors once when accepted offers fill the goal", () => {
    const f = setup(),
      s = f.state,
      o = f.offer();
    f.reserve([o], f.buyer, o.amountCents);
    expect(
      s.notices.filter((n) => n.action === "funded" && n.userId === f.donor.id),
    ).toHaveLength(1);
    expect(s.notices.some((n) => n.userId === f.owner.id)).toBe(false);
  });
});
