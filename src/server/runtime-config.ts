import { channelFlag } from "./channel-availability";
import { discoveryModes, type DiscoveryConfig } from "../shared/gift-discovery";
import { deploymentEnvironment, syntheticEnvironment } from "./deployment";
import {
  scrapingProviders,
  scrapingSelections,
} from "../shared/scraping-providers";

export const settingKeys = [
  "GIFT_DISCOVERY_MODE",
  "GIFT_DISCOVERY_USER_WEEKLY_LIMIT",
  "GIFT_DISCOVERY_MONTHLY_LIMIT",
  "GIFT_DISCOVERY_MODEL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "TELEGRAM_ENABLED",
  "SMS_ENABLED",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_NAME",
  "SMS_PROVIDER",
  "TEXTBELT_API_KEY",
  "SMS_MONTHLY_LIMIT",
  "SMS_USER_DAILY_LIMIT",
  "SMS_CREDIT_RESERVE",
  "SMS_ALLOWED_EVENTS",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM",
  "TWILIO_VERIFY_SERVICE_SID",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "SCRAPINGBEE_API_KEY",
  "SCRAPINGFISH_API_KEY",
  "SCRAPEDO_API_KEY",
  "SCRAPINGDOG_API_KEY",
  "SCRAPING_PROVIDER",
  "PAID_DAILY_LIMIT",
] as const;
export type SettingKey = (typeof settingKeys)[number];
const defaults: Partial<Record<SettingKey, string>> = {
  GIFT_DISCOVERY_MODE: "givers",
  GIFT_DISCOVERY_USER_WEEKLY_LIMIT: "3",
  GIFT_DISCOVERY_MONTHLY_LIMIT: "100",
  GIFT_DISCOVERY_MODEL: "gpt-6-luna",
  SMS_ENABLED: "false",
  TELEGRAM_ENABLED: "false",
  SMS_PROVIDER: "none",
  SMS_MONTHLY_LIMIT: "100",
  SMS_USER_DAILY_LIMIT: "2",
  SMS_CREDIT_RESERVE: "20",
  SMS_ALLOWED_EVENTS: "exchange,access",
  SMTP_PORT: "465",
  SMTP_FROM: "Little Hint <littlehint@example.com>",
  OPENAI_MODEL: "gpt-6-luna",
  PAID_DAILY_LIMIT: "50",
  SCRAPING_PROVIDER: "auto",
};
// A staging database may contain old settings after a branch switch. Never use
// those credentials, or runtime provider credentials, to contact real users.
// Paid providers accept only explicitly prefixed staging runtime settings.
export function stagingSettings(): Record<SettingKey, string> {
  const result = Object.fromEntries(
    settingKeys
      .map((k) => [k, ""])
      .concat([
        ["GIFT_DISCOVERY_MODE", "off"],
        ["GIFT_DISCOVERY_USER_WEEKLY_LIMIT", "3"],
        ["GIFT_DISCOVERY_MONTHLY_LIMIT", "100"],
        ["GIFT_DISCOVERY_MODEL", "gpt-6-luna"],
        ["SMTP_HOST", "mailpit"],
        ["SMTP_PORT", "1025"],
        [
          "SMTP_FROM",
          deploymentEnvironment() === "preview"
            ? "Little Hint preview <preview@example.test>"
            : "Little Hint staging <staging@example.test>",
        ],
        ["SCRAPING_PROVIDER", "none"],
        ["PAID_DAILY_LIMIT", "0"],
        ["OPENAI_MODEL", defaults.OPENAI_MODEL!],
      ]),
  ) as Record<SettingKey, string>;
  if (
    deploymentEnvironment() === "staging" &&
    process.env.STAGING_OPENAI_API_KEY
  ) {
    result.OPENAI_API_KEY = process.env.STAGING_OPENAI_API_KEY;
    for (const k of [
      "OPENAI_MODEL",
      "GIFT_DISCOVERY_MODE",
      "GIFT_DISCOVERY_MODEL",
      "GIFT_DISCOVERY_USER_WEEKLY_LIMIT",
      "GIFT_DISCOVERY_MONTHLY_LIMIT",
    ] as const) {
      result[k] = process.env[`STAGING_${k}`] || result[k];
    }
    discoveryConfiguration(result);
  }
  if (deploymentEnvironment() === "staging") {
    for (const k of settingKeys.filter(
      (k) =>
        k.startsWith("SMS_") ||
        k.startsWith("TELEGRAM_") ||
        k.startsWith("TWILIO_") ||
        k === "TEXTBELT_API_KEY",
    ))
      result[k] = process.env[`STAGING_${k}`] || defaults[k] || "";
    result.SCRAPING_PROVIDER = process.env.STAGING_SCRAPING_PROVIDER || "auto";
    if (!scrapingSelections.includes(result.SCRAPING_PROVIDER))
      throw new Error("Invalid STAGING_SCRAPING_PROVIDER.");
    for (const provider of scrapingProviders)
      result[provider.key] = process.env[`STAGING_${provider.key}`] || "";
    if (
      result.OPENAI_API_KEY ||
      result.SMS_PROVIDER !== "none" ||
      scrapingProviders.some((p) => result[p.key])
    ) {
      result.PAID_DAILY_LIMIT = process.env.STAGING_PAID_DAILY_LIMIT || "0";
      if (!/^\d{1,6}$/.test(result.PAID_DAILY_LIMIT))
        throw new Error("Invalid STAGING_PAID_DAILY_LIMIT.");
    }
  }
  validateChannelFlags(
    result,
    deploymentEnvironment() === "staging" ? "STAGING_" : "",
  );
  validateSmsConfig(result);
  return result;
}
export function effectiveConfig(): Record<SettingKey, string> {
  if (syntheticEnvironment()) return stagingSettings();
  const result = Object.fromEntries(
    settingKeys.map((k) => [k, process.env[k] || defaults[k] || ""]),
  ) as Record<SettingKey, string>;
  discoveryConfiguration(result);
  validateChannelFlags(result);
  validateSmsConfig(result);
  if (!scrapingSelections.includes(result.SCRAPING_PROVIDER))
    throw new Error("Invalid SCRAPING_PROVIDER.");
  if (!/^\d{1,6}$/.test(result.PAID_DAILY_LIMIT))
    throw new Error("Invalid PAID_DAILY_LIMIT.");
  if (
    !/^\d+$/.test(result.SMTP_PORT) ||
    Number(result.SMTP_PORT) < 1 ||
    Number(result.SMTP_PORT) > 65535
  )
    throw new Error("Invalid SMTP_PORT.");
  return result;
}
export function discoveryConfiguration(
  cfg: Record<string, string>,
): DiscoveryConfig {
  const mode = cfg.GIFT_DISCOVERY_MODE || defaults.GIFT_DISCOVERY_MODE!;
  if (!discoveryModes.includes(mode as DiscoveryConfig["mode"]))
    throw new Error("Invalid GIFT_DISCOVERY_MODE.");
  for (const key of [
    "GIFT_DISCOVERY_USER_WEEKLY_LIMIT",
    "GIFT_DISCOVERY_MONTHLY_LIMIT",
  ] as const)
    if (!/^\d{1,6}$/.test(cfg[key] || defaults[key]!))
      throw new Error(`Invalid ${key}.`);
  const model = cfg.GIFT_DISCOVERY_MODEL || defaults.GIFT_DISCOVERY_MODEL!;
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model))
    throw new Error("Invalid GIFT_DISCOVERY_MODEL.");
  return {
    mode: mode as DiscoveryConfig["mode"],
    available: mode !== "off" && !!cfg.OPENAI_API_KEY,
    weeklyLimit: Number(
      cfg.GIFT_DISCOVERY_USER_WEEKLY_LIMIT ||
        defaults.GIFT_DISCOVERY_USER_WEEKLY_LIMIT,
    ),
    monthlyLimit: Number(
      cfg.GIFT_DISCOVERY_MONTHLY_LIMIT || defaults.GIFT_DISCOVERY_MONTHLY_LIMIT,
    ),
    model,
  };
}

function validateSmsConfig(cfg: Record<string, string>) {
  if (!["none", "textbelt", "twilio"].includes(cfg.SMS_PROVIDER || "none"))
    throw new Error("Invalid SMS_PROVIDER.");
  for (const k of [
    "SMS_MONTHLY_LIMIT",
    "SMS_USER_DAILY_LIMIT",
    "SMS_CREDIT_RESERVE",
  ])
    if (cfg[k] && !/^\d{1,6}$/.test(cfg[k])) throw new Error(`Invalid ${k}.`);
  if (
    (cfg.SMS_ALLOWED_EVENTS || "")
      .split(",")
      .filter(Boolean)
      .some(
        (v) =>
          ![
            "exchange",
            "access",
            "reservation",
            "purchase",
            "discussion",
          ].includes(v),
      )
  )
    throw new Error("Invalid SMS_ALLOWED_EVENTS.");
}

function validateChannelFlags(cfg: Record<string, string>, prefix = "") {
  for (const key of ["SMS_ENABLED", "TELEGRAM_ENABLED"])
    cfg[key] = String(channelFlag(cfg[key], `${prefix}${key}`));
}
