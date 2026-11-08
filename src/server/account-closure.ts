import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../shared/model";
import { readState, transact, type DomainTransaction } from "./db";
import { fail } from "./domain-common";
import { sendEmail } from "./notifications";
import { accountFingerprint } from "./closed-accounts";
import {
  closurePlan,
  closeAccountData,
  requestHandoff,
  acceptHandoff,
  handoffCandidates,
} from "./account-closure-domain";

type Identity = { a: Actor; sessionId: string };
const identifier = (id: string) => `account-closure:${id}`;
const hash = (challenge: string, code: string) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(`${challenge}:${code}`)
    .digest("hex");
async function assertIdentity(
  tx: DomainTransaction,
  { a, sessionId }: Identity,
) {
  const row = await tx.execute(
    sql`SELECT u.email FROM "user" u JOIN session s ON s.user_id=u.id WHERE u.id=${a.id} AND s.id=${sessionId} AND s.expires_at > now() AND u.email_verified=true FOR UPDATE OF u`,
  );
  if (row.rows[0]?.email !== a.email)
    fail(401, "Sign in again before continuing.");
}
export function registerAccountClosure(
  app: FastifyInstance,
  identity: (req: FastifyRequest) => Promise<Identity>,
) {
  app.get("/api/v1/account/closure", async (req, reply) => {
    const { a } = await identity(req);
    const s = await readState();
    reply.header("Cache-Control", "no-store");
    return {
      blockers: closurePlan(s, a).blockers,
      candidates: handoffCandidates(s, a),
      requests: s.links
        .filter(
          (l) =>
            ["guardian", "admin"].includes(l.kind) &&
            !l.consumed &&
            Date.parse(l.expiresAt) > Date.now() &&
            (l.userId === a.id || l.requestedBy === a.id),
        )
        .map((l) => ({
          id: l.id,
          kind: l.kind,
          keepPreviousOwner: !!l.keepPreviousOwner,
          name:
            l.kind === "admin"
              ? "App administration"
              : (s.people.find((p) => p.id === l.targetId)?.name ??
                "Managed profile"),
          from:
            s.people.find((p) => p.userId === l.requestedBy)?.name ??
            "Former member",
          to:
            s.people.find((p) => p.userId === l.userId)?.name ??
            "Former member",
          incoming: l.userId === a.id,
        })),
    };
  });
  app.post("/api/v1/account/handoff", async (req) => {
    const who = await identity(req);
    const b = z
      .object({
        kind: z.enum(["admin", "guardian"]),
        personId: z.string().uuid(),
        userId: z.string().min(1).max(255),
        keepPreviousOwner: z.boolean().default(false),
      })
      .parse(req.body);
    await transact(async (s, tx) => {
      await assertIdentity(tx, who);
      requestHandoff(
        s,
        who.a,
        b.kind,
        b.personId,
        b.userId,
        b.keepPreviousOwner,
      );
    });
    return { ok: true };
  });
  app.post("/api/v1/account/handoff/respond", async (req) => {
    const who = await identity(req);
    const b = z
      .object({ id: z.string().uuid(), accept: z.boolean() })
      .parse(req.body);
    await transact(async (s, tx) => {
      await assertIdentity(tx, who);
      if (b.accept) acceptHandoff(s, who.a, b.id);
      else {
        const l = s.links.find(
          (l) =>
            l.id === b.id &&
            ["guardian", "admin"].includes(l.kind) &&
            (l.userId === who.a.id || l.requestedBy === who.a.id),
        );
        if (!l) fail(404, "Handoff not found.");
        s.links = s.links.filter((link) => link.id !== l.id);
      }
    });
    return { ok: true };
  });
  app.post(
    "/api/v1/account/closure/start",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const who = await identity(req);
      const id = randomUUID(),
        code = String(randomInt(0, 1000000)).padStart(6, "0");
      await transact(async (s, tx) => {
        await assertIdentity(tx, who);
        if (closurePlan(s, who.a).blockers.length)
          fail(
            409,
            "Resolve the listed responsibilities and gift commitments first.",
          );
        await tx.execute(
          sql`DELETE FROM verification WHERE identifier=${identifier(who.a.id)}`,
        );
        const value = JSON.stringify({
          sessionId: who.sessionId,
          email: who.a.email,
          hash: hash(id, code),
          attempts: 0,
        });
        await tx.execute(
          sql`INSERT INTO verification (id,identifier,value,expires_at) VALUES (${id},${identifier(who.a.id)},${value},${new Date(Date.now() + 600000)})`,
        );
      });
      try {
        await sendEmail(who.a.email, {
          kind: "update",
          text: `Your Little Hint account closure code is ${code}. Enter it only if you intend to permanently close your account. It expires in 10 minutes. If you did not request this, do not share the code and review your sign-in devices.`,
          actionPath: "/settings?section=security",
        });
      } catch (e) {
        await transact(async (_, tx) => {
          await tx.execute(sql`DELETE FROM verification WHERE id=${id}`);
        });
        throw e;
      }
      reply.header("Cache-Control", "no-store");
      return { challenge: id };
    },
  );
  app.post(
    "/api/v1/account/closure/confirm",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const who = await identity(req);
      const b = z
        .object({
          challenge: z.string().uuid(),
          code: z.string().regex(/^\d{6}$/),
          confirmation: z.literal("DELETE"),
        })
        .parse(req.body);
      const result = await transact(async (s, tx) => {
        await assertIdentity(tx, who);
        const row = (
          await tx.execute(
            sql`SELECT value,expires_at FROM verification WHERE id=${b.challenge} AND identifier=${identifier(who.a.id)} FOR UPDATE`,
          )
        ).rows[0];
        if (!row || new Date(String(row.expires_at)).getTime() <= Date.now())
          return "Code expired. Request a new code.";
        const value = JSON.parse(String(row.value)) as {
          sessionId: string;
          email: string;
          hash: string;
          attempts: number;
        };
        if (
          value.sessionId !== who.sessionId ||
          value.email !== who.a.email ||
          value.attempts >= 5
        )
          return "This code is no longer available. Request a new code on this device.";
        const supplied = Buffer.from(hash(b.challenge, b.code), "hex"),
          expected = Buffer.from(value.hash, "hex");
        if (
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        ) {
          value.attempts++;
          await tx.execute(
            sql`UPDATE verification SET value=${JSON.stringify(value)} WHERE id=${b.challenge}`,
          );
          return "Code not accepted. Check your email and try again.";
        }
        if (closurePlan(s, who.a).blockers.length)
          return "Your responsibilities changed. Refresh the review and resolve them before closing your account.";
        closeAccountData(s, who.a);
        // State changes, auth removal, and the late-write barrier commit together.
        await tx.execute(
          sql`INSERT INTO closed_account(id_hash) VALUES (${accountFingerprint(who.a.id)}) ON CONFLICT DO NOTHING`,
        );
        const otpIds = ["sign-in", "email-verification", "forget-password"].map(
          (type) => `${type}-otp-${who.a.email}`,
        );
        await tx.execute(
          sql`DELETE FROM verification WHERE identifier=${identifier(who.a.id)} OR identifier IN (${sql.join(
            otpIds.map((id) => sql`${id}`),
            sql`, `,
          )}) OR starts_with(identifier,${`change-email-otp-${who.a.email}-`}) OR position(${who.a.id} in value)>0`,
        );
        await tx.execute(sql`DELETE FROM "user" WHERE id=${who.a.id}`);
        return null;
      });
      if (result) fail(409, result);
      reply.header("Cache-Control", "no-store");
      return { ok: true };
    },
  );
}
