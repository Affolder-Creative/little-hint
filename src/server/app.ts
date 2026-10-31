import { productLookupEnabled } from "../shared/product-lookup";
import { importView } from "../shared/imports";
import { telegramInfo } from "./channel-availability";
import { smsInfo, verifyTextbelt, normalizePhone } from "./sms-provider";
import { recordTransport } from "./sms-policy";
import {
  startSms,
  verifySms,
  startSmsReauth,
  verifySmsReauth,
  changeSmsLogin,
  requireSmsGrant,
  refreshSmsQuota,
  webhookSource,
} from "./sms";
import { serviceStatuses } from "./service-status";
import { batchJob, retryWishlistBatch } from "./wishlist-delivery";
import { registerGiftDiscovery } from "./gift-discovery-routes";
import { adminUsage } from "./usage";
import { discoveryJob } from "./gift-discovery";
import { managementActions, trash } from "./management";
import {
  inbox,
  mentionCandidates,
  emitActivity,
  notificationEntry,
  notificationBatchEntry,
} from "./activity";
import {
  pushConfiguration,
  subscribePush,
  removePushDevice,
  activePushDevice,
  sendPush,
} from "./push";
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
import { readState, readImport, transact, pool } from "./db";
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
import {
  config,
  settingsSummary,
  saveSettings,
  effectiveConfig,
  canCreateGroups,
  imageDeliveryForState,
  discoveryConfiguration,
} from "./settings";
import { mediaDir, saveImage } from "./imports";
import { cardImage } from "./media";
import { linkTelegram, verifyTwilio } from "./notifications";
import type { Actor } from "../shared/model";
import {
  cloudflareWebAnalyticsEnabled,
  deploymentEnvironment,
  validateDeployment,
} from "./deployment";
export async function makeApp(options: { browserTest?: boolean } = {}) {
  validateDeployment();
  effectiveConfig();
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
    // Safari upgrades localhost subresources with Helmet's default directive.
    // HTTP preview is deliberate; production and staging retain the default.
    strictTransportSecurity: !(
      deploymentEnvironment() === "preview" && appUrl.startsWith("http:")
    ),
    contentSecurityPolicy: {
      directives: {
        ...(deploymentEnvironment() === "preview" && appUrl.startsWith("http:")
          ? { upgradeInsecureRequests: null }
          : {}),
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
  registerGiftDiscovery(app, actor);
  app.get("/api/v1/world", async (req) => {
    const a = await actor(req);
    const notificationAsOf = Date.now();
    const state = await readState();
    const cfg = await config();
    return {
      ...world(state, a),
      productLookupEnabled: productLookupEnabled(cfg),
      sms: smsInfo(cfg),
      telegram: telegramInfo(cfg),
      canCreateGroups: canCreateGroups(state, a),
      imageDelivery: imageDeliveryForState(state),
      giftDiscovery: discoveryConfiguration(cfg),
      notificationAsOf,
      environment: deploymentEnvironment(),
    };
  });
  app.get<{ Params: { id: string } }>("/api/v1/imports/:id", async (req) => {
    const a = await actor(req);
    const id = z.string().uuid().parse(req.params.id);
    const job = await readImport(id, a.id);
    if (!job) fail(404, "Import not found.");
    return importView(job);
  });
  app.get<{ Params: { id: string } }>(
    "/api/v1/lists/:id/gift-summary",
    async (req) => {
      const a = await actor(req);
      return giftSummary(await readState(), a, req.params.id);
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/v1/notifications/batches/:id",
    async (req) =>
      notificationBatchEntry(
        await readState(),
        await actor(req),
        req.params.id,
      ),
  );
  app.get("/api/v1/notifications", async (req) => {
    const a = await actor(req);
    const q = z
      .object({
        unread: z.enum(["true", "false"]).optional(),
        cursor: z.string().max(200).optional(),
      })
      .parse(req.query);
    const asOf = new Date().toISOString();
    return {
      ...inbox(await readState(), a, {
        unread: q.unread === "true",
        cursor: q.cursor,
      }),
      asOf,
    };
  });
  app.get<{ Params: { id: string } }>(
    "/api/v1/notifications/:id",
    async (req) =>
      notificationEntry(await readState(), await actor(req), req.params.id),
  );
  app.get<{ Params: { id: string } }>(
    "/api/v1/items/:id/mention-candidates",
    async (req) => {
      const a = await actor(req);
      const q = z
        .object({ q: z.string().max(160).default("") })
        .parse(req.query);
      return mentionCandidates(await readState(), a, req.params.id, q.q);
    },
  );
  app.get("/api/v1/push", async (req) => {
    const a = await actor(req);
    const session = (await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    }))!;
    const s = await readState();
    const devices = [];
    for (const d of s.pushDevices.filter((d) => d.userId === a.id)) {
      if (await activePushDevice(d))
        devices.push({
          id: d.id,
          label: d.label,
          current: d.sessionId === session.session.id,
        });
    }
    return { publicKey: pushConfiguration()?.publicKey ?? null, devices };
  });
  app.post("/api/v1/push/subscribe", async (req) => {
    const a = await actor(req);
    const session = (await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    }))!;
    return subscribePush(
      a,
      session.session.id,
      req.body,
      req.headers["user-agent"],
    );
  });
  app.post("/api/v1/push/unsubscribe", async (req) => {
    const a = await actor(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.body);
    await removePushDevice(id, a.id);
    return { ok: true };
  });
  app.post(
    "/api/v1/push/test",
    { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (req) => {
      const a = await actor(req);
      const { id } = z.object({ id: z.string().uuid() }).parse(req.body);
      const timestamp = Date.now();
      const s = await readState();
      const device =
        s.pushDevices.find((d) => d.id === id && d.userId === a.id) ??
        fail(404, "Device not found.");
      if (!(await activePushDevice(device)))
        fail(409, "Sign in again to enable notifications on this device.");
      await sendPush(
        device,
        {
          deviceId: id,
          test: true,
          unreadCount: inbox(s, a).unreadCount,
          timestamp,
          tag: "test",
        },
        "test",
      );
      return { ok: true };
    },
  );
  const routes: Record<string, string> = {
    "gift-preferences": "gift-preferences.update",
    households: "households.create",
    "households/update": "households.update",
    "households/delete": "households.delete",
    "households/memberships": "households.memberships",
    groups: "groups.create",
    "groups/event-leaders": "groups.event-leaders",
    "group-events": "group-events.create",
    "group-events/update": "group-events.update",
    "groups/invite": "groups.invite",
    invitations: "invitations.create",
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
    "notifications/read": "notifications.read",
    follows: "follows.update",
    watches: "watches.update",
    exchanges: "exchanges.create",
    "exchanges/update": "exchanges.update",
    "exchanges/guideline": "exchanges.guideline",
    "exchanges/draw": "exchanges.draw",
    "exchanges/cancel": "exchanges.cancel",
    preferences: "preferences.update",
    imports: "imports.create",
    "imports/update": "imports.update",
    "imports/discard": "imports.discard",
    "imports/retry": "imports.retry",
  };
  app.get("/api/v1/trash", async (req) =>
    trash(await readState(), await actor(req)),
  );
  for (const action of managementActions)
    routes[action.replace(".", "/")] = action;
  for (const [url, action] of Object.entries(routes))
    app.post(`/api/v1/${url}`, async (req) => {
      const a = await actor(req);
      const invited =
        action === "groups.invite" &&
        typeof (req.body as any)?.email === "string"
          ? (
              await pool.query(
                'SELECT id FROM "user" WHERE lower(email)=lower($1)',
                [(req.body as any).email.trim()],
              )
            ).rows[0]?.id
          : undefined;
      return transact((s) => {
        if (action === "groups.create" && !canCreateGroups(s, a))
          fail(
            403,
            "Only app administrators can create family groups. Ask an administrator to create one or accept an invitation.",
          );
        const result = idempotent(
          s,
          a,
          String(req.headers["idempotency-key"] ?? ""),
          action,
          req.body,
        );
        if (
          invited &&
          typeof (result as { id?: string }).id === "string" &&
          !s.notices.some(
            (n) =>
              n.inbox &&
              n.invitationId === (result as any).id &&
              n.userId === invited,
          )
        )
          emitActivity(s, "invitation", [invited], {
            invitationId: (result as any).id,
            actorId: a.id,
            status: "sent",
          });
        return result;
      });
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
        m.deletedAt ||
        (s.items.some((i) => i.image === `/api/v1/media/${m.id}`) &&
          !s.items.some(
            (i) => i.image === `/api/v1/media/${m.id}` && itemVisible(s, a, i),
          )) ||
        (m.userId !== a.id &&
          !s.items.some(
            (i) => i.image === `/api/v1/media/${m.id}` && itemVisible(s, a, i),
          ))
      )
        fail(404, "Image not found.");
      const image = `/api/v1/media/${m.id}`;
      const batches = s.giftDiscoveryJobs.filter((j) =>
        j.candidates.some((c) => c.image === image),
      );
      if (batches.length && !s.items.some((i) => i.image === image)) {
        const cfg = discoveryConfiguration(await config());
        if (
          !batches.some((j) => {
            try {
              discoveryJob(s, a, cfg, j.id);
              return true;
            } catch {
              return false;
            }
          })
        )
          fail(404, "Image not found.");
      }
      const { size } = z
        .object({ size: z.literal("card").optional() })
        .parse(req.query);
      return reply
        .type("image/webp")
        .send(
          createReadStream(
            size === "card"
              ? await cardImage(m.file)
              : path.join(mediaDir(), m.file),
          ),
        );
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
    const update = z.object({ key: z.string(), value: z.string().max(10000) });
    const b = z
      .union([update, z.object({ updates: z.array(update).min(1).max(4) })])
      .parse(req.body);
    await saveSettings("updates" in b ? b.updates : [b]);
    return { ok: true };
  });
  app.get("/api/v1/admin/services", async (req) => {
    const a = await actor(req);
    if (!isAdmin(await readState(), a))
      fail(403, "Administrator access required.");
    return serviceStatuses(await config(), !!pushConfiguration());
  });
  app.get("/api/v1/admin/usage", async (req) => {
    const a = await actor(req);
    const state = await readState();
    if (!isAdmin(state, a)) fail(403, "Administrator access required.");
    await refreshSmsQuota();
    return adminUsage(await readState(), await config());
  });
  app.get("/api/v1/admin/jobs", async (req) => {
    const a = await actor(req),
      s = await readState();
    if (!isAdmin(s, a)) fail(403, "Administrator access required.");
    return {
      workerLastSeen:
        s.usage.find((u) => u.key === "worker-heartbeat")?.count ?? null,
      backupProvider: "backup-sidecar",
      imports: s.imports.map(
        ({ id, status, error, diagnostic, createdAt }) => ({
          createdAt,
          diagnostic,
          id,
          status,
          error,
        }),
      ),
      notifications: [
        ...s.notificationBatches.map(batchJob),
        ...s.notices
          .filter((n) => !n.batchId)
          .map((n) => {
            const failedPush = Object.values(n.pushDeliveries ?? {}).filter(
              (d) => d.status === "failed",
            );
            const terminal = failedPush.some((d) => d.attempts >= 5);
            return {
              id: n.id,
              createdAt: n.createdAt,
              status: terminal
                ? "failed"
                : failedPush.length && !n.pushComplete
                  ? "pending"
                  : n.status,
              error: terminal
                ? "Push delivery failed. Check push configuration and retry."
                : n.error,
              attempts: Math.max(
                n.attempts,
                ...failedPush.map((d) => d.attempts),
              ),
            };
          }),
      ],
    };
  });
  app.post("/api/v1/admin/jobs/retry", async (req) => {
    const a = await actor(req);
    const b = z.object({ id: z.string().uuid() }).parse(req.body);
    return transact((s) => {
      if (!isAdmin(s, a)) fail(403, "Administrator access required.");
      if (retryWishlistBatch(s, b.id)) return { ok: true };
      const j = s.notices.find(
        (n) =>
          n.id === b.id &&
          (n.status === "failed" ||
            Object.values(n.pushDeliveries ?? {}).some(
              (d) => d.status === "failed" && d.attempts >= 5,
            )),
      );
      if (!j) fail(404, "Failed job not found.");
      if (j.status === "failed") j.status = "pending";
      let retryPush = false;
      for (const delivery of Object.values(j.pushDeliveries ?? {})) {
        if (delivery.status === "failed") {
          delivery.attempts = 0;
          delete delivery.nextAttemptAt;
          retryPush = true;
        }
      }
      if (retryPush)
        for (const n of s.notices)
          if (
            n.id === j.id ||
            (j.event === "wishlist" &&
              n.event === "wishlist" &&
              n.userId === j.userId &&
              n.listId === j.listId &&
              n.pushDueAt === j.pushDueAt)
          )
            n.pushComplete = false;
      j.attempts = 0;
      j.error = undefined;
      return { ok: true };
    });
  });
  app.post("/api/v1/channels/telegram", async (req) =>
    linkTelegram(await actor(req)),
  );
  app.get("/api/v1/sms-info", async () => smsInfo(await config()));
  async function smsActor(req: { headers: any }) {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    const a = await actor(req);
    return { a, sessionId: session!.session.id };
  }
  app.post(
    "/api/v1/channels/sms/reauth/start",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (req) => {
      const { a, sessionId } = await smsActor(req);
      return { challenge: await startSmsReauth(a, sessionId) };
    },
  );
  app.post("/api/v1/channels/sms/reauth/verify", async (req) => {
    const { a, sessionId } = await smsActor(req);
    const b = z
      .object({
        challenge: z.string().uuid(),
        code: z.string().regex(/^\d{6}$/),
      })
      .parse(req.body);
    await verifySmsReauth(a, sessionId, b.challenge, b.code);
    return { ok: true };
  });
  app.post(
    "/api/v1/channels/sms/start",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req) => {
      const { a, sessionId } = await smsActor(req);
      requireSmsGrant(await readState(), a, sessionId);
      const b = z
        .object({ phone: z.string().max(40), consent: z.literal(true) })
        .parse(req.body);
      return { challenge: await startSms(a, b.phone, "verification") };
    },
  );
  app.post(
    "/api/v1/channels/sms/verify",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req) => {
      const { a, sessionId } = await smsActor(req);
      requireSmsGrant(await readState(), a, sessionId);
      const b = z
        .object({
          challenge: z.string().uuid(),
          code: z.string().regex(/^\d{6}$/),
        })
        .parse(req.body);
      await verifySms(b.challenge, b.code, "verification", a);
      return { ok: true };
    },
  );
  app.post("/api/v1/channels/sms/login", async (req) => {
    const { a, sessionId } = await smsActor(req);
    const b = z
      .object({
        enabled: z.boolean(),
        consent: z.boolean().optional(),
        remove: z.boolean().optional(),
      })
      .parse(req.body);
    if (b.enabled && b.consent !== true)
      fail(400, "Agree to receive requested SMS sign-in codes first.");
    await changeSmsLogin(a, sessionId, b.enabled, b.remove);
    return { ok: true };
  });
  // Capture the exact JSON bytes before parsing; re-stringification breaks HMACs.
  await app.register(async (hooks) => {
    hooks.removeContentTypeParser("application/json");
    hooks.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_req, body, done) => done(null, body),
    );
    hooks.post("/api/hooks/textbelt", { bodyLimit: 16384 }, async (req) => {
      const raw = String(req.body),
        c = await config();
      if (
        !verifyTextbelt(
          raw,
          String(req.headers["x-textbelt-timestamp"] ?? ""),
          String(req.headers["x-textbelt-signature"] ?? ""),
          c.TEXTBELT_API_KEY,
        )
      )
        fail(403, "Invalid provider signature.");
      const b = z
        .object({
          fromNumber: z.string(),
          text: z.string().max(1600),
          textId: z.union([z.string(), z.number()]),
        })
        .parse(JSON.parse(raw));
      const phone = normalizePhone(b.fromNumber);
      if (phone)
        await transact((s) =>
          recordTransport(
            s,
            phone,
            b.text,
            webhookSource(
              "textbelt",
              String(req.headers["x-textbelt-timestamp"]) + raw,
            ),
          ),
        );
      return { ok: true };
    });
  });
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
      if (body.From)
        recordTransport(
          s,
          body.From,
          body.OptOutType ?? body.Body ?? "",
          webhookSource("twilio", JSON.stringify(body)),
        );
      const smsId = new URL(req.url, appUrl).searchParams.get("sms");
      const attempt = s.smsAttempts.find(
        (a) => a.reference === smsId && a.provider === "twilio",
      );
      if (
        attempt &&
        (!attempt.providerId || attempt.providerId === body.MessageSid)
      ) {
        if (["failed", "undelivered"].includes(body.MessageStatus))
          attempt.status = "failed";
        else if (
          body.MessageStatus === "delivered" &&
          attempt.status !== "failed"
        )
          attempt.status = "delivered";
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
