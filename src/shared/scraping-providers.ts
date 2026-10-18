export const scrapingProviders = [
  { id: "scrapingfish", name: "Scraping Fish", key: "SCRAPINGFISH_API_KEY" },
  { id: "scrapingbee", name: "ScrapingBee", key: "SCRAPINGBEE_API_KEY" },
  { id: "scrapedo", name: "Scrape.do", key: "SCRAPEDO_API_KEY" },
  { id: "scrapingdog", name: "Scrapingdog", key: "SCRAPINGDOG_API_KEY" },
] as const;
export type ScrapingProvider = (typeof scrapingProviders)[number]["id"];
export const scrapingSelections = [
  "auto",
  "none",
  ...scrapingProviders.map((p) => p.id),
];
export function selectedScrapingProvider(
  cfg: Record<string, string>,
): ScrapingProvider | undefined {
  const selected = cfg.SCRAPING_PROVIDER || "auto";
  return scrapingProviders.find(
    (p) => (selected === "auto" || p.id === selected) && !!cfg[p.key],
  )?.id;
}
