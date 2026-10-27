import { load } from "cheerio";
import { z } from "zod";
import { safeFetch, validateUrl } from "./imports";
import { cachedImport, importCacheKey, productCacheUrl } from "./import-cache";
import {
  offerFreshnessMs,
  type GiftEvidence,
  type GiftOffer,
} from "../shared/gift-discovery";

// Deliberate trust registry. The model cannot nominate additional domains.
export const giftShops: Record<
  string,
  { name: string; marketplace?: boolean }
> = {
  "amazon.com": { name: "Amazon", marketplace: true },
  "walmart.com": { name: "Walmart", marketplace: true },
  "target.com": { name: "Target", marketplace: true },
  "bestbuy.com": { name: "Best Buy", marketplace: true },
  "rei.com": { name: "REI" },
  "barnesandnoble.com": { name: "Barnes & Noble" },
  "homedepot.com": { name: "The Home Depot" },
  "williams-sonoma.com": { name: "Williams Sonoma" },
  "uncommongoods.com": { name: "Uncommon Goods" },
  "lego.com": { name: "LEGO" },
  "oxo.com": { name: "OXO" },
  "yeti.com": { name: "YETI" },
};
export const giftReviewDomains = [
  "nytimes.com",
  "seriouseats.com",
  "goodhousekeeping.com",
  "tomsguide.com",
];
export function trustedGiftDomain(
  url: string,
  domains = Object.keys(giftShops),
) {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw new Error("Unsupported product URL.");
  const domain = domains.find(
    (d) => u.hostname === d || u.hostname === `www.${d}`,
  );
  if (!domain)
    throw new Error("This source is not in the gift discovery registry.");
  return domain;
}
const normalized = (value: unknown) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const plain = (value: unknown) =>
  load(String(value ?? ""))("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();
function productNodes(value: unknown, depth = 0): Record<string, any>[] {
  if (!value || depth > 10) return [];
  if (Array.isArray(value))
    return value.flatMap((x) => productNodes(x, depth + 1));
  if (typeof value !== "object") return [];
  const v = value as Record<string, any>;
  if ([v["@type"]].flat().includes("Product")) return [v];
  return productNodes(v["@graph"] ?? v.mainEntity, depth + 1);
}
const offerSchema = z.object({
  url: z.url(),
  retailer: z.string(),
  seller: z.string(),
  priceCents: z.number().int().positive(),
  currency: z.literal("USD"),
  checkedAt: z.iso.datetime(),
  identity: z.string(),
});
const evidenceSchema = z.object({
  kind: z.enum(["customer", "editorial"]),
  url: z.url(),
  label: z.string(),
  checkedAt: z.iso.datetime(),
});
const productSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(5000),
  imageUrl: z.string(),
  brand: z.string(),
  offer: offerSchema,
  evidence: z.array(evidenceSchema),
});
export type CheckedProduct = z.infer<typeof productSchema>;

