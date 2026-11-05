import {
  beforeEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const mail = vi.hoisted(() => vi.fn());
vi.mock("../src/server/notifications", async (original) => ({
  ...(await original<typeof import("../src/server/notifications")>()),
  sendEmail: (...args: unknown[]) => mail(...args),
}));
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("verified account email change", () => {
  let storage: typeof import("../src/server/db"),
    app: Awaited<ReturnType<(typeof import("../src/server/app"))["makeApp"]>>;
  const origin = "http://localhost:3198";
  const oldEmail = "email-member@example.test",
    nextEmail = "new-address@example.test";
  let cookie = "",
    otherCookie = "";
  const post = (path: string, body: unknown, auth = cookie) =>
    app.inject({
      method: "POST",
      url: `/api/auth/${path}`,
      headers: { origin, cookie: auth },
      payload: body as any,
    });
  const code = () => mail.mock.calls.at(-1)![1].code as string;
  async function signIn(email: string) {
    expect(
      (
        await post(
          "email-otp/send-verification-otp",
          { email, type: "sign-in" },
          "",
        )
      ).statusCode,
    ).toBe(200);
    const response = await post(
      "sign-in/email-otp",
      { email, otp: code() },
      "",
    );
    expect(response.statusCode, response.body).toBe(200);
    return ([response.headers["set-cookie"]].flat() as string[])
      .map((c) => c.split(";")[0])
      .join("; ");
  }
  beforeAll(async () => {
    if (new URL(url!).pathname !== "/little_hint_test")
      throw new Error("Use isolated little_hint_test.");
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "email-change-test-secret-at-least-32-characters",
    );
    storage = await import("../src/server/db");
    await storage.migrate();
    await storage.pool.query(
      'TRUNCATE app_record, session, account, verification, passkey, "user" CASCADE',
    );
    await storage.pool.query(
      'INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,$2,$3,true), ($4,$5,$6,true)',
      [
        "email-member",
        "Member",
        oldEmail,
        "occupied",
        "Other",
        "occupied@example.test",
      ],
    );
    await storage.transact((s) =>
      s.people.push({
        id: "email-person",
        revision: 1,
        createdAt: new Date().toISOString(),
        userId: "email-member",
        name: "Member",
        guardians: [],
      }),
    );
    app = await (await import("../src/server/app")).makeApp();
    cookie = await signIn(oldEmail);
    otherCookie = await signIn(oldEmail);
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 61_000));
  });
  afterAll(async () => {
    vi.useRealTimers();
    await app?.close();
    await storage?.pool.end();
    vi.unstubAllEnvs();
  });
  it("requires authentication and current-address verification, without sending to an unverified target", async () => {
    expect(
      (
        await post(
          "email-otp/request-email-change",
          { newEmail: nextEmail },
          "",
        )
      ).statusCode,
    ).toBe(401);
    const sent = mail.mock.calls.length;
    expect(
      (await post("email-otp/request-email-change", { newEmail: nextEmail }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await post("email-otp/request-email-change", {
          newEmail: nextEmail,
          otp: "000000",
        })
      ).statusCode,
    ).toBe(400);
    expect(mail).toHaveBeenCalledTimes(sent);
    expect(
      (await post("change-email", { newEmail: nextEmail })).statusCode,
    ).not.toBe(200);
  });
  it("requires a second single-use code, preserves identity, and revokes all devices", async () => {
    await post("email-otp/send-verification-otp", {
      email: oldEmail,
      type: "email-verification",
    });
    const currentCode = code();
    expect(mail.mock.calls.at(-1)![1].purpose).toBe("email-change");
    expect(
      (
        await post("email-otp/request-email-change", {
          newEmail: nextEmail,
          otp: currentCode,
        })
      ).statusCode,
    ).toBe(200);
    const newCode = code();
    expect(mail.mock.calls.at(-1)![0]).toBe(nextEmail);
    expect(
      (
        await post("email-otp/request-email-change", {
          newEmail: "third@example.test",
          otp: currentCode,
        })
      ).statusCode,
    ).toBe(400);
    const wrong = newCode === "000000" ? "000001" : "000000";
    expect(
      (
        await post("email-otp/change-email", {
          newEmail: nextEmail,
          otp: wrong,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await storage.pool.query('SELECT email FROM "user" WHERE id=$1', [
          "email-member",
        ])
      ).rows[0].email,
    ).toBe(oldEmail);
    const changed = await post("email-otp/change-email", {
      newEmail: nextEmail,
      otp: newCode,
    });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(
      (
        await storage.pool.query(
          'SELECT id,email,email_verified FROM "user" WHERE id=$1',
          ["email-member"],
        )
      ).rows[0],
    ).toEqual({ id: "email-member", email: nextEmail, email_verified: true });
    expect(
      (await storage.readState()).people.find((p) => p.id === "email-person")
        ?.userId,
    ).toBe("email-member");
    for (const oldCookie of [cookie, otherCookie])
      expect(
        (
          await app.inject({
            url: "/api/v1/world",
            headers: { cookie: oldCookie },
          })
        ).statusCode,
      ).toBe(401);
    cookie = await signIn(nextEmail);
    expect(
      (await app.inject({ url: "/api/v1/world", headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await post("email-otp/change-email", {
          newEmail: nextEmail,
          otp: newCode,
        })
      ).statusCode,
    ).not.toBe(200);
  });
  it("does not send a change code to an occupied address or alter either account", async () => {
    await post("email-otp/send-verification-otp", {
      email: nextEmail,
      type: "email-verification",
    });
    const currentCode = code(),
      sent = mail.mock.calls.length;
    expect(
      (
        await post("email-otp/request-email-change", {
          newEmail: "occupied@example.test",
          otp: currentCode,
        })
      ).statusCode,
    ).toBe(200);
    expect(mail).toHaveBeenCalledTimes(sent);
    expect(
      (
        await storage.pool.query('SELECT email FROM "user" WHERE id=$1', [
          "email-member",
        ])
      ).rows[0].email,
    ).toBe(nextEmail);
  });
  it("rejects expired verification and keeps invitation-only signup intact", async () => {
    await post("email-otp/send-verification-otp", {
      email: nextEmail,
      type: "email-verification",
    });
    const expired = code();
    vi.setSystemTime(new Date(Date.now() + 601_000));
    expect(
      (
        await post("email-otp/request-email-change", {
          newEmail: "unused@example.test",
          otp: expired,
        })
      ).statusCode,
    ).toBe(400);
    const sent = mail.mock.calls.length;
    await post(
      "email-otp/send-verification-otp",
      { email: "uninvited@example.test", type: "sign-in" },
      "",
    );
    await post(
      "email-otp/send-verification-otp",
      { email: oldEmail, type: "sign-in" },
      "",
    );
    expect(mail).toHaveBeenCalledTimes(sent);
  });
});
