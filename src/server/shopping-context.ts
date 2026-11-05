import type { Actor, Item, State } from "../shared/model";
import { controls, groupAccess, mode } from "./domain-access";
import { fail } from "./domain-common";
export type ShoppingContext = {
  exchangeId?: string;
  giverId?: string;
  exchangeRecipientId?: string;
  ordinary?: boolean;
};
export function shoppingAssignments(s: State, a: Actor, item: Item) {
  return s.exchanges.flatMap((e) =>
    !e.archived &&
    !e.deletedAt &&
    e.status === "drawn" &&
    groupAccess(s, a, e.groupId)
      ? e.assignments
          .filter(
            ([g, r]) => controls(s, a, g) && item.recipientIds.includes(r),
          )
          .map(([g, r]) => ({
            exchangeId: e.id,
            giverId: g,
            exchangeRecipientId: r,
          }))
      : [],
  );
}
export function resolveShoppingContext(
  s: State,
  a: Actor,
  item: Item,
  p: ShoppingContext,
) {
  const choices = shoppingAssignments(s, a, item);
  if (p.exchangeId) {
    const matches = choices.filter(
      (c) =>
        c.exchangeId === p.exchangeId &&
        c.giverId === p.giverId &&
        (!p.exchangeRecipientId ||
          c.exchangeRecipientId === p.exchangeRecipientId),
    );
    if (p.ordinary || mode(s, item) !== "surprise" || matches.length !== 1)
      fail(
        409,
        "This exchange choice is unavailable. Choose who this gift is for again in Buying for.",
      );
    return matches[0];
  }
  if (p.giverId || p.exchangeRecipientId || (choices.length && !p.ordinary))
    fail(
      409,
      "Choose an exchange assignment or Not part of an exchange before continuing.",
    );
  return undefined;
}