/** Discovery deliberately rejects incomplete metadata accepted by ordinary imports. */
export function parseGiftProduct(
  html: string,
  url: string,
  expectedTitle: string,
  now = new Date(),
): CheckedProduct {
  const domain = trustedGiftDomain(url),
    shop = giftShops[domain];
  const $ = load(html);
  const products: Record<string, any>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      products.push(...productNodes(JSON.parse($(el).text())));
    } catch {
      /* Not product evidence. */
    }
  });
  // Multiple products or aggregate/variant offers cannot establish one purchasable variant.
  if (products.length !== 1)
    throw new Error("An exact product could not be verified.");
  const p = products[0];
  const title = plain(p.name);
  if (
    /\b(?:e[ -]?)?gift[ -]?cards?\b|\bsubscriptions?\b|\bmemberships?\b|\bdigital (?:downloads?|codes?)\b|\bdownloadable\b/i.test(
      `${title} ${plain(p.category)}`,
    )
  )
    throw new Error("Only physical, one-time purchases are supported.");
  if (
    !title ||
    title.length > 160 ||
    normalized(title) !== normalized(expectedTitle)
  )
    throw new Error("Product identity did not match.");
  if (p.hasVariant || (p.isVariantOf && !p.sku && !p.gtin && !p.gtin13))
    throw new Error("Choose a specific variant.");
  const offers = [p.offers].flat().filter(Boolean);
  if (offers.length !== 1)
    throw new Error("A single offer could not be verified.");
  const o = offers[0];
  if (
    o["@type"] === "AggregateOffer" ||
    o.priceCurrency !== "USD" ||
    o.price === undefined ||
    !/^https?:\/\/schema\.org\/InStock$|^InStock$/.test(
      String(o.availability),
    ) ||
    o.eligibleCustomerType ||
    o.eligibleQuantity ||
    o.priceSpecification ||
    (o.itemCondition &&
      !/^(https?:\/\/schema\.org\/)?NewCondition$/.test(o.itemCondition))
  )
    throw new Error("The USD price and availability could not be verified.");
  const price = String(o.price);
  if (
    !/^\d+(\.\d{1,2})?$/.test(price) ||
    Number(price) <= 0 ||
    Number(price) > 1000000
  )
    throw new Error("Invalid offer price.");
  if (
    o.priceValidUntil &&
    (!Number.isFinite(Date.parse(o.priceValidUntil)) ||
      Date.parse(o.priceValidUntil) < now.getTime())
  )
    throw new Error("Expired offer.");
  const seller = plain(
    typeof o.seller === "string" ? o.seller : o.seller?.name,
  );
  if (
    shop.marketplace &&
    ![normalized(shop.name), normalized(domain)].includes(normalized(seller))
  )
    throw new Error("The marketplace retailer seller could not be verified.");
  const brand = plain(typeof p.brand === "string" ? p.brand : p.brand?.name);
  const gtin = p.gtin ?? p.gtin13 ?? p.gtin12 ?? p.gtin14 ?? p.gtin8;
  const identity =
    gtin && /^\d{8,14}$/.test(String(gtin))
      ? `gtin:${gtin}`
      : brand && p.mpn
        ? `mpn:${normalized(brand)}:${normalized(p.mpn)}:${normalized(p.color)}:${normalized(p.size)}`
        : `url:${url}`;
  const checkedAt = now.toISOString();
  const evidence: GiftEvidence[] = [];
  const rating = p.aggregateRating;
  if (
    rating &&
    Number(rating.bestRating ?? 5) === 5 &&
    [0, 1].includes(Number(rating.worstRating ?? 1)) &&
    Number(rating.ratingValue) >= 4 &&
    Number(rating.ratingValue) <= 5 &&
    Number(rating.reviewCount) >= 25 &&
    Number.isInteger(Number(rating.reviewCount))
  )
    evidence.push({
      kind: "customer",
      url,
      label: `${Number(rating.ratingValue)}/5 from ${Number(rating.reviewCount)} customer reviews`,
      checkedAt,
    });
  const img = [p.image].flat()[0];
  return productSchema.parse({
    title,
    description: plain(p.description).slice(0, 5000),
    brand,
    imageUrl: typeof img === "string" ? img : (img?.url ?? ""),
    evidence,
    offer: {
      url,
      retailer: shop.name,
      seller: seller || shop.name,
      priceCents: Math.round(Number(price) * 100),
      currency: "USD",
      checkedAt,
      identity,
    },
  });
}
export async function checkGiftProduct(
  url: string,
  title: string,
  guard: () => Promise<void>,
  force = false,
) {
  trustedGiftDomain(url);
  await guard();
  await validateUrl(url);
  const normalizedUrl = productCacheUrl(url);
  const key = normalizedUrl
    ? importCacheKey("discovery-product-v1", [normalizedUrl, title])
    : undefined;
  const compute = async () => {
    const page = await safeFetch(url, 2_000_000, async (u) => {
      trustedGiftDomain(u);
      await guard();
    });
    return {
      value: parseGiftProduct(page.buffer.toString("utf8"), page.url, title),
      cacheable: page.cacheable,
    };
  };
  let result = await cachedImport(key, productSchema, compute, force);
  if (Date.now() - Date.parse(result.offer.checkedAt) >= offerFreshnessMs)
    result = await cachedImport(key, productSchema, compute, true);
  await guard();
  return result;
}
export async function checkEditorial(
  url: string,
  quote: string,
  title: string,
  guard: () => Promise<void>,
): Promise<GiftEvidence> {
  trustedGiftDomain(url, giftReviewDomains);
  if (
    quote.split(/\s+/).length > 25 ||
    !/recommend|best|favorite|favourite|top pick|our pick/i.test(quote) ||
    /\bnot\b|\bnever\b|\bavoid\b|\bno longer\b|\b(?:don|doesn|isn|wasn)['’]t\b/i.test(
      quote,
    )
  )
    throw new Error("No positive review evidence.");
  const page = await safeFetch(url, 2_000_000, async (u) => {
    trustedGiftDomain(u, giftReviewDomains);
    await guard();
  });
  const $ = load(page.buffer.toString("utf8"));
  const paragraphs = $("p, li")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get();
  if (
    !paragraphs.some(
      (p) => p.includes(quote) && normalized(p).includes(normalized(title)),
    )
  )
    throw new Error("The review could not be matched to this product.");
  return {
    kind: "editorial",
    url: page.url,
    label: `Recommended by ${new URL(page.url).hostname.replace(/^www\./, "")}`,
    checkedAt: new Date().toISOString(),
  };
}
export function compatibleOffer(first: GiftOffer, next: GiftOffer) {
  return !first.identity.startsWith("url:") && first.identity === next.identity;
}
