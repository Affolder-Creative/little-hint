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
  makeAuth: () => ({}),
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
