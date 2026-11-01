import { afterEach, expect, it, vi } from "vitest";
import {
  effectiveConfig,
  discoveryConfiguration,
} from "../src/server/runtime-config";
import { serviceStatuses } from "../src/server/service-status";
import { adminUsage } from "../src/server/usage";
import { emptyState } from "../src/shared/model";
import {
  createDiscovery,
  addDiscoveryUsage,
} from "../src/server/gift-discovery";

import { discoveryFixture } from "./gift-discovery-fixture";

afterEach(() => vi.unstubAllEnvs());
it.each([undefined, "", "false", "true"])(
  "requires explicit AI opt-in: %s",
  (flag) => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("AI_ENABLED", flag);
    vi.stubEnv("OPENAI_API_KEY", "retained-key");
    vi.stubEnv("GIFT_DISCOVERY_MODE", "both");
    const cfg = effectiveConfig();
    expect(cfg.OPENAI_API_KEY).toBe("retained-key");
    expect(discoveryConfiguration(cfg).available).toBe(flag === "true");
    expect(serviceStatuses(cfg, false).some((s) => s.id === "product-ai")).toBe(
      flag === "true",
    );
  },
);
it("validates the switch without credentials and isolates staging and preview", () => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("AI_ENABLED", "yes");
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(() => effectiveConfig()).toThrow("AI_ENABLED");
  vi.stubEnv("AI_ENABLED", "true");
  expect(discoveryConfiguration(effectiveConfig()).available).toBe(false);
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("STAGING_AI_ENABLED", "");
  vi.stubEnv("STAGING_OPENAI_API_KEY", "retained-key");
  vi.stubEnv("STAGING_GIFT_DISCOVERY_MODE", "both");
  expect(discoveryConfiguration(effectiveConfig()).available).toBe(false);
  vi.stubEnv("STAGING_AI_ENABLED", "true");
  expect(discoveryConfiguration(effectiveConfig()).available).toBe(true);
  vi.stubEnv("STAGING_AI_ENABLED", "yes");
  expect(() => effectiveConfig()).toThrow("STAGING_AI_ENABLED");
  vi.stubEnv("APP_ENV", "preview");
  expect(effectiveConfig().AI_ENABLED).toBe("false");
});
it("hides AI-only history without deleting it and restores it on opt-in", () => {
  const state = emptyState();
  const now = new Date("2026-10-28T12:00:00Z");
  addDiscoveryUsage(state, "2026-10-01:openai", 2);
  const before = structuredClone(state);
  const cfg = {
    AI_ENABLED: "false",
    OPENAI_API_KEY: "retained-key",
    GIFT_DISCOVERY_MODE: "off",
    SCRAPING_PROVIDER: "none",
  };
  const off = adminUsage(state, cfg, now);
  expect(off).toMatchObject({
    aiEnabled: false,
    visible: false,
    productDetails: { enabled: false, requests: 2 },
  });
  expect(state).toEqual(before);
  expect(adminUsage(state, { ...cfg, AI_ENABLED: "true" }, now)).toMatchObject({
    aiEnabled: true,
    visible: true,
    productDetails: { requests: 2 },
  });
});

it("quota exceptions cannot enable discovery when the master flag is off", () => {
  const f = discoveryFixture();
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv(
    "GIFT_DISCOVERY_USER_OVERRIDES",
    JSON.stringify({
      [f.actors[1].id]: { weeklyLimit: "unlimited", bypassMonthlyLimit: true },
    }),
  );
  const cfg = discoveryConfiguration({
    AI_ENABLED: "false",
    OPENAI_API_KEY: "retained-key",
    GIFT_DISCOVERY_MODE: "both",
  });
  expect(() => createDiscovery(f.state, f.actors[1], cfg, f.input)).toThrow(
    "not enabled",
  );
});
