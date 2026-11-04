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
      !job.targets.some((t) =>
        s.items.some(
          (i) =>
            i.id === t.id &&
            i.revision === t.revision &&
            i.pricing?.generation === t.generation &&
            priceEligible(s, i),
        ),
      )
    )
      throw new Error("Check no longer eligible");
  };
  try {
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
      for (const t of job.targets) {
        const i = s.items.find((i) => i.id === t.id);
        if (
          !i ||
          i.revision !== t.revision ||
          i.pricing?.generation !== t.generation ||
          !priceEligible(s, i)
        )
          continue;
        const p = i.pricing!;
        if (p.identity && p.identity !== result.identity) {
          p.status = "unavailable";
          continue;
        }
        accepted++;
        p.identity = result.identity;
        p.checkedAt = checkedAt;
        p.status = "verified";
        const old = i.priceCents;
        if (old !== result.priceCents) {
          s.priceChanges.push({
            ...stamp(),
            itemId: i.id,
            generation: p.generation,
            from: old,
            to: result.priceCents,
            source: result.source,
          });
          i.priceCents = result.priceCents;
          i.revision++;
        }
        for (const offer of i.purchaseOffers ?? [])
          if (offer.url === i.url) {
            offer.priceCents = result.priceCents;
            offer.checkedAt = checkedAt;
          }
        for (const w of s.priceWatches.filter((w) => w.itemId === i.id)) {
          if (w.generation !== p.generation) {
            w.generation = p.generation;
            w.reference = null;
          }
          if (w.reference === null) w.reference = result.priceCents;
          else if (
            meaningfulDrop(w.reference, result.priceCents) &&
            priceAlertAllowed(s, w.userId, i.id)
          ) {
            emitActivity(s, "price-drop", [w.userId], {
              itemId: i.id,
              action: `Price fell from $${(w.reference / 100).toFixed(2)} to $${(result.priceCents / 100).toFixed(2)}`,
            });
            w.reference = result.priceCents;
          }
        }
      }
      j.status = accepted ? "complete" : "failed";
      if (!accepted)
        j.error = "Product identity changed; previous prices retained.";
      delete j.leaseUntil;
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
      const deferred = /allowance|budget|limit/i.test(String(error));
      j.status = "failed";
      j.error = deferred
        ? "Deferred: provider request allowance exhausted."
        : "Price could not be verified; the previous price was retained.";
      for (const t of j.targets) {
        const i = s.items.find((i) => i.id === t.id);
        if (
          i?.pricing?.generation === t.generation &&
          i.revision === t.revision
        )
          i.pricing.status = deferred ? "deferred" : "unavailable";
      }
    });
  }
}
