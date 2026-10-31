import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDecipheriv } from "node:crypto";
vi.mock("node:crypto", async (original) => {
  const actual = await original<typeof import("node:crypto")>();
  return { ...actual, createDecipheriv: vi.fn(actual.createDecipheriv) };
});
import { readSettings } from "../src/server/db";
import { emptyState } from "../src/shared/model";
const storage = vi.hoisted(() => ({
  state: {} as ReturnType<typeof emptyState>,
}));
vi.mock("../src/server/db", () => ({
  readSettings: vi.fn(async () => storage.state.settings),
  transact: vi.fn(async (fn) => fn(storage.state)),
}));
import {
  encrypt,
  automaticallyImportProductPhotos,
  config,
  productPhotoSetting,
  saveSetting,
  saveSettings,
  settingsSummary,
  imageDeliveryForState,
} from "../src/server/settings";
import { validateDeployment } from "../src/server/deployment";
const key = "AUTO_IMPORT_PRODUCT_PHOTOS";
beforeEach(() => {
  storage.state = emptyState();
  vi.clearAllMocks();
  vi.stubEnv("SETTINGS_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv(key, "");
  vi.stubEnv("APP_ENV", "test");
});
afterEach(() => vi.unstubAllEnvs());
describe("automatic product photo preference", () => {
  it("defaults OFF on existing databases and reads each subsequent change", async () => {
    expect(await productPhotoSetting()).toMatchObject({
      value: "false",
      source: "default",
    });
    await saveSetting(key, "true");
    expect(await automaticallyImportProductPhotos()).toBe(true);
    expect(storage.state.settings[0].encrypted).not.toBe("true");
    await saveSetting(key, "false");
    expect(await automaticallyImportProductPhotos()).toBe(false);
    expect(storage.state.settings).toHaveLength(1);
  });
  it.each(["true", "false"])(
    "environment %s wins and prevents writes",
    async (value) => {
      await saveSetting(key, value === "true" ? "false" : "true");
      vi.stubEnv(key, value);
      expect(await productPhotoSetting()).toMatchObject({
        value,
        source: "environment",
      });
      await expect(saveSetting(key, "true")).rejects.toThrow(
        "set on the server",
      );
      vi.stubEnv(key, "");
      expect(await automaticallyImportProductPhotos()).toBe(value !== "true");
    },
  );
  it.each(["", "1", "0", "TRUE", "yes", " false "])(
    "rejects invalid saved value %j",
    async (value) => {
      await expect(saveSetting(key, value)).rejects.toThrow(
        "Choose true or false",
      );
      expect(storage.state.settings).toHaveLength(0);
    },
  );
  it("rejects invalid environment values at startup and at read time", async () => {
    vi.stubEnv(key, "yes");
    expect(() => validateDeployment()).toThrow("AUTO_IMPORT_PRODUCT_PHOTOS");
    await expect(automaticallyImportProductPhotos()).rejects.toThrow(
      "AUTO_IMPORT_PRODUCT_PHOTOS",
    );
  });
  it("never exposes the staging AI secret in the settings summary", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("STAGING_OPENAI_API_KEY", "staging-secret-must-not-leak");
    const summary = await settingsSummary();
    expect(summary.some((setting) => setting.key === "OPENAI_API_KEY")).toBe(
      false,
    );
    expect((await config()).OPENAI_API_KEY).toBe(
      "staging-secret-must-not-leak",
    );
    expect(JSON.stringify(summary)).not.toContain(
      "staging-secret-must-not-leak",
    );
  });
  it("allows the preference in staging without unlocking providers", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("OPENAI_API_KEY", "must-not-use");
    await saveSetting(key, "true");
    expect(await settingsSummary()).toContainEqual(
      expect.objectContaining({ key, value: "true", source: "settings" }),
    );
    expect(await config()).toMatchObject({
      SMTP_HOST: "mailpit",
      OPENAI_API_KEY: "",
      SCRAPING_PROVIDER: "auto",
      PAID_DAILY_LIMIT: "0",
    });
    for (const provider of [
      "SMTP_HOST",
      "OPENAI_API_KEY",
      "SCRAPING_PROVIDER",
      "PAID_DAILY_LIMIT",
    ])
      await expect(saveSetting(provider, "anything")).rejects.toThrow(
        "set on the server",
      );
    vi.stubEnv(key, "false");
    expect(await automaticallyImportProductPhotos()).toBe(false);
    await expect(saveSetting(key, "true")).rejects.toThrow("set on the server");
  });
});

