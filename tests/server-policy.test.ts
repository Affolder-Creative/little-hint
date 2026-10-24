import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyServerOptions } from "fastify";

const mocks = vi.hoisted(() => ({ query: vi.fn(), logs: [] as string[] }));
vi.mock("../src/server/db", () => ({
  pool: { query: mocks.query },
  readState: vi.fn(),
  transact: vi.fn(),
}));
vi.mock("../src/server/auth", () => ({
  appUrl: "https://littlehint.example.test",
  makeAuth: () => ({ api: { getSession: async () => null } }),
}));
vi.mock("fastify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fastify")>();
  return {
    ...actual,
    default: (options: FastifyServerOptions) =>
      actual.default({
        ...options,
        logger: {
          ...(typeof options?.logger === "object" ? options.logger : {}),
          stream: { write: (line: string) => mocks.logs.push(line) },
        },
      }),
  };
});
import { makeApp } from "../src/server/app";

let app: Awaited<ReturnType<typeof makeApp>> | undefined;
beforeEach(() => {
  mocks.logs.length = 0;
  mocks.query.mockReset().mockResolvedValue({ rows: [] });
  vi.stubEnv("LOG_LEVEL", "info");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("CLOUDFLARE_WEB_ANALYTICS", undefined);
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("request limits", () => {
  it("enforces the production default after 150 requests even in test mode", async () => {
    vi.stubEnv("NODE_ENV", "test");
    app = await makeApp();
    for (let i = 0; i < 150; i++)
      expect((await app.inject("/api/health")).statusCode).toBe(200);
    const limited = await app.inject("/api/health");
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(limited.json()).toEqual({
      error: "Too many requests. Wait a moment and try again.",
    });
    expect(
      (await app.inject({ url: "/api/health", remoteAddress: "127.0.0.2" }))
        .statusCode,
    ).toBe(200);
  });

  it("allows browser bursts but preserves route-specific limits", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://test:test@localhost/little_hint_e2e",
    );
    app = await makeApp({ browserTest: true });
    for (let i = 0; i < 200; i++)
      expect((await app.inject("/api/health")).statusCode).toBe(200);
    for (const [route, max] of [
      ["start", 5],
      ["verify", 10],
    ] as const) {
      const request = () =>
        app!.inject({
          method: "POST",
          url: `/api/v1/channels/sms/${route}`,
          headers: { origin: "https://littlehint.example.test" },
          payload: {},
        });
      // The real SMS routes reject unauthenticated callers until their own
      // request budget is exhausted, without contacting any provider.
      for (let i = 0; i < max; i++)
        expect((await request()).statusCode).toBe(401);
      expect((await request()).statusCode).toBe(429);
    }
  });

  it.each([
    ["production", "production", "little_hint_e2e"],
    ["test", "production", "little_hint_e2e"],
    ["development", "test", "little_hint_e2e"],
    ["test", "test", "little_hint"],
    ["test", "test", "little_hint_test"],
  ])(
    "rejects the browser override in %s/%s with database %s",
    async (nodeEnv, appEnv, database) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("APP_ENV", appEnv);
      vi.stubEnv("DATABASE_URL", `postgres://test:test@localhost/${database}`);
      await expect(makeApp({ browserTest: true })).rejects.toThrow(
        /Browser tests require/,
      );
    },
  );
});

describe("server logging policy", () => {
  it("starts without deprecated logging options and omits access logs at info level", async () => {
    const warning = vi.spyOn(process, "emitWarning");
    app = await makeApp();
    const response = await app.inject({
      url: "/api/health?private=synthetic-secret",
      headers: {
        cookie: "session=synthetic-cookie",
        authorization: "Bearer synthetic-token",
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(response.statusCode).toBe(200);
    expect(warning).not.toHaveBeenCalled();
    expect(mocks.logs).toEqual([]);
  });

  it("still logs safe error codes without exposing request data or database error details", async () => {
    mocks.query.mockRejectedValueOnce(
      Object.assign(new Error("synthetic-private-database-detail"), {
        code: "TEST_DATABASE_ERROR",
      }),
    );
    app = await makeApp();
    const response = await app.inject({
      url: "/api/health?private=synthetic-secret",
      headers: { cookie: "session=synthetic-cookie" },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "That request could not be completed. Please try again.",
    });
    expect(mocks.logs).toHaveLength(1);
    expect(JSON.parse(mocks.logs[0])).toMatchObject({
      level: 50,
      code: "TEST_DATABASE_ERROR",
      msg: "Request failed",
    });
    expect(mocks.logs.join("")).not.toContain("synthetic-");
  });
});

describe("Cloudflare analytics CSP", () => {
  async function policy() {
    app = await makeApp();
    const response = await app.inject({ url: "/api/health" });
    expect(response.statusCode).toBe(200);
    return Object.fromEntries(
      String(response.headers["content-security-policy"])
        .split(";")
        .map((directive) => {
          const [name, ...sources] = directive.trim().split(/\s+/);
          return [name, sources];
        }),
    );
  }

  it.each([undefined, "", "false"])(
    "keeps third-party scripts and connections blocked when set to %s",
    async (value) => {
      vi.stubEnv("CLOUDFLARE_WEB_ANALYTICS", value);
      const csp = await policy();
      expect(csp["script-src"]).toEqual(["'self'"]);
      expect(csp["connect-src"]).toEqual(["'self'"]);
    },
  );

  it("permits only Cloudflare's script and reporting hosts when opted in", async () => {
    vi.stubEnv("CLOUDFLARE_WEB_ANALYTICS", "true");
    const csp = await policy();
    expect(csp["script-src"]).toEqual([
      "'self'",
      "https://static.cloudflareinsights.com",
    ]);
    expect(csp["connect-src"]).toEqual([
      "'self'",
      "https://cloudflareinsights.com",
    ]);
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
  });

  it.each(["yes", "TRUE", "1"])(
    "rejects an invalid opt-in value %s",
    async (value) => {
      vi.stubEnv("CLOUDFLARE_WEB_ANALYTICS", value);
      await expect(makeApp()).rejects.toThrow(
        "CLOUDFLARE_WEB_ANALYTICS must be true, false, or empty.",
      );
    },
  );
});

it("returns readable validation errors in the existing HTTP error shape", async () => {
  app = await makeApp();
  app.get("/test-copy-validation", () =>
    z
      .object({ title: z.string().min(1), quantity: z.number().max(999) })
      .parse({ title: "", quantity: 1000 }),
  );
  const response = await app.inject({ url: "/test-copy-validation" });
  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({
    error:
      "Item name: use at least 1 character. Quantity: enter a number no greater than 999.",
  });
});
