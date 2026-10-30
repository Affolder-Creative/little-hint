import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPreviewSeed,
  assertStagingSeed,
  validateDeployment,
  cloudflareWebAnalyticsEnabled,
} from "../src/server/deployment";
import {
  config,
  discoveryConfigForState,
  saveSetting,
} from "../src/server/settings";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { addHouseholdScenario } from "../src/server/household-fixtures";
const env = {
  APP_ENV: "preview",
  NODE_ENV: "production",
  ALLOW_SYNTHETIC_DATA: "1",
  DATABASE_URL:
    "postgresql://little_hint_preview:synthetic@db/little_hint_preview",
  APP_URL: "http://localhost:4567",
  NODE_EXTRA_CA_CERTS: "/run/mailpit-ca.crt",
};
afterEach(() => vi.unstubAllEnvs());
describe("preview boundaries", () => {
  it("requires explicit preview, production runtime, dedicated database and role, and seed consent", () => {
    expect(() => assertPreviewSeed(env)).not.toThrow();
    for (const override of [
      { APP_ENV: "staging" },
      { APP_ENV: "production" },
      { APP_ENV: "" },
      { NODE_ENV: "development" },
      { ALLOW_SYNTHETIC_DATA: "" },
      { DATABASE_URL: "postgres://little_hint_preview:p@db/little_hint" },
      { DATABASE_URL: "postgres://little_hint:p@db/little_hint_preview" },
      {
        DATABASE_URL: "postgres://little_hint_staging:p@db/little_hint_staging",
      },
    ])
      expect(() => assertPreviewSeed({ ...env, ...override })).toThrow();
    expect(() => assertStagingSeed(env)).toThrow();
    expect(() => assertPreviewSeed({ ...env, APP_ENV: "staging" })).toThrow();
  });
  it("allows localhost HTTP and canonical HTTPS origins only", () => {
    for (const APP_URL of [
      "http://localhost:4567",
      "https://some-test.trycloudflare.com",
    ])
      expect(() => validateDeployment({ ...env, APP_URL })).not.toThrow();
    for (const APP_URL of [
      "http://192.168.1.2:4567",
      "http://example.com",
      "https://example.com/path",
      "https://user:secret@example.com",
      "https://example.com/",
      "",
    ])
      expect(() => validateDeployment({ ...env, APP_URL })).toThrow();
    expect(() =>
      validateDeployment({ ...env, NODE_EXTRA_CA_CERTS: "" }),
    ).toThrow();
  });
  it("ignores shell and database providers and disables analytics even if requested", async () => {
    vi.stubEnv("APP_ENV", "preview");
    for (const key of [
      "SMTP_HOST",
      "SMTP_PASS",
      "OPENAI_API_KEY",
      "TWILIO_AUTH_TOKEN",
      "TELEGRAM_BOT_TOKEN",
      "SCRAPINGBEE_API_KEY",
    ])
      vi.stubEnv(key, "must-not-use");
    // config returns before accessing/decrypting the database at all.
    expect(await config()).toMatchObject({
      SMTP_HOST: "mailpit",
      SMTP_PORT: "1025",
      SMTP_PASS: "",
      OPENAI_API_KEY: "",
      TWILIO_AUTH_TOKEN: "",
      TELEGRAM_BOT_TOKEN: "",
      SCRAPINGBEE_API_KEY: "",
      SCRAPING_PROVIDER: "none",
      GIFT_DISCOVERY_MODE: "off",
    });
    const { state } = stagingFixtures();
    state.settings.push({
      id: "old",
      revision: 1,
      createdAt: "",
      key: "OPENAI_API_KEY",
      encrypted: "invalid ciphertext from another installation",
    });
    expect(discoveryConfigForState(state).available).toBe(false);
    expect(
      cloudflareWebAnalyticsEnabled({
        ...env,
        CLOUDFLARE_WEB_ANALYTICS: "true",
      }),
    ).toBe(false);
    await expect(saveSetting("SMTP_HOST", "real.example.com")).rejects.toThrow(
      "set on the server",
    );
  });
  it("reuses household and staging fixtures without losing scenarios", () => {
    const { state, actors } = stagingFixtures();
    addHouseholdScenario(state, actors);
    expect(actors).toHaveLength(5);
    expect(state.groups).toHaveLength(4);
    expect(state.households.length).toBeGreaterThan(0);
    expect(state.exchanges[0].status).toBe("drawn");
    expect(state.reservations.some((r) => r.purchased > 0)).toBe(true);
    expect(state.contributions).toHaveLength(2);
  });
});
