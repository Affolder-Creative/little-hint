import Fastify, { LogController } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import statics from "@fastify/static";
import { fromNodeHeaders } from "better-auth/node";
import { z, ZodError } from "zod";
import { validationMessage } from "./validation-message";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { makeAuth, appUrl } from "./auth";
import { readState, transact, pool } from "./db";
import {
  activateAccount,
  world,
  idempotent,
  isAdmin,
  DomainError,
  fail,
  itemVisible,
  giftSummary,
} from "./domain";
import { config, settingsSummary, saveSetting } from "./settings";
import { mediaDir, saveImage } from "./imports";
import {
  linkTelegram,
  smsStart,
  smsVerify,
  verifyTwilio,
} from "./notifications";
import type { Actor } from "../shared/model";
import {
  cloudflareWebAnalyticsEnabled,
  deploymentEnvironment,
  validateDeployment,
} from "./deployment";
export async function makeApp(options: { browserTest?: boolean } = {}) {
  validateDeployment();
  // Only the separate test entrypoint opts in. Production entrypoints never
  // read an environment switch that could accidentally relax these limits.
  if (
    options.browserTest &&
    (process.env.NODE_ENV !== "test" ||
      deploymentEnvironment() !== "test" ||
      new URL(process.env.DATABASE_URL || "postgres://invalid/invalid")
        .pathname !== "/little_hint_e2e")
  )
    throw new Error("Browser tests require test mode and little_hint_e2e.");
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "warn",
      redact: [
        "req.headers.cookie",
        "req.headers.authorization",
        "req.body",
        "res.headers.set-cookie",
      ],
    },
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 6_000_000,
    trustProxy: false,
  });
  const auth = makeAuth();
  const cloudflareAnalytics = cloudflareWebAnalyticsEnabled();
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          ...(cloudflareAnalytics
            ? ["https://static.cloudflareinsights.com"]
            : []),
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "blob:", "data:"],
        fontSrc: ["'self'"],
        connectSrc: [
          "'self'",
          ...(cloudflareAnalytics ? ["https://cloudflareinsights.com"] : []),
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(rateLimit, {
    max: options.browserTest ? 10_000 : 150,
    timeWindow: "1 minute",
  });
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body),
  );
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) =>
      done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api")) reply.header("Cache-Control", "no-store");
    if (
      ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
      !req.url.startsWith("/api/hooks/")
    ) {
      if (req.headers.origin !== new URL(appUrl).origin)
        fail(403, "This request must come from Little Hint.");
    }
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof DomainError)
      return reply.code(error.status).send({ error: error.message });
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: validationMessage(error),
      });
    if ((error as { statusCode?: number }).statusCode === 429)
      return reply
        .code(429)
        .send({ error: "Too many requests. Wait a moment and try again." });
    req.log.error(
      { code: (error as { code?: string }).code ?? "INTERNAL" },
      "Request failed",
    );
    return reply.code(500).send({
      error: "That request could not be completed. Please try again.",
    });
  });
  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok", app: "little-hint" };
  });
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (req, reply) => {
      const authPath = new URL(req.url, appUrl).pathname;
      if (
        req.method === "POST" &&
        [
          "/api/auth/passkey/verify-registration",
          "/api/auth/passkey/update-passkey",
        ].includes(authPath)
      ) {
        const body = req.body as Record<string, unknown> | undefined;
        if (body?.name !== undefined)
          body.name = z.string().trim().min(1).max(80).parse(body.name);
      }
      const request = new Request(new URL(req.url, appUrl), {
        method: req.method,
        headers: fromNodeHeaders(req.headers),
        ...(req.body ? { body: JSON.stringify(req.body) } : {}),
      });
      const response = await auth.handler(request);
      reply.code(response.status);
      response.headers.forEach((v, k) => {
        if (k !== "set-cookie") reply.header(k, v);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header("set-cookie", cookies);
      return reply.send(await response.text());
    },
  });
  async function actor(req: { headers: any }): Promise<Actor> {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session || !session.user.emailVerified)
      fail(401, "Sign in to continue.");
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  }
  app.get("/api/v1/world", async (req) => {
    const a = await actor(req);
    return {
      ...world(await readState(), a),
      environment: deploymentEnvironment(),
    };
  });
  app.get<{ Params: { id: string } }>(
    "/api/v1/lists/:id/gift-summary",
    async (req) => {
      const a = await actor(req);
      return giftSummary(await readState(), a, req.params.id);
    },
  );
  const routes: Record<string, string> = {
    households: "households.create",
    "households/update": "households.update",
    "households/delete": "households.delete",
    "households/memberships": "households.memberships",
    groups: "groups.create",
    "groups/event-leaders": "groups.event-leaders",
    "group-events": "group-events.create",
    "group-events/update": "group-events.update",
    "groups/invite": "groups.invite",
    "groups/remove": "groups.remove",
    "groups/transfer": "groups.transfer",
    "invitations/accept": "invitations.accept",
    "invitations/revoke": "invitations.revoke",
    "links/accept": "links.accept",
    people: "people.create",
    "people/update": "people.update",
    "people/link": "people.link",
    lists: "lists.create",
    "lists/accept": "lists.accept",
    "lists/update": "lists.update",
    items: "items.create",
    "items/update": "items.update",
    reservations: "reservations.create",
    "reservations/update": "reservations.update",
    contributions: "contributions.create",
    "contributions/update": "contributions.update",
    comments: "comments.create",
    exchanges: "exchanges.create",
    "exchanges/update": "exchanges.update",
    "exchanges/draw": "exchanges.draw",
    "exchanges/cancel": "exchanges.cancel",
    preferences: "preferences.update",
    imports: "imports.create",
  };
  for (const [url, action] of Object.entries(routes))
    app.post(`/api/v1/${url}`, async (req) => {
      const a = await actor(req);
      return transact((s) =>
        idempotent(
          s,
          a,
          String(req.headers["idempotency-key"] ?? ""),
          action,
          req.body,
        ),
      );
    });
  app.post("/api/v1/media", async (req) => {
    const a = await actor(req);
    if (!Buffer.isBuffer(req.body)) fail(400, "Upload an image file.");
    return { url: await saveImage(req.body as Buffer, a.id) };
  });
  app.get<{ Params: { id: string } }>(
    "/api/v1/media/:id",
    async (req, reply) => {
      const a = await actor(req),
        s = await readState(),
        m = s.media.find((m) => m.id === req.params.id);
      if (
        !m ||
        (m.userId !== a.id &&
          !s.items.some(
            (i) => i.image === `/api/v1/media/${m.id}` && itemVisible(s, a, i),
          ))
      )
        fail(404, "Image not found.");
      return reply
        .type("image/webp")
        .send(createReadStream(path.join(mediaDir(), m.file)));
    },
  );
  app.get("/api/v1/admin/settings", async (req) => {
    const a = await actor(req);
    if (!isAdmin(await readState(), a))
      fail(403, "Administrator access required.");
    return settingsSummary();
  });
  app.post("/api/v1/admin/settings", async (req) => {
    const a = await actor(req);
    if (!isAdmin(await readState(), a))
      fail(403, "Administrator access required.");
    const b = z
      .object({ key: z.string(), value: z.string().max(10000) })
      .parse(req.body);
    await saveSetting(b.key, b.value);
    return { ok: true };
  });
  app.get("/api/v1/admin/jobs", async (req) => {
    const a = await actor(req),
      s = await readState();
    if (!isAdmin(s, a)) fail(403, "Administrator access required.");
    return {
      workerLastSeen:
        s.usage.find((u) => u.key === "worker-heartbeat")?.count ?? null,
      backupProvider: "backup-sidecar",
      imports: s.imports.map(({ id, status, error }) => ({
        id,
        status,
        error,
      })),
      notifications: s.notices.map(({ id, status, error, attempts }) => ({
        id,
        status,
        error,
        attempts,
      })),
    };
  });
  app.post("/api/v1/admin/jobs/retry", async (req) => {
    const a = await actor(req);
    const b = z.object({ id: z.string().uuid() }).parse(req.body);
    return transact((s) => {
      if (!isAdmin(s, a)) fail(403, "Administrator access required.");
      const j = s.notices.find((n) => n.id === b.id && n.status === "failed");
      if (!j) fail(404, "Failed job not found.");
      j.status = "pending";
      j.attempts = 0;
      j.error = undefined;
      return { ok: true };
    });
  });
  app.post("/api/v1/channels/telegram", async (req) =>
    linkTelegram(await actor(req)),
  );
  app.post(
    "/api/v1/channels/sms/start",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
      const a = await actor(req),
        b = z
          .object({ phone: z.string(), consent: z.literal(true) })
          .parse(req.body);
      await smsStart(a, b.phone, b.consent);
      return { ok: true };
    },
  );
  app.post(
    "/api/v1/channels/sms/verify",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req) => {
      const a = await actor(req),
        b = z.object({ code: z.string() }).parse(req.body);
      await smsVerify(a, b.code);
      return { ok: true };
    },
  );
  app.post("/api/hooks/twilio/:action", async (req, reply) => {
    const body = z.record(z.string(), z.string()).parse(req.body);
    if (
      !(await verifyTwilio(
        new URL(req.url, appUrl).toString(),
        body,
        String(req.headers["x-twilio-signature"] ?? ""),
      ))
    )
      fail(403, "Invalid provider signature.");
    await transact((s) => {
      if (
        body.OptOutType === "STOP" ||
        /^(STOP|UNSUBSCRIBE|CANCEL|END|QUIT)$/i.test(body.Body ?? "")
      )
        for (const p of s.preferences.filter((p) => p.phone === body.From)) {
          p.sms = false;
          p.smsOptOut = true;
          p.revision++;
        }
      const id = new URL(req.url, appUrl).searchParams.get("notice");
      if (id && ["failed", "undelivered"].includes(body.MessageStatus)) {
        const n = s.notices.find((n) => n.id === id);
        if (n) {
          n.status = "failed";
          n.error = "SMS could not be delivered.";
        }
      }
    });
    return reply.type("text/xml").send("<Response/>");
  });
  const root = path.resolve("dist/client");
  if (existsSync(root)) {
    await app.register(statics, {
      root,
      cacheControl: true,
      maxAge: 0,
      setHeaders(res, file) {
        if (file.includes("/assets/"))
          res.header("Cache-Control", "public, max-age=31536000, immutable");
        if (file.endsWith("sw.js")) res.header("Service-Worker-Allowed", "/");
      },
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Not found." })
        : reply.type("text/html").sendFile("index.html"),
    );
  }
  return app;
}
