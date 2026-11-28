import type { Item, Mode, State } from "../shared/model";
import { fail, touch } from "./domain-common";

/** One-time initialization preserves the promises made by the previous version. */
export function migrateListPolicies(s: State) {
  for (const list of s.lists) list.revealPolicyLocked = list.modeLocked;
  for (const event of s.groupEvents) {
    event.modeLocked = true;
    event.revealPolicyLocked = true;
  }
  reconcileListPolicies(s);
}

/** Locks are monotonic. Never infer an unlock from activity disappearing. */
export function reconcileListPolicies(s: State) {
  const activityItems = new Set([
    ...s.reservations.map((r) => r.itemId),
    ...s.contributionOffers.map((o) => o.itemId),
    ...s.comments.map((c) => c.itemId),
  ]);
  const activityLists = new Set(
    s.items
      .filter((i) => i.listId && activityItems.has(i.id))
      .map((i) => i.listId!),
  );
  for (const event of s.groupEvents) {
    const lists = s.lists.filter((l) => l.groupEventId === event.id);
    const locked =
      (event.modeLocked ?? true) ||
      lists.some((l) => l.modeLocked || activityLists.has(l.id));
    if (event.modeLocked !== locked || !event.revealPolicyLocked) {
      event.modeLocked = locked;
      event.revealPolicyLocked = true;
      touch(event);
    }
    if (locked) for (const list of lists) activityLists.add(list.id);
  }
  for (const list of s.lists) {
    const modeLocked = list.modeLocked || activityLists.has(list.id);
    const revealPolicyLocked =
      (list.revealPolicyLocked ?? list.modeLocked) ||
      modeLocked ||
      !!list.groupEventId ||
      list.groupIds.length > 0 ||
      (list.ownerIds.length === 1 &&
        list.pendingOwnerIds.length === 0 &&
        s.coManagement.some(
          (g) => g.personId === list.ownerIds[0] && g.status === "active",
        ));
    if (
      list.modeLocked !== modeLocked ||
      list.revealPolicyLocked !== revealPolicyLocked
    ) {
      list.modeLocked = modeLocked;
      list.revealPolicyLocked = revealPolicyLocked;
      touch(list);
    }
  }
}

export function checkReviewedListMode(
  s: State,
  item: Item,
  expected: Mode | undefined,
) {
  if (!item.listId) return;
  const list = s.lists.find((l) => l.id === item.listId);
  if (!list || expected !== list.mode)
    fail(
      409,
      "Gifting settings changed. Review who can see your plan before continuing.",
    );
}
