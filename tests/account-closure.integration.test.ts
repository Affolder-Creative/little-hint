import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { stamp } from "../src/server/domain-common";
import { sql } from "drizzle-orm";
const mail = vi.hoisted(() => vi.fn());
vi.mock("../src/server/notifications", async (original) => ({
  ...(await original<typeof import("../src/server/notifications")>()),
  sendEmail: (...args: unknown[]) => mail(...args),
}));
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("atomic account closure", () => {
  let storage: typeof import("../src/server/db"),
    app: Awaited<ReturnType<(typeof import("../src/server/app"))["makeApp"]>>;
  let cookie = "",
    otherCookie = "",
    clock = Date.now(),
    n = 0;
  let id: string, email: string, personId: string;
  const origin = "http://localhost:3197";
  const post = (
    path: string,
    body: unknown = {},
    auth = cookie,
    requestOrigin = origin,
  ) =>
    app.inject({
      method: "POST",
      url: path,
      headers: { origin: requestOrigin, cookie: auth },
      payload: body as any,
    });
  async function signIn() {
    const sent = await post(
      "/api/auth/email-otp/send-verification-otp",
      { email, type: "sign-in" },
      "",
    );
    expect(sent.statusCode, sent.body).toBe(200);
    const response = await post(
      "/api/auth/sign-in/email-otp",
      { email, otp: mail.mock.calls.at(-1)![1].code },
      "",
    );
    expect(response.statusCode, response.body).toBe(200);
    return ([response.headers["set-cookie"]].flat() as string[])
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  async function start() {
    const response = await post("/api/v1/account/closure/start");
    expect(response.statusCode, response.body).toBe(200);
    return {
      challenge: response.json().challenge as string,
      code: mail.mock.calls.at(-1)![1].text.match(/\b\d{6}\b/)[0] as string,
      confirmation: "DELETE",
    };
  }
  const exists = async () =>
    (await storage.pool.query('SELECT id FROM "user" WHERE id=$1', [id]))
      .rowCount;
  beforeAll(async () => {
    if (new URL(url!).pathname !== "/little_hint_test")
      throw new Error("Use isolated little_hint_test.");
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "closure-test-secret-with-at-least-32-characters",
    );
    storage = await import("../src/server/db");
    await storage.migrate();
    app = await (await import("../src/server/app")).makeApp();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    clock += 3_601_000;
    vi.setSystemTime(clock);
    id = `closure-${++n}`;
    email = `closure-${n}@example.test`;
    personId = stamp().id;
    await storage.pool.query(
      'TRUNCATE app_record, session, account, verification, passkey, "user", closed_account CASCADE',
    );
    await storage.pool.query(
      'INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,$2,$3,true)',
      [id, "Closing Member", email],
    );
    await storage.transact((s) =>
      s.people.push({
        ...stamp(),
        id: personId,
        name: "Closing Member",
        userId: id,
        guardians: [],
      }),
    );
    cookie = await signIn();
    otherCookie = await signIn();
  });
  afterAll(async () => {
    vi.useRealTimers();
    await app?.close();
    await storage?.pool.end();
    vi.unstubAllEnvs();
  });
  it("requires authentication, same origin, and the exact destructive confirmation", async () => {
    expect(
      (await post("/api/v1/account/closure/start", {}, "")).statusCode,
    ).toBe(401);
    expect(
      (
        await post(
          "/api/v1/account/closure/start",
          {},
          cookie,
          "https://untrusted.example",
        )
      ).statusCode,
    ).toBe(403);
    const body = await start();
    expect(
      (
        await post("/api/v1/account/closure/confirm", {
          ...body,
          confirmation: "delete",
        })
      ).statusCode,
    ).toBe(400);
    expect(await exists()).toBe(1);
    const row = (
      await storage.pool.query("SELECT value FROM verification WHERE id=$1", [
        body.challenge,
      ])
    ).rows[0];
    expect(row.value).not.toContain(body.code);
  });
  it("persists wrong-code attempts and locks out after five failures", async () => {
    const body = await start();
    for (let attempt = 0; attempt < 5; attempt++)
      expect(
        (
          await post("/api/v1/account/closure/confirm", {
            ...body,
            code: body.code === "000000" ? "000001" : "000000",
          })
        ).statusCode,
      ).toBe(409);
    const blocked = await post("/api/v1/account/closure/confirm", body);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.body).toContain("no longer available");
    expect(await exists()).toBe(1);
  });
  it("binds a code to its device, rejects expiry, and replaces previous challenges", async () => {
    const body = await start();
    expect(
      (await post("/api/v1/account/closure/confirm", body, otherCookie))
        .statusCode,
    ).toBe(409);
    vi.setSystemTime(Date.now() + 601000);
    expect(
      (await post("/api/v1/account/closure/confirm", body)).statusCode,
    ).toBe(409);
    const next = await start();
    expect(next.challenge).not.toBe(body.challenge);
    expect(
      (await post("/api/v1/account/closure/confirm", body)).statusCode,
    ).toBe(409);
    expect(await exists()).toBe(1);
  });
  it("rechecks commitments introduced after the review/code was issued", async () => {
    const body = await start();
    await storage.transact((s) =>
      s.reservations.push({
        ...stamp(),
        itemId: stamp().id,
        buyerId: id,
        quantity: 1,
        purchased: 0,
        former: false,
        titleSnapshot: "New commitment",
      }),
    );
    const response = await post("/api/v1/account/closure/confirm", body);
    expect(response.statusCode).toBe(409);
    expect(response.body).toContain("responsibilities changed");
    expect(await exists()).toBe(1);
    expect((await storage.readState()).reservations[0].quantity).toBe(1);
  });
  it("rolls back private data, challenge consumption, and the write barrier when auth deletion fails", async () => {
    const body = await start();
    const before = await storage.readState();
    await storage.pool.query(
      "CREATE OR REPLACE FUNCTION reject_test_closure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$",
    );
    await storage.pool.query(
      'CREATE TRIGGER reject_test_closure BEFORE DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION reject_test_closure()',
    );
    try {
      expect(
        (await post("/api/v1/account/closure/confirm", body)).statusCode,
      ).toBe(500);
      expect(await exists()).toBe(1);
      expect(await storage.readState()).toEqual(before);
      expect(
        (
          await storage.pool.query("SELECT id FROM verification WHERE id=$1", [
            body.challenge,
          ])
        ).rowCount,
      ).toBe(1);
      expect(
        (await storage.pool.query("SELECT * FROM closed_account")).rowCount,
      ).toBe(0);
    } finally {
      await storage.pool.query('DROP TRIGGER reject_test_closure ON "user"');
      await storage.pool.query("DROP FUNCTION reject_test_closure()");
    }
  });
  it("commits closure once, cascades credentials, and rejects late writes and old devices", async () => {
    await storage.pool.query(
      "INSERT INTO passkey (id,public_key,user_id,credential_id,counter,device_type,backed_up) VALUES ($1,$2,$3,$4,0,$5,false)",
      [stamp().id, "synthetic", id, stamp().id, "singleDevice"],
    );
    await storage.pool.query(
      "INSERT INTO account (id,account_id,provider_id,user_id) VALUES ($1,$2,$3,$4)",
      [stamp().id, id, "test", id],
    );
    await storage.transact((s) => {
      s.imports.push({
        ...stamp(),
        userId: id,
        url: "https://private.example",
        status: "pending",
      });
      s.media.push({ ...stamp(), userId: id, file: "closure-test.webp" });
    });
    const body = await start();
    const results = await Promise.all([
      post("/api/v1/account/closure/confirm", body),
      post("/api/v1/account/closure/confirm", body),
    ]);
    expect(
      results.map((r) => r.statusCode).filter((s) => s === 200),
    ).toHaveLength(1);
    expect(await exists()).toBe(0);
    for (const table of ["session", "passkey", "account"])
      expect(
        (
          await storage.pool.query(`SELECT * FROM ${table} WHERE user_id=$1`, [
            id,
          ])
        ).rowCount,
      ).toBe(0);
    expect(
      (
        await storage.pool.query("SELECT id FROM verification WHERE id=$1", [
          body.challenge,
        ])
      ).rowCount,
    ).toBe(0);
    for (const auth of [cookie, otherCookie]) {
      for (const format of ["json", "csv"]) {
        const exported = await post(
          "/api/v1/account/export",
          { format, table: "wishes" },
          auth,
        );
        expect(exported.statusCode, exported.body).toBe(401);
        expect(exported.body).not.toContain(email);
      }
      expect(
        (await app.inject({ url: "/api/v1/world", headers: { cookie: auth } }))
          .statusCode,
      ).toBe(401);
    }
    const state = await storage.readState();
    expect(state.imports).toEqual([]);
    expect(state.media[0].deletedAt).toBeTruthy();
    expect(state.people[0].name).toBe("Former member");
    expect(JSON.stringify(state)).not.toContain(id);
    await expect(
      storage.transact((s) =>
        s.imports.push({
          ...stamp(),
          userId: id,
          url: "https://late.example",
          status: "pending",
        }),
      ),
    ).rejects.toThrow(/closed/);
    expect((await storage.readState()).imports).toEqual([]);
    // Transaction callbacks can use the same connection for domain/auth work.
    await expect(
      storage.transact(async (s, tx) => {
        s.people.push({ ...stamp(), name: "Rollback", guardians: [] });
        await tx.execute(sql`SELECT 1`);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect((await storage.readState()).people).toHaveLength(1);
  });
});
