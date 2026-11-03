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
import { emptyState } from "../src/shared/model";
import { stamp } from "../src/server/domain";
let app: Awaited<ReturnType<typeof makeApp>>;
const headers = {
  origin: "https://littlehint.example.test",
  "idempotency-key": "admin_spending_request_01",
};
beforeEach(async () => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("SPENDING_ENABLED", "");
  vi.stubEnv("SETTINGS_ENCRYPTION_KEY", Buffer.alloc(32, 5).toString("base64"));
  mocks.state = emptyState();
  mocks.actor = { id: stamp().id, name: "Admin", email: "admin@example.test" };
  mocks.state.people.push({
    ...stamp(),
    userId: mocks.actor.id,
    name: "Admin",
    guardians: [],
    admin: true,
  });
  app = await makeApp();
});
afterEach(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});
it("enforces authentication and admin access on reads and writes", async () => {
  const run = () =>
    app.inject({
      method: "POST",
      url: "/api/v1/admin/spending/enable",
      headers,
      payload: { scope: "all" },
    });
  mocks.actor = null;
  expect((await app.inject("/api/v1/admin/spending")).statusCode).toBe(401);
  expect((await run()).statusCode).toBe(401);
  mocks.actor = {
    id: mocks.state.people[0].userId!,
    name: "Admin",
    email: "admin@example.test",
  };
  mocks.state.people[0].admin = false;
  expect((await app.inject("/api/v1/admin/spending")).statusCode).toBe(403);
  expect((await run()).statusCode).toBe(403);
});
it("saves the default and returns exact replay counts with no private data", async () => {
  const save = await app.inject({
    method: "POST",
    url: "/api/v1/admin/settings",
    headers,
    payload: { updates: [{ key: "SPENDING_DEFAULT_ENABLED", value: "true" }] },
  });
  expect(save.statusCode).toBe(200);
  expect((await app.inject("/api/v1/admin/settings")).json()).toContainEqual(
    expect.objectContaining({ key: "SPENDING_DEFAULT_ENABLED", value: "true" }),
  );
  const run = () =>
    app.inject({
      method: "POST",
      url: "/api/v1/admin/spending/enable",
      headers,
      payload: { scope: "all" },
    });
  expect((await run()).json()).toEqual({
    total: 1,
    enabled: 1,
    alreadyEnabled: 0,
    optedOut: 0,
  });
  expect((await run()).json()).toMatchObject({ enabled: 1, replayed: true });
  mocks.state.people[0].admin = false;
  expect((await run()).statusCode).toBe(403);
});
it("rejects invalid or unavailable bulk writes without persisting changes", async () => {
  const run = (payload: Record<string, unknown>) =>
    app.inject({
      method: "POST",
      url: "/api/v1/admin/spending/enable",
      headers,
      payload,
    });
  expect((await run({ scope: "group", groupId: stamp().id })).statusCode).toBe(
    404,
  );
  expect((await run({ scope: "all", groupId: stamp().id })).statusCode).toBe(
    400,
  );
  vi.stubEnv("SPENDING_ENABLED", "false");
  expect((await run({ scope: "all" })).statusCode).toBe(404);
  expect(mocks.state.spendingSettings).toEqual([]);
});
