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
import { createDiscovery } from "../src/server/gift-discovery";
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
  f = discoveryFixture();
  mocks.state = f.state;
  mocks.actor = f.actors[1];
  app = await makeApp();
});
afterEach(async () => {
  await app?.close();
  vi.unstubAllEnvs();
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
  await saveSetting("GIFT_DISCOVERY_MODE", "off");
  expect((await create()).statusCode).toBe(403);
  expect((await app.inject(`/api/v1/gift-discovery/${id}`)).statusCode).toBe(
    404,
  );
});
it("persists an immediate kill switch, preserves wishes/preferences and cannot revive old results", async () => {
  const j = createDiscovery(mocks.state, f.actors[1], cfg, f.input);
  j.status = "complete";
  j.candidates = [candidate()];
  const items = structuredClone(mocks.state.items);
  await saveSetting("GIFT_DISCOVERY_MODE", "off");
  expect(mocks.state.giftDiscoveryJobs[0]).toMatchObject({
    status: "cancelled",
    candidates: [],
  });
  expect(mocks.state.items).toEqual(items);
  await saveSetting("GIFT_DISCOVERY_MODE", "both");
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
  expect(
    (await settingsSummary()).find((s) => s.key === "GIFT_DISCOVERY_MODE"),
  ).toMatchObject({ source: "environment", value: "off" });
  vi.stubEnv("GIFT_DISCOVERY_MODE", "");
  await expect(saveSetting("GIFT_DISCOVERY_MODE", "invalid")).rejects.toThrow(
    "Choose",
  );
  await expect(
    saveSetting("GIFT_DISCOVERY_MONTHLY_LIMIT", "-1"),
  ).rejects.toThrow("limit");
  await saveSetting("GIFT_DISCOVERY_MONTHLY_LIMIT", "0");
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
