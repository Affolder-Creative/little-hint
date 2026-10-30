import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Actor, State } from "../src/shared/model";
const mocks = vi.hoisted(() => ({
  state: {} as State,
  actor: null as Actor | null,
}));
vi.mock("../src/server/db", () => ({
  pool: { query: vi.fn() },
  readImport: vi.fn(),
  readSettings: async () => mocks.state.settings,
  readState: async () => structuredClone(mocks.state),
  transact: async (run: (s: State) => unknown) => {
    const next = structuredClone(mocks.state);
    const result = await run(next);
    mocks.state = next;
    return result;
  },
}));
vi.mock("../src/server/auth", () => ({
  appUrl: "https://littlehint.example.test",
  makeAuth: () => ({
    api: {
      getSession: async () =>
        mocks.actor ? { user: { ...mocks.actor, emailVerified: true } } : null,
    },
  }),
}));
import { makeApp } from "../src/server/app";
import {
  config,
  discoveryConfiguration,
  discoveryConfigForState,
  saveSetting,
  settingsSummary,
} from "../src/server/settings";
import {
  createDiscovery,
  pruneDiscovery,
  addDiscoveryUsage,
  quotaKeys,
} from "../src/server/gift-discovery";
import {
  discoveryFixture,
  discoveryConfig as cfg,
  candidate,
} from "./gift-discovery-fixture";
let app: Awaited<ReturnType<typeof makeApp>>,
  f: ReturnType<typeof discoveryFixture>;
