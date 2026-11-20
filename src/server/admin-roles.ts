import { peopleForGroup } from "../shared/group-events";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { Actor } from "../shared/model";
import { readState, transact } from "./db";
import { isAdmin, managedGroup } from "./domain-access";
import {
  checkRevision,
  fail,
  id,
  revision,
  text,
  touch,
} from "./domain-common";
import { accountFingerprint } from "./closed-accounts";

export function registerAdminRoles(
  app: FastifyInstance,
  actor: (req: any) => Promise<Actor>,
) {
  app.get("/api/v1/admin/administrators", async (req, reply) => {
    const a = await actor(req),
      s = await readState();
    if (!isAdmin(s, a)) fail(403, "Administration access is required.");
    reply.header("Cache-Control", "no-store");
    return s.people
      .filter((p) => p.userId && p.admin && !p.mergedIntoId)
      .map((p) => ({
        id: p.id,
        userId: p.userId!,
        name: p.name,
        revision: p.revision,
      }));
  });
  app.post("/api/v1/admin/administrators", async (req) => {
    const a = await actor(req),
      b = z
        .object({ id, revision, admin: z.boolean() })
        .strict()
        .parse(req.body);
    return transact(async (s, tx) => {
      if (!isAdmin(s, a)) fail(403, "Administration access is required.");
      const p =
        s.people.find((p) => p.id === b.id && p.userId && !p.mergedIntoId) ??
        fail(404, "Account not found.");
      checkRevision(p, b.revision);
      if (
        !b.admin &&
        p.admin &&
        !s.people.some(
          (q) => q.userId && q.admin && !q.mergedIntoId && q.id !== p.id,
        )
      )
        fail(409, "Keep at least one app administrator.");
      p.admin = b.admin;
      touch(p);
      await tx.execute(
        sql`INSERT INTO admin_account_audit(actor_hash,target_hash,action) VALUES (${accountFingerprint(a.id)},${accountFingerprint(p.userId!)},${b.admin ? "admin:grant" : "admin:revoke"})`,
      );
      return { ok: true };
    });
  });
  app.get("/api/v1/admin/groups", async (req, reply) => {
    const a = await actor(req),
      s = await readState();
    if (!isAdmin(s, a)) fail(403, "Administration access is required.");
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        search: z.string().max(160).default(""),
      })
      .parse(req.query);
    reply.header("Cache-Control", "no-store");
    const rows = s.groups
      .filter((g) => g.name.toLowerCase().includes(q.search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return {
      total: rows.length,
      rows: rows.slice((q.page - 1) * 24, q.page * 24).map((g) => ({
        ...g,
        canAdminister: true,
        households: s.households.filter((h) => h.groupId === g.id),
        people: peopleForGroup(s.people, g).map((p) => ({
          id: p.id,
          name: p.name,
          revision: p.revision,
          householdIds: s.householdMemberships
            .filter(
              (m) =>
                m.personId === p.id &&
                s.households.some(
                  (h) => h.id === m.householdId && h.groupId === g.id,
                ),
            )
            .map((m) => m.householdId),
        })),
        invitations: s.invitations
          .filter(
            (i) =>
              i.groupId === g.id &&
              !i.acceptedBy &&
              !i.revoked &&
              !i.declined &&
              Date.parse(i.expiresAt) > Date.now(),
          )
          .map((i) => ({ id: i.id, email: i.email })),
        requests: s.groupInviteRequests
          .filter((r) => r.groupId === g.id && r.status === "pending")
          .map((r) => ({ id: r.id, email: r.email })),
        members: g.memberIds.map((userId) => ({
          userId,
          name:
            s.people.find((p) => p.userId === userId)?.name ?? "Former member",
        })),
      })),
    };
  });
  app.post("/api/v1/groups/admins", async (req) => {
    const a = await actor(req),
      b = z
        .object({
          groupId: id,
          revision,
          userIds: z.array(z.string().min(1)).max(100),
        })
        .strict()
        .parse(req.body);
    return transact(async (s, tx) => {
      const g = managedGroup(s, a, b.groupId);
      checkRevision(g, b.revision);
      if (
        new Set(b.userIds).size !== b.userIds.length ||
        b.userIds.some(
          (u) =>
            u === g.ownerId ||
            !g.memberIds.includes(u) ||
            !s.people.some((p) => p.userId === u && !p.mergedIntoId),
        )
      )
        fail(
          400,
          "Choose current account holders other than the primary owner.",
        );
      g.adminIds = b.userIds;
      touch(g);
      await tx.execute(
        sql`INSERT INTO admin_account_audit(actor_hash,target_hash,action) VALUES (${accountFingerprint(a.id)},${accountFingerprint(g.id)},${"family-admins:update"})`,
      );
      return { ok: true };
    });
  });
  app.post("/api/v1/groups/update", async (req) => {
    const a = await actor(req),
      b = z
        .object({ groupId: id, revision, name: text })
        .strict()
        .parse(req.body);
    return transact(async (s, tx) => {
      const g = managedGroup(s, a, b.groupId);
      checkRevision(g, b.revision);
      g.name = b.name;
      touch(g);
      await tx.execute(
        sql`INSERT INTO admin_account_audit(actor_hash,target_hash,action) VALUES (${accountFingerprint(a.id)},${accountFingerprint(g.id)},${"group:rename"})`,
      );
      return { ok: true };
    });
  });
}
