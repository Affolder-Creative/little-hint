import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DomainError, stamp } from "../src/server/domain-common";
import { accountFingerprint } from "../src/server/closed-accounts";
import { fixture } from "./privacy-fixture";
import { commandWithAudience as command } from "./discussion-command";
import type { Reservation } from "../src/shared/model";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("admin gift protection over HTTP", () => {
  let db: typeof import("../src/server/db");
  let app: FastifyInstance;
  let f: ReturnType<typeof fixture>;
  let reservationId: string;
  const post = (
    action: "review" | "override",
    body: unknown,
    actor = 0,
    key = stamp().id,
  ) =>
    app.inject({
      method: "POST",
      url: `/api/v1/admin/gift-protection/${action}`,
      headers: {
        "x-test-actor": String(actor),
        "idempotency-key": key,
      },
      payload: body as Record<string, unknown>,
    });
  const target = (operation: "archive" | "trash" | "purge" = "trash") => ({
    kind: "items",
    id: f.item.id,
    revision: f.item.revision,
    operation,
  });
  async function reviewed(operation: "archive" | "trash" | "purge" = "trash") {
    const body = target(operation);
    const response = await post("review", body);
    expect(response.statusCode).toBe(200);
    return {
      ...body,
      token: response.json().token,
      confirmation: "OVERRIDE",
      reason: "Buyer is unavailable to correct this purchase.",
    };
  }
  const audits = () =>
    db.pool.query(
      "SELECT action,reason FROM admin_account_audit WHERE target_hash=$1",
      [accountFingerprint(f.item.id)],
    );

  beforeAll(async () => {
    if (new URL(url!).pathname !== "/little_hint_test")
      throw new Error("Use isolated little_hint_test.");
    process.env.DATABASE_URL = url;
    process.env.BETTER_AUTH_SECRET ??=
      "purchase-protection-integration-test-secret";
    db = await import("../src/server/db");
    await db.migrate();
    app = Fastify();
    app.setErrorHandler((error, _req, reply) => {
      reply.code(error instanceof DomainError ? error.status : 400).send({
        message: error instanceof Error ? error.message : "Request failed",
      });
    });
    const { registerAdminGiftProtection } =
      await import("../src/server/admin-gift-protection");
    registerAdminGiftProtection(
      app,
      async (req) => f.actors[Number(req.headers["x-test-actor"] ?? 0)],
    );
  });
  beforeEach(async () => {
    f = fixture();
    f.state.people[0].admin = true;
    f.state.people[3].admin = true;
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[3].id);
    const created = command(f.state, f.actors[1], "reservations.create", {
      itemId: f.item.id,
      quantity: 2,
    }) as Reservation;
    reservationId = created.id;
    const r = f.state.reservations.find((r) => r.id === reservationId)!;
    command(f.state, f.actors[1], "reservations.update", {
      ...r,
      purchased: 1,
    });
    await db.transact((s) => Object.assign(s, f.state));
  });
  afterAll(async () => {
    await app?.close();
    await db?.pool.end();
  });

  it("requires app administration and existing content access", async () => {
    expect((await post("review", target(), 1)).statusCode).toBe(403);
    expect((await post("review", target(), 3)).statusCode).toBe(404);
    const body = await reviewed();
    expect((await post("override", body, 1)).statusCode).toBe(403);
    expect((await post("override", body, 3)).statusCode).toBe(404);
    expect((await audits()).rows).toHaveLength(0);
  });

  it("reviews a recipient-admin's target without disclosing purchase information", async () => {
    const response = await post("review", target());
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: f.item.title,
      revision: f.item.revision,
      token: expect.any(String),
    });
    for (const hidden of [
      reservationId,
      f.actors[1].id,
      f.actors[1].name,
      "purchased",
      "quantity",
    ])
      expect(response.body).not.toContain(hidden);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("retains buying history and records exactly one audit for identical retries", async () => {
    const body = await reviewed();
    const key = stamp().id;
    const responses = await Promise.all([
      post("override", body, 0, key),
      post("override", body, 0, key),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    const saved = await db.readState();
    expect(saved.items.find((i) => i.id === f.item.id)?.deletedAt).toBeTruthy();
    expect(
      saved.reservations.find((r) => r.id === reservationId),
    ).toMatchObject({ purchased: 1, sourceState: "removed" });
    expect((await audits()).rows).toEqual([
      { action: "gift-protection:items:trash", reason: body.reason },
    ]);
    expect(
      (
        await post(
          "override",
          { ...body, reason: "A different request" },
          0,
          key,
        )
      ).statusCode,
    ).toBe(409);
    expect((await audits()).rows).toHaveLength(1);
  });

  it("rejects purchase changes after review without changing the gift or writing an audit", async () => {
    const body = await reviewed();
    await db.transact((s) => {
      const r = s.reservations.find((r) => r.id === reservationId)!;
      command(s, f.actors[1], "reservations.update", { ...r, purchased: 2 });
    });
    const response = await post("override", body);
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toMatch(/review/i);
    expect(
      (await db.readState()).items.find((i) => i.id === f.item.id)?.deletedAt,
    ).toBeUndefined();
    expect((await audits()).rows).toHaveLength(0);
  });

  it("requires a reason, confirmation, current authority, and Trash before purge", async () => {
    expect((await post("review", target("purge"))).statusCode).toBe(403);
    const body = await reviewed();
    expect(
      (await post("override", { ...body, reason: "   " })).statusCode,
    ).toBe(400);
    expect(
      (await post("override", { ...body, confirmation: "yes" })).statusCode,
    ).toBe(400);
    await db.transact((s) => {
      s.people.find((p) => p.userId === f.actors[0].id)!.admin = false;
    });
    expect((await post("override", body)).statusCode).toBe(403);
    expect((await audits()).rows).toHaveLength(0);
  });

  it("requires a separate purge review and retains purchased history after deletion", async () => {
    expect((await post("override", await reviewed())).statusCode).toBe(200);
    f.item = (await db.readState()).items.find((i) => i.id === f.item.id)!;
    const body = await reviewed("purge");
    expect((await post("override", body)).statusCode).toBe(200);
    const saved = await db.readState();
    expect(saved.items.some((i) => i.id === f.item.id)).toBe(false);
    expect(
      saved.reservations.find((r) => r.id === reservationId),
    ).toMatchObject({
      purchased: 1,
      sourceState: "removed",
    });
    expect((await audits()).rows.map((row) => row.action).sort()).toEqual([
      "gift-protection:items:purge",
      "gift-protection:items:trash",
    ]);
  });

  it("serializes ordinary purchase and removal without deleting a purchased gift", async () => {
    await db.transact((s) => {
      const r = s.reservations.find((r) => r.id === reservationId)!;
      command(s, f.actors[1], "reservations.update", { ...r, purchased: 0 });
    });
    const results = await Promise.allSettled([
      db.transact((s) => {
        const r = s.reservations.find((r) => r.id === reservationId)!;
        command(s, f.actors[1], "reservations.update", { ...r, purchased: 1 });
      }),
      db.transact((s) => {
        const item = s.items.find((i) => i.id === f.item.id)!;
        command(s, f.actors[0], "items.trash", {
          id: item.id,
          revision: item.revision,
        });
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const saved = await db.readState();
    const item = saved.items.find((i) => i.id === f.item.id)!;
    const reservation = saved.reservations.find((r) => r.id === reservationId)!;
    expect(Boolean(item.deletedAt) && reservation.purchased > 0).toBe(false);
  });
});