const headers = {
  origin: "https://littlehint.example.test",
  "idempotency-key": "discovery_request_0001",
};
beforeEach(async () => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("OPENAI_API_KEY", "synthetic-key");
  vi.stubEnv("SETTINGS_ENCRYPTION_KEY", Buffer.alloc(32, 5).toString("base64"));
  vi.stubEnv("GIFT_DISCOVERY_MODE", "");
  vi.stubEnv("GIFT_DISCOVERY_USER_WEEKLY_LIMIT", "");
  vi.stubEnv("GIFT_DISCOVERY_MONTHLY_LIMIT", "");
  vi.stubEnv("GIFT_DISCOVERY_USER_OVERRIDES", "");
  f = discoveryFixture();
  mocks.state = f.state;
  mocks.actor = f.actors[1];
  app = await makeApp();
});
afterEach(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});
it("returns only the requesting account's effective allowance and never exposes the override map", async () => {
  const overrides = {
    [f.actors[1].id]: { weeklyLimit: "unlimited", bypassMonthlyLimit: true },
    "private-override-account": { weeklyLimit: 20 },
  };
  vi.stubEnv("GIFT_DISCOVERY_USER_OVERRIDES", JSON.stringify(overrides));
  const context = await app.inject(
    `/api/v1/gift-discovery/context/${f.people[0].id}`,
  );
  expect(context.statusCode).toBe(200);
  expect(context.json().allowance).toMatchObject({
    weeklyRemaining: null,
    monthlyRemaining: null,
  });
  expect(context.body).not.toContain("private-override-account");
  expect((await app.inject("/api/v1/world")).body).not.toContain(
    "private-override-account",
  );
  mocks.actor = f.actors[2];
  expect(
    (
      await app.inject(`/api/v1/gift-discovery/context/${f.people[0].id}`)
    ).json().allowance,
  ).toMatchObject({ weeklyRemaining: 3, monthlyRemaining: 100 });
  mocks.actor = f.actors[0];
  mocks.state.people.find((p) => p.userId === mocks.actor!.id)!.admin = true;
  const settings = await app.inject("/api/v1/admin/settings");
  expect(settings.body).not.toContain("GIFT_DISCOVERY_USER_OVERRIDES");
  expect((await app.inject("/api/v1/admin/gift-discovery")).body).not.toContain(
    "private-override-account",
  );
  const save = await app.inject({
    method: "POST",
    url: "/api/v1/admin/settings",
    headers,
    payload: { key: "GIFT_DISCOVERY_USER_OVERRIDES", value: "{}" },
  });
  expect(save.statusCode).toBe(400);
  for (const environment of ["staging", "preview"]) {
    vi.stubEnv("APP_ENV", environment);
    expect(
      (await app.inject(`/api/v1/gift-discovery/context/${f.people[0].id}`))
        .statusCode,
    ).toBe(403);
  }
});
it("reports total and exempt attempts separately without losing unknown provider usage", async () => {
  mocks.actor = f.actors[0];
  mocks.state.people.find((p) => p.userId === mocks.actor!.id)!.admin = true;
  const keys = quotaKeys(mocks.actor.id);
  addDiscoveryUsage(mocks.state, keys.month, 103);
  addDiscoveryUsage(mocks.state, keys.monthExempt, 5);
  const month = new Date().toISOString().slice(0, 7);
  addDiscoveryUsage(
    mocks.state,
    `discovery:metrics:${month}:gpt-6-luna:reported`,
    2,
  );
  const response = await app.inject("/api/v1/admin/gift-discovery");
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    searches: 103,
    exemptSearches: 5,
    quotaSearches: 98,
    unreportedAttempts: 101,
  });
});
it("requires authentication, scopes jobs and reauthorizes idempotent replays", async () => {
  const create = () =>
    app.inject({
      method: "POST",
      url: "/api/v1/gift-discovery",
      headers,
      payload: f.input,
    });
  const first = await create();
  expect(first.statusCode).toBe(200);
  const id = first.json().id;
  expect((await create()).json()).toEqual({ replayed: true, jobId: id });
  expect(
    (await app.inject(`/api/v1/gift-discovery/${id}`)).headers["cache-control"],
  ).toBe("no-store");
  mocks.actor = f.actors[2];
  expect((await app.inject(`/api/v1/gift-discovery/${id}`)).statusCode).toBe(
    404,
  );
  mocks.actor = null;
  expect((await app.inject(`/api/v1/gift-discovery/${id}`)).statusCode).toBe(
    401,
  );
  mocks.actor = f.actors[1];
  vi.stubEnv("GIFT_DISCOVERY_MODE", "off");
  pruneDiscovery(mocks.state, discoveryConfigForState(mocks.state));
  expect((await create()).statusCode).toBe(403);
  expect((await app.inject(`/api/v1/gift-discovery/${id}`)).statusCode).toBe(
    404,
  );
});
it("reconciles the deployment kill switch, preserves wishes/preferences and cannot revive old results", async () => {
  const j = createDiscovery(mocks.state, f.actors[1], cfg, f.input);
  j.status = "complete";
  j.candidates = [candidate()];
  const items = structuredClone(mocks.state.items);
  vi.stubEnv("GIFT_DISCOVERY_MODE", "off");
  pruneDiscovery(mocks.state, discoveryConfigForState(mocks.state));
  expect(mocks.state.giftDiscoveryJobs[0]).toMatchObject({
    status: "cancelled",
    candidates: [],
  });
  expect(mocks.state.items).toEqual(items);
  vi.stubEnv("GIFT_DISCOVERY_MODE", "both");
  expect((await app.inject(`/api/v1/gift-discovery/${j.id}`)).statusCode).toBe(
    404,
  );
  expect(
    (
      await app.inject(`/api/v1/gift-discovery/context/${f.people[0].id}`)
    ).json().recent,
  ).toBeUndefined();
});
it("locks environment overrides and validates limits, mode and staging isolation", async () => {
  expect(discoveryConfiguration(await config())).toMatchObject({
    mode: "givers",
    weeklyLimit: 3,
    monthlyLimit: 100,
  });
  vi.stubEnv("GIFT_DISCOVERY_MODE", "off");
  await expect(saveSetting("GIFT_DISCOVERY_MODE", "both")).rejects.toThrow(
    "set on the server",
  );
  expect((await settingsSummary()).map((s) => s.key)).toEqual([
    "AUTO_IMPORT_PRODUCT_PHOTOS",
    "FAMILY_GROUP_CREATION",
  ]);
  vi.stubEnv("GIFT_DISCOVERY_MODE", "invalid");
  await expect(config()).rejects.toThrow("GIFT_DISCOVERY_MODE");
  vi.stubEnv("GIFT_DISCOVERY_MODE", "both");
  vi.stubEnv("GIFT_DISCOVERY_MONTHLY_LIMIT", "-1");
  await expect(config()).rejects.toThrow("GIFT_DISCOVERY_MONTHLY_LIMIT");
  vi.stubEnv("GIFT_DISCOVERY_MONTHLY_LIMIT", "0");
  expect(discoveryConfiguration(await config()).monthlyLimit).toBe(0);
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("SMTP_PASS", "");
  mocks.state.settings.push({
    id: candidate().id,
    revision: 1,
    createdAt: new Date().toISOString(),
    key: "SMTP_PASS",
    encrypted: "dormant-production-ciphertext",
  });
  expect(discoveryConfigForState(mocks.state)).toMatchObject({
    mode: "off",
    available: false,
  });
  expect(discoveryConfiguration(await config())).toMatchObject({
    mode: "off",
    available: false,
  });
});
it("excludes job data and unshared preferences from world and denies non-admin controls", async () => {
  createDiscovery(mocks.state, f.actors[1], cfg, f.input);
  const response = await app.inject("/api/v1/world");
  expect(response.statusCode).toBe(200);
  expect(response.json()).not.toHaveProperty("giftDiscoveryJobs");
  expect(response.json().giftDiscovery.mode).toBe("givers");
  expect((await app.inject("/api/v1/admin/gift-discovery")).statusCode).toBe(
    403,
  );
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/settings",
        headers,
        payload: { key: "GIFT_DISCOVERY_MODE", value: "off" },
      })
    ).statusCode,
  ).toBe(403);
});
it("blocks unsaved discovery images immediately when an environment override disables AI", async () => {
  const j = createDiscovery(mocks.state, f.actors[1], cfg, f.input);
  const c = candidate(),
    id = c.id;
  c.image = `/api/v1/media/${id}`;
  j.status = "complete";
  j.candidates = [c];
  mocks.state.media.push({
    id,
    revision: 1,
    createdAt: new Date().toISOString(),
    userId: f.actors[1].id,
    file: "not-read.webp",
  });
  vi.stubEnv("GIFT_DISCOVERY_MODE", "off");
  expect((await app.inject(`/api/v1/media/${id}`)).statusCode).toBe(404);
});

