import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readState, transact } from "./db";
import { stamp, fail } from "./domain";
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
  "PAID_DAILY_LIMIT",
] as const;
export type SettingKey = (typeof settingKeys)[number];
const defaults: Partial<Record<SettingKey, string>> = {
  SMTP_PORT: "465",
  SMTP_FROM: "Little Hint <littlehint@example.com>",
  OPENAI_MODEL: "gpt-6-luna",
  PAID_DAILY_LIMIT: "50",
};
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
export async function settingsSummary() {
  const s = await readState();
  return settingKeys.map((k) => ({
    key: k,
    configured: !!process.env[k] || s.settings.some((v) => v.key === k),
    source: process.env[k]
      ? "environment"
      : s.settings.some((v) => v.key === k)
        ? "settings"
        : "default",
    default: defaults[k] ?? null,
  }));
}
export async function saveSetting(k: string, value: string) {
  if (!settingKeys.includes(k as SettingKey)) fail(400, "Unknown setting.");
  if (process.env[k])
    fail(409, "This setting is controlled by an environment variable.");
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
