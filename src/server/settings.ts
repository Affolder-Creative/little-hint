import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readState, transact } from "./db";
import { stamp, fail } from "./domain";
import { deploymentEnvironment, productPhotoOverride } from "./deployment";
import {
  scrapingSelections,
  selectedScrapingProvider,
} from "../shared/scraping-providers";
export const settingKeys = [
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
  SMTP_PORT: "465",
  SMTP_FROM: "Little Hint <littlehint@example.com>",
  OPENAI_MODEL: "gpt-6-luna",
  PAID_DAILY_LIMIT: "50",
  SCRAPING_PROVIDER: "auto",
};
// A staging database may contain old settings after a branch switch. Never use
// those credentials, or runtime provider credentials, to contact real users.
export function stagingSettings(): Record<SettingKey, string> {
  return Object.fromEntries(
    settingKeys
      .map((k) => [k, ""])
      .concat([
        ["SMTP_HOST", "mailpit"],
        ["SMTP_PORT", "1025"],
        ["SMTP_FROM", "Little Hint staging <staging@example.test>"],
        ["SCRAPING_PROVIDER", "none"],
        ["PAID_DAILY_LIMIT", "0"],
        ["OPENAI_MODEL", defaults.OPENAI_MODEL!],
      ]),
  ) as Record<SettingKey, string>;
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
export async function config(): Promise<Record<SettingKey, string>> {
  if (deploymentEnvironment() === "staging") return stagingSettings();
  const s = await readState();
  return Object.fromEntries(
    settingKeys.map((k) => {
      const v = s.settings.find((v) => v.key === k);
      return [
        k,
        process.env[k] || (v ? decrypt(v.encrypted) : defaults[k]) || "",
      ];
    }),
  ) as Record<SettingKey, string>;
}
export const productPhotoSettingKey = "AUTO_IMPORT_PRODUCT_PHOTOS";

// Application preferences are editable in staging; provider settings are not.
export async function productPhotoSetting() {
  const override = productPhotoOverride();
  const saved =
    override === undefined
      ? (await readState()).settings.find(
          (s) => s.key === productPhotoSettingKey,
        )
      : undefined;
  return {
    key: productPhotoSettingKey,
    configured: override !== undefined || !!saved,
    source:
      override !== undefined ? "environment" : saved ? "settings" : "default",
    default: "false",
    value: String(
      override ?? (saved ? decrypt(saved.encrypted) === "true" : false),
    ),
  };
}

export async function automaticallyImportProductPhotos(): Promise<boolean> {
  return (await productPhotoSetting()).value === "true";
}

export async function settingsSummary() {
  return [await productPhotoSetting(), ...(await integrationSettingsSummary())];
}

async function integrationSettingsSummary() {
  if (deploymentEnvironment() === "staging") {
    const cfg = stagingSettings();
    return settingKeys.map((key) => ({
      key,
      configured: !!cfg[key],
      source: "environment",
      default: cfg[key] || null,
      ...(key === "SCRAPING_PROVIDER"
        ? { value: "none", effectiveProvider: null }
        : {}),
    }));
  }
  const s = await readState();
  const cfg = await config();
  return settingKeys.map((k) => ({
    key: k,
    configured: !!process.env[k] || s.settings.some((v) => v.key === k),
    source: process.env[k]
      ? "environment"
      : s.settings.some((v) => v.key === k)
        ? "settings"
        : "default",
    default: defaults[k] ?? null,
    ...(k === "SCRAPING_PROVIDER"
      ? {
          value: cfg[k],
          effectiveProvider: selectedScrapingProvider(cfg) ?? null,
        }
      : {}),
  }));
}
export async function saveSetting(k: string, value: string) {
  const photoPreference = k === productPhotoSettingKey;
  if (photoPreference && value !== "true" && value !== "false")
    fail(400, "Choose true or false for automatic product photos.");
  if (!photoPreference && deploymentEnvironment() === "staging")
    fail(
      409,
      "Staging integrations are fixed to the private test inbox; external providers are disabled.",
    );
  if (!photoPreference && !settingKeys.includes(k as SettingKey))
    fail(400, "Unknown setting.");
  if (photoPreference ? productPhotoOverride() !== undefined : process.env[k])
    fail(409, "This setting is controlled by an environment variable.");
  if (k === "SCRAPING_PROVIDER" && value && !scrapingSelections.includes(value))
    fail(400, "Choose an available scraping provider.");
  if (k === "PAID_DAILY_LIMIT" && !/^\d{1,6}$/.test(value))
    fail(400, "Use a daily request limit from 0 to 999999.");
  if (k === "SMTP_PORT" && !/^\d{1,5}$/.test(value))
    fail(400, "Use a valid SMTP port.");
  await transact((s) => {
    const existing = s.settings.find((x) => x.key === k);
    if (!value) {
      s.settings = s.settings.filter((x) => x.key !== k);
      return;
    }
    if (existing) {
      existing.encrypted = encrypt(value);
      existing.revision++;
    } else s.settings.push({ ...stamp(), key: k, encrypted: encrypt(value) });
  });
}
export async function spend(service: string) {
  const cfg = await config();
  const limit = Number(cfg.PAID_DAILY_LIMIT);
  await transact((s) => {
    const k = `${new Date().toISOString().slice(0, 10)}:${service}`;
    let row = s.usage.find((u) => u.key === k);
    if (!row) {
      row = { ...stamp(), key: k, count: 0 };
      s.usage.push(row);
    }
    if (!Number.isFinite(limit) || row.count >= limit)
      fail(429, "The integration daily limit has been reached.");
    row.count++;
    row.revision++;
  });
}
