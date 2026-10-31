import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readSettings, transact } from "./db";
import type { Setting, State, Actor } from "../shared/model";
import { stamp, fail, isAdmin } from "./domain";
import {
  imageDeliveryOverride,
  syntheticEnvironment,
  productPhotoOverride,
  familyGroupCreationOverride,
} from "./deployment";
import {
  settingKeys,
  stagingSettings,
  effectiveConfig,
  discoveryConfiguration,
  type SettingKey,
} from "./runtime-config";
export {
  settingKeys,
  stagingSettings,
  effectiveConfig,
  discoveryConfiguration,
  type SettingKey,
} from "./runtime-config";
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
export const imageSettingKeys = [
  "PRODUCT_IMAGE_CACHE_ENABLED",
  "PRODUCT_IMAGE_PREFETCH_ENABLED",
] as const;
const applicationSettingKeys = [
  productPhotoSettingKey,
  familyGroupCreationKey,
  ...imageSettingKeys,
];
function imageSetting(k: string, values: Map<string, string>) {
  const override = imageDeliveryOverride(k);
  const saved = values.get(k);
  return {
    key: k,
    configured: override !== undefined || saved !== undefined,
    source:
      override !== undefined
        ? "environment"
        : saved !== undefined
          ? "settings"
          : "default",
    default: "true",
    value: String(override ?? (saved === undefined || saved === "true")),
  };
}
export function imageDeliveryForState(s: State) {
  const values = settingsValues(s.settings);
  const cacheEnabled =
    imageSetting(imageSettingKeys[0], values).value === "true";
  return {
    cacheEnabled,
    prefetchEnabled:
      cacheEnabled &&
      imageSetting(imageSettingKeys[1], values).value === "true",
  };
}
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
  return [
    photoSetting(values),
    groupCreationSetting(values),
    ...imageSettingKeys.map((k) => imageSetting(k, values)),
  ];
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
  if (imageSettingKeys.some((key) => key === k)) {
    if (value !== "true" && value !== "false")
      fail(400, "Choose true or false for product image delivery.");
    if (imageDeliveryOverride(k) !== undefined)
      fail(409, "This value is set on the server. Change it there instead.");
    return;
  }
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
  await saveSettings([{ key: k, value }]);
}
export async function saveSettings(
  updates: Array<{ key: string; value: string }>,
) {
  if (!updates.length || updates.length > applicationSettingKeys.length)
    fail(400, "Choose between one and four settings to save.");
  if (new Set(updates.map((update) => update.key)).size !== updates.length)
    fail(400, "Each setting can only appear once.");
  for (const update of updates) validateSetting(update.key, update.value);
  await transact((s) => {
    for (const update of updates) validateSetting(update.key, update.value);
    for (const update of updates) applySetting(s, update.key, update.value);
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
