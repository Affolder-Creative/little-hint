import { recordPriceFailure } from "./price-diagnostics";
import { etsyListingId } from "./etsy";
import { transact } from "./db";
import { load } from "cheerio";
import { safeFetch, validateUrl, boundedBody } from "./imports";
import { brightRetailer, retailerDataset, unlockPage } from "./brightdata";
import {
  selectedScrapingProvider,
  scrapingProviders,
} from "../shared/scraping-providers";
import { scrapingRequest } from "./scraping";
import { spend } from "./settings";

export function parsePrice(html: string, url: string) {
  const $ = load(html),
    products: any[] = [];
  function visit(v: any, depth = 0) {
    if (!v || depth > 10) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (typeof v !== "object") return;
    if ([v["@type"]].flat().includes("Product")) products.push(v);
    else visit(v["@graph"] ?? v.mainEntity, depth + 1);
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      /* unusable metadata */
    }
  });
  if (products.length !== 1) throw new Error("Product cannot be verified");
  const p = products[0],
    offers = [p.offers].flat().filter(Boolean),
    u = new URL(url);
  if (p.hasVariant || offers.length !== 1)
    throw new Error("Choose an exact product option");
  const o = offers[0];
  // An explicit option must match structured identifiers, not a page's default offer.
  for (const key of ["variant", "sku", "preselect", "size", "color", "colour"])
    if (
      u.searchParams.has(key) &&
      ![p.sku, p.productID, p.size, p.color]
        .map(String)
        .includes(u.searchParams.get(key)!)
    )
      throw new Error("Selected option cannot be verified");
  if (
    o["@type"] === "AggregateOffer" ||
    o.priceCurrency !== "USD" ||
    o.priceSpecification ||
    o.eligibleCustomerType ||
    o.eligibleQuantity ||
    !/^(https?:\/\/schema.org\/)?InStock$/.test(o.availability ?? "") ||
    (o.itemCondition && !/NewCondition$/.test(o.itemCondition)) ||
    (o.priceValidUntil && Date.parse(o.priceValidUntil) < Date.now())
  )
    throw new Error("Price cannot be verified");
  if (
    !/^\d+(\.\d{1,2})?$/.test(String(o.price)) ||
    Number(o.price) <= 0 ||
    Number(o.price) > 1000000
  )
    throw new Error("Invalid price");
  const seller = typeof o.seller === "string" ? o.seller : o.seller?.name;
  if (/(amazon|walmart|target|bestbuy)\.com$/.test(u.hostname) && !seller)
    throw new Error("Seller cannot be verified");
  return {
    priceCents: Math.round(Number(o.price) * 100),
    identity: JSON.stringify([
      u.origin,
      u.pathname,
      p.sku ?? p.gtin ?? p.productID ?? "",
      p.size ?? "",
      p.color ?? "",
      seller ?? "",
    ]),
  };
}
export async function lookupPrice(
  url: string,
  id: string,
  cfg: Record<string, string>,
  guard: () => Promise<void>,
  resume = false,
) {
  await guard();
  try {
    if (resume || etsyListingId(url))
      throw new Error("Resume existing collection");
    const page = await safeFetch(url, 2_000_000, guard);
    if (new URL(page.url).pathname !== new URL(url).pathname)
      throw new Error("Product redirected");
    const result = parsePrice(page.buffer.toString("utf8"), page.url);
    return {
      ...result,
      ...(retailerDataset(url, "price") ? { identity: `retailer:${url}` } : {}),
      source: "direct",
    };
  } catch (error) {
    if (!resume && !etsyListingId(url))
      await transact((s) => {
        const job = s.priceChecks.find((j) => j.id === id);
        if (job) recordPriceFailure(job, error, "direct");
      });
  }
  await guard();
  await validateUrl(url);
  const provider = selectedScrapingProvider(cfg);
  if (!provider) throw new Error("Paid fallback unavailable");
  if (!(provider === "brightdata" && retailerDataset(url, "price"))) {
    await transact((s) => {
      const job = s.priceChecks.find((j) => j.id === id);
      if (!job || job.paidAttempted)
        throw new Error("Submission outcome uncertain; do not resubmit");
      job.paidAttempted = true;
    });
  }
  if (provider === "brightdata") {
    if (retailerDataset(url, "price")) {
      const r = await brightRetailer(url, cfg.BRIGHTDATA_API_KEY, id, true);
      if (etsyListingId(url) && r.warnings?.length)
        throw new Error("Selected option cannot be verified");
      if (!r.priceCents) throw new Error("Price cannot be verified");
      return {
        priceCents: r.priceCents,
        identity: `retailer:${url}`,
        source: "brightdata-scraper",
      };
    }
    return {
      ...parsePrice(await unlockPage(url, cfg, true), url),
      source: "brightdata-unlocker",
    };
  }
  const request = scrapingRequest(
    provider,
    cfg[scrapingProviders.find((p) => p.id === provider)!.key],
    url,
  );
  if (request.amazon) throw new Error("Structured price adapter unavailable");
  await spend(provider, true);
  const response = await fetch(request.url, {
    headers: request.headers,
    redirect: "error",
    signal: AbortSignal.timeout(35000),
  });
  if (!response.ok) throw new Error("Provider unavailable");
  const resolved = response.headers.get("resolved-url") ?? url;
  await validateUrl(resolved);
  return {
    ...parsePrice((await boundedBody(response)).toString("utf8"), resolved),
    source: provider,
  };
}
