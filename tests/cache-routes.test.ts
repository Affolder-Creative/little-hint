import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { emptyState } from "../src/shared/model";
const mocks = vi.hoisted(() => ({
  actor: "alice" as string | null,
  state: {} as ReturnType<typeof emptyState>,
  readImport: vi.fn(),
  readState: vi.fn(),
  directory: "",
  thumbnail: vi.fn(),
}));
vi.mock("../src/server/db", () => ({
  pool: { query: vi.fn() },
  transact: vi.fn(),
  readSettings: vi.fn(),
  readState: mocks.readState,
  readImport: mocks.readImport,
}));
vi.mock("../src/server/auth", () => ({
  appUrl: "https://littlehint.example.test",
  makeAuth: () => ({
    api: {
      getSession: async () =>
        mocks.actor
          ? {
              user: {
                id: mocks.actor,
                name: mocks.actor,
                email: `${mocks.actor}@example.test`,
                emailVerified: true,
              },
            }
          : null,
    },
  }),
}));
vi.mock("../src/server/media", () => ({
  mediaDir: () => mocks.directory,
  saveImage: vi.fn(),
  cardImage: mocks.thumbnail,
}));
import { stagingFixtures } from "../src/server/staging-fixtures";
import { makeApp } from "../src/server/app";
let app: Awaited<ReturnType<typeof makeApp>>;
const id = "a9e3b118-3978-4d39-bd79-ea0d32c2eff2";
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("APP_ENV", "test");
  mocks.actor = "alice";
  mocks.state = emptyState();
  mocks.directory = await mkdtemp(path.join(os.tmpdir(), "hint-route-test-"));
  await writeFile(path.join(mocks.directory, "photo.webp"), "synthetic photo");
  mocks.state.media.push({
    id,
    userId: "alice",
    file: "photo.webp",
    revision: 1,
    createdAt: new Date().toISOString(),
  });
  mocks.readState.mockImplementation(async () => mocks.state);
  mocks.thumbnail.mockImplementation(async () =>
    path.join(mocks.directory, "photo.webp"),
  );
  mocks.readImport.mockImplementation(async (jobId, userId) =>
    jobId === id && userId === "alice"
      ? { id, userId, status: "pending" }
      : undefined,
  );
  app = await makeApp();
});
afterEach(async () => {
  await app.close();
  await rm(mocks.directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("serves owner-scoped job status without reading world state", async () => {
  const response = await app.inject(`/api/v1/imports/${id}`);
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    id,
    userId: "alice",
    status: "pending",
  });
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(mocks.readState).not.toHaveBeenCalled();
  mocks.actor = "bob";
  expect((await app.inject(`/api/v1/imports/${id}`)).statusCode).toBe(404);
  mocks.actor = null;
  expect((await app.inject(`/api/v1/imports/${id}`)).statusCode).toBe(401);
});

it("authorizes both image sizes before generating or serving a thumbnail", async () => {
  for (const suffix of ["", "?size=card"]) {
    const response = await app.inject(`/api/v1/media/${id}${suffix}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toBe("synthetic photo");
  }
  expect(mocks.thumbnail).toHaveBeenCalledTimes(1);
  mocks.actor = "bob";
  for (const suffix of ["", "?size=card"])
    expect((await app.inject(`/api/v1/media/${id}${suffix}`)).statusCode).toBe(
      404,
    );
  expect(mocks.thumbnail).toHaveBeenCalledTimes(1);
  mocks.actor = null;
  expect((await app.inject(`/api/v1/media/${id}?size=card`)).statusCode).toBe(
    401,
  );
  mocks.actor = "alice";
  expect(
    (await app.inject(`/api/v1/media/${id}?size=arbitrary`)).statusCode,
  ).toBe(400);
});

it("rechecks revoked group access even when a thumbnail already exists", async () => {
  const { state, actors } = stagingFixtures();
  mocks.state = state;
  state.media.push({
    id,
    userId: actors[0].id,
    file: "photo.webp",
    revision: 1,
    createdAt: new Date().toISOString(),
  });
  state.items[0].image = `/api/v1/media/${id}`;
  mocks.actor = actors[1].id;
  expect((await app.inject(`/api/v1/media/${id}?size=card`)).statusCode).toBe(
    200,
  );
  for (const group of state.groups)
    group.memberIds = group.memberIds.filter(
      (userId) => userId !== actors[1].id,
    );
  expect((await app.inject(`/api/v1/media/${id}?size=card`)).statusCode).toBe(
    404,
  );
  expect((await app.inject(`/api/v1/media/${id}`)).statusCode).toBe(404);
  expect(mocks.thumbnail).toHaveBeenCalledTimes(1);
});
