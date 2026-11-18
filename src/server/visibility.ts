import type { Actor, Item, State } from "../shared/model";
import { listVisible } from "./domain-access";

/** Wishes inherit list access; their stored idea visibility is irrelevant. */
export function visibilityScope(
  s: State,
  a: Actor,
  item: Item,
): "only-me" | "shared" {
  if (!item.listId) return item.visibility === "private" ? "only-me" : "shared";
  const list = s.lists.find((l) => l.id === item.listId);
  return list &&
    s.people.some(
      (p) =>
        p.userId &&
        p.userId !== a.id &&
        !p.mergedIntoId &&
        listVisible(s, { id: p.userId, name: p.name, email: "" }, list),
    )
    ? "shared"
    : "only-me";
}
