import { isPriceRange } from "../shared/price";
import { fail } from "./domain-common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Item, ShoppingOffer } from "../shared/model";
import { shopLabel, shoppingOffers } from "../shared/shopping-offers";
import { productCacheUrl } from "../shared/product-url";

export const shoppingOfferInput = z.object({
  id: z.string().min(1).max(128),
  url: z
    .string()
    .max(2048)
    .url()
    .refine((value) => {
      const u = new URL(value);
      return (
        ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
      );
    }, "Use an HTTP or HTTPS shop link without credentials."),
  label: z.string().trim().max(100).default(""),
  note: z.string().trim().max(500).optional(),
  priceCents: z.number().int().min(0).max(100000000).nullable().default(null),
});

/** Called once by migration; legacy price history and subscriptions stay attached. */
export function migrateShoppingOffers(item: Item) {
  if (item.shoppingOffers) return;
  const offers = shoppingOffers(item).map((o) => ({
    ...o,
    pricing: o.pricing ? { ...o.pricing } : undefined,
  }));
  for (const legacy of item.purchaseOffers ?? []) {
    if (
      offers.some(
        (o) =>
          (productCacheUrl(o.url) ?? o.url) ===
          (productCacheUrl(legacy.url) ?? legacy.url),
      )
    )
      continue;
    offers.push({
      id: randomUUID(),
      url: legacy.url,
      label: legacy.retailer,
      priceCents: legacy.priceCents,
      pricing: {
        baseline: legacy.priceCents,
        baselineLabel: "when tracking started",
        generation: randomUUID(),
        checkedAt: legacy.checkedAt,
        status: "verified",
      },
    });
  }
  item.shoppingOffers = offers;
  item.primaryOfferId = offers.find((o) => o.url === item.url)?.id;
  if (offers.length > 1 && item.pricing) item.pricing.generation = randomUUID();
  delete item.purchaseOffers;
}

/** Input pricing is never trusted. Preserve checked data only for the same saved link. */
export function reconcileShoppingOffers(item: Item, previous?: Item) {
  const rangeTransition =
    isPriceRange(item) || (!!previous && isPriceRange(previous));
  if (rangeTransition) {
    item.pricing ??= {
      baseline: null,
      baselineLabel: "when tracking started",
      generation: randomUUID(),
    };
    item.pricing.paused = true;
    item.pricing.baseline = null;
    delete item.pricing.checkedAt;
    delete item.pricing.status;
  }
  const old = previous ? shoppingOffers(previous) : [];
  let offers = item.shoppingOffers;
  if (!offers) {
    if (!previous?.shoppingOffers && !rangeTransition) return;
    offers = (previous ? old : shoppingOffers(item)).map((o) => ({ ...o }));
  }
  // Older clients can still replace the primary scalar URL.
  if (
    previous &&
    item.url !== previous.url &&
    item.primaryOfferId === previous.primaryOfferId
  ) {
    offers = offers
      .map((o) =>
        o.id === item.primaryOfferId
          ? {
              ...o,
              url: item.url,
              priceCents: rangeTransition ? o.priceCents : item.priceCents,
            }
          : o,
      )
      .filter((o) => o.url);
    if (item.url && !offers.length)
      offers.push({
        id: randomUUID(),
        url: item.url,
        label: shopLabel(item.url),
        priceCents: rangeTransition ? null : item.priceCents,
      });
  }
  const ids = new Set<string>(),
    urls = new Set<string>();
  item.shoppingOffers = offers.map((raw) => {
    const input = shoppingOfferInput.parse(raw);
    const key = productCacheUrl(input.url) ?? input.url;
    if (ids.has(input.id) || urls.has(key))
      fail(400, "Each shop link must be unique.");
    ids.add(input.id);
    urls.add(key);
    const before = old.find((o) => o.id === input.id && o.url === input.url);
    const pricing = before?.pricing
      ? { ...before.pricing }
      : {
          baseline: input.priceCents,
          baselineLabel: "when link changed" as const,
          generation: randomUUID(),
        };
    if (before && before.priceCents !== input.priceCents) {
      delete pricing.checkedAt;
      delete pricing.status;
      if (item.pricing) item.pricing.paused = true;
    }
    return { ...input, label: input.label || shopLabel(input.url), pricing };
  });
  item.primaryOfferId =
    item.shoppingOffers.find((o) => o.id === item.primaryOfferId)?.id ??
    item.shoppingOffers[0]?.id;
  item.url =
    item.shoppingOffers.find((o) => o.id === item.primaryOfferId)?.url ?? "";
  const primary = item.shoppingOffers.find((o) => o.id === item.primaryOfferId);
  if (!previous && item.priceCents === null) {
    item.priceCents =
      primary?.priceCents ??
      item.shoppingOffers.find((o) => o.priceCents !== null)?.priceCents ??
      null;
    if (item.pricing) item.pricing.baseline = item.priceCents;
  }
  if (
    previous &&
    !rangeTransition &&
    previous.url === item.url &&
    previous.priceCents !== item.priceCents
  ) {
    // Scalar edits from existing clients still correct the primary shop price.
    // The aggregate stays manual until its editor explicitly resumes checks.
    item.pricing ??= {
      baseline: previous.priceCents,
      baselineLabel: "when tracking started",
      generation: randomUUID(),
    };
    item.pricing.paused = true;
    delete item.pricing.checkedAt;
    if (primary) {
      primary.priceCents = item.priceCents;
      if (primary.pricing) {
        delete primary.pricing.checkedAt;
        delete primary.pricing.status;
      }
    }
  } else if (
    !previous &&
    !rangeTransition &&
    primary &&
    primary.priceCents === null &&
    item.priceCents !== null
  ) {
    primary.priceCents = item.priceCents;
    if (primary.pricing) primary.pricing.baseline = item.priceCents;
  }
  const membership = (values: ShoppingOffer[]) =>
    values
      .map((o) => `${o.id}:${o.url}`)
      .sort()
      .join("\n");
  if (
    previous &&
    membership(old) !== membership(item.shoppingOffers) &&
    item.pricing
  ) {
    item.pricing.generation = randomUUID();
    item.pricing.baseline = item.priceCents;
    item.pricing.baselineLabel = "when link changed";
    delete item.pricing.completedDay;
  }
}
