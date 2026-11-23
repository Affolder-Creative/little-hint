import { isPriceRange } from "./price";
import type { Item, ShoppingOffer } from "./model";

export const PRICE_FRESH_MS = 48 * 3600000;
export function shopLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Shop";
  }
}
export function shoppingOffers(
  item: Pick<
    Item,
    "id" | "url" | "priceCents" | "pricing" | "shoppingOffers" | "priceMaxCents"
  >,
): ShoppingOffer[] {
  if (item.shoppingOffers) return item.shoppingOffers;
  return item.url
    ? [
        {
          id: `${item.id}:primary`,
          url: item.url,
          label: shopLabel(item.url),
          priceCents: isPriceRange(item) ? null : item.priceCents,
          pricing: isPriceRange(item) ? undefined : item.pricing,
        },
      ]
    : [];
}
export function freshOffer(offer: ShoppingOffer, now = Date.now()) {
  const checked = Date.parse(offer.pricing?.checkedAt ?? "");
  return (
    offer.priceCents !== null &&
    offer.pricing?.status === "verified" &&
    Number.isFinite(checked) &&
    now >= checked &&
    now - checked < PRICE_FRESH_MS
  );
}
export function bestShoppingOffer(
  item: Parameters<typeof shoppingOffers>[0] & { primaryOfferId?: string },
  now = Date.now(),
) {
  return shoppingOffers(item)
    .filter((o) => freshOffer(o, now))
    .sort(
      (a, b) =>
        a.priceCents! - b.priceCents! ||
        Number(b.id === item.primaryOfferId) -
          Number(a.id === item.primaryOfferId),
    )[0];
}
export function shoppingUrl(
  item: Parameters<typeof bestShoppingOffer>[0],
  now = Date.now(),
) {
  return bestShoppingOffer(item, now)?.url ?? item.url;
}

/** Saved prices remain useful estimates when no recently checked offer exists. */
export function automaticPriceOffer(
  item: Parameters<typeof bestShoppingOffer>[0],
  now = Date.now(),
) {
  return (
    bestShoppingOffer(item, now) ??
    shoppingOffers(item)
      .filter((o) => o.priceCents !== null)
      .sort(
        (a, b) =>
          a.priceCents! - b.priceCents! ||
          Number(b.id === item.primaryOfferId) -
            Number(a.id === item.primaryOfferId),
      )[0]
  );
}
export function inferredPriceSource(
  item: Parameters<typeof bestShoppingOffer>[0] & {
    priceSource?: "shops" | "custom";
  },
): "shops" | "custom" {
  if (item.priceSource) return item.priceSource;
  return !isPriceRange(item) &&
    item.priceCents !== null &&
    automaticPriceOffer(item)?.priceCents === item.priceCents
    ? "shops"
    : "custom";
}
