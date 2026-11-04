import type { CheerioAPI } from "cheerio";

export function reiProductId(url: string) {
  const u = new URL(url);
  return ["rei.com", "www.rei.com"].includes(u.hostname)
    ? u.pathname.match(/^\/product\/([a-z0-9]+)(?:\/|$)/i)?.[1]
    : undefined;
}

/** Only read data tied to the requested REI style, never recommendations. */
export function reiProduct(
  $: CheerioAPI,
  url: string,
): Record<string, any> | undefined {
  const id = reiProductId(url);
  if (!id) return;
  let model: any;
  try {
    const p = JSON.parse($("script#modelData").text()).pageData?.product;
    if (
      String(p?.styleId) === id &&
      typeof p?.title === "string" &&
      Array.isArray(p?.skus)
    )
      model = p;
  } catch {}
  let group: any;
  function visit(v: any, depth = 0) {
    if (!v || depth > 8) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (typeof v !== "object") return;
    if (
      [v["@type"]]
        .flat()
        .some((t) => t === "ProductGroup" || t === "Product") &&
      [
        v.productGroupId,
        v.sku,
        v.url && reiProductId(new URL(v.url, url).href),
      ].includes(id)
    )
      group = v;
    else visit(v["@graph"] ?? v.mainEntity, depth + 1);
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {}
  });
  if (!model && !group) {
    const name = $("#product-page-title").text().trim().replace(/\s+/g, " ");
    if (!name) return;
    return {
      name,
      description: $("#product-primary-description").text().trim() || undefined,
      image: $("#apparel-media-image-container img[alt^='Product Image']")
        .first()
        .attr("src"),
      reiUncertain: ["sku", "size", "color", "colour"].some((k) =>
        new URL(url).searchParams.has(k),
      ),
    };
  }
  const u = new URL(url);
  const rawVariants = model?.skus ?? group?.hasVariant ?? [group];
  const variants: any[] = Array.isArray(rawVariants) ? rawVariants : [];
  const choices = variants.filter(Boolean).map((v) => ({
    sku: String(v.skuId ?? v.sku ?? ""),
    size: String(v.size?.name ?? v.size ?? ""),
    color: String(v.color?.displayLabel ?? v.color ?? ""),
    colorCode: String(v.color?.code ?? ""),
    price: model
      ? v.price?.hideDisplayPrice || v.membersOnly
        ? undefined
        : v.price?.price?.value
      : [v.offers].flat().length === 1 &&
          ![v.offers].flat()[0]?.eligibleCustomerType &&
          ![v.offers].flat()[0]?.priceSpecification
        ? [v.offers].flat()[0]?.price
        : undefined,
    currency: model ? "USD" : [v.offers].flat()[0]?.priceCurrency,
    image: model
      ? model.imagesByColorCodeMap?.[v.color?.code]?.find(
          (i: any) => i.type === "Product Image",
        )?.uri
      : [v.image].flat()[0],
  }));
  const selectedKeys = ["sku", "size", "color", "colour"].filter((k) =>
    u.searchParams.has(k),
  );
  const matches = choices.filter((v) =>
    selectedKeys.every((k) => {
      const expected = u.searchParams.get(k)!.toLowerCase();
      return (
        k === "sku" ? [v.sku] : k === "size" ? [v.size] : [v.color, v.colorCode]
      ).some((s) => s.toLowerCase() === expected);
    }),
  );
  const ambiguous = selectedKeys.length > 0 && matches.length !== 1;
  const selected = selectedKeys.length && !ambiguous ? matches[0] : undefined;
  const prices = matches.map((v) =>
    v.currency === "USD" && /^\d+(\.\d{1,2})?$/.test(String(v.price))
      ? Number(v.price)
      : NaN,
  );
  const price =
    !ambiguous &&
    prices.length &&
    prices.every((p) => Number.isFinite(p) && p === prices[0])
      ? prices[0]
      : undefined;
  const brand = String(model?.brand?.name ?? group?.brand?.name ?? "");
  const name = model?.title ?? group?.name;
  const title =
    `${brand && !String(name).toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ` : ""}${name ?? ""}`.trim();
  const image =
    selected?.image ??
    (selectedKeys.length
      ? undefined
      : (model?.computedImages?.find(
          (i: any) => i.type === "Product Image" && i.featured,
        )?.uri ?? [group?.image].flat()[0]));
  return {
    name: `${title}${selected ? ` - ${selected.color} - ${selected.size}` : ""}`,
    description: model?.description ?? group?.description,
    image: typeof image === "string" ? image : image?.url,
    offers: { price, priceCurrency: "USD" },
    reiUncertain: ambiguous || (selectedKeys.length > 0 && !image),
  };
}
