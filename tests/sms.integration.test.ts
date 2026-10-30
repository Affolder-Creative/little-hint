import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHmac } from "node:crypto";
const mail = vi.hoisted(() => vi.fn());
vi.mock("../src/server/notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/notifications")>()),
  sendEmail: (...args: unknown[]) => mail(...args),
}));
const url = process.env.SMS_TEST_DATABASE_URL;
describe.skipIf(!url)("SMS HTTP and PostgreSQL integration", () => {
  let storage: typeof import("../src/server/db"),
    app: Awaited<ReturnType<(typeof import("../src/server/app"))["makeApp"]>>,
    cookie: string;
  const phone = "+12025550123",
    origin = "http://localhost:3199",
    fetchMock = vi.fn();
  let apiPort = 0;
  async function post(path: string, body: unknown, signed = true) {
    return app.inject({
      method: "POST",
      url: path,
      headers: { origin, ...(signed ? { cookie } : {}) },
      payload: body as any,
    });
  }
  beforeAll(async () => {
    if (new URL(url!).pathname !== "/little_hint_sms_test")
      throw new Error("Use the dedicated little_hint_sms_test database.");
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_URL", origin);
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "sms-integration-test-secret-at-least-32-characters",
    );
    vi.stubEnv("SMS_PROVIDER", "textbelt");
    vi.stubEnv("TEXTBELT_API_KEY", "integration-secret");
    vi.stubEnv("PAID_DAILY_LIMIT", "50");
    vi.stubEnv("SMS_ALLOWED_EVENTS", "exchange,access");
    vi.stubGlobal("fetch", fetchMock);
    storage = await import("../src/server/db");
    await storage.migrate();
    await storage.pool.query(
      'TRUNCATE app_record, session, account, verification, passkey, "user" CASCADE',
    );
    await storage.pool.query(
      `INSERT INTO "user" (id,name,email,email_verified) VALUES ('member','Member','member@example.test',true)`,
    );
    const { stamp } = await import("../src/server/domain");
    await storage.transact((s) =>
      s.people.push({
        ...stamp(),
        userId: "member",
        name: "Member",
        guardians: [],
        admin: true,
      }),
    );
    app = await (await import("../src/server/app")).makeApp();
    await post(
      "/api/auth/email-otp/send-verification-otp",
      { email: "member@example.test", type: "sign-in" },
      false,
    );
    const code = mail.mock.calls[0][1].code;
    const signed = await post(
      "/api/auth/sign-in/email-otp",
      { email: "member@example.test", otp: code },
      false,
    );
    expect(signed.statusCode).toBe(200);
    cookie = ([signed.headers["set-cookie"]].flat() as string[])
      .map((c) => c.split(";")[0])
      .join("; ");
  });
  beforeEach(async () => {
    fetchMock.mockReset().mockImplementation(async (input: string) => {
      const u = String(input);
      return new Response(
        JSON.stringify(
          u.includes("/quota/")
            ? { success: true, quotaRemaining: 100 }
            : u.includes("/otp/verify")
              ? {
                  success: true,
                  isValidOtp: new URL(u).searchParams.get("otp") === "123456",
                }
              : {
                  success: true,
                  textId: `text-${++apiPort}`,
                  quotaRemaining: 99,
                  otp: "123456",
                },
        ),
        { headers: { "content-type": "application/json" } },
      );
    });
    mail.mockClear();
    const { stamp } = await import("../src/server/domain");
    await storage.transact((s) => {
      s.smsChallenges = [];
      s.smsAttempts = [];
      s.smsQuotas = [];
      s.smsGrants = [];
      s.smsConsents = [];
      s.preferences = [
        {
          ...stamp(),
          userId: "member",
          email: true,
          telegram: false,
          sms: false,
          events: ["access"],
          recipientUpdates: false,
          phone,
          phoneVerified: true,
          smsLogin: true,
        },
      ];
    });
  });
  afterAll(async () => {
    await app?.close();
    await storage?.pool.end();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("issues a real Better Auth session for an existing enabled phone and rejects replay", async () => {
    const sent = await post("/api/auth/sms/send-code", { phone }, false);
    expect(sent.statusCode).toBe(200);
    const { challenge } = sent.json();
    const results = await Promise.all([
      post("/api/auth/sms/sign-in", { challenge, code: "123456" }, false),
      post("/api/auth/sms/sign-in", { challenge, code: "123456" }, false),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    const cookies = results.find((r) => r.statusCode === 200)!.headers[
      "set-cookie"
    ];
    expect(cookies).toBeTruthy();
    const signedCookie = ([cookies].flat() as string[])
      .map((c) => c.split(";")[0])
      .join("; ");
    const world = await app.inject({
      url: "/api/v1/world",
      headers: { cookie: signedCookie },
    });
    expect(world.statusCode).toBe(200);
    expect(world.json().me.id).toBe("member");
    expect(
      (await storage.pool.query('SELECT count(*) FROM "user"')).rows[0].count,
    ).toBe("1");
  });
  it("does not offer direct phone signup/update/password endpoints or let SMS sessions enroll another number", async () => {
    for (const path of [
      "/phone-number/send-otp",
      "/phone-number/verify",
      "/sign-in/phone-number",
      "/phone-number/request-password-reset",
    ]) {
      const r = await post(
        `/api/auth${path}`,
        { phoneNumber: phone, code: "123456", updatePhoneNumber: true },
        false,
      );
      expect(r.statusCode).toBe(404);
    }
    const r = await post("/api/v1/channels/sms/start", {
      phone: "+12025550124",
      consent: true,
    });
    expect(r.statusCode).toBe(403);
    const login = await post("/api/v1/channels/sms/login", {
      enabled: true,
      consent: true,
    });
    expect(login.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("links a phone after session-bound email confirmation without subscribing it", async () => {
    const sent = await post("/api/v1/channels/sms/reauth/start", {});
    expect(sent.statusCode).toBe(200);
    const confirmed = await post("/api/v1/channels/sms/reauth/verify", {
      challenge: sent.json().challenge,
      code: mail.mock.calls[0][1].code,
    });
    expect(confirmed.statusCode).toBe(200);
    const start = await post("/api/v1/channels/sms/start", {
      phone: "+12025550124",
      consent: true,
    });
    expect(start.statusCode).toBe(200);
    expect((await storage.readState()).preferences[0].phone).toBe(phone);
    const verify = await post("/api/v1/channels/sms/verify", {
      challenge: start.json().challenge,
      code: "123456",
    });
    expect(verify.statusCode).toBe(200);
    expect((await storage.readState()).preferences[0]).toMatchObject({
      phone: "+12025550124",
      sms: false,
      smsLogin: false,
    });
    expect(
      (await post("/api/v1/channels/sms/login", { enabled: true })).statusCode,
    ).toBe(400);
    expect(
      (
        await post("/api/v1/channels/sms/login", {
          enabled: true,
          consent: true,
        })
      ).statusCode,
    ).toBe(200);
  });
  it("verifies raw webhook bytes, rejects forgeries, and never silently resubscribes after START", async () => {
    await storage.transact((s) => {
      s.preferences[0].sms = true;
    });
    const raw = JSON.stringify(
        { fromNumber: phone, text: "STOP", textId: "text-1" },
        null,
        2,
      ),
      timestamp = String(Math.floor(Date.now() / 1000));
    const signed = (raw: string) =>
      createHmac("sha256", "integration-secret")
        .update(timestamp + raw)
        .digest("hex");
    const hook = (raw: string, signature: string) =>
      app.inject({
        method: "POST",
        url: "/api/hooks/textbelt",
        headers: {
          "content-type": "application/json",
          "x-textbelt-timestamp": timestamp,
          "x-textbelt-signature": signature,
        },
        payload: raw,
      });
    expect((await hook(raw, "invalid")).statusCode).toBe(403);
    expect((await hook(raw, signed(raw))).statusCode).toBe(200);
    expect((await hook(raw, signed(raw))).statusCode).toBe(200);
    expect((await storage.readState()).preferences[0]).toMatchObject({
      sms: false,
      smsOptOut: true,
    });
    const start = raw.replace("STOP", "START");
    expect((await hook(start, signed(start))).statusCode).toBe(200);
    expect((await storage.readState()).preferences[0]).toMatchObject({
      sms: false,
      smsOptOut: false,
    });
  });
  it("records signed Twilio delivery callbacks against current SMS attempts", async () => {
    const { stamp } = await import("../src/server/domain");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-test-secret");
    const reference = "current-notice";
    await storage.transact((s) =>
      s.smsAttempts.push({
        ...stamp(),
        userId: "member",
        phone,
        provider: "twilio",
        account: "test",
        purpose: "activity",
        reference,
        providerId: "SM-test",
        status: "accepted",
        segments: 1,
      }),
    );
    const path = `/api/hooks/twilio/status?sms=${reference}`;
    const body = { MessageSid: "SM-test", MessageStatus: "delivered" };
    const signature = createHmac("sha1", "twilio-test-secret")
      .update(
        origin +
          path +
          Object.entries(body)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => k + v)
            .join(""),
      )
      .digest("base64");
    const response = await app.inject({
      method: "POST",
      url: path,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": signature,
      },
      payload: new URLSearchParams(body).toString(),
    });
    expect(response.statusCode).toBe(200);
    expect((await storage.readState()).smsAttempts[0].status).toBe("delivered");
  });
  it("uses the PostgreSQL advisory lock to prevent duplicate paid submissions", async () => {
    const { stamp } = await import("../src/server/domain"),
      { smsConsentVersion } = await import("../src/shared/sms"),
      { sendActivitySms } = await import("../src/server/sms");
    const id = await storage.transact((s) => {
      Object.assign(s.preferences[0], {
        sms: true,
        smsConsentVersion,
        smsConsentedDailyLimit: 2,
        channelEvents: { sms: ["access"], email: [], telegram: [] },
      });
      const n = {
        ...stamp(),
        userId: "member",
        event: "access" as const,
        action: "access-lost",
        status: "pending" as const,
        attempts: 0,
        delivered: [],
      };
      s.notices.push(n);
      return n.id;
    });
    await Promise.all(Array.from({ length: 5 }, () => sendActivitySms(id)));
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/text")),
    ).toHaveLength(1);
    expect((await storage.readState()).smsAttempts).toHaveLength(1);
  });
});
