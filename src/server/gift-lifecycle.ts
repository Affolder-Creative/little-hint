import type {
  Actor,
  GiftSourceState,
  Reservation,
  State,
} from "../shared/model";
import { itemTrashed } from "../shared/organization";
import { archived, itemVisible, selfRecipient, canShop } from "./domain-access";
import { emitActivity } from "./activity";
import { fail } from "./domain-common";

export function sourceState(s: State, r: Reservation): GiftSourceState {
  const item = s.items.find((i) => i.id === r.itemId);
  if (!item) return r.sourceState === "removed" ? "removed" : "unavailable";
  if (itemTrashed(s, item)) return "removed";
  if (!itemVisible(s, { id: r.buyerId, name: "", email: "" }, item))
    return "unavailable";
  return archived(s, item) ? "archived" : "active";
}
export function lifecycleBaseline(s: State) {
  for (const r of s.reservations) {
    const item = s.items.find((i) => i.id === r.itemId);
    if (item && itemVisible(s, { id: r.buyerId, name: "", email: "" }, item))
      r.sourceRecipientIds ??= item.recipientIds.slice();
    r.sourceState ??= sourceState(s, r);
    r.sourceVersion ??= 1;
  }
}
export function reconcileGiftLifecycle(s: State) {
  const groups = new Map<
    string,
    { userId: string; state: GiftSourceState; ids: string[] }
  >();
  for (const r of s.reservations) {
    const next = sourceState(s, r);
    if (!r.sourceState) {
      r.sourceState = next;
      r.sourceVersion = 1;
      continue;
    }
    if (next === r.sourceState) continue;
    const previous = r.sourceState;
    r.sourceState = next;
    r.sourceVersion = (r.sourceVersion ?? 1) + 1;
    r.revision++;
    if (previous === "unavailable" || next === "unavailable") continue;
    const users = new Set<string>();
    if (r.quantity || r.purchased) users.add(r.buyerId);
    for (const c of s.contributions.filter(
      (c) => c.reservationId === r.id && c.status !== "cancelled",
    ))
      users.add(c.userId);
    for (const n of s.notices.filter((n) =>
      n.lifecycle?.reservationIds.includes(r.id),
    ))
      users.add(n.userId);
    for (const userId of users) {
      const item = s.items.find((i) => i.id === r.itemId);
      const actor = { id: userId, name: "", email: "" };
      // Removing a source keeps history; it does not restore revoked sharing.
      const audienceState = {
        ...s,
        lists: s.lists.map((l) =>
          l.id === item?.listId ? { ...l, deletedAt: undefined } : l,
        ),
      };
      if (
        item &&
        !itemVisible(audienceState, actor, { ...item, deletedAt: undefined })
      )
        continue;
      if (
        selfRecipient(s, { id: userId, name: "", email: "" }, [
          ...(r.sourceRecipientIds ?? []),
          ...(item?.recipientIds ?? []),
        ])
      )
        continue;
      const key = userId + ":" + next;
      const entry = groups.get(key) ?? { userId, state: next, ids: [] };
      entry.ids.push(r.id);
      groups.set(key, entry);
    }
  }
  for (const g of groups.values()) {
    for (const n of s.notices)
      if (
        n.userId === g.userId &&
        n.lifecycle?.reservationIds.every((id) => g.ids.includes(id))
      ) {
        n.pushComplete = true;
        n.status = "sent";
      }
    emitActivity(s, "access", [g.userId], {
      lifecycle: { reservationIds: g.ids, state: g.state },
    });
  }
}
export function reviewSource(s: State, a: Actor, r: Reservation) {
  const state = sourceState(s, r);
  if (state !== "active" && r.sourceReviewedBy?.[a.id] !== r.sourceVersion)
    fail(409, "Review the changed wish in Buying before continuing.");
}
export function buyingDestination(
  s: State,
  n: {
    userId: string;
    lifecycle?: { reservationIds: string[] };
    contributionId?: string;
    reservationId?: string;
  },
) {
  const id = n.lifecycle?.reservationIds[0] ?? n.reservationId;
  const reservation = s.reservations.find((r) => r.id === id);
  const contributionId =
    n.contributionId ??
    (reservation?.buyerId !== n.userId
      ? s.contributions.find(
          (c) => c.reservationId === id && c.userId === n.userId,
        )?.id
      : undefined);
  return contributionId
    ? `/buying?contribution=${contributionId}`
    : `/buying?reservation=${id ?? ""}`;
}

/** Reads must expose the same version a scheduled transition will persist. */
export function sourceView(s: State, r: Reservation, a: Actor) {
  const state = sourceState(s, r);
  const version =
    (r.sourceVersion ?? 1) + (r.sourceState && r.sourceState !== state ? 1 : 0);
  const item = s.items.find((i) => i.id === r.itemId);
  const requiresReview =
    state !== "active" && r.sourceReviewedBy?.[a.id] !== version;
  return {
    ...r,
    planActions: {
      canRecordPurchase:
        r.buyerId === a.id && !!item && canShop(s, a, item) && !requiresReview,
      canRelease: r.buyerId === a.id && r.quantity > r.purchased,
      requiresReview,
    },
    sourceState: state,
    sourceVersion: version,
    sourceReviewedBy: r.sourceReviewedBy?.[a.id]
      ? { [a.id]: r.sourceReviewedBy[a.id] }
      : {},
  };
}
