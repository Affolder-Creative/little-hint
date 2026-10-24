import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyState } from "../src/shared/model";
const storage = vi.hoisted(() => ({
  state: {} as ReturnType<typeof emptyState>,
}));
vi.mock("../src/server/db", () => ({
  readState: vi.fn(async () => storage.state),
  transact: vi.fn(async (fn) => fn(storage.state)),
}));
import {
  automaticallyImportProductPhotos,
  config,
  productPhotoSetting,
  saveSetting,
  settingsSummary,
} from "../src/server/settings";
import { validateDeployment } from "../src/server/deployment";
const key = "AUTO_IMPORT_PRODUCT_PHOTOS";
beforeEach(() => {
  storage.state = emptyState();
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
      SCRAPING_PROVIDER: "none",
      PAID_DAILY_LIMIT: "0",
    });
    for (const provider of [
      "SMTP_HOST",
      "OPENAI_API_KEY",
      "SCRAPING_PROVIDER",
      "PAID_DAILY_LIMIT",
    ])
      await expect(saveSetting(provider, "anything")).rejects.toThrow(
        "This test app uses a private email inbox",
      );
    vi.stubEnv(key, "false");
    expect(await automaticallyImportProductPhotos()).toBe(false);
    await expect(saveSetting(key, "true")).rejects.toThrow("set on the server");
  });
});
