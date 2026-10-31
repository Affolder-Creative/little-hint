import { productLookupEnabled } from "../shared/product-lookup";
import { smsUsage } from "./sms-usage";
import type { State } from "../shared/model";
import type { AdminUsage, AiUsage } from "../shared/admin-usage";
import {
  scrapingProviders,
  selectedScrapingProvider,
} from "../shared/scraping-providers";
import { discoveryMonthlyUsage, addDiscoveryUsage } from "./gift-discovery";
import { discoveryConfiguration } from "./settings";

// Keep the existing versioned discovery estimate. Unknown models are unpriced.
export const usagePricingAsOf = "2026-10-27";
const rates: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, output: 0.5 },
};
export function returnedTokens(
  usage: unknown,
): { input: number; output: number } | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const valid = (n: unknown): n is number =>
    typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  return valid(u.input_tokens) && valid(u.output_tokens)
    ? { input: u.input_tokens, output: u.output_tokens }
    : null;
}
export function recordProductTokens(
  s: State,
  startedAt: string,
  model: string,
  usage: unknown,
) {
  const tokens = returnedTokens(usage);
  if (!tokens) return;
  for (const [metric, count] of Object.entries({ ...tokens, reported: 1 }))
    addDiscoveryUsage(
      s,
      `imports:metrics:${startedAt.slice(0, 7)}:${model}:${metric}`,
      count,
    );
}
function aiMetrics(
  s: State,
  prefix: string,
  requests: number,
  enabled: boolean,
): AiUsage {
  const models = new Map<string, AiUsage["models"][number]>();
  for (const row of s.usage.filter((u) => u.key.startsWith(prefix))) {
    const [model, metric] = row.key.slice(prefix.length).split(":");
    if (!["input", "output", "reported"].includes(metric)) continue;
    const stats = models.get(model) ?? {
      model,
      inputTokens: 0,
      outputTokens: 0,
      reported: 0,
    };
    stats[
      metric === "input"
        ? "inputTokens"
        : metric === "output"
          ? "outputTokens"
          : "reported"
    ] += row.count;
    models.set(model, stats);
  }
  const values = [...models.values()];
  const reported = values.reduce((n, m) => n + m.reported, 0);
  return {
    enabled,
    requests,
    reported,
    unreported: Math.max(0, requests - reported),
    inputTokens: values.reduce((n, m) => n + m.inputTokens, 0),
    outputTokens: values.reduce((n, m) => n + m.outputTokens, 0),
    estimatedUsd:
      (requests > 0 && reported === 0) || values.some((m) => !rates[m.model])
        ? null
        : values.reduce(
            (n, m) =>
              n +
              (m.inputTokens * rates[m.model].input +
                m.outputTokens * rates[m.model].output) /
                1e6,
            0,
          ),
    models: values.sort((a, b) => a.model.localeCompare(b.model)),
  };
}
export function adminUsage(
  s: State,
  cfg: Record<string, string>,
  now = new Date(),
): AdminUsage {
  const month = now.toISOString().slice(0, 7);
  const daily = (service: string) =>
    s.usage
      .filter(
        (u) => u.key.startsWith(`${month}-`) && u.key.endsWith(`:${service}`),
      )
      .reduce((n, u) => n + u.count, 0);
  const discovery = discoveryConfiguration(cfg);
  const usage = discoveryMonthlyUsage(s, now);
  const prefix = `discovery:metrics:${month}:`;
  const searchCalls = s.usage
    .filter((u) => u.key.startsWith(prefix) && u.key.endsWith(":searches"))
    .reduce((n, u) => n + u.count, 0);
  const ai = aiMetrics(s, prefix, usage.searches, discovery.available);
  const suggestions = {
    ...ai,
    quotaSearches: usage.quotaSearches,
    exemptSearches: usage.exemptSearches,
    monthlyLimit: discovery.monthlyLimit,
    searchCalls,
    estimatedUsd:
      ai.estimatedUsd === null ? null : ai.estimatedUsd + searchCalls * 0.01,
  };
  const productDetails = aiMetrics(
    s,
    `imports:metrics:${month}:`,
    daily("openai"),
    productLookupEnabled(cfg) &&
      !!cfg.OPENAI_API_KEY &&
      Number(cfg.PAID_DAILY_LIMIT) > 0,
  );
  const selected = selectedScrapingProvider(cfg);
  const providers = scrapingProviders.map((p) => ({
    id: p.id,
    name: p.name,
    requests: daily(p.id),
    enabled: p.id === selected && Number(cfg.PAID_DAILY_LIMIT) > 0,
  }));
  const scraping = {
    enabled: providers.some((p) => p.enabled),
    requests: providers.reduce((n, p) => n + p.requests, 0),
    providers: providers.filter((p) => p.enabled || p.requests > 0),
  };
  const sms = smsUsage(s, cfg, now);
  return {
    sms,
    month,
    resetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString(),
    pricingAsOf: usagePricingAsOf,
    visible:
      sms.enabled ||
      sms.requests > 0 ||
      [suggestions, productDetails, scraping].some(
        (g) => g.enabled || g.requests > 0,
      ),
    suggestions,
    productDetails,
    scraping,
  };
}
