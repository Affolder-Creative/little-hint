import type { GiftView, Item, SortOrder } from "./model";
import { ideaAllocationChoices } from "./spending";
import { ordered } from "./organization";

/** Call after audience authorization; creator-only defaults identify private associations. */
export function ideaAssignedToList(
  item: Pick<
    Item,
    "listId" | "recipientIds" | "spendingListId" | "spendingAllocations"
  >,
  listId: string,
) {
  return (
    !item.listId &&
    ideaAllocationChoices(item).some(
      (a) => a.listId === listId && item.recipientIds.includes(a.recipientId),
    )
  );
}

export function orderedListGifts<T extends Item | GiftView>(
  items: T[],
  sort: SortOrder,
  order: string[] = [],
): T[] {
  return sort === "manual"
    ? [
        ...ordered(
          items.filter((i) => !!i.listId),
          "manual",
          order,
        ),
        ...ordered(
          items.filter((i) => !i.listId),
          "newest",
        ),
      ]
    : ordered(items, sort, order);
}
