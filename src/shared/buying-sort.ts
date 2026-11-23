import type { World } from "./model";
export const buyingSorts = [
  "newest",
  "oldest",
  "name-asc",
  "name-desc",
  "price-asc",
  "price-desc",
] as const;
export type BuyingSort = (typeof buyingSorts)[number];
export const buyingSortLabels: Record<BuyingSort, string> = {
  newest: "Most recent",
  oldest: "Oldest",
  "name-asc": "Alphabetical A–Z",
  "name-desc": "Alphabetical Z–A",
  "price-asc": "Price low to high",
  "price-desc": "Price high to low",
};
export function sortBuying(rows: World["buying"], sort: BuyingSort) {
  return [...rows].sort((a, b) => {
    let result = 0;
    if (sort === "newest" || sort === "oldest")
      result =
        a.createdAt.localeCompare(b.createdAt) * (sort === "newest" ? -1 : 1);
    else if (sort.startsWith("name"))
      result =
        a.titleSnapshot.localeCompare(b.titleSnapshot, "en", {
          numeric: true,
          sensitivity: "base",
        }) * (sort === "name-desc" ? -1 : 1);
    else {
      const ap = a.item?.priceCents,
        bp = b.item?.priceCents;
      result =
        ap == null
          ? bp == null
            ? 0
            : 1
          : bp == null
            ? -1
            : sort === "price-desc"
              ? (b.item?.priceMaxCents ?? bp) - (a.item?.priceMaxCents ?? ap)
              : ap - bp;
    }
    return (
      result ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id)
    );
  });
}
