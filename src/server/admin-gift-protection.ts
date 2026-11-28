import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Actor, State } from "../shared/model";
import { affectedItems, withRemovalOverride } from "./purchase-protection";
import { manages, canPurge } from "./management";
import { isAdmin } from "./domain-access";
import { fail } from "./domain-common";
import { idempotent } from "./domain";
import { readState, transact } from "./db";
import { accountFingerprint } from "./closed-accounts";

const target = z.object({
  kind: z.enum(["items", "lists", "group-events"]),
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  operation: z.enum(["archive", "trash", "purge"]),
});
function review(s: State, a: Actor, p: z.infer<typeof target>, latest = false) {
  if (!isAdmin(s, a)) fail(403, "Administration access is required.");
  if (!manages(s, a, p.kind, p.id)) fail(404, "Entry not found.");
  const row = (p.kind === "group-events" ? s.groupEvents : s[p.kind]).find(
    (r) => r.id === p.id,
  )!;
  if (latest) p = { ...p, revision: row.revision };
  if (row.revision !== p.revision)
    fail(409, "This changed since you opened it. Refresh and try again.");
  if (p.operation === "archive" && (p.kind !== "items" || row.deletedAt))
    fail(400, "Choose an available action.");
  if (
    p.operation === "purge" &&
    (!row.deletedAt || !canPurge(s, a, p.kind, p.id))
  )
    fail(403, "Move this entry to Trash before deleting it permanently.");
  if (p.operation === "trash" && row.deletedAt)
    fail(409, "This entry is already in Trash.");
  const items = affectedItems(s, p.kind, p.id);
  const token = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(
      JSON.stringify({
        actor: a.id,
        target: p,
        row,
        items,
        reservations: s.reservations.filter((r) =>
          items.some((i) => i.id === r.itemId),
        ),
      }),
    )
    .digest("hex");
  return {
    token,
    revision: row.revision,
    name: "title" in row ? row.title : row.name,
  };
}
export function registerAdminGiftProtection(
  app: FastifyInstance,
  actor: (req: any) => Promise<Actor>,
) {
  app.post("/api/v1/admin/gift-protection/review", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    return review(
      await readState(),
      await actor(req),
      target.parse(req.body),
      true,
    );
  });
  app.post("/api/v1/admin/gift-protection/override", async (req) => {
    const a = await actor(req);
    const p = target
      .extend({
        token: z.string(),
        reason: z.string().trim().min(1).max(500),
        confirmation: z.literal("OVERRIDE"),
      })
      .parse(req.body);
    const key = String(req.headers["idempotency-key"] ?? "");
    if (!key || key.length > 200) fail(400, "An idempotency key is required.");
    return transact(async (s, tx) => {
      if (!isAdmin(s, a)) fail(403, "Administration access is required.");
      const requestHash = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
        .update(JSON.stringify(p))
        .digest("hex");
      const prior = await tx.execute(
        sql`SELECT request_hash FROM gift_override_receipt WHERE actor_hash=${accountFingerprint(a.id)} AND request_key=${key}`,
      );
      if (prior.rows.length) {
        if (prior.rows[0].request_hash !== requestHash)
          fail(409, "This request key was already used.");
        return { ok: true };
      }
      if (review(s, a, target.parse(p)).token !== p.token)
        fail(409, "This entry changed. Review the admin override again.");
      withRemovalOverride(s, p.kind, p.id, () =>
        idempotent(s, a, key, `${p.kind}.${p.operation}`, {
          id: p.id,
          revision: p.revision,
          ...(p.operation === "archive" ? { archived: true } : {}),
        }),
      );
      await tx.execute(
        sql`INSERT INTO admin_account_audit(actor_hash,target_hash,action,reason) VALUES (${accountFingerprint(a.id)},${accountFingerprint(p.id)},${`gift-protection:${p.kind}:${p.operation}`},${p.reason})`,
      );
      await tx.execute(
        sql`INSERT INTO gift_override_receipt(actor_hash,request_key,request_hash) VALUES (${accountFingerprint(a.id)},${key},${requestHash})`,
      );
      return { ok: true };
    });
  });
}
