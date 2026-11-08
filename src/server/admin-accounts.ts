import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { Actor, State } from "../shared/model";
import { readState, transact, pool } from "./db";
import {
  closurePlan,
  closeAccountData,
  handoffCandidates,
  requestHandoff,
} from "./account-closure-domain";
import { isAdmin } from "./domain-access";
import { fail, touch } from "./domain-common";
import { command } from "./domain";
import { accountFingerprint } from "./closed-accounts";
function authorize(s: State, actor: Actor, target: Actor) {
  if (!isAdmin(s, actor)) fail(403, "Administration access is required.");
  if (actor.id === target.id)
    fail(
      409,
      "Use Close your account in Sign-in & security for your own account.",
    );
  if (!s.people.some((p) => p.userId === target.id))
    fail(404, "Account not found.");
}
export function deletionReview(s: State, target: Actor) {
  const plan = closurePlan(s, target, { removeAuthoredContent: true });
  const owned = s.lists.filter((l) =>
    l.ownerIds.some((id) => plan.own.has(id)),
  );
  const authored = s.items.filter(
    (i) => i.creatorId === target.id || plan.removedItems.has(i.id),
  );
  const notes = s.comments.filter((c) => c.authorId === target.id);
  const counts = {
    lists: owned.length,
    gifts: authored.length,
    notes: notes.length,
  };
  const token = createHash("sha256")
    .update(
      JSON.stringify({
        target: { id: target.id, email: target.email },
        profiles: s.people.filter(
          (p) => p.userId === target.id || p.guardians.includes(target.id),
        ),
        blockers: plan.blockers,
        lists: owned,
        gifts: authored,
        notes,
        reservations: s.reservations.filter(
          (r) =>
            r.buyerId === target.id || authored.some((i) => i.id === r.itemId),
        ),
        contributions: s.contributions,
      }),
    )
    .digest("hex");
  return {
    blockers: plan.blockers.map((b) => ({
      ...b,
      candidates: handoffCandidates(s, target).filter(
        (p) =>
          b.kind !== "group" ||
          s.groups.some((g) => g.id === b.id && g.memberIds.includes(p.id)),
      ),
    })),
    counts,
    token,
    candidates: handoffCandidates(s, target),
  };
}
export function registerAdminAccounts(
  app: FastifyInstance,
  actor: (req: any) => Promise<Actor>,
) {
  async function target(id: string): Promise<Actor> {
    const user = (
      await pool.query('SELECT id,email,name FROM "user" WHERE id=$1', [id])
    ).rows[0];
    return user ?? fail(404, "Account not found.");
  }
  app.get<{ Params: { id: string } }>(
    "/api/v1/admin/accounts/:id/deletion",
    async (req, reply) => {
      const a = await actor(req),
        s = await readState();
      if (!isAdmin(s, a)) fail(403, "Administration access is required.");
      const user = await target(req.params.id);
      authorize(s, a, user);
      reply.header("Cache-Control", "no-store");
      return deletionReview(s, user);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/admin/accounts/:id/resolve",
    async (req) => {
      const a = await actor(req);
      if (!isAdmin(await readState(), a))
        fail(403, "Administration access is required.");
      const user = await target(req.params.id);
      const b = z
        .object({
          kind: z.enum(["guardian", "group", "commitments"]),
          targetId: z.string().optional(),
          userId: z.string().optional(),
          confirmation: z.literal("RESOLVE"),
        })
        .parse(req.body);
      await transact(async (s, tx) => {
        authorize(s, a, user);
        if (b.kind === "guardian")
          requestHandoff(s, user, "guardian", b.targetId ?? "", b.userId ?? "");
        else if (b.kind === "group") {
          const next = await target(b.userId ?? "");
          command(s, user, "groups.transfer", {
            groupId: b.targetId,
            userId: next.id,
            email: next.email,
          });
        } else {
          for (const r of s.reservations.filter((r) => r.buyerId === user.id)) {
            if (
              s.contributions.some(
                (c) => c.reservationId === r.id && c.status === "sent",
              )
            )
              continue;
            r.quantity = r.purchased;
            touch(r);
            for (const c of s.contributions.filter(
              (c) => c.reservationId === r.id && c.status === "pledged",
            )) {
              c.status = "cancelled";
              touch(c);
            }
          }
          for (const c of s.contributions.filter(
            (c) => c.userId === user.id && c.status === "pledged",
          )) {
            c.status = "cancelled";
            touch(c);
          }
        }
        await tx.execute(
          sql`INSERT INTO admin_account_audit(actor_hash,target_hash,action) VALUES (${accountFingerprint(a.id)},${accountFingerprint(user.id)},${`resolve:${b.kind}`})`,
        );
      });
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/admin/accounts/:id/delete",
    async (req) => {
      const a = await actor(req);
      if (!isAdmin(await readState(), a))
        fail(403, "Administration access is required.");
      const user = await target(req.params.id);
      const b = z
        .object({
          confirmation: z.literal("DELETE"),
          mode: z.enum(["keep-shared", "remove-content"]),
          token: z.string().length(64),
        })
        .parse(req.body);
      await transact(async (s, tx) => {
        authorize(s, a, user);
        const locked = await tx.execute(
          sql`SELECT id,email,name FROM "user" WHERE id=${user.id} FOR UPDATE`,
        );
        if (!locked.rows[0]) fail(404, "Account not found.");
        user.email = String(locked.rows[0].email);
        user.name = String(locked.rows[0].name);
        const review = deletionReview(s, user);
        if (review.token !== b.token)
          fail(
            409,
            "The account changed. Refresh the deletion review before continuing.",
          );
        if (review.blockers.length)
          fail(
            409,
            "Resolve the listed responsibilities and gift commitments first.",
          );
        closeAccountData(s, user, {
          keepSharedContent: b.mode === "keep-shared",
          removeAuthoredContent: b.mode === "remove-content",
        });
        s.groupInviteRequests = s.groupInviteRequests.filter(
          (r) => r.requestedBy !== user.id,
        );
        await tx.execute(
          sql`INSERT INTO closed_account(id_hash) VALUES (${accountFingerprint(user.id)}) ON CONFLICT DO NOTHING`,
        );
        await tx.execute(
          sql`DELETE FROM verification WHERE position(${user.id} in value)>0 OR identifier=${`account-closure:${user.id}`} OR identifier IN (${`sign-in-otp-${user.email}`},${`email-verification-otp-${user.email}`},${`forget-password-otp-${user.email}`}) OR starts_with(identifier,${`change-email-otp-${user.email}-`})`,
        );
        await tx.execute(sql`DELETE FROM "user" WHERE id=${user.id}`);
        await tx.execute(
          sql`INSERT INTO admin_account_audit(actor_hash,target_hash,action) VALUES (${accountFingerprint(a.id)},${accountFingerprint(user.id)},${`delete:${b.mode}`})`,
        );
      });
      return { ok: true };
    },
  );
}
