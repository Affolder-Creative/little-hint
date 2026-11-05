import type { Comment, Item, Reservation, State } from "../shared/model";
import { controllers } from "./domain-access";

/** A review candidate is not proof that the author intended an exchange. */
export function possibleLegacyExchange(s: State, userId: string, item: Item) {
  return s.exchanges.some((e) =>
    e.assignments.some(
      ([g, r]) =>
        item.recipientIds.includes(r) &&
        (s.people.some((p) => p.id === g && controllers(p).includes(userId)) ||
          s.reservations.some(
            (v) =>
              v.buyerId === userId && v.giverId === g && v.exchangeId === e.id,
          )),
    ),
  );
}
export function reservationNeedsReview(s: State, r: Reservation) {
  const item = s.items.find((i) => i.id === r.itemId);
  return (
    !!r.privacyReview ||
    (r.ordinary !== true &&
      !r.exchangeId &&
      !!item &&
      possibleLegacyExchange(s, r.buyerId, item))
  );
}
export function noteNeedsReview(s: State, c: Comment) {
  const item = s.items.find((i) => i.id === c.itemId);
  return (
    !!c.privacyReview ||
    (!c.authorOnly &&
      c.ordinary !== true &&
      !c.giverId &&
      !!item &&
      possibleLegacyExchange(s, c.authorId, item))
  );
}
export function privacyPreflight(s: State) {
  return {
    reservationsNeedingOwnerReview: s.reservations.filter((r) =>
      reservationNeedsReview(s, r),
    ).length,
    notesNeedingAuthorReview: s.comments.filter((c) => noteNeedsReview(s, c))
      .length,
    sourceLinkedSpendingWithoutItem: s.spendingRecords.filter(
      (r) =>
        r.reservationId &&
        !s.items.some((i) =>
          s.reservations.some(
            (v) => v.id === r.reservationId && v.itemId === i.id,
          ),
        ),
    ).length,
  };
}

export function reconcilePrivacyReview(s: State) {
  for (const r of s.reservations)
    if (reservationNeedsReview(s, r)) r.privacyReview = true;
  for (const c of s.comments) if (noteNeedsReview(s, c)) c.privacyReview = true;
}
