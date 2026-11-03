import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyServerOptions } from "fastify";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  logs: [] as string[],
  user: null as string | null,
}));
vi.mock("../src/server/db", () => ({
  pool: { query: mocks.query },
  readState: vi.fn(),
  transact: vi.fn(),
}));
vi.mock("../src/server/auth", () => ({
  appUrl: "https://littlehint.example.test",
  makeAuth: () => ({
    api: {
      getSession: async () =>
        mocks.user
          ? {
              user: {
                id: mocks.user,
                emailVerified: true,
                email: `${mocks.user}@example.test`,
                name: mocks.user,
              },
            }
          : null,
    },
  }),
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
  mocks.user = null;
  mocks.query.mockReset().mockResolvedValue({ rows: [] });
  vi.stubEnv("LOG_LEVEL", "info");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("TRUSTED_PROXIES", undefined);
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
      expect((await app.inject("/api/v1/world")).statusCode).toBe(401);
    const limited = await app.inject("/api/v1/world");
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(limited.json()).toEqual({
      error: "Too many requests. Wait a moment and try again.",
    });
    expect(
      (await app.inject({ url: "/api/v1/world", remoteAddress: "127.0.0.2" }))
        .statusCode,
    ).toBe(401);
  });

  it("separates trusted forwarded clients and exempts static assets and health", async () => {
    vi.stubEnv("TRUSTED_PROXIES", "127.0.0.1");
    app = await makeApp();
    const request = (ip: string) =>
      app!.inject({ url: "/api/v1/world", headers: { "x-forwarded-for": ip } });
    for (let i = 0; i < 150; i++) await request("198.51.100.1");
    expect((await request("198.51.100.1")).statusCode).toBe(429);
    expect((await request("198.51.100.2")).statusCode).toBe(401);
    expect((await app.inject("/api/health")).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: "/",
          headers: { "x-forwarded-for": "198.51.100.1" },
        })
      ).statusCode,
    ).not.toBe(429);
  });
  it("ignores spoofed forwarding headers from untrusted peers", async () => {
    app = await makeApp();
    for (let i = 0; i < 150; i++)
      await app.inject({
        url: "/api/v1/world",
        headers: { "x-forwarded-for": `198.51.100.${i}` },
      });
    expect(
      (
        await app.inject({
          url: "/api/v1/world",
          headers: { "x-forwarded-for": "203.0.113.2" },
        })
      ).statusCode,
    ).toBe(429);
  });
  it("gives authenticated accounts separate allowances behind the same proxy", async () => {
    app = await makeApp();
    mocks.user = "alice";
    for (let i = 0; i < 150; i++)
      await app.inject("/api/v1/imports/not-a-uuid");
    expect((await app.inject("/api/v1/imports/not-a-uuid")).statusCode).toBe(
      429,
    );
    mocks.user = "bob";
    expect((await app.inject("/api/v1/imports/not-a-uuid")).statusCode).toBe(
      400,
    );
  });
  it("allows browser bursts but preserves route-specific limits", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(
      "DATABASE_URL",
      "postgres://test:test@localhost/little_hint_e2e",
    );
    app = await makeApp({ browserTest: true });
    for (let i = 0; i < 200; i++)
      expect((await app.inject("/api/v1/world")).statusCode).toBe(401);
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
