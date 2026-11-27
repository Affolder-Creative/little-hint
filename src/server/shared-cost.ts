import { createHash } from "node:crypto";
import type { Reservation, State } from "../shared/model";
import { archived, itemVisible } from "./domain-access";
import { spendingAvailable } from "./deployment";

/** Only the buyer's own ledger can become a shared gift total. */
export function recordedGiftCost(s: State, r: Reservation) {
  const records = s.spendingRecords.filter(
    (p) => p.reservationId === r.id && p.ownerId === r.buyerId && !p.voided,
  );
  const purchases = records.filter((p) => p.kind === "purchase");
  const refunds = records.filter(
    (p) =>
      p.kind === "refund" &&
      purchases.some((v) => v.id === p.sourceId) &&
      !p.contributionReturnId,
  );
  const item = s.items.find((i) => i.id === r.itemId);
  const allowed =
    spendingAvailable() &&
    s.spendingSettings.some((v) => v.userId === r.buyerId && v.enabled) &&
    !r.exchangeId &&
    !!item &&
    !archived(s, item) &&
    itemVisible(s, { id: r.buyerId, name: "", email: "" }, item);
  const complete =
    allowed &&
    r.quantity > 0 &&
    r.purchased === r.quantity &&
    purchases.reduce((n, p) => n + p.quantity, 0) === r.quantity &&
    [...purchases, ...refunds].every((p) => p.amountCents !== null);
  const totalCents = complete
    ? purchases.reduce((n, p) => n + p.amountCents!, 0) -
      refunds.reduce((n, p) => n + p.amountCents!, 0)
    : undefined;
  return {
    totalCents,
    token: createHash("sha256")
      .update(
        JSON.stringify([
          r.id,
          r.quantity,
          r.purchased,
          allowed,
          [...purchases, ...refunds]
            .map((p) => [p.id, p.revision, p.amountCents, p.quantity])
            .sort(),
        ]),
      )
      .digest("hex"),
    status:
      totalCents === undefined
        ? ("incomplete" as const)
        : totalCents < 0 ||
            totalCents > 100000000 ||
            r.poolCostReview ||
            totalCents < (r.poolTargetCents ?? 0)
          ? ("review" as const)
          : ("ready" as const),
  };
}

/** Called once after the outer synchronous command, never while a compound save is incomplete. */
export function reconcileSharedCosts(s: State) {
  for (const r of s.reservations) {
    if (r.poolCostSource !== "recorded-spending") continue;
    const cost = recordedGiftCost(s, r);
    if (cost.status === "review") {
      if (!r.poolCostReview) {
        r.poolCostReview = true;
        r.revision++;
      }
      continue;
    }
    if (cost.status !== "ready") continue;
    const own = cost.totalCents! - (r.poolTargetCents ?? 0);
    if (
      r.poolTotalCents !== cost.totalCents ||
      r.poolOwnContributionCents !== own
    ) {
      r.poolTotalCents = cost.totalCents;
      r.poolOwnContributionCents = own;
      r.revision++;
    }
  }
}
