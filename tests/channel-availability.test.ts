import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectiveConfig } from "../src/server/settings";
import { smsInfo } from "../src/server/sms-provider";
import { telegramInfo, channelFlag } from "../src/server/channel-availability";
import { availableNotificationChannels } from "../src/shared/channel-availability";
import { serviceStatuses } from "../src/server/service-status";
import { command, preferences, stamp } from "../src/server/domain";
import { adminUsage } from "../src/server/usage";
import { emptyState, type SmsAttempt } from "../src/shared/model";
import { wishlistFixture } from "./wishlist-fixture";

const configured = {
  SMS_ENABLED: "true",
  SMS_PROVIDER: "textbelt",
  TEXTBELT_API_KEY: "sms-secret",
  PAID_DAILY_LIMIT: "50",
  TELEGRAM_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: "bot-secret",
  TELEGRAM_BOT_NAME: "test_bot",
  GIFT_DISCOVERY_MODE: "off",
};
beforeEach(() => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("SMS_ENABLED", "false");
  vi.stubEnv("TELEGRAM_ENABLED", "false");
});
afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "", "false", "true"])(
  "requires explicit true for either channel: %s",
  (flag) => {
    const cfg = {
      ...configured,
      SMS_ENABLED: flag ?? "",
      TELEGRAM_ENABLED: flag ?? "",
    };
    expect(smsInfo(cfg).available).toBe(flag === "true");
    expect(telegramInfo(cfg).available).toBe(flag === "true");
    expect(channelFlag(flag, "SMS_ENABLED")).toBe(flag === "true");
  },
);
it.each(["SMS_ENABLED", "TELEGRAM_ENABLED"])(
  "validates %s in both deployments",
  (key) => {
    vi.stubEnv(key, "yes");
    expect(() => effectiveConfig()).toThrow(key);
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv(`STAGING_${key}`, "yes");
    expect(() => effectiveConfig()).toThrow(`STAGING_${key}`);
  },
);
it("requires complete configuration and positive paid allowance for SMS", () => {
  for (const override of [
    { SMS_PROVIDER: "none" },
    { TEXTBELT_API_KEY: "" },
    { PAID_DAILY_LIMIT: "0" },
  ])
    expect(smsInfo({ ...configured, ...override }).available).toBe(false);
  for (const key of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_NAME"])
    expect(telegramInfo({ ...configured, [key]: "" }).available).toBe(false);
  expect(telegramInfo({ ...configured, PAID_DAILY_LIMIT: "0" }).available).toBe(
    true,
  );
});
it("uses only staging credentials and keeps preview isolated even with explicit true", () => {
  for (const [key, value] of Object.entries(configured)) vi.stubEnv(key, value);
  vi.stubEnv("APP_ENV", "staging");
  expect(telegramInfo(effectiveConfig()).available).toBe(false);
  expect(smsInfo(effectiveConfig()).available).toBe(false);
  vi.stubEnv("STAGING_TELEGRAM_ENABLED", "true");
  vi.stubEnv("STAGING_TELEGRAM_BOT_TOKEN", "staging-token");
  vi.stubEnv("STAGING_TELEGRAM_BOT_NAME", "staging_bot");
  vi.stubEnv("STAGING_SMS_ENABLED", "true");
  vi.stubEnv("STAGING_SMS_PROVIDER", "textbelt");
  vi.stubEnv("STAGING_TEXTBELT_API_KEY", "staging-key");
  vi.stubEnv("STAGING_PAID_DAILY_LIMIT", "5");
  const cfg = effectiveConfig();
  expect(cfg.TELEGRAM_BOT_TOKEN).toBe("staging-token");
  expect(telegramInfo(cfg).available).toBe(true);
  expect(smsInfo(cfg).available).toBe(true);
  vi.stubEnv("APP_ENV", "preview");
  expect(telegramInfo(effectiveConfig()).available).toBe(false);
  expect(smsInfo(effectiveConfig()).available).toBe(false);
  expect(effectiveConfig().TELEGRAM_BOT_TOKEN).toBe("");
});
it("distinguishes disabled and incomplete services without exposing secrets", () => {
  const off = serviceStatuses(
    { ...configured, SMS_ENABLED: "false", TELEGRAM_ENABLED: "false" },
    false,
  );
  expect(
    off.filter((s) => ["sms", "telegram"].includes(s.id)).map((s) => s.status),
  ).toEqual(["Off", "Off"]);
  const incomplete = serviceStatuses(
    { ...configured, TELEGRAM_BOT_NAME: "", TEXTBELT_API_KEY: "" },
    false,
  );
  expect(
    incomplete
      .filter((s) => ["sms", "telegram"].includes(s.id))
      .map((s) => s.status),
  ).toEqual(["Not configured", "Not configured"]);
  expect(JSON.stringify(off)).not.toContain("secret");
});
it("filters UI channels without changing saved state", () => {
  expect(availableNotificationChannels({})).toEqual(["push", "email"]);
  expect(
    availableNotificationChannels({
      sms: smsInfo(configured),
      telegram: telegramInfo(configured),
    }),
  ).toEqual(["push", "email", "telegram", "sms"]);
});
it.each([false, true])(
  "preserves dormant choices and legacy topic defaults on save, stale client=%s",
  (stale) => {
    const state = emptyState();
    const actor = { id: "user", email: "user@example.test", name: "User" };
    const prefs = preferences(state, actor);
    Object.assign(prefs, {
      sms: true,
      telegram: true,
      smsLogin: true,
      phoneVerified: true,
      phone: "+12025550123",
      chatId: "123",
      events: ["exchange"],
      notificationDetails: { telegram: true, sms: false },
    });
    state.preferences.push(prefs);
    command(state, actor, "preferences.update", {
      email: false,
      events: ["mention"],
      channelEvents: {
        email: ["mention"],
        ...(stale ? { telegram: [], sms: [] } : {}),
      },
      notificationDetails: {
        email: true,
        ...(stale ? { telegram: false, sms: true } : {}),
      },
      ...(stale ? { telegram: false, sms: false } : {}),
    });
    expect(prefs).toMatchObject({
      email: false,
      telegram: true,
      sms: true,
      smsLogin: true,
      phone: "+12025550123",
      chatId: "123",
      channelEvents: {
        email: ["mention"],
        telegram: ["exchange"],
        sms: ["exchange"],
      },
      notificationDetails: { email: true, telegram: true, sms: false },
    });
    expect(state.smsConsents).toHaveLength(0);
  },
);
it("preserves hidden custom follows but allows explicit inheritance", () => {
  const f = wishlistFixture();
  f.s.follows.push({
    ...stamp(),
    userId: f.reader.id,
    target: "list",
    targetId: f.list.id,
    channels: ["telegram", "email"],
  });
  f.follow("list", f.list.id, { channels: ["push"] });
  expect(f.s.follows[0].channels).toEqual(["push", "telegram"]);
  f.follow("list", f.list.id, { channels: null });
  expect(f.s.follows[0].channels).toBeUndefined();
});
it("only retains current UTC month SMS submissions, never skipped-only history", () => {
  const s = emptyState();
  const off = { ...configured, SMS_ENABLED: "false" };
  const attempt: SmsAttempt = {
    ...stamp(),
    createdAt: "2026-12-31T23:59:59.000Z",
    userId: "u",
    phone: "",
    purpose: "activity",
    provider: "textbelt",
    account: "a",
    reference: "n",
    status: "failed",
    segments: 1,
  };
  s.smsAttempts.push(attempt);
  expect(adminUsage(s, off, new Date("2026-12-31T23:59:59Z")).visible).toBe(
    true,
  );
  const nextMonth = new Date("2027-01-01T00:00:00Z");
  expect(adminUsage(s, off, nextMonth).visible).toBe(false);
  s.smsAttempts.push({
    ...attempt,
    id: "skipped",
    createdAt: nextMonth.toISOString(),
    status: "skipped",
    segments: 0,
  });
  expect(adminUsage(s, off, nextMonth).visible).toBe(false);
  expect(s.smsAttempts).toHaveLength(2);
});
