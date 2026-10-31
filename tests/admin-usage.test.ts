import { describe, expect, it } from "vitest";
import { emptyState } from "../src/shared/model";
import { addDiscoveryUsage, quotaKeys } from "../src/server/gift-discovery";
import {
  adminUsage,
  recordProductTokens,
  returnedTokens,
} from "../src/server/usage";
const now = new Date("2026-10-28T12:00:00Z");
const cfg = {
  GIFT_DISCOVERY_MODE: "off",
  GIFT_DISCOVERY_MODEL: "gpt-6-luna",
  PAID_DAILY_LIMIT: "50",
  SCRAPING_PROVIDER: "none",
};
it("hides unused disabled services and reveals enabled empty services", () => {
  const s = emptyState();
  expect(adminUsage(s, cfg, now).visible).toBe(false);
  const report = adminUsage(
    s,
    { ...cfg, SCRAPING_PROVIDER: "auto", OPENAI_API_KEY: "secret" },
    now,
  );
  expect(report.visible).toBe(true);
  expect(report.productDetails).toMatchObject({
    enabled: true,
    requests: 0,
    estimatedUsd: 0,
  });
  expect(report.suggestions.enabled).toBe(false);
  expect(JSON.stringify(report)).not.toContain("secret");
});
it("aggregates feature usage without counting web searches as shop lookups", () => {
  const s = emptyState();
  const keys = quotaKeys("actor", now);
  for (const [key, count] of [
    [keys.month, 5],
    [keys.monthExempt, 2],
    ["discovery:metrics:2026-10:gpt-6-luna:reported", 4],
    ["discovery:metrics:2026-10:gpt-6-luna:searches", 8],
    ["2026-10-01:openai", 3],
    ["2026-10-28:scrapingfish", 2],
    ["2026-09-30:scrapingfish", 9],
    ["2026-10-28:telegram", 8],
  ] as const)
    addDiscoveryUsage(s, key, count);
  recordProductTokens(s, now.toISOString(), "gpt-6-luna", {
    input_tokens: 100,
    output_tokens: 50,
  });
  const report = adminUsage(s, cfg, now);
  expect(report.suggestions).toMatchObject({
    requests: 5,
    quotaSearches: 3,
    exemptSearches: 2,
    searchCalls: 8,
    unreported: 1,
  });
  expect(report.productDetails).toMatchObject({
    requests: 3,
    reported: 1,
    unreported: 2,
    inputTokens: 100,
    outputTokens: 50,
    estimatedUsd: 0.000035,
  });
  expect(report.scraping).toMatchObject({
    requests: 2,
    enabled: false,
    providers: [{ id: "scrapingfish", requests: 2 }],
  });
  expect(report.visible).toBe(true);
  expect(report.resetsAt).toBe("2026-11-01T00:00:00.000Z");
});
it("keeps missing historical tokens and unknown model costs unavailable", () => {
  const s = emptyState();
  addDiscoveryUsage(s, "2026-10-01:openai", 3);
  expect(adminUsage(s, cfg, now).productDetails.estimatedUsd).toBeNull();
  recordProductTokens(s, now.toISOString(), "unpriced-model", {
    input_tokens: 1,
    output_tokens: 2,
  });
  expect(adminUsage(s, cfg, now).productDetails).toMatchObject({
    estimatedUsd: null,
    reported: 1,
    unreported: 2,
  });
});
it("attributes tokens to the request month, including a December boundary", () => {
  const s = emptyState();
  recordProductTokens(s, "2026-12-31T23:59:59Z", "gpt-6-luna", {
    input_tokens: 10,
    output_tokens: 3,
  });
  expect(
    adminUsage(s, cfg, new Date("2027-01-01T00:00:01Z")).productDetails
      .inputTokens,
  ).toBe(0);
  expect(adminUsage(s, cfg, new Date("2026-12-31T23:59:59Z")).resetsAt).toBe(
    "2027-01-01T00:00:00.000Z",
  );
});
describe("returned usage", () => {
  it.each([
    undefined,
    null,
    {},
    { input_tokens: -1, output_tokens: 2 },
    { input_tokens: "12", output_tokens: 2 },
    { input_tokens: 1.5, output_tokens: 2 },
  ])("does not fabricate missing or invalid tokens: %j", (value) =>
    expect(returnedTokens(value)).toBeNull(),
  );
  it("accepts explicitly reported zero tokens", () =>
    expect(returnedTokens({ input_tokens: 0, output_tokens: 0 })).toEqual({
      input: 0,
      output: 0,
    }));
});
