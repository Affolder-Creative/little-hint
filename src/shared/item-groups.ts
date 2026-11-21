import type { GiftView } from "./model";

/** Purchasing and spending operate on products, never their browsing containers. */
export function productItems(items: readonly GiftView[]): GiftView[] {
  const products = items.flatMap((item) =>
    item.kind === "group" ? (item.products ?? []) : [item],
  );
  return [...new Map(products.map((item) => [item.id, item])).values()];
}
