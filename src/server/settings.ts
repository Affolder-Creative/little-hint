import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readSettings, transact } from "./db";
import type { Setting, State, Actor } from "../shared/model";
import { discoveryModes, type DiscoveryConfig } from "../shared/gift-discovery";
import { stamp, fail, isAdmin } from "./domain";
import {
  deploymentEnvironment,
  syntheticEnvironment,
  productPhotoOverride,
  familyGroupCreationOverride,
} from "./deployment";
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
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_NAME",
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
  SMTP_PORT: "465",
  SMTP_FROM: "Little Hint <littlehint@example.com>",
  OPENAI_MODEL: "gpt-6-luna",
  PAID_DAILY_LIMIT: "50",
  SCRAPING_PROVIDER: "auto",
};
// A staging database may contain old settings after a branch switch. Never use
// those credentials, or runtime provider credentials, to contact real users.
// AI and scraping accept only explicitly prefixed staging runtime settings.
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
    result.SCRAPING_PROVIDER = process.env.STAGING_SCRAPING_PROVIDER || "auto";
    if (!scrapingSelections.includes(result.SCRAPING_PROVIDER))
      throw new Error("Invalid STAGING_SCRAPING_PROVIDER.");
    for (const provider of scrapingProviders)
      result[provider.key] = process.env[`STAGING_${provider.key}`] || "";
    if (result.OPENAI_API_KEY || scrapingProviders.some((p) => result[p.key])) {
      result.PAID_DAILY_LIMIT = process.env.STAGING_PAID_DAILY_LIMIT || "0";
      if (!/^\d{1,6}$/.test(result.PAID_DAILY_LIMIT))
        throw new Error("Invalid STAGING_PAID_DAILY_LIMIT.");
    }
  }
  return result;
}
const key = () => {
  const b = Buffer.from(process.env.SETTINGS_ENCRYPTION_KEY ?? "", "base64");
  if (b.length !== 32)
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY must be 32 random bytes in base64.",
    );
  return b;
};
export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decrypt(value: string) {
  const b = Buffer.from(value, "base64");
  const c = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  c.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([c.update(b.subarray(28)), c.final()]).toString("utf8");
}
// Only decoded values are memoized. Every operation first reads committed rows,
// so a change made by the API is visible to the worker without TTL staleness.
let decoded = new Map<string, { encrypted: string; value: string }>();
let decodingKey: string | undefined;
function settingsValues(rows: Setting[]) {
  if (decodingKey !== process.env.SETTINGS_ENCRYPTION_KEY) {
    decoded.clear();
    decodingKey = process.env.SETTINGS_ENCRYPTION_KEY;
  }
  const next = new Map<string, { encrypted: string; value: string }>();
  for (const row of rows) {
    if (!applicationSettingKeys.includes(row.key)) continue;
    const prior = decoded.get(row.key);
    if (process.env[row.key]) {
      if (prior?.encrypted === row.encrypted) next.set(row.key, prior);
      continue;
    }
    next.set(
      row.key,
      prior?.encrypted === row.encrypted
        ? prior
        : {
            encrypted: row.encrypted,
            value: decrypt(row.encrypted),
          },
    );
  }
  decoded = next;
  return new Map([...next].map(([k, v]) => [k, v.value]));
}
export function effectiveConfig(): Record<SettingKey, string> {
  if (syntheticEnvironment()) return stagingSettings();
  const result = Object.fromEntries(
    settingKeys.map((k) => [k, process.env[k] || defaults[k] || ""]),
  ) as Record<SettingKey, string>;
  discoveryConfiguration(result);
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
export async function config(): Promise<Record<SettingKey, string>> {
  if (syntheticEnvironment()) return stagingSettings();
  return effectiveConfig();
}
// Keep the state-based interface used by mutation guards; configuration is ENV-only.
export function discoveryConfigForState(_s: State) {
  if (syntheticEnvironment()) return discoveryConfiguration(stagingSettings());
  return discoveryConfiguration(effectiveConfig());
}
export const productPhotoSettingKey = "AUTO_IMPORT_PRODUCT_PHOTOS";
export const familyGroupCreationKey = "FAMILY_GROUP_CREATION";
const applicationSettingKeys = [productPhotoSettingKey, familyGroupCreationKey];
function groupCreationSetting(values: Map<string, string>) {
  const override = familyGroupCreationOverride();
  const saved = values.get(familyGroupCreationKey);
  return {
    key: familyGroupCreationKey,
    configured: override !== undefined || saved !== undefined,
    source:
      override !== undefined
        ? "environment"
        : saved !== undefined
          ? "settings"
          : "default",
    default: "everyone",
    value: override ?? saved ?? "everyone",
  };
}
export function canCreateGroups(s: State, actor: Actor) {
  return (
    isAdmin(s, actor) ||
    groupCreationSetting(settingsValues(s.settings)).value === "everyone"
  );
}
function photoSetting(values: Map<string, string>) {
  const override = productPhotoOverride();
  const saved = values.has(productPhotoSettingKey);
  return {
    key: productPhotoSettingKey,
    configured: override !== undefined || saved,
    source:
      override !== undefined ? "environment" : saved ? "settings" : "default",
    default: "false",
    value: String(override ?? values.get(productPhotoSettingKey) === "true"),
  };
}
// Application preferences are editable in staging; provider settings are not.
export async function productPhotoSetting() {
  const override = productPhotoOverride();
  if (override !== undefined) return photoSetting(new Map());
  return photoSetting(settingsValues(await readSettings()));
}
export async function automaticallyImportProductPhotos(): Promise<boolean> {
  return (await productPhotoSetting()).value === "true";
}
export async function settingsSummary() {
  const values = settingsValues(await readSettings());
  return [photoSetting(values), groupCreationSetting(values)];
}
function validateSetting(k: string, value: string) {
  if (!applicationSettingKeys.includes(k)) {
    if (settingKeys.includes(k as SettingKey))
      fail(409, "This value is set on the server. Change it there instead.");
    fail(400, "Unknown setting.");
  }
  if (k === familyGroupCreationKey && !["everyone", "admins"].includes(value))
    fail(400, "Choose everyone or administrators for family-group creation.");
  if (k === productPhotoSettingKey && value !== "true" && value !== "false")
    fail(400, "Choose true or false for automatic product photos.");
  const locked =
    k === productPhotoSettingKey
      ? productPhotoOverride() !== undefined
      : familyGroupCreationOverride() !== undefined;
  if (locked)
    fail(409, "This value is set on the server. Change it there instead.");
}
function applySetting(s: State, k: string, value: string) {
  const existing = s.settings.find((x) => x.key === k);
  if (!value) {
    s.settings = s.settings.filter((x) => x.key !== k);
  } else if (existing) {
    existing.encrypted = encrypt(value);
    existing.revision++;
  } else s.settings.push({ ...stamp(), key: k, encrypted: encrypt(value) });
}
export async function saveSetting(k: string, value: string) {
  validateSetting(k, value);
  await transact((s) => {
    validateSetting(k, value);
    applySetting(s, k, value);
  });
}
export async function spend(service: string) {
  const cfg = await config();
  const limit = Number(cfg.PAID_DAILY_LIMIT);
  const startedAt = new Date().toISOString();
  await transact((s) => {
    const k = `${startedAt.slice(0, 10)}:${service}`;
    let row = s.usage.find((u) => u.key === k);
    if (!row) {
      row = { ...stamp(), key: k, count: 0 };
      s.usage.push(row);
    }
    if (!Number.isFinite(limit) || row.count >= limit)
      fail(
        429,
        "The daily limit for paid requests has been reached. Try again tomorrow or ask the app administrator to review the limit.",
      );
    row.count++;
    row.revision++;
  });
  return startedAt;
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
