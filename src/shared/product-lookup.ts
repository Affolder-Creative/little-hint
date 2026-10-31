/** `none` disables the entire product import pipeline, including direct extraction. */
export function productLookupEnabled(cfg: Record<string, string>): boolean {
  return cfg.SCRAPING_PROVIDER !== "none";
}
export const lookupDisabledMessage =
  "Automatic shop lookups are off. Enter the item details manually.";