it("exposes only preferences and safe service status to administrators", async () => {
  expect((await app.inject("/api/v1/admin/services")).statusCode).toBe(403);
  expect((await app.inject("/api/v1/admin/usage")).statusCode).toBe(403);
  mocks.state.people.find((p) => p.userId === mocks.actor!.id)!.admin = true;
  const services = await app.inject("/api/v1/admin/services");
  expect(services.statusCode).toBe(200);
  expect(services.body).not.toContain("synthetic-key");
  expect(services.json()).toHaveLength(7);
  expect((await app.inject("/api/v1/admin/settings")).json()).toHaveLength(2);
  for (const key of [
    "OPENAI_API_KEY",
    "GIFT_DISCOVERY_MODE",
    "SMTP_HOST",
    "PAID_DAILY_LIMIT",
  ])
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/admin/settings",
          headers,
          payload: { key, value: "anything" },
        })
      ).statusCode,
    ).toBe(409);
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/settings/batch",
        headers,
        payload: { settings: [] },
      })
    ).statusCode,
  ).toBe(404);
});
it("gates group creation and idempotent replays while preserving membership and ownership", async () => {
  vi.stubEnv("FAMILY_GROUP_CREATION", "");
  const create = () =>
    app.inject({
      method: "POST",
      url: "/api/v1/groups",
      headers,
      payload: { name: "New family" },
    });
  expect((await app.inject("/api/v1/world")).json().canCreateGroups).toBe(true);
  const created = await create();
  expect(created.statusCode).toBe(200);
  await saveSetting("FAMILY_GROUP_CREATION", "admins");
  expect((await app.inject("/api/v1/world")).json().canCreateGroups).toBe(
    false,
  );
  expect((await create()).statusCode).toBe(403);
  expect(
    mocks.state.groups.find((g) => g.id === created.json().id)?.ownerId,
  ).toBe(mocks.actor!.id);
  mocks.state.people.find((p) => p.userId === mocks.actor!.id)!.admin = true;
  expect((await create()).statusCode).toBe(200);
  vi.stubEnv("FAMILY_GROUP_CREATION", "everyone");
  await expect(saveSetting("FAMILY_GROUP_CREATION", "admins")).rejects.toThrow(
    "set on the server",
  );
  mocks.state.people.find((p) => p.userId === mocks.actor!.id)!.admin = false;
  expect((await app.inject("/api/v1/world")).json().canCreateGroups).toBe(true);
});
it("allows group policy in staging without enabling integrations and rejects invalid policy", async () => {
  vi.stubEnv("FAMILY_GROUP_CREATION", "");
  vi.stubEnv("APP_ENV", "staging");
  await saveSetting("FAMILY_GROUP_CREATION", "admins");
  expect(await settingsSummary()).toContainEqual(
    expect.objectContaining({
      key: "FAMILY_GROUP_CREATION",
      value: "admins",
      source: "settings",
    }),
  );
  expect((await config()).OPENAI_API_KEY).toBe("");
  await expect(saveSetting("FAMILY_GROUP_CREATION", "anyone")).rejects.toThrow(
    "Choose everyone",
  );
  vi.stubEnv("FAMILY_GROUP_CREATION", "invalid");
  await expect(makeApp()).rejects.toThrow("FAMILY_GROUP_CREATION");
});
