import { reservationNeedsReview } from "./privacy-review";
import type { State } from "../shared/model";
import type { SpendingRecord, SpendingConnection } from "../shared/spending";
import { controllers } from "./domain-access";

/** Source restrictions survive missing source rows; manual entries remain independent. */
export function protectedSpending(
  s: State,
  r: SpendingRecord,
  c?: SpendingConnection,
  seen = new Set<string>(),
): boolean {
  if (seen.has(r.id)) return true;
  seen.add(r.id);
  const reservation = s.reservations.find((v) => v.id === r.reservationId);
  const item = s.items.find((v) => v.id === reservation?.itemId);
  const parent = s.spendingRecords.find((v) => v.id === r.sourceId);
  return (
    !!r.protected ||
    !!reservation?.exchangeId ||
    !!(reservation && reservationNeedsReview(s, reservation)) ||
    !!(r.reservationId && (!reservation || !item)) ||
    !!(item && !item.listId && item.visibility === "private") ||
    !!(parent && protectedSpending(s, parent, c, seen)) ||
    [...r.recipientIds, ...(item?.recipientIds ?? [])].some((id) =>
      s.people.some(
        (p) =>
          p.id === id && controllers(p).some((user) => c?.users.includes(user)),
      ),
    )
  );
}

/** Run around mutations so removed sources cannot erase a restriction. */
export function reconcileSpendingPrivacy(s: State) {
  for (const r of s.spendingRecords) {
    const reservation = s.reservations.find((v) => v.id === r.reservationId);
    const item = s.items.find((v) => v.id === reservation?.itemId);
    if (item)
      r.protected =
        !!reservation?.exchangeId ||
        (!item.listId && item.visibility === "private");
    const c = s.spendingConnections.find((c) => c.id === r.connectionId);
    if (!protectedSpending(s, r, c)) continue;
    if (protectedSpending(s, r)) r.protected = true;
    if (r.sharing !== "private" || r.connectionId) {
      r.sharing = "private";
      delete r.connectionId;
      delete r.rule;
      r.privacyRevoked = true;
      r.revision++;
    }
  }
}
