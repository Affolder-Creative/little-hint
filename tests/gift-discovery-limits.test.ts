import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoveryUserOverrides } from "../src/server/gift-discovery-limits";
import { validateDeployment } from "../src/server/deployment";
import {
  addDiscoveryUsage,
  createDiscovery,
  discoveryAllowance,
  discoveryMonthlyUsage,
  quotaKeys,
  startDiscovery,
} from "../src/server/gift-discovery";
import {
  discoveryFixture,
  discoveryConfig as cfg,
} from "./gift-discovery-fixture";

beforeEach(() => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("STAGING_GIFT_DISCOVERY_USER_OVERRIDES", "");
  vi.stubEnv("GIFT_DISCOVERY_USER_OVERRIDES", "");
});
afterEach(() => vi.unstubAllEnvs());
const override = (id: string, policy: unknown) =>
  vi.stubEnv("GIFT_DISCOVERY_USER_OVERRIDES", JSON.stringify({ [id]: policy }));

describe("server-only account allowance configuration", () => {
  it("accepts empty configuration, exact account IDs, partial policies, zero and unlimited", () => {
    expect(discoveryUserOverrides({})).toEqual(new Map());
    expect(
      discoveryUserOverrides({ GIFT_DISCOVERY_USER_OVERRIDES: "  " }),
    ).toEqual(new Map());
    const value = {
      account: { weeklyLimit: 0 },
      another: { weeklyLimit: "unlimited", bypassMonthlyLimit: true },
      third: { bypassMonthlyLimit: false },
      fourth: {},
    };
    const result = discoveryUserOverrides({
      GIFT_DISCOVERY_USER_OVERRIDES: JSON.stringify(value),
    });
    expect(Object.fromEntries(result)).toEqual(value);
    expect(result.get("Account")).toBeUndefined();
    expect(result.get("toString")).toBeUndefined();
  });

  it.each([
    "broken secret-value",
    "null",
    "[]",
    '"account"',
    '{"account":{"weeklyLimit":-1}}',
    '{"account":{"weeklyLimit":1.5}}',
    '{"account":{"weeklyLimit":1000000}}',
    '{"account":{"weeklyLimit":"20"}}',
    '{"account":{"weeklyLimit":null}}',
    '{"account":{"bypassMonthlyLimit":"true"}}',
    '{"account":{"unknown":true}}',
    '{"account":null}',
    '{" ":{}}',
  ])(
    "rejects malformed overrides at startup without echoing their value: %s",
    (raw) => {
      expect(() =>
        validateDeployment({
          APP_ENV: "test",
          GIFT_DISCOVERY_USER_OVERRIDES: raw,
        }),
      ).toThrow("Invalid GIFT_DISCOVERY_USER_OVERRIDES.");
      try {
        discoveryUserOverrides({ GIFT_DISCOVERY_USER_OVERRIDES: raw });
      } catch (error) {
        expect((error as Error).message).not.toContain(raw);
      }
    },
  );
});

