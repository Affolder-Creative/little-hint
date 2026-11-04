const queryKeys = new Set([
  "id",
  "pid",
  "product_id",
  "variant",
  "sku",
  "color",
  "colour",
  "size",
  "currency",
  "locale",
  "lang",
  "country",
  "th",
  "psc",
]);
const trackingKeys = new Set(["gclid", "fbclid", "msclkid"]);

/** Deliberately narrower than duplicate detection: markets and variants matter. */
export function productCacheUrl(value: string): string | undefined {
  try {
    const u = new URL(value);
    if (
      !/^https?:$/.test(u.protocol) ||
      u.username ||
      u.password ||
      (u.port && !["80", "443"].includes(u.port)) ||
      /\/(auth|login|account|checkout|cart|password|reset|invite|share)(\/|$)/i.test(
        u.pathname,
      )
    )
      return;
    u.hash = "";
    const amazon =
      /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|com\.au|co\.jp)$/.test(
        u.hostname,
      );
    for (const key of [...u.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        trackingKeys.has(lower) ||
        (amazon && ["tag", "ref"].includes(lower))
      )
        u.searchParams.delete(key);
      else if (!queryKeys.has(lower)) return;
    }
    // Preserve query order and path spelling rather than merging ambiguous URLs.
    return u.href;
  } catch {
    return;
  }
}
