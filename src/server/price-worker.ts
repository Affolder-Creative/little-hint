import type { State, Item, PriceCheck } from "../shared/model";
import { bestShoppingOffer } from "../shared/shopping-offers";
import { recordPriceFailure } from "./price-diagnostics";
import { randomUUID } from "node:crypto";
import { transact, readState } from "./db";
import { config } from "./settings";
import { lookupPrice } from "./price-products";
import { ImportPending } from "./brightdata";
import { productLookupEnabled } from "../shared/product-lookup";
import { priceConfig } from "./price-config";
import { priceEligible, meaningfulDrop, priceAlertAllowed } from "./prices";
import { stamp } from "./domain";
import { emitActivity } from "./activity";
function targetEligible(s: State, i: Item, t: PriceCheck["targets"][number]) {
  return (
    i.revision === t.revision &&
    i.pricing?.generation === t.generation &&
    priceEligible(s, i) &&
    (!t.offerId ||
      i.shoppingOffers?.some(
        (o) =>
          o.id === t.offerId && o.pricing?.generation === t.offerGeneration,
      ))
  );
}
// Worker writes invalidate stale editors without invalidating sibling checks.
// Only targets for the exact input revision are rebased; user edits never are.
function bumpPriceRevision(s: State, item: Item) {
  const previous = item.revision++;
  for (const check of s.priceChecks)
    for (const target of check.targets)
      if (
        target.id === item.id &&
        target.generation === item.pricing?.generation &&
        target.revision === previous
      )
        target.revision = item.revision;
}
function finishProductRuns(s: State, job: PriceCheck) {
  for (const t of job.targets.filter((t) => t.offerId)) {
    const i = s.items.find((i) => i.id === t.id);
    if (!i || !targetEligible(s, i, t) || i.pricing!.completedDay === job.day)
      continue;
    const jobs = s.priceChecks.filter(
      (j) =>
        j.day === job.day &&
        j.targets.some(
          (target) =>
            target.id === i.id &&
            target.generation === t.generation &&
            target.revision === t.revision,
        ),
    );
    if (jobs.some((j) => j.status === "pending" || j.status === "running"))
      continue;
    const p = i.pricing!;
    p.completedDay = job.day;
    const best = bestShoppingOffer(i);
    if (!best) {
      p.status = i.shoppingOffers?.some((o) => o.pricing?.status === "deferred")
        ? "deferred"
        : "unavailable";
      continue;
    }
    i.priceCents = best.priceCents;
    p.checkedAt = best.pricing!.checkedAt;
    p.status = "verified";
    bumpPriceRevision(s, i);
    // A run with no accepted result must not manufacture a price-drop alert.
    if (!jobs.some((j) => j.status === "complete")) continue;
    notifyDrop(s, i, best.priceCents!);
  }
}
function notifyDrop(s: State, i: Item, price: number) {
  const p = i.pricing!;
  for (const w of s.priceWatches.filter((w) => w.itemId === i.id)) {
    if (w.generation !== p.generation) {
      w.generation = p.generation;
      w.reference = null;
    }
    if (w.reference === null) w.reference = price;
    else if (
      meaningfulDrop(w.reference, price) &&
      priceAlertAllowed(s, w.userId, i.id)
    ) {
      emitActivity(s, "price-drop", [w.userId], {
        itemId: i.id,
        action: `Price fell from $${(w.reference / 100).toFixed(2)} to $${(price / 100).toFixed(2)}`,
      });
      w.reference = price;
    }
  }
}
export async function processPrice(id: string) {
  const cfg = await config();
  if (!priceConfig().enabled || !productLookupEnabled(cfg)) return;
  const token = randomUUID();
  const job = await transact((s) => {
    const j = s.priceChecks.find((j) => j.id === id);
    if (
      !j ||
      ["complete", "failed"].includes(j.status) ||
      (j.leaseUntil && Date.parse(j.leaseUntil) > Date.now())
    )
      return;
    j.status = "running";
    j.token = token;
    j.leaseUntil = new Date(Date.now() + 300000).toISOString();
    return structuredClone(j);
  });
  if (!job) return;
  const guard = async () => {
    const s = await readState();
    if (
      !priceConfig().enabled ||
      !productLookupEnabled(await config()) ||
      !s.priceChecks.some((j) => j.id === id && j.token === token) ||
      !s.priceChecks
        .find((j) => j.id === id)!
        .targets.some((t) =>
          s.items.some((i) => i.id === t.id && targetEligible(s, i, t)),
        )
    )
      throw new Error("Check no longer eligible");
  };
  try {
    await guard();
    const result = await lookupPrice(
      job.url,
      id,
      cfg,
      guard,
      !!job.providerState,
    );
    await guard();
    await transact((s) => {
      const j = s.priceChecks.find((j) => j.id === id);
      if (!j || j.token !== token) return;
      const checkedAt = new Date().toISOString();
      let accepted = 0;
      for (const t of j.targets) {
        const i = s.items.find((i) => i.id === t.id);
        if (!i || !targetEligible(s, i, t)) continue;
        const offer = t.offerId
          ? i.shoppingOffers!.find((o) => o.id === t.offerId)!
          : undefined;
        const p = offer?.pricing ?? i.pricing!;
        if (p.identity && p.identity !== result.identity) {
          p.status = "unavailable";
          if (offer) bumpPriceRevision(s, i);
          continue;
        }
        accepted++;
        p.identity = result.identity;
        p.checkedAt = checkedAt;
        p.status = "verified";
        const old = offer ? offer.priceCents : i.priceCents;
        if (old !== result.priceCents) {
          s.priceChanges.push({
            ...stamp(),
            itemId: i.id,
            ...(offer ? { offerId: offer.id } : {}),
            generation: p.generation,
            from: old,
            to: result.priceCents,
            source: result.source,
          });
          if (offer) offer.priceCents = result.priceCents;
          else {
            i.priceCents = result.priceCents;
            i.revision++;
          }
        }
        for (const offer of i.purchaseOffers ?? [])
          if (offer.url === i.url) {
            offer.priceCents = result.priceCents;
            offer.checkedAt = checkedAt;
          }
        if (offer) bumpPriceRevision(s, i);
        else notifyDrop(s, i, result.priceCents);
      }
      j.status = accepted ? "complete" : "failed";
      if (!accepted) {
        j.outcome = "unverifiable";
        j.error = "Product identity changed; previous prices retained.";
        j.diagnostics = [
          ...(j.diagnostics ?? []),
          { stage: "identity", reason: j.error },
        ].slice(-8);
      } else {
        delete j.outcome;
        delete j.error;
      }
      delete j.leaseUntil;
      finishProductRuns(s, j);
    });
  } catch (error) {
    await transact((s) => {
      const j = s.priceChecks.find((j) => j.id === id);
      if (!j || j.token !== token) return;
      delete j.leaseUntil;
      if (error instanceof ImportPending) {
        j.status = "pending";
        return;
      }
      j.outcome = recordPriceFailure(j, error, "price-check");
      const deferred = j.outcome === "deferred";
      j.status = "failed";
      j.error = deferred
        ? "Deferred: provider request allowance exhausted."
        : "Price could not be verified; the previous price was retained.";
      for (const t of j.targets) {
        const i = s.items.find((i) => i.id === t.id);
        if (i && targetEligible(s, i, t)) {
          const pricing = t.offerId
            ? i.shoppingOffers!.find((o) => o.id === t.offerId)!.pricing!
            : i.pricing!;
          pricing.status = deferred ? "deferred" : "unavailable";
          if (t.offerId) bumpPriceRevision(s, i);
        }
      }
      finishProductRuns(s, j);
    });
  }
}
