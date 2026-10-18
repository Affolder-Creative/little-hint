import type { ScrapingProvider } from "../shared/scraping-providers";

/** Provider hosts are fixed. Target URLs must pass validateUrl before this call. */
export function scrapingRequest(
  provider: ScrapingProvider,
  key: string,
  target: string,
) {
  const productUrl = new URL(target);
  const asin =
    provider === "scrapingbee" && /(^|\.)amazon\.com$/.test(productUrl.hostname)
      ? productUrl.pathname.match(
          /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i,
        )?.[1]
      : undefined;
  const endpoints = {
    scrapingfish: "https://api.scrapingfish.com/api/v1/",
    scrapingbee: asin
      ? "https://app.scrapingbee.com/api/v1/amazon/product"
      : "https://app.scrapingbee.com/api/v1/",
    scrapedo: "https://api.scrape.do/",
    scrapingdog: "https://api.scrapingdog.com/scrape",
  };
  const url = new URL(endpoints[provider]);
  const headers: Record<string, string> = {};
  if (provider === "scrapingbee") {
    headers.Authorization = `Bearer ${key}`;
    if (asin) {
      url.searchParams.set("query", asin);
      url.searchParams.set("country", "us");
      url.searchParams.set("currency", "USD");
    } else url.searchParams.set("render_js", "false");
  } else
    url.searchParams.set(provider === "scrapedo" ? "token" : "api_key", key);
  if (!asin) url.searchParams.set("url", target);
  if (provider === "scrapingdog") url.searchParams.set("dynamic", "false");
  return { url, headers, amazon: !!asin };
}