describe("per-account allowances", () => {
  it("raises the weekly limit only for the account, retains its usage, and keeps monthly enforcement", () => {
    const f = discoveryFixture(),
      a = f.actors[1],
      keys = quotaKeys(a.id);
    addDiscoveryUsage(f.state, keys.week, 3);
    override(a.id, { weeklyLimit: 20 });
    expect(discoveryAllowance(f.state, a, cfg).weeklyRemaining).toBe(17);
    expect(discoveryAllowance(f.state, f.actors[2], cfg).weeklyRemaining).toBe(
      3,
    );
    addDiscoveryUsage(f.state, keys.month, 100);
    expect(() => createDiscovery(f.state, a, cfg, f.input)).toThrow(
      "allowance",
    );
    override(a.id, { weeklyLimit: "unlimited" });
    expect(() => createDiscovery(f.state, a, cfg, f.input)).toThrow(
      "allowance",
    );
    override(a.id, { weeklyLimit: 0, bypassMonthlyLimit: true });
    expect(() => createDiscovery(f.state, a, cfg, f.input)).toThrow(
      "allowance",
    );
  });

  it("bypasses zero caps explicitly, preserves other users' pool, and counts every exempt reservation once", () => {
    const f = discoveryFixture(),
      a = f.actors[1];
    override(a.id, { weeklyLimit: "unlimited", bypassMonthlyLimit: true });
    const zero = { ...cfg, weeklyLimit: 0, monthlyLimit: 0 };
    for (let i = 0; i < 4; i++) {
      const j = createDiscovery(f.state, a, zero, { ...f.input, fresh: true });
      const first = startDiscovery(f.state, a, zero, j.id);
      expect(first?.monthlyQuotaExempt).toBe(true);
      expect(startDiscovery(f.state, a, zero, j.id)).toBeUndefined();
      j.status = "failed";
    }
    expect(discoveryAllowance(f.state, a, zero)).toMatchObject({
      weeklyRemaining: null,
      monthlyRemaining: null,
    });
    expect(discoveryMonthlyUsage(f.state)).toEqual({
      searches: 4,
      exemptSearches: 4,
      quotaSearches: 0,
    });
    expect(discoveryAllowance(f.state, f.actors[2], cfg).monthlyRemaining).toBe(
      100,
    );
    vi.stubEnv("GIFT_DISCOVERY_USER_OVERRIDES", "");
    expect(discoveryAllowance(f.state, a, cfg)).toMatchObject({
      weeklyRemaining: 0,
      monthlyRemaining: 100,
    });
  });

  it("inherits weekly policy for monthly-only overrides and does not reclassify historical usage", () => {
    const f = discoveryFixture(),
      a = f.actors[1],
      keys = quotaKeys(a.id);
    addDiscoveryUsage(f.state, keys.month, 100);
    override(a.id, { bypassMonthlyLimit: true });
    const j = createDiscovery(f.state, a, cfg, f.input);
    startDiscovery(f.state, a, cfg, j.id);
    expect(discoveryAllowance(f.state, a, cfg)).toMatchObject({
      weeklyRemaining: 2,
      monthlyRemaining: null,
    });
    expect(discoveryMonthlyUsage(f.state)).toEqual({
      searches: 101,
      exemptSearches: 1,
      quotaSearches: 100,
    });
    expect(discoveryAllowance(f.state, f.actors[2], cfg).monthlyRemaining).toBe(
      0,
    );
  });

  it("rechecks policy at worker reservation, preserves privacy and one-active-search enforcement", () => {
    const f = discoveryFixture(),
      a = f.actors[1];
    override(a.id, { weeklyLimit: "unlimited", bypassMonthlyLimit: true });
    for (const disabled of [
      { ...cfg, mode: "off" as const },
      { ...cfg, available: false },
      { ...cfg, mode: "receivers" as const },
    ])
      expect(() => createDiscovery(f.state, a, disabled, f.input)).toThrow(
        "not enabled",
      );
    const j = createDiscovery(f.state, a, cfg, f.input);
    expect(() =>
      createDiscovery(f.state, a, cfg, { ...f.input, maxPriceCents: 6000 }),
    ).toThrow("Wait for");
    override(a.id, { weeklyLimit: 0 });
    expect(() => startDiscovery(f.state, a, cfg, j.id)).toThrow("allowance");
    expect(discoveryMonthlyUsage(f.state).searches).toBe(0);
  });

  it.each(["staging", "preview"])("ignores exceptions in %s", (environment) => {
    const f = discoveryFixture(),
      a = f.actors[1];
    override(a.id, { weeklyLimit: "unlimited", bypassMonthlyLimit: true });
    vi.stubEnv("APP_ENV", environment);
    expect(discoveryAllowance(f.state, a, cfg)).toMatchObject({
      weeklyRemaining: 3,
      monthlyRemaining: 100,
    });
  });

  it("applies staging-specific overrides to requests and worker reservations only in staging", () => {
    const f = discoveryFixture(),
      a = f.actors[1];
    vi.stubEnv(
      "STAGING_GIFT_DISCOVERY_USER_OVERRIDES",
      JSON.stringify({
        [a.id]: { weeklyLimit: "unlimited", bypassMonthlyLimit: true },
      }),
    );
    expect(discoveryAllowance(f.state, a, cfg).weeklyRemaining).toBe(3);
    vi.stubEnv("APP_ENV", "staging");
    const zero = { ...cfg, weeklyLimit: 0, monthlyLimit: 0 };
    const job = createDiscovery(f.state, a, zero, f.input);
    expect(startDiscovery(f.state, a, zero, job.id)?.monthlyQuotaExempt).toBe(
      true,
    );
    expect(discoveryAllowance(f.state, a, zero)).toMatchObject({
      weeklyRemaining: null,
      monthlyRemaining: null,
    });
    expect(discoveryAllowance(f.state, f.actors[2], zero).weeklyRemaining).toBe(
      0,
    );
    expect(() =>
      createDiscovery(f.state, a, { ...zero, mode: "off" }, f.input),
    ).toThrow("not enabled");
    vi.stubEnv("APP_ENV", "preview");
    expect(discoveryAllowance(f.state, a, zero).weeklyRemaining).toBe(0);
  });

  it("validates staging overrides at startup without exposing their value", () => {
    expect(() =>
      validateDeployment({
        APP_ENV: "staging",
        STAGING_GIFT_DISCOVERY_USER_OVERRIDES: "private-invalid-value",
      }),
    ).toThrow("Invalid STAGING_GIFT_DISCOVERY_USER_OVERRIDES.");
    expect(() =>
      discoveryUserOverrides({
        APP_ENV: "staging",
        GIFT_DISCOVERY_USER_OVERRIDES: "ignored-production-value",
      }),
    ).not.toThrow();
    expect(() =>
      discoveryUserOverrides({
        APP_ENV: "preview",
        STAGING_GIFT_DISCOVERY_USER_OVERRIDES: "ignored-staging-value",
        GIFT_DISCOVERY_USER_OVERRIDES: "ignored-production-value",
      }),
    ).not.toThrow();
  });

  it("resets both shared and exempt monthly accounting at UTC boundaries", () => {
    const f = discoveryFixture(),
      a = f.actors[1];
    const before = new Date("2026-11-30T23:59:59Z"),
      after = new Date("2026-12-01T00:00:00Z");
    const keys = quotaKeys(a.id, before);
    addDiscoveryUsage(f.state, keys.month, 110);
    addDiscoveryUsage(f.state, keys.monthExempt, 12);
    addDiscoveryUsage(f.state, keys.week, 2);
    expect(discoveryAllowance(f.state, a, cfg, before)).toMatchObject({
      weeklyRemaining: 1,
      monthlyRemaining: 2,
    });
    expect(discoveryAllowance(f.state, a, cfg, after)).toMatchObject({
      weeklyRemaining: 1,
      monthlyRemaining: 100,
    });
    expect(discoveryMonthlyUsage(f.state, after)).toEqual({
      searches: 0,
      exemptSearches: 0,
      quotaSearches: 0,
    });
    expect(
      discoveryAllowance(f.state, a, cfg, new Date("2026-12-07T00:00:00Z"))
        .weeklyRemaining,
    ).toBe(3);
  });
});
