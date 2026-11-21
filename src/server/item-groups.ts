import type { Item, State } from "../shared/model";
import { touch } from "./domain-common";

export function groupProducts(s: State, parent: Item): Item[] {
  return s.items
    .filter((i) => i.parentItemId === parent.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** Audience and draft authority belong to the container, never to its products. */
export function inheritGroupContext(parent: Item, child: Item) {
  child.listId = parent.listId;
  child.recipientIds = [...parent.recipientIds];
  child.visibility = parent.visibility;
  child.groupIds = [...parent.groupIds];
  child.excludedUserIds = parent.excludedUserIds
    ? [...parent.excludedUserIds]
    : undefined;
  child.friendEntryId = parent.friendEntryId;
  child.publicationState = parent.publicationState;
  child.draftOwnerId = parent.draftOwnerId;
  child.spendingListId = parent.spendingListId;
  child.spendingAllocations = parent.spendingAllocations;
}

export function reconcileItemGroups(s: State) {
  for (const child of s.items) {
    if (!child.parentItemId) continue;
    const parent = s.items.find(
      (i) => i.id === child.parentItemId && i.kind === "group",
    );
    if (!parent) continue;
    const before = JSON.stringify(child);
    inheritGroupContext(parent, child);
    if (JSON.stringify(child) !== before) touch(child);
  }
}
