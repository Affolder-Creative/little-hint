import type { Base, Item, ItemPriority, SortOrder, State } from "./model";

export const priorityLabels: Record<ItemPriority, string> = {
  "most-wanted": "Most wanted",
  "would-love": "Would love",
  "nice-to-have": "Nice to have",
};
export const sortLabels: Record<SortOrder, string> = {
  manual: "List order",
  priority: "Priority",
  "name-asc": "Name A–Z",
  "name-desc": "Name Z–A",
  "price-asc": "Price low–high",
  "price-desc": "Price high–low",
  newest: "Newest",
  oldest: "Oldest",
};
export function itemTrashed(s: State, item: Item): boolean {
  return (
    !!item.deletedAt || !!s.lists.find((l) => l.id === item.listId)?.deletedAt
  );
}
export function ordered<
  T extends Base & {
    name?: string;
    title?: string;
    priority?: ItemPriority | null;
    priceCents?: number | null;
  },
>(
  rows: readonly T[],
  sort: SortOrder = "manual",
  order: readonly string[] = [],
): T[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  const natural = (a: T, b: T) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  const manual = (a: T, b: T) =>
    (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER) || natural(a, b);
  const priorities = Object.keys(priorityLabels);
  return [...rows].sort((a, b) => {
    let result = 0;
    if (sort.startsWith("name"))
      result =
        (a.title ?? a.name ?? "").localeCompare(b.title ?? b.name ?? "", "en", {
          numeric: true,
          sensitivity: "base",
        }) * (sort === "name-desc" ? -1 : 1);
    if (sort === "newest" || sort === "oldest")
      result =
        a.createdAt.localeCompare(b.createdAt) * (sort === "newest" ? -1 : 1);
    if (sort === "priority")
      result =
        (a.priority ? priorities.indexOf(a.priority) : 3) -
        (b.priority ? priorities.indexOf(b.priority) : 3);
    if (sort.startsWith("price"))
      result =
        a.priceCents == null
          ? b.priceCents == null
            ? 0
            : 1
          : b.priceCents == null
            ? -1
            : (a.priceCents - b.priceCents) * (sort === "price-desc" ? -1 : 1);
    return result || manual(a, b);
  });
}
