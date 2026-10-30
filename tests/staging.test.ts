import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertStagingSeed,
  deploymentEnvironment,
  validateDeployment,
} from "../src/server/deployment";
import {
  scrapingProviders,
  selectedScrapingProvider,
} from "../src/shared/scraping-providers";
import { serviceStatuses } from "../src/server/service-status";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world, giftSummary } from "../src/server/domain";
import {
  config,
  saveSetting,
  discoveryConfigForState,
} from "../src/server/settings";
const env = {
  APP_ENV: "staging",
  NODE_ENV: "production",
  ALLOW_SYNTHETIC_DATA: "1",
  DATABASE_URL:
    "postgresql://little_hint_staging:synthetic@localhost/little_hint_staging",
  APP_URL: "https://staging.example.test",
  NODE_EXTRA_CA_CERTS: "/run/mailpit-ca.crt",
};
afterEach(() => vi.unstubAllEnvs());
describe("staging boundaries", () => {
  it("keeps production defaults and requires explicit staging seed authorization", () => {
    expect(deploymentEnvironment({ NODE_ENV: "production" })).toBe(
      "production",
    );
    expect(() => assertStagingSeed(env)).not.toThrow();
    for (const override of [
      { APP_ENV: "production" },
      { APP_ENV: "" },
      { ALLOW_SYNTHETIC_DATA: "" },
      { DATABASE_URL: "postgresql://little_hint:secret@db/little_hint" },
      {
        DATABASE_URL: "postgresql://little_hint:secret@db/little_hint_staging",
      },
    ]) {
      expect(() => assertStagingSeed({ ...env, ...override })).toThrow();
    }
  });
  it("requires production runtime, HTTPS, and SMTP trust for staging", () => {
    expect(() => validateDeployment(env)).not.toThrow();
    for (const override of [
      { NODE_ENV: "development" },
      { APP_URL: "http://staging.example.test" },
      { NODE_EXTRA_CA_CERTS: "" },
    ])
      expect(() => validateDeployment({ ...env, ...override })).toThrow();
  });
  it("ignores real provider credentials and refuses integration edits in staging", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("SMTP_HOST", "real-mail.example.com");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "must-not-use");
    vi.stubEnv("OPENAI_API_KEY", "must-not-use");
    expect(await config()).toMatchObject({
      SMTP_HOST: "mailpit",
      SMTP_PORT: "1025",
      SMTP_PASS: "",
      TWILIO_AUTH_TOKEN: "",
      OPENAI_API_KEY: "",
      SCRAPING_PROVIDER: "auto",
      PAID_DAILY_LIMIT: "0",
    });
    await expect(
      saveSetting("SMTP_HOST", "real-mail.example.com"),
    ).rejects.toThrow("set on the server");
  });
});
describe("staging AI opt-in", () => {
  it("uses only staging credentials and shares discovery configuration with transaction guards", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_OPENAI_API_KEY", "staging-test-key");
    vi.stubEnv("OPENAI_API_KEY", "production-must-not-use");
    vi.stubEnv("STAGING_GIFT_DISCOVERY_MODE", "both");
    vi.stubEnv("STAGING_GIFT_DISCOVERY_MONTHLY_LIMIT", "20");
    vi.stubEnv("STAGING_PAID_DAILY_LIMIT", "10");
    vi.stubEnv("SMTP_HOST", "real.example.com");
    vi.stubEnv("SCRAPINGBEE_API_KEY", "must-not-use");
    expect(await config()).toMatchObject({
      OPENAI_API_KEY: "staging-test-key",
      GIFT_DISCOVERY_MODE: "both",
      GIFT_DISCOVERY_MONTHLY_LIMIT: "20",
      PAID_DAILY_LIMIT: "10",
      SMTP_HOST: "mailpit",
      SCRAPINGBEE_API_KEY: "",
      SCRAPING_PROVIDER: "auto",
    });
    const { state } = stagingFixtures();
    expect(discoveryConfigForState(state)).toMatchObject({
      available: true,
      mode: "both",
      monthlyLimit: 20,
    });
    vi.stubEnv("STAGING_OPENAI_API_KEY", "");
    expect(discoveryConfigForState(state).available).toBe(false);
    expect((await config()).PAID_DAILY_LIMIT).toBe("0");
  });
  it("keeps preview isolated even with a staging key and validates staging limits", async () => {
    vi.stubEnv("STAGING_OPENAI_API_KEY", "staging-test-key");
    vi.stubEnv("STAGING_GIFT_DISCOVERY_MODE", "both");
    vi.stubEnv("APP_ENV", "preview");
    expect(await config()).toMatchObject({
      OPENAI_API_KEY: "",
      GIFT_DISCOVERY_MODE: "off",
    });
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_PAID_DAILY_LIMIT", "invalid");
    await expect(config()).rejects.toThrow("STAGING_PAID_DAILY_LIMIT");
    vi.stubEnv("STAGING_PAID_DAILY_LIMIT", "10");
    vi.stubEnv("STAGING_GIFT_DISCOVERY_MONTHLY_LIMIT", "invalid");
    await expect(config()).rejects.toThrow("GIFT_DISCOVERY_MONTHLY_LIMIT");
  });
});
describe("representative staging fixtures", () => {
  it("provides synthetic accounts, scoped groups, and real domain workflows", () => {
    const { actors, state } = stagingFixtures();
    expect(actors).toHaveLength(5);
    expect(actors.every((a) => a.email.endsWith("@example.test"))).toBe(true);
    expect(state.people.filter((p) => p.admin)).toHaveLength(1);
    expect(state.settings).toHaveLength(0);
    expect(state.groups).toHaveLength(2);
    expect(state.exchanges[0].status).toBe("drawn");
    expect(state.groupEvents).toHaveLength(1);
    expect(state.contributions.map((c) => c.status).sort()).toEqual([
      "pledged",
      "received",
    ]);
    const alex = world(state, actors[0]);
    const taylor = world(state, actors[4]);
    expect(taylor.groups.map((g) => g.name)).toEqual(["Weekend friends"]);
    const gift = state.items.find((i) => i.title === "Ceramic pour-over set")!;
    const ownGift = alex.items.find((i) => i.id === gift.id)!;
    expect(ownGift).toBeDefined();
    expect(ownGift.reservations).toBeUndefined();
    expect(ownGift.reserved).toBeUndefined();
    const revealed = state.lists.find((l) => l.name === "Last birthday")!;
    expect(revealed.archived).toBe(true);
    expect(giftSummary(state, actors[0], revealed.id).gifts).toHaveLength(1);
    expect(() => giftSummary(state, actors[4], revealed.id)).toThrow();
  });
});

