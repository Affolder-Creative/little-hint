import { afterEach, expect, it, vi } from "vitest";
import { effectiveConfig } from "../src/server/settings";
import { serviceStatuses } from "../src/server/service-status";
afterEach(() => vi.unstubAllEnvs());
it("reports capability requirements without exposing values", () => {
  const cfg = {
    GIFT_DISCOVERY_MODE: "off",
    PAID_DAILY_LIMIT: "50",
    SMTP_HOST: "private-host",
    SMTP_USER: "",
    TELEGRAM_ENABLED: "true",
    SMS_ENABLED: "true",
    TELEGRAM_BOT_TOKEN: "secret",
    TWILIO_ACCOUNT_SID: "secret",
    SCRAPING_PROVIDER: "auto",
  };
  const rows = serviceStatuses(cfg, false);
  expect(rows.find((r) => r.id === "email")?.status).toBe("Configured");
  for (const id of ["telegram", "sms", "push", "product-ai"])
    expect(rows.find((r) => r.id === id)?.status).toBe("Not configured");
  expect(rows.find((r) => r.id === "suggestions")?.status).toBe("Off");
  expect(rows.find((r) => r.id === "shops")?.status).toBe("Direct lookup only");
  expect(JSON.stringify(rows)).not.toMatch(/private-host|secret/);
  const enabled = serviceStatuses(
    {
      ...cfg,
      GIFT_DISCOVERY_MODE: "both",
      OPENAI_API_KEY: "secret",
      SCRAPINGFISH_API_KEY: "secret",
      TELEGRAM_BOT_NAME: "private-bot",
      SMS_PROVIDER: "twilio",
      TWILIO_AUTH_TOKEN: "secret",
      TWILIO_FROM: "private-number",
      TWILIO_VERIFY_SERVICE_SID: "secret",
    },
    true,
  );
  expect(enabled.every((r) => r.status === "Configured")).toBe(true);
  expect(JSON.stringify(enabled)).not.toMatch(/private-|secret/);
});
it.each([
  ["SMTP_PORT", "0"],
  ["SMTP_PORT", "65536"],
  ["PAID_DAILY_LIMIT", "-1"],
  ["SCRAPING_PROVIDER", "unknown"],
  ["GIFT_DISCOVERY_MODE", "invalid"],
  ["GIFT_DISCOVERY_USER_WEEKLY_LIMIT", "-1"],
])("validates effective deployment %s", (key, value) => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv(key, value);
  expect(() => effectiveConfig()).toThrow(key);
});
it("synthetic deployments ignore external services and invalid dormant configuration", () => {
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("OPENAI_API_KEY", "secret");
  vi.stubEnv("SMTP_PORT", "invalid");
  const rows = serviceStatuses(effectiveConfig(), false);
  expect(rows.find((r) => r.id === "email")?.status).toBe("Configured");
  expect(rows.find((r) => r.id === "suggestions")?.status).toBe("Off");
  expect(rows.find((r) => r.id === "shops")?.status).toBe("Direct lookup only");
});

it("requires a password only when SMTP authentication is enabled", () => {
  const cfg = {
    GIFT_DISCOVERY_MODE: "off",
    SMTP_HOST: "host",
    SMTP_USER: "account",
  };
  expect(serviceStatuses(cfg, false)[0].status).toBe("Not configured");
  expect(
    serviceStatuses({ ...cfg, SMTP_PASS: "secret" }, false)[0].status,
  ).toBe("Configured");
});
