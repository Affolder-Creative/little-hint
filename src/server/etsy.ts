import { load } from "cheerio";
import type { Item } from "../shared/model";

export function etsyListingId(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      !["etsy.com", "www.etsy.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      return;
    return url.pathname.match(
      /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?listing\/([0-9]+)(?:\/[^/]*)?\/?$/i,
    )?.[1];
  } catch {
    return;
  }
}

const plainText = (value: unknown) => {
  if (typeof value !== "string") return "";
  const $ = load(value);
  $("script,style").remove();
  return $("body").text().trim();
};

/** A listing can import even when Etsy cannot establish one selected price. */
export function normalizeEtsyProduct(
  row: any,
  url: string,
): Partial<Item> & {
  sourceTitle: string;
  remoteImage?: string;
  warnings?: string[];
} {
  const id = etsyListingId(url);
  if (
    !id ||
    !row ||
    row.error ||
    row.error_code ||
    String(row.product_id) !== id ||
    (row.url !== undefined && etsyListingId(row.url) !== id)
  )
    throw new Error("Etsy listing identity could not be verified");
  const title = plainText(row.title);
  if (!title) throw new Error("Etsy returned no product name");

  const selectedOption = [...new URL(url).searchParams.keys()].some((key) =>
    /^(variation\d*|listing_inventory_id|inventory_id|variant(?:_id)?|sku|size|colou?r)$/i.test(
      key,
    ),
  );
  const hasVariations =
    (row.listing_has_variations != null &&
      row.listing_has_variations !== false) ||
    [
      row.variation,
      row.variations,
      row.variant_attributes,
      row.nai_variants,
    ].some(
      (value) => value != null && (!Array.isArray(value) || value.length > 0),
    );
  const amount = (value: unknown) =>
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\$?\d+(?:\.\d{1,2})?$/.test(value.trim())
        ? Number(value.trim().replace(/^\$/, ""))
        : NaN;
  const price = amount(row.final_price ?? row.sale_price ?? row.price);
  const uncertainRange = [row.final_price_high, row.price_range].some(
    (value) => value != null && value !== "" && amount(value) !== price,
  );
  const image = [
    row.image_url,
    ...(Array.isArray(row.images) ? row.images : []),
  ].find((value) => {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
      const imageUrl = new URL(value);
      return (
        ["http:", "https:"].includes(imageUrl.protocol) &&
        !imageUrl.username &&
        !imageUrl.password
      );
    } catch {
      return false;
    }
  });
  const needsOptionCheck = selectedOption || hasVariations;
  return {
    title: title.slice(0, 160),
    sourceTitle: title.slice(0, 2000),
    description: (
      plainText(row.description) ||
      (Array.isArray(row.item_details)
        ? row.item_details.map(plainText).filter(Boolean).join("\n")
        : "") ||
      plainText(row.item_details_html)
    ).slice(0, 5000),
    priceCents:
      !needsOptionCheck &&
      !uncertainRange &&
      row.currency === "USD" &&
      Number.isFinite(price) &&
      price >= 0 &&
      price <= 1000000
        ? Math.round(price * 100)
        : null,
    currency: "USD",
    tags: [],
    source: new URL(url).hostname,
    importedAt: new Date().toISOString(),
    ...(image && !selectedOption ? { remoteImage: image } : {}),
    ...(needsOptionCheck
      ? {
          warnings: [
            "Check the selected option at the shop before adding this item.",
          ],
        }
      : {}),
  };
}