describe("staging scraping opt-in", () => {
  it.each(scrapingProviders)(
    "enables $id without AI using only its staging key",
    async (provider) => {
      vi.stubEnv("APP_ENV", "staging");
      vi.stubEnv("STAGING_OPENAI_API_KEY", "");
      vi.stubEnv("STAGING_SCRAPING_PROVIDER", "auto");
      vi.stubEnv("STAGING_PAID_DAILY_LIMIT", "10");
      for (const p of scrapingProviders) {
        vi.stubEnv(p.key, "production-must-not-use");
        vi.stubEnv(
          `STAGING_${p.key}`,
          p.id === provider.id ? "staging-key" : "",
        );
      }
      const cfg = await config();
      expect(selectedScrapingProvider(cfg)).toBe(provider.id);
      expect(cfg.OPENAI_API_KEY).toBe("");
      expect(cfg.PAID_DAILY_LIMIT).toBe("10");
      expect(
        serviceStatuses(cfg, false).find((r) => r.id === "shops"),
      ).toMatchObject({ status: "Configured", detail: provider.name });
      expect(JSON.stringify(cfg)).not.toContain("production-must-not-use");
      vi.stubEnv("STAGING_SCRAPING_PROVIDER", provider.id);
      expect(selectedScrapingProvider(await config())).toBe(provider.id);
      vi.stubEnv("APP_ENV", "preview");
      const preview = await config();
      expect(preview[provider.key]).toBe("");
      expect(selectedScrapingProvider(preview)).toBeUndefined();
      expect(preview.PAID_DAILY_LIMIT).toBe("0");
    },
  );
  it("respects selection, missing keys, limits, and disabling", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_OPENAI_API_KEY", "");
    for (const p of scrapingProviders) vi.stubEnv(`STAGING_${p.key}`, "");
    vi.stubEnv("SCRAPINGFISH_API_KEY", "production-must-not-use");
    vi.stubEnv("SCRAPING_PROVIDER", "scrapingfish");
    vi.stubEnv("STAGING_SCRAPING_PROVIDER", "auto");
    expect(selectedScrapingProvider(await config())).toBeUndefined();
    vi.stubEnv("STAGING_SCRAPINGFISH_API_KEY", "fish-key");
    vi.stubEnv("STAGING_SCRAPINGBEE_API_KEY", "bee-key");
    vi.stubEnv("STAGING_PAID_DAILY_LIMIT", "10");
    expect(selectedScrapingProvider(await config())).toBe("scrapingfish");
    vi.stubEnv("STAGING_SCRAPING_PROVIDER", "scrapingbee");
    expect(selectedScrapingProvider(await config())).toBe("scrapingbee");
    for (const selection of ["none", "scrapedo"]) {
      vi.stubEnv("STAGING_SCRAPING_PROVIDER", selection);
      expect(selectedScrapingProvider(await config())).toBeUndefined();
    }
    vi.stubEnv("STAGING_SCRAPING_PROVIDER", "auto");
    vi.stubEnv("STAGING_PAID_DAILY_LIMIT", "0");
    expect(
      serviceStatuses(await config(), false).find((r) => r.id === "shops")
        ?.status,
    ).toBe("Direct lookup only");
    vi.stubEnv("STAGING_PAID_DAILY_LIMIT", "invalid");
    await expect(config()).rejects.toThrow("STAGING_PAID_DAILY_LIMIT");
    vi.stubEnv("STAGING_SCRAPING_PROVIDER", "unknown");
    await expect(config()).rejects.toThrow("STAGING_SCRAPING_PROVIDER");
    vi.stubEnv("APP_ENV", "preview");
    expect((await config()).SCRAPING_PROVIDER).toBe("none");
  });
});
