import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "../shared/model";
import { readState, transact, pool } from "./db";
import { isAdmin } from "./domain-access";
import {
  checkRevision,
  fail,
  id,
  revision,
  text,
  touch,
} from "./domain-common";

export function registerProfileAccounts(
  app: FastifyInstance,
  actor: (req: any) => Promise<Actor>,
) {
  app.post("/api/v1/account/name", async (req) => {
    const a = await actor(req);
    const b = z.object({ firstName: text, lastName: text }).parse(req.body);
    const name = text.parse(`${b.firstName} ${b.lastName}`);
    await transact(async (s, tx) => {
      const p =
        s.people.find((p) => p.userId === a.id && !p.mergedIntoId) ??
        fail(404, "Profile not found.");
      if (!p.nameSetupRequired)
        fail(409, "Your name is already set. Edit your profile to change it.");
      p.name = name;
      p.nameSetupRequired = false;
      touch(p);
      await tx.execute(
        sql`UPDATE "user" SET name=${name}, updated_at=now() WHERE id=${a.id}`,
      );
    });
    return { ok: true };
  });
  app.get("/api/v1/admin/profiles", async (req, reply) => {
    const a = await actor(req),
      s = await readState();
    if (!isAdmin(s, a)) fail(403, "Administration access is required.");
    const q = z
      .object({
        search: z.string().max(160).default(""),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const accounts = await pool.query('SELECT id,email FROM "user"');
    const emails = new Map(accounts.rows.map((u) => [u.id, u.email]));
    const rows = s.people
      .filter((p) => !p.mergedIntoId && (p.userId || p.guardians.length))
      .map((p) => ({
        id: p.id,
        revision: p.revision,
        name: p.name,
        userId: p.userId,
        email: p.userId ? emails.get(p.userId) : undefined,
        admin: !!p.admin,
        managed: !p.userId,
      }))
      .filter((p) =>
        `${p.name} ${p.email ?? ""}`
          .toLowerCase()
          .includes(q.search.toLowerCase()),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    reply.header("Cache-Control", "no-store");
    return {
      rows: rows.slice((q.page - 1) * 24, q.page * 24),
      total: rows.length,
    };
  });
  app.post("/api/v1/admin/profiles/update", async (req) => {
    const a = await actor(req),
      b = z.object({ id, revision, name: text }).parse(req.body);
    await transact(async (s, tx) => {
      if (!isAdmin(s, a)) fail(403, "Administration access is required.");
      const p =
        s.people.find(
          (p) =>
            p.id === b.id &&
            !p.mergedIntoId &&
            (p.userId || p.guardians.length),
        ) ?? fail(404, "Profile not found.");
      checkRevision(p, b.revision);
      p.name = b.name;
      touch(p);
      if (p.userId)
        await tx.execute(
          sql`UPDATE "user" SET name=${p.name}, updated_at=now() WHERE id=${p.userId}`,
        );
    });
    return { ok: true };
  });
}