describe("settings read and decryption reuse", () => {
  it("ignores legacy deployment rows without decrypting them", async () => {
    vi.stubEnv("SMTP_HOST", "");
    storage.state.settings.push({
      id: "legacy",
      key: "SMTP_HOST",
      encrypted: "invalid",
      revision: 1,
      createdAt: "",
    });
    expect((await config()).SMTP_HOST).toBe("");
    expect(await settingsSummary()).toHaveLength(4);
    expect(createDecipheriv).not.toHaveBeenCalled();
    expect(readSettings).toHaveBeenCalledTimes(1);
  });
  it("observes application preference updates and deletion", async () => {
    await saveSetting(key, "true");
    expect(await automaticallyImportProductPhotos()).toBe(true);
    storage.state.settings[0].encrypted = encrypt("false");
    expect(await automaticallyImportProductPhotos()).toBe(false);
    storage.state.settings = [];
    expect(await automaticallyImportProductPhotos()).toBe(false);
  });
  it("does not decrypt saved credentials overridden by environment or disabled in staging", async () => {
    storage.state.settings.push({
      id: "saved",
      revision: 1,
      createdAt: new Date().toISOString(),
      key: "SMTP_HOST",
      encrypted: "invalid dormant ciphertext",
    });
    vi.stubEnv("SMTP_HOST", "override.example");
    expect((await config()).SMTP_HOST).toBe("override.example");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("SMTP_HOST", "");
    await settingsSummary();
    expect(createDecipheriv).not.toHaveBeenCalled();
  });
});

describe("product image delivery controls", () => {
  it("defaults on and keeps saved prefetch preference while caching is disabled", async () => {
    expect(imageDeliveryForState(storage.state)).toEqual({
      cacheEnabled: true,
      prefetchEnabled: true,
    });
    await saveSetting("PRODUCT_IMAGE_CACHE_ENABLED", "false");
    expect(imageDeliveryForState(storage.state)).toEqual({
      cacheEnabled: false,
      prefetchEnabled: false,
    });
    await saveSetting("PRODUCT_IMAGE_CACHE_ENABLED", "true");
    expect(imageDeliveryForState(storage.state).prefetchEnabled).toBe(true);
    await saveSetting("PRODUCT_IMAGE_PREFETCH_ENABLED", "false");
    expect(imageDeliveryForState(storage.state)).toEqual({
      cacheEnabled: true,
      prefetchEnabled: false,
    });
  });
  it.each(["PRODUCT_IMAGE_CACHE_ENABLED", "PRODUCT_IMAGE_PREFETCH_ENABLED"])(
    "validates and locks %s overrides",
    async (key) => {
      await expect(saveSetting(key, "yes")).rejects.toThrow("true or false");
      vi.stubEnv(key, "false");
      expect(await settingsSummary()).toContainEqual(
        expect.objectContaining({ key, value: "false", source: "environment" }),
      );
      await expect(saveSetting(key, "true")).rejects.toThrow(
        "set on the server",
      );
      vi.stubEnv(key, "no");
      expect(() => validateDeployment()).toThrow(key);
    },
  );
});

describe("grouped application settings", () => {
  it("saves a photo batch and preserves the preload choice while caching is off", async () => {
    await saveSettings([
      { key, value: "true" },
      { key: "PRODUCT_IMAGE_CACHE_ENABLED", value: "false" },
      { key: "PRODUCT_IMAGE_PREFETCH_ENABLED", value: "true" },
    ]);
    expect(await automaticallyImportProductPhotos()).toBe(true);
    expect(imageDeliveryForState(storage.state)).toEqual({
      cacheEnabled: false,
      prefetchEnabled: false,
    });
    await saveSetting("PRODUCT_IMAGE_CACHE_ENABLED", "true");
    expect(imageDeliveryForState(storage.state).prefetchEnabled).toBe(true);
  });
  it("rejects the whole batch when a later value is invalid or locked", async () => {
    await expect(
      saveSettings([
        { key, value: "true" },
        { key: "PRODUCT_IMAGE_CACHE_ENABLED", value: "bad" },
      ]),
    ).rejects.toThrow();
    expect(storage.state.settings).toHaveLength(0);
    vi.stubEnv("PRODUCT_IMAGE_CACHE_ENABLED", "false");
    await expect(
      saveSettings([
        { key, value: "true" },
        { key: "PRODUCT_IMAGE_CACHE_ENABLED", value: "true" },
      ]),
    ).rejects.toThrow();
    expect(storage.state.settings).toHaveLength(0);
  });
  it("rejects empty batches and duplicate keys", async () => {
    await expect(saveSettings([])).rejects.toThrow();
    await expect(
      saveSettings([
        { key, value: "true" },
        { key, value: "false" },
      ]),
    ).rejects.toThrow();
    expect(storage.state.settings).toHaveLength(0);
  });
});
