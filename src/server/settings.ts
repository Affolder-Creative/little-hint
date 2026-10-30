import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readSettings, transact } from "./db";
import type { Setting, State, Actor } from "../shared/model";
import { pruneDiscovery } from "./gift-discovery";
import { discoveryModes, type DiscoveryConfig } from "../shared/gift-discovery";
import { stamp, fail, isAdmin } from "./domain";
import {
  deploymentEnvironment,
  syntheticEnvironment,
  productPhotoOverride,
  familyGroupCreationOverride,
} from "./deployment";
import {
  scrapingSelections,
  selectedScrapingProvider,
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
// AI is the exception: staging accepts only explicitly prefixed runtime settings.
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
      "PAID_DAILY_LIMIT",
    ] as const) {
      result[k] = process.env[`STAGING_${k}`] || result[k];
    }
    if (!/^\d{1,6}$/.test(result.PAID_DAILY_LIMIT))
      throw new Error("Invalid STAGING_PAID_DAILY_LIMIT.");
    discoveryConfiguration(result);
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
function settingsValues(rows: Setting[], onlyApplication = false) {
  if (decodingKey !== process.env.SETTINGS_ENCRYPTION_KEY) {
    decoded.clear();
    decodingKey = process.env.SETTINGS_ENCRYPTION_KEY;
  }
  const next = new Map<string, { encrypted: string; value: string }>();
  for (const row of rows) {
    if (
      !settingKeys.includes(row.key as SettingKey) &&
      !applicationSettingKeys.includes(row.key)
    )
      continue;
    const prior = decoded.get(row.key);
    if (
      (onlyApplication && !applicationSettingKeys.includes(row.key)) ||
      process.env[row.key]
    ) {
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
function effectiveConfig(
  values: Map<string, string>,
): Record<SettingKey, string> {
  if (syntheticEnvironment()) return stagingSettings();
  const result = Object.fromEntries(
    settingKeys.map((k) => [
      k,
      process.env[k] || values.get(k) || defaults[k] || "",
    ]),
  ) as Record<SettingKey, string>;
  discoveryConfiguration(result);
  return result;
}
export async function config(): Promise<Record<SettingKey, string>> {
  if (syntheticEnvironment()) return stagingSettings();
  return effectiveConfig(settingsValues(await readSettings()));
}
// Mutation guards read settings under the same database lock as the mutation.
export function discoveryConfigForState(s: State) {
  if (syntheticEnvironment()) return discoveryConfiguration(stagingSettings());
  return discoveryConfiguration(effectiveConfig(settingsValues(s.settings)));
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
    groupCreationSetting(settingsValues(s.settings, true)).value === "everyone"
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
  return photoSetting(settingsValues(await readSettings(), true));
}
export async function automaticallyImportProductPhotos(): Promise<boolean> {
  return (await productPhotoSetting()).value === "true";
}
export async function settingsSummary() {
  const rows = await readSettings();
  // Staging must not decrypt dormant production integration credentials.
  const values = settingsValues(
    syntheticEnvironment()
      ? rows.filter((s) => applicationSettingKeys.includes(s.key))
      : rows,
  );
  const cfg = effectiveConfig(values);
  const staging = syntheticEnvironment();
  return [
    photoSetting(values),
    groupCreationSetting(values),
    ...settingKeys.map((k) => ({
      key: k,
      configured: staging
        ? !!cfg[k]
        : !!process.env[k] || rows.some((s) => s.key === k),
      source:
        staging || process.env[k]
          ? "environment"
          : rows.some((s) => s.key === k)
            ? "settings"
            : "default",
      default: staging
        ? k === "OPENAI_API_KEY"
          ? null
          : cfg[k] || null
        : (defaults[k] ?? null),
      ...(k.startsWith("GIFT_DISCOVERY_") ? { value: cfg[k] } : {}),
      ...(k === "SCRAPING_PROVIDER"
        ? {
            value: cfg[k],
            effectiveProvider: selectedScrapingProvider(cfg) ?? null,
          }
        : {}),
    })),
  ];
}
function validateSetting(k: string, value: string) {
  const photoPreference = k === productPhotoSettingKey;
  const applicationPreference = applicationSettingKeys.includes(k);
  if (k === familyGroupCreationKey && !["everyone", "admins"].includes(value))
    fail(400, "Choose everyone or administrators for family-group creation.");
  if (photoPreference && value !== "true" && value !== "false")
    fail(400, "Choose true or false for automatic product photos.");
  if (!applicationPreference && syntheticEnvironment())
    fail(
      409,
      deploymentEnvironment() === "staging"
        ? "This test app uses a private email inbox. Configure AI with STAGING_ environment variables on the server; other external services are turned off."
        : "This test app uses a private email inbox. External services are turned off.",
    );
  if (!applicationPreference && !settingKeys.includes(k as SettingKey))
    fail(400, "Unknown setting.");
  if (photoPreference ? productPhotoOverride() !== undefined : process.env[k])
    fail(409, "This value is set on the server. Change it there instead.");
  if (k === "SCRAPING_PROVIDER" && value && !scrapingSelections.includes(value))
    fail(400, "Choose an available service for shop details.");
  if (k === "PAID_DAILY_LIMIT" && !/^\d{1,6}$/.test(value))
    fail(400, "Use a daily request limit from 0 to 999999.");
  if (
    value &&
    k === "GIFT_DISCOVERY_MODE" &&
    !discoveryModes.includes(value as DiscoveryConfig["mode"])
  )
    fail(400, "Choose Off, For others, For own lists, or Both.");
  if (value && /^GIFT_DISCOVERY_.*LIMIT$/.test(k) && !/^\d{1,6}$/.test(value))
    fail(400, "Use a search limit from 0 to 999999.");
  if (
    value &&
    k === "GIFT_DISCOVERY_MODEL" &&
    !/^[a-zA-Z0-9._-]{1,100}$/.test(value)
  )
    fail(400, "Enter a valid model identifier.");
  if (k === "SMTP_PORT" && !/^\d{1,5}$/.test(value))
    fail(400, "Use a valid SMTP port.");
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
    if (k === "GIFT_DISCOVERY_MODE" || k === "OPENAI_API_KEY")
      pruneDiscovery(s, discoveryConfigForState(s));
  });
}
export async function saveDiscoverySettings(
  entries: Array<{ key: string; value: string }>,
) {
  if (
    !entries.length ||
    entries.length > 4 ||
    new Set(entries.map((e) => e.key)).size !== entries.length
  )
    fail(400, "Choose the gift suggestion settings to save.");
  for (const { key, value } of entries) {
    if (
      !settingKeys.includes(key as SettingKey) ||
      !key.startsWith("GIFT_DISCOVERY_")
    )
      fail(400, "Only gift suggestion settings can be saved together.");
    validateSetting(key, value);
  }
  await transact((s) => {
    for (const { key, value } of entries) validateSetting(key, value);
    for (const { key, value } of entries) applySetting(s, key, value);
    pruneDiscovery(s, discoveryConfigForState(s));
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
