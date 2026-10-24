import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertStagingSeed,
  deploymentEnvironment,
  validateDeployment,
} from "../src/server/deployment";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world, giftSummary } from "../src/server/domain";
import { config, saveSetting } from "../src/server/settings";
const env = {
  APP_ENV: "staging",
  NODE_ENV: "production",
  ALLOW_SYNTHETIC_DATA: "1",
  DATABASE_URL:
    "postgresql://little_hint_staging:synthetic@localhost/little_hint_staging",
  APP_URL: "https://staging.example.test",
  NODE_EXTRA_CA_CERTS: "/run/mailpit-ca.crt",
};
afterEach(() => vi.unstubAllEnvs());
describe("staging boundaries", () => {
  it("keeps production defaults and requires explicit staging seed authorization", () => {
    expect(deploymentEnvironment({ NODE_ENV: "production" })).toBe(
      "production",
    );
    expect(() => assertStagingSeed(env)).not.toThrow();
    for (const override of [
      { APP_ENV: "production" },
      { APP_ENV: "" },
      { ALLOW_SYNTHETIC_DATA: "" },
      { DATABASE_URL: "postgresql://little_hint:secret@db/little_hint" },
      {
        DATABASE_URL: "postgresql://little_hint:secret@db/little_hint_staging",
      },
    ]) {
      expect(() => assertStagingSeed({ ...env, ...override })).toThrow();
    }
  });
  it("requires production runtime, HTTPS, and SMTP trust for staging", () => {
    expect(() => validateDeployment(env)).not.toThrow();
    for (const override of [
      { NODE_ENV: "development" },
      { APP_URL: "http://staging.example.test" },
      { NODE_EXTRA_CA_CERTS: "" },
    ])
      expect(() => validateDeployment({ ...env, ...override })).toThrow();
  });
  it("ignores real provider credentials and refuses integration edits in staging", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("SMTP_HOST", "real-mail.example.com");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "must-not-use");
    vi.stubEnv("OPENAI_API_KEY", "must-not-use");
    expect(await config()).toMatchObject({
      SMTP_HOST: "mailpit",
      SMTP_PORT: "1025",
      SMTP_PASS: "",
      TWILIO_AUTH_TOKEN: "",
      OPENAI_API_KEY: "",
      SCRAPING_PROVIDER: "none",
      PAID_DAILY_LIMIT: "0",
    });
    await expect(
      saveSetting("SMTP_HOST", "real-mail.example.com"),
    ).rejects.toThrow("This test app uses a private email inbox");
  });
});
describe("representative staging fixtures", () => {
  it("provides synthetic accounts, scoped groups, and real domain workflows", () => {
    const { actors, state } = stagingFixtures();
    expect(actors).toHaveLength(5);
    expect(actors.every((a) => a.email.endsWith("@example.test"))).toBe(true);
    expect(state.people.filter((p) => p.admin)).toHaveLength(1);
    expect(state.settings).toHaveLength(0);
    expect(state.groups).toHaveLength(2);
    expect(state.exchanges[0].status).toBe("drawn");
    expect(state.groupEvents).toHaveLength(1);
    expect(state.contributions.map((c) => c.status).sort()).toEqual([
      "pledged",
      "received",
    ]);
    const alex = world(state, actors[0]);
    const taylor = world(state, actors[4]);
    expect(taylor.groups.map((g) => g.name)).toEqual(["Weekend friends"]);
    const gift = state.items.find((i) => i.title === "Ceramic pour-over set")!;
    const ownGift = alex.items.find((i) => i.id === gift.id)!;
    expect(ownGift).toBeDefined();
    expect(ownGift.reservations).toBeUndefined();
    expect(ownGift.reserved).toBeUndefined();
    const revealed = state.lists.find((l) => l.name === "Last birthday")!;
    expect(revealed.archived).toBe(true);
    expect(giftSummary(state, actors[0], revealed.id).gifts).toHaveLength(1);
    expect(() => giftSummary(state, actors[4], revealed.id)).toThrow();
  });
});
