import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { stamp, DomainError } from "../src/server/domain-common";
import { emptyState, type Actor } from "../src/shared/model";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("administration roles over HTTP", () => {
  let storage: typeof import("../src/server/db");
  let app: FastifyInstance;
  const actors: Actor[] = [
    "App admin",
    "Family owner",
    "Additional admin",
    "Member",
  ].map((name) => ({
    id: stamp().id,
    name,
    email: `${stamp().id}@example.test`,
  }));
  let personIds: string[], groupId: string;
  const post = (path: string, body: unknown, actor = 0) =>
    app.inject({
      method: "POST",
      url: `/api/v1/${path}`,
      headers: { "x-test-actor": String(actor) },
      payload: body as any,
    });
  beforeAll(async () => {
    if (new URL(url!).pathname !== "/little_hint_test")
      throw new Error("Use isolated little_hint_test.");
    process.env.DATABASE_URL = url;
    storage = await import("../src/server/db");
    await storage.migrate();
    app = Fastify();
    app.setErrorHandler((error, req, reply) => {
      reply.code(error instanceof DomainError ? error.status : 400).send({
        message: error instanceof Error ? error.message : "Request failed",
      });
    });
    const { registerAdminRoles } = await import("../src/server/admin-roles");
    const { registerProfileAccounts } =
      await import("../src/server/profile-accounts");
    registerProfileAccounts(
      app,
      async (req) => actors[Number(req.headers["x-test-actor"] ?? 0)],
    );
    registerAdminRoles(
      app,
      async (req) => actors[Number(req.headers["x-test-actor"] ?? 0)],
    );
  });
  beforeEach(async () => {
    await storage.pool.query("DELETE FROM app_record");
    for (const a of actors)
      await storage.pool.query(
        'INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,$2,$3,true) ON CONFLICT (id) DO NOTHING',
        [a.id, a.name, a.email],
      );
    await storage.transact((s) => {
      Object.assign(s, emptyState());
      s.people = actors.map((a, n) => ({
        ...stamp(),
        name: a.name,
        userId: a.id,
        guardians: [],
        admin: n === 0,
      }));
      personIds = s.people.map((p) => p.id);
      const group = {
        ...stamp(),
        name: "Family",
        ownerId: actors[1].id,
        memberIds: actors.slice(1).map((a) => a.id),
        adminIds: [actors[2].id],
      };
      groupId = group.id;
      s.groups.push(group);
    });
  });
  afterAll(async () => {
    await app?.close();
    await storage?.pool.end();
  });
  it("allows multiple app admins and serializes concurrent last-admin removals", async () => {
    expect(
      (
        await post("admin/administrators", {
          id: personIds[2],
          revision: 1,
          admin: true,
        })
      ).statusCode,
    ).toBe(200);
    const s = await storage.readState();
    const results = await Promise.all(
      [0, 2].map((n) =>
        post(
          "admin/administrators",
          {
            id: personIds[n],
            revision: s.people.find((p) => p.id === personIds[n])!.revision,
            admin: false,
          },
          n,
        ),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      (await storage.readState()).people.filter((p) => p.admin),
    ).toHaveLength(1);
  });
  it("restricts global roles, validates family membership, and protects the owner", async () => {
    expect(
      (
        await post(
          "admin/administrators",
          { id: personIds[3], revision: 1, admin: true },
          2,
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await post(
          "groups/admins",
          { groupId, revision: 1, userIds: [actors[3].id] },
          3,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await post(
          "groups/admins",
          { groupId, revision: 1, userIds: [actors[0].id] },
          2,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await post(
          "groups/admins",
          { groupId, revision: 1, userIds: [actors[1].id] },
          2,
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await post(
          "groups/admins",
          { groupId, revision: 1, userIds: [actors[2].id, actors[3].id] },
          2,
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (await post("groups/admins", { groupId, revision: 1, userIds: [] }, 2))
        .statusCode,
    ).toBe(409);
  });
  it("filters administrator candidates before pagination and includes account email", async () => {
    await storage.transact((s) => {
      s.people.forEach((p) => {
        p.name = "Same name";
      });
      for (let i = 0; i < 30; i++) {
        const p = { ...stamp(), name: "Same name", guardians: [actors[0].id] };
        s.people.push(p);
      }
      s.people.push({
        ...stamp(),
        name: "Same name",
        userId: "deleted-account",
        guardians: [],
      });
    });
    const candidates = await app.inject(
      "/api/v1/admin/profiles?search=Same&eligibleForAdmin=true",
    );
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json().total).toBe(3);
    expect(
      candidates
        .json()
        .rows.map((p: any) => p.email)
        .sort(),
    ).toEqual(
      actors
        .slice(1)
        .map((a) => a.email)
        .sort(),
    );
    expect(
      candidates.json().rows.every((p: any) => !p.admin && !p.managed),
    ).toBe(true);
    expect(
      (await app.inject("/api/v1/admin/administrators")).json()[0].email,
    ).toBe(actors[0].email);
    expect(
      (
        await app.inject({
          url: "/api/v1/admin/profiles?search=Same&eligibleForAdmin=true",
          headers: { "x-test-actor": "3" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("loads one unjoined group without exposing content or granting membership", async () => {
    const result = await app.inject(`/api/v1/admin/groups/${groupId}`);
    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.json().id).toBe(groupId);
    expect(result.json().members[0]).toMatchObject({ admin: false });
    expect(result.json()).not.toHaveProperty("items");
    expect(result.json()).not.toHaveProperty("lists");
    expect((await storage.readState()).groups[0].memberIds).not.toContain(
      actors[0].id,
    );
    expect(
      (
        await app.inject({
          url: `/api/v1/admin/groups/${groupId}`,
          headers: { "x-test-actor": "2" },
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject(`/api/v1/admin/groups/missing`)).statusCode).toBe(
      404,
    );
  });
  it("lets app admins manage unjoined groups without changing membership", async () => {
    const res = await app.inject("/api/v1/admin/groups");
    expect(res.statusCode).toBe(200);
    expect(res.json().rows[0].members).toHaveLength(3);
    expect(res.json().rows[0].people).toHaveLength(3);
    expect(res.json().rows[0].households).toEqual([]);
    expect(res.json().rows[0].invitations).toEqual([]);
    expect(res.json().rows[0].requests).toEqual([]);
    expect(
      (await post("groups/update", { groupId, revision: 1, name: "Renamed" }))
        .statusCode,
    ).toBe(200);
    expect((await storage.readState()).groups[0].memberIds).not.toContain(
      actors[0].id,
    );
    expect(
      (
        await app.inject({
          url: "/api/v1/admin/groups",
          headers: { "x-test-actor": "2" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("revokes family role immediately and preserves bootstrap on repeated migrations", async () => {
    expect(
      (await post("groups/admins", { groupId, revision: 1, userIds: [] }, 1))
        .statusCode,
    ).toBe(200);
    expect(
      (await post("groups/update", { groupId, revision: 2, name: "Denied" }, 2))
        .statusCode,
    ).toBe(404);
    await storage.migrate();
    await storage.migrate();
    expect(
      (await storage.readState()).people
        .filter((p) => p.admin)
        .map((p) => p.id),
    ).toEqual([personIds[0]]);
  });
});
