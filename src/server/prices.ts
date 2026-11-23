import { isPriceRange } from "../shared/price";
import { shoppingOffers, bestShoppingOffer } from "../shared/shopping-offers";
import { itemTrashed } from "../shared/organization";
import { canEdit, archived } from "./domain-access";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { State, Item, Actor } from "../shared/model";
import { stamp, itemVisible, fail } from "./domain";
import { priceConfig, priceDay } from "./price-config";
import { productCacheUrl } from "../shared/product-url";
export function priceBaseline(
  i: Item,
  label: NonNullable<Item["pricing"]>["baselineLabel"],
) {
  i.pricing = {
    baseline: isPriceRange(i) ? null : i.priceCents,
    ...(isPriceRange(i) ? { paused: true } : {}),
    baselineLabel: label,
    generation: randomUUID(),
  };
}
export function priceEligible(s: State, i: Item) {
  return (
    i.priceSource !== "custom" &&
    i.kind !== "group" &&
    i.publicationState !== "draft" &&
    i.priceCents !== null &&
    !isPriceRange(i) &&
    shoppingOffers(i).length > 0 &&
    !itemTrashed(s, i) &&
    (!i.listId || s.lists.some((l) => l.id === i.listId)) &&
    !archived(s, i) &&
    !i.pricing?.paused
  );
}
export function priceAlertAllowed(s: State, userId: string, itemId: string) {
  const i = s.items.find((i) => i.id === itemId);
  return (
    priceConfig().enabled &&
    !!i &&
    priceEligible(s, i) &&
    itemVisible(s, { id: userId, name: "", email: "" }, i) &&
    s.priceWatches.some(
      (w) =>
        w.userId === userId &&
        w.itemId === itemId &&
        w.generation === i.pricing?.generation,
    )
  );
}
export function meaningfulDrop(reference: number | null, price: number) {
  return (
    reference !== null &&
    reference > 0 &&
    reference - price >= Math.max(100, Math.ceil(reference * 0.05))
  );
}
export function priceCommand(s: State, a: Actor, action: string, raw: unknown) {
  const p = z.object({ id: z.string(), enabled: z.boolean() }).parse(raw);
  const i = s.items.find((i) => i.id === p.id && itemVisible(s, a, i));
  if (!i || i.deletedAt) fail(404, "Item not found.");
  const item = i!;
  if (!item.pricing) priceBaseline(item, "when tracking started");
  if (action === "prices.watch") {
    s.priceWatches = s.priceWatches.filter(
      (w) => w.userId !== a.id || w.itemId !== p.id,
    );
    if (p.enabled) {
      if (!priceEligible(s, item) || !priceConfig().enabled)
        fail(400, "Price tracking is unavailable for this item.");
      const fresh = item.shoppingOffers
        ? !!bestShoppingOffer(item)
        : item.pricing!.checkedAt &&
          Date.now() - Date.parse(item.pricing!.checkedAt) < 48 * 3600000;
      s.priceWatches.push({
        ...stamp(),
        userId: a.id,
        itemId: p.id,
        generation: item.pricing!.generation,
        reference: fresh
          ? item.shoppingOffers
            ? bestShoppingOffer(item)!.priceCents
            : item.priceCents
          : null,
      });
    }
  } else if (action === "prices.tracking") {
    if (!canEdit(s, a, item)) fail(403, "You cannot edit this item.");
    if (p.enabled && item.priceSource === "custom")
      fail(
        400,
        "Choose Use shop prices in the editor before resuming price checks.",
      );
    if (p.enabled && isPriceRange(item))
      fail(400, "Enter an exact price before resuming price checks.");
    if (p.enabled && (item.priceCents === null || !item.url))
      fail(400, "Add a price and product link before resuming price checks.");
    if (p.enabled && item.pricing!.baseline === null) {
      item.pricing!.baseline = item.priceCents;
      item.pricing!.baselineLabel = "when tracking started";
    }
    item.pricing!.paused = !p.enabled;
    for (const w of s.priceWatches.filter((w) => w.itemId === item.id))
      w.reference = null;
    item.revision++;
  } else fail(404, "Unknown price action.");
  return { ok: true };
}
export function schedulePrices(s: State, now = new Date()) {
  const cfg = priceConfig(),
    { day, due } = priceDay(now, cfg);
  if (!cfg.enabled || !due) return;
  const key = `price-run:${day}`;
  if (s.usage.some((u) => u.key === key)) return;
  s.usage.push({ ...stamp(), key, count: now.getTime() });
  const groups = new Map<
    string,
    { url: string; targets: State["priceChecks"][number]["targets"] }
  >();
  for (const i of s.items.filter((i) => priceEligible(s, i))) {
    if (!i.pricing) priceBaseline(i, "when tracking started");
    for (const offer of shoppingOffers(i)) {
      if (i.shoppingOffers && !offer.pricing)
        offer.pricing = {
          baseline: offer.priceCents,
          baselineLabel: "when tracking started",
          generation: randomUUID(),
        };
      const key = productCacheUrl(offer.url) ?? `private:${i.id}:${offer.id}`;
      const group = groups.get(key) ?? { url: offer.url, targets: [] };
      group.targets.push({
        id: i.id,
        generation: i.pricing!.generation,
        revision: i.revision,
        ...(i.shoppingOffers
          ? { offerId: offer.id, offerGeneration: offer.pricing!.generation }
          : {}),
      });
      groups.set(key, group);
    }
  }
  for (const group of groups.values())
    s.priceChecks.push({
      ...stamp(),
      ...group,
      day,
      status: "pending",
    });
  // Completed jobs are diagnostics, not price history.
  s.priceChecks = s.priceChecks.filter(
    (j) =>
      !["complete", "failed"].includes(j.status) ||
      Date.parse(j.createdAt) > now.getTime() - 7 * 86400000,
  );
  s.priceWatches = s.priceWatches.filter((w) =>
    s.items.some((i) => i.id === w.itemId),
  );
  s.priceChanges = s.priceChanges.filter((c) =>
    s.items.some((i) => i.id === c.itemId),
  );
}
