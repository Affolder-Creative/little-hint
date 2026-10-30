import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { emptyState, type State } from "../src/shared/model";
import { stamp, preferences } from "../src/server/domain";
import { smsConsentVersion, smsActivityMessage } from "../src/shared/sms";
import {
  smsInfo,
  providerSend,
  providerVerify,
  verifyTextbelt,
} from "../src/server/sms-provider";
import {
  activityReason,
  budgetReason,
  notificationConsent,
  recordTransport,
  transportBlocked,
  challengeRateLimited,
} from "../src/server/sms-policy";
import { smsUsage } from "../src/server/sms-usage";
import { effectiveConfig } from "../src/server/settings";
const m = vi.hoisted(() => ({
  s: null as State | null,
  c: {} as Record<string, string>,
  fetch: vi.fn(),
  mail: vi.fn(),
  tail: Promise.resolve(),
}));
vi.mock("../src/server/notifications", () => ({
  sendEmail: (...a: unknown[]) => m.mail(...a),
}));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));
vi.mock("../src/server/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/settings")>()),
  config: async () => m.c,
}));
vi.mock("../src/server/db", () => ({
  readState: async () => structuredClone(m.s),
  transact: async (fn: (s: State) => unknown) => {
    const next = structuredClone(m.s!);
    const result = await fn(next);
    m.s = next;
    return result;
  },
  pool: {
    query: async () => ({ rows: [{ email: "member@example.test" }] }),
    connect: async () => {
      let unlock: () => void = () => {};
      return {
        query: async (sql: string) => {
          if (sql.includes("pg_advisory_lock")) {
            const prior = m.tail;
            m.tail = new Promise<void>((r) => {
              unlock = r;
            });
            await prior;
          } else if (sql.includes("pg_advisory_unlock")) unlock();
        },
        release: () => {},
      };
    },
  },
}));
import {
  sendActivitySms,
  startSms,
  verifySms,
  startSmsReauth,
  verifySmsReauth,
  requireSmsGrant,
  changeSmsLogin,
  refreshSmsQuota,
  pollSmsStatus,
  alertLowSmsCredit,
} from "../src/server/sms";
const actor = { id: "member", email: "member@example.test", name: "Member" },
  phone = "+12025550123";
function fixture() {
  const s = emptyState();
  s.people.push({
    ...stamp(),
    userId: actor.id,
    name: actor.name,
    guardians: [],
  });
  const p = preferences(s, actor);
  Object.assign(p, {
    phone,
    phoneVerified: true,
    sms: true,
    smsLogin: true,
    smsConsentVersion,
    channelEvents: {
      email: ["access"],
      telegram: ["access"],
      sms: ["access", "exchange"],
    },
  });
  s.preferences.push(p);
  const n = {
    ...stamp(),
    userId: actor.id,
    event: "access" as const,
    action: "access-lost",
    status: "pending" as const,
    attempts: 0,
    delivered: [],
  };
  s.notices.push(n);
  m.s = s;
  return { s, p, n };
}
function response(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-30T12:00:00Z"));
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "sms-unit-test-secret-of-at-least-32-characters",
  );
  vi.stubEnv("APP_URL", "https://littlehint.example.test");
  m.c = {
    SMS_PROVIDER: "textbelt",
    TEXTBELT_API_KEY: "test-secret-key",
    SMS_MONTHLY_LIMIT: "100",
    SMS_USER_DAILY_LIMIT: "2",
    SMS_CREDIT_RESERVE: "20",
    SMS_ALLOWED_EVENTS: "exchange,access",
    PAID_DAILY_LIMIT: "50",
  };
  m.tail = Promise.resolve();
  m.mail.mockReset().mockResolvedValue(undefined);
  m.fetch.mockReset().mockImplementation(async (url: string) =>
    response(
      url.includes("/quota/")
        ? { success: true, quotaRemaining: 50 }
        : url.includes("/otp/verify")
          ? { success: true, isValidOtp: true }
          : url.includes("/status/")
            ? { status: "DELIVERED" }
            : {
                success: true,
                textId: "text-1",
                quotaRemaining: 49,
                otp: "123456",
              },
    ),
  );
  vi.stubGlobal("fetch", m.fetch);
  fixture();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses a one-segment ASCII template with identity, opt-out and no personal content or URL", async () => {
  expect(smsActivityMessage.length).toBeLessThanOrEqual(160);
  expect(smsActivityMessage).toMatch(/^[\x20-\x7e]+$/);
  await sendActivitySms(m.s!.notices[0].id);
  const body = JSON.parse(
    m.fetch.mock.calls.find(([u]) => u.endsWith("/text"))![1].body,
  );
  expect(body.message).toBe(smsActivityMessage);
  expect(body.message).not.toMatch(/https:|member|gift|payment/i);
  expect(body.replyWebhookUrl).toBe(
    "https://littlehint.example.test/api/hooks/textbelt",
  );
  expect(m.s!.smsAttempts[0].status).toBe("accepted");
  await pollSmsStatus();
  expect(m.s!.smsAttempts[0].status).toBe("delivered");
});
it("serializes competing sends and sends each event once, even after an ambiguous timeout", async () => {
  m.fetch.mockImplementation(async (url: string) => {
    if (url.includes("/quota/"))
      return response({ success: true, quotaRemaining: 21 });
    throw new Error("private provider error: test-secret-key");
  });
  const n = m.s!.notices[0];
  m.s!.notices.push({ ...n, ...stamp() });
  await Promise.all([
    sendActivitySms(n.id),
    sendActivitySms(n.id),
    sendActivitySms(m.s!.notices[1].id),
  ]);
  expect(m.fetch.mock.calls.filter(([u]) => u.endsWith("/text"))).toHaveLength(
    1,
  );
  expect(m.s!.smsAttempts.map((a) => a.status)).toEqual([
    "uncertain",
    "skipped",
  ]);
  expect(m.s!.smsAttempts[1].reason).toBe("credit-reserve");
  await sendActivitySms(n.id);
  expect(m.s!.smsAttempts).toHaveLength(2);
  expect(JSON.stringify(m.s)).not.toContain("test-secret-key");
});
it("enforces monthly and recipient daily budgets without affecting authentication reserve", async () => {
  m.c.SMS_USER_DAILY_LIMIT = "1";
  const n = m.s!.notices[0];
  await sendActivitySms(n.id);
  m.s!.notices.push({ ...n, ...stamp() });
  await sendActivitySms(m.s!.notices[1].id);
  expect(m.s!.smsAttempts[1].reason).toBe("recipient-daily-limit");
  m.c.SMS_MONTHLY_LIMIT = "1";
  expect(budgetReason(m.s!, m.c, "activity", "another-user")).toBe(
    "monthly-limit",
  );
  expect(budgetReason(m.s!, m.c, "login", actor.id)).toBeUndefined();
  expect(
    budgetReason(
      m.s!,
      m.c,
      "activity",
      actor.id,
      new Date("2026-11-01T00:00:00Z"),
    ),
  ).toBeUndefined();
});
it("treats failed submissions as budget usage and does not replay skipped updates after a refill", async () => {
  m.fetch.mockImplementation(async (url: string) =>
    response(
      url.includes("/quota/")
        ? { success: true, quotaRemaining: 20 }
        : { success: false, quotaRemaining: 20 },
    ),
  );
  const id = m.s!.notices[0].id;
  await sendActivitySms(id);
  expect(m.s!.smsAttempts[0].reason).toBe("credit-reserve");
  vi.setSystemTime(new Date(Date.now() + 61000));
  m.fetch.mockResolvedValue(response({ success: true, quotaRemaining: 200 }));
  await refreshSmsQuota();
  await sendActivitySms(id);
  expect(m.s!.smsAttempts).toHaveLength(1);
  expect(m.fetch.mock.calls.some(([u]) => u.endsWith("/text"))).toBe(false);
});
it("fails closed on unavailable/stale quota and never counts quota checks as sends", async () => {
  m.fetch.mockRejectedValue(new Error("private URL"));
  await sendActivitySms(m.s!.notices[0].id);
  expect(m.s!.smsAttempts[0]).toMatchObject({
    status: "skipped",
    reason: "quota-unavailable",
  });
  expect(smsUsage(m.s!, m.c).requests).toBe(0);
  await refreshSmsQuota();
  expect(m.fetch).toHaveBeenCalledOnce();
  expect(smsUsage(m.s!, m.c).balance).toBeNull();
});
it("does not subscribe users or enable login when verifying a replacement; enforces unique ownership", async () => {
  const id = await startSms(actor, "+12025550124", "verification");
  expect(m.s!.preferences[0].phone).toBe(phone);
  await verifySms(id, "123456", "verification", actor);
  expect(m.s!.preferences[0]).toMatchObject({
    phone: "+12025550124",
    phoneVerified: true,
    sms: false,
    smsLogin: false,
  });
  expect(
    m.s!.smsConsents.some((r) => r.purpose === "verification" && r.optedIn),
  ).toBe(true);
  expect(
    m.s!.smsConsents.filter((r) => r.phone === phone && !r.optedIn),
  ).toHaveLength(2);
  await expect(
    verifySms(id, "123456", "verification", actor),
  ).rejects.toThrow();
  await expect(
    startSms({ ...actor, id: "other" }, "+12025550124", "verification"),
  ).rejects.toThrow(/already linked/);
});
it("returns an opaque challenge without sending to unknown or notification-only phone numbers", async () => {
  expect(await startSms(undefined, "+12025550199", "login")).toMatch(
    /^[a-f0-9-]{36}$/,
  );
  m.s!.preferences[0].smsLogin = false;
  await startSms(undefined, phone, "login");
  expect(m.fetch).not.toHaveBeenCalled();
  expect(m.s!.smsChallenges).toHaveLength(0);
});
it("redeems sign-in codes once across concurrent checks, with purpose/account/provider binding", async () => {
  const id = await startSms(undefined, phone, "login");
  await expect(
    verifySms(id, "123456", "verification", actor),
  ).rejects.toThrow();
  const results = await Promise.allSettled([
    verifySms(id, "123456", "login"),
    verifySms(id, "123456", "login"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    m.fetch.mock.calls.filter(([u]) => u.includes("/otp/verify")),
  ).toHaveLength(1);
  vi.setSystemTime(new Date(Date.now() + 61000));
  const next = await startSms(undefined, phone, "login");
  m.c.TEXTBELT_API_KEY = "replacement-key";
  await expect(verifySms(next, "123456", "login")).rejects.toThrow();
});
it("checks OTP validity, expires after five minutes and caps attempts at five", async () => {
  const id = await startSms(undefined, phone, "login");
  m.fetch.mockResolvedValue(response({ success: true, isValidOtp: false }));
  for (let i = 0; i < 6; i++)
    await expect(verifySms(id, "111111", "login")).rejects.toThrow();
  expect(m.s!.smsChallenges[0].attempts).toBe(5);
  vi.setSystemTime(new Date(Date.now() + 61000));
  m.fetch.mockImplementation(async (url: string) =>
    response(
      url.includes("/quota/")
        ? { success: true, quotaRemaining: 50 }
        : { success: true, textId: "id", quotaRemaining: 49 },
    ),
  );
  const next = await startSms(undefined, phone, "login");
  vi.setSystemTime(new Date(Date.now() + 300001));
  await expect(verifySms(next, "123456", "login")).rejects.toThrow();
});
it("limits code requests across purposes and prevents changing login settings without fresh email confirmation", async () => {
  await startSms(actor, phone, "verification");
  await expect(startSms(actor, phone, "verification")).rejects.toThrow(/Wait/);
  expect(m.s!.smsChallenges).toHaveLength(1);
  await expect(changeSmsLogin(actor, "session", true)).rejects.toThrow(
    /Confirm/,
  );
  const id = await startSmsReauth(actor, "session");
  const code = m.mail.mock.calls[0][1].code;
  expect(JSON.stringify(m.s)).not.toContain(code);
  await expect(
    verifySmsReauth(actor, "different-session", id, code),
  ).rejects.toThrow();
  await verifySmsReauth(actor, "session", id, code);
  requireSmsGrant(m.s!, actor, "session");
  await changeSmsLogin(actor, "session", false);
  expect(m.s!.preferences[0].smsLogin).toBe(false);
  await expect(verifySmsReauth(actor, "session", id, code)).rejects.toThrow();
  vi.setSystemTime(new Date(Date.now() + 600001));
  expect(() => requireSmsGrant(m.s!, actor, "session")).toThrow();
});
it("records consent and honors STOP/START idempotently across provider changes and unordered records", () => {
  const p = m.s!.preferences[0];
  p.sms = false;
  expect(notificationConsent(m.s!, p, true, false)).toBe(false);
  expect(notificationConsent(m.s!, p, true, true)).toBe(true);
  p.sms = true;
  recordTransport(m.s!, phone, "STOP", "stop-1");
  recordTransport(m.s!, phone, "STOP", "stop-1");
  expect(transportBlocked(m.s!, phone)).toBe(true);
  expect(p.sms).toBe(false);
  m.c.SMS_PROVIDER = "twilio";
  recordTransport(m.s!, phone, "START", "start-1");
  expect(transportBlocked(m.s!, phone)).toBe(false);
  expect(p.sms).toBe(false);
  recordTransport(m.s!, phone, "STOP", "stop-2");
  m.s!.smsConsents.reverse();
  expect(transportBlocked(m.s!, phone)).toBe(true);
  expect(
    m.s!.smsConsents.filter((r) => r.purpose === "transport"),
  ).toHaveLength(3);
});
it("blocks summaries, invitations, payments, unselected topics, ordinary edits and lost access", async () => {
  const { n } = fixture();
  for (const event of [
    "invitation",
    "contribution",
    "wishlist",
    "purchase",
  ] as const)
    expect(activityReason(m.s!, { ...n, event }, m.c)).toBe("topic-disabled");
  expect(activityReason(m.s!, { ...n, action: "updated" }, m.c)).toBe(
    "topic-disabled",
  );
  m.c.SMS_ALLOWED_EVENTS = "exchange,access,purchase";
  expect(activityReason(m.s!, { ...n, event: "purchase" }, m.c)).toBe(
    "topic-disabled",
  );
  m.s!.notices[0].itemId = "no-longer-visible";
  await sendActivitySms(n.id);
  expect(m.s!.smsAttempts[0].reason).toBe("no-longer-authorized");
  expect(m.fetch.mock.calls.some(([u]) => u.endsWith("/text"))).toBe(false);
});
it("validates exact raw Textbelt webhook signatures and rejects stale/future/reformatted input", () => {
  const raw = '{"text": "STOP"}',
    timestamp = String(Date.now() / 1000),
    key = "private-key";
  const sign = createHmac("sha256", key)
    .update(timestamp + raw)
    .digest("hex");
  expect(verifyTextbelt(raw, timestamp, sign, key)).toBe(true);
  expect(
    verifyTextbelt(JSON.stringify(JSON.parse(raw)), timestamp, sign, key),
  ).toBe(false);
  expect(verifyTextbelt(raw, timestamp, sign, key, Date.now() + 901000)).toBe(
    false,
  );
  expect(verifyTextbelt(raw, timestamp, sign, key, Date.now() - 901000)).toBe(
    false,
  );
  expect(verifyTextbelt(raw, timestamp, "a", key)).toBe(false);
});
it("discards provider OTPs and error bodies and enforces both success and isValidOtp", async () => {
  const sent = await providerSend(m.c, phone, "challenge", "verification");
  expect(sent).not.toHaveProperty("otp");
  const body = JSON.parse(m.fetch.mock.calls[0][1].body);
  expect(body).toMatchObject({ userid: "challenge", length: 6, lifetime: 300 });
  expect(body.message).toContain("$OTP");
  m.fetch.mockResolvedValue(response({ success: true, isValidOtp: false }));
  expect(await providerVerify(m.c, phone, "id", "123456")).toBe(false);
  m.fetch.mockResolvedValue(response({ success: false, isValidOtp: true }));
  expect(await providerVerify(m.c, phone, "id", "123456")).toBe(false);
  m.fetch.mockRejectedValue(
    new Error("https://textbelt.com/otp/verify?key=secret&otp=123456"),
  );
  await expect(providerVerify(m.c, phone, "id", "123456")).rejects.toThrow(
    "SMS provider unavailable.",
  );
});
it("retains Twilio sends and Verify checks without Textbelt credentials", async () => {
  const c = {
    ...m.c,
    SMS_PROVIDER: "twilio",
    TWILIO_ACCOUNT_SID: "sid",
    TWILIO_AUTH_TOKEN: "secret",
    TWILIO_FROM: phone,
    TWILIO_VERIFY_SERVICE_SID: "verify",
  };
  m.fetch.mockImplementation(async (url: string) =>
    response(
      url.includes("VerificationCheck")
        ? { status: "approved" }
        : { sid: "provider-id" },
    ),
  );
  expect((await providerSend(c, phone, "notice", "activity")).accepted).toBe(
    true,
  );
  const body = m.fetch.mock.calls[0][1].body as URLSearchParams;
  expect(body.get("Body")).toBe(smsActivityMessage);
  expect((await providerSend(c, phone, "id", "login")).providerId).toBe(
    "provider-id",
  );
  expect(await providerVerify(c, phone, "id", "123456")).toBe(true);
  expect(m.fetch.mock.calls.every(([u]) => u.includes("twilio.com"))).toBe(
    true,
  );
});
it("reports balance separately from UTC monthly usage and preserves history when disabled", async () => {
  await sendActivitySms(m.s!.notices[0].id);
  let u = smsUsage(m.s!, m.c);
  expect(u).toMatchObject({
    activity: 1,
    balance: 49,
    availableForNotifications: 29,
    quotaState: "fresh",
  });
  vi.setSystemTime(new Date(Date.now() + 61000));
  u = smsUsage(m.s!, m.c);
  expect(u.quotaState).toBe("stale");
  expect(u.availableForNotifications).toBeNull();
  m.c.SMS_PROVIDER = "none";
  expect(smsUsage(m.s!, m.c)).toMatchObject({
    enabled: false,
    requests: 1,
    history: 1,
    balance: null,
  });
  expect(smsUsage(m.s!, m.c, new Date("2026-11-01T00:00:00Z"))).toMatchObject({
    requests: 0,
    history: 1,
    activity: 0,
  });
});
it("isolates staging credentials and keeps preview SMS disabled", () => {
  vi.stubEnv("SMS_PROVIDER", "textbelt");
  vi.stubEnv("TEXTBELT_API_KEY", "production-secret");
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("STAGING_SMS_PROVIDER", "");
  expect(smsInfo(effectiveConfig()).available).toBe(false);
  expect(effectiveConfig().TEXTBELT_API_KEY).toBe("");
  vi.stubEnv("STAGING_SMS_PROVIDER", "textbelt");
  vi.stubEnv("STAGING_TEXTBELT_API_KEY", "staging-secret");
  vi.stubEnv("STAGING_PAID_DAILY_LIMIT", "10");
  expect(smsInfo(effectiveConfig()).available).toBe(true);
  expect(effectiveConfig().TEXTBELT_API_KEY).toBe("staging-secret");
  vi.stubEnv("APP_ENV", "preview");
  expect(smsInfo(effectiveConfig()).available).toBe(false);
  expect(effectiveConfig().TEXTBELT_API_KEY).toBe("");
});
it("blocks another paid send if a provider acceptance omits a usable balance", async () => {
  m.fetch.mockImplementation(async (url: string) =>
    response(
      url.includes("/quota/")
        ? { success: true, quotaRemaining: 21 }
        : { success: true, textId: "missing-quota" },
    ),
  );
  const id = m.s!.notices[0].id;
  await sendActivitySms(id);
  m.s!.notices.push({ ...m.s!.notices[0], ...stamp() });
  await sendActivitySms(m.s!.notices[1].id);
  expect(m.fetch.mock.calls.filter(([u]) => u.endsWith("/text"))).toHaveLength(
    1,
  );
  expect(m.s!.smsAttempts[1].reason).toBe("quota-unavailable");
});

it("caps combined phone/account code requests at three per hour and five per rolling day", () => {
  const now = Date.now();
  for (let i = 0; i < 5; i++)
    m.s!.smsChallenges.push({
      ...stamp(),
      createdAt: new Date(now - (i + 1) * 70000).toISOString(),
      userId: actor.id,
      phone,
      purpose: i % 2 ? "login" : "verification",
      account: "test",
      attempts: 0,
      state: "used",
      expiresAt: new Date(now).toISOString(),
    });
  expect(challengeRateLimited(m.s!, phone, "other", now)).toBe(true);
  expect(challengeRateLimited(m.s!, "+12025550124", actor.id, now)).toBe(true);
  expect(challengeRateLimited(m.s!, phone, actor.id, now + 3600000)).toBe(true);
  expect(challengeRateLimited(m.s!, phone, actor.id, now + 86400000)).toBe(
    false,
  );
});
it("deduplicates low-credit administrator emails without spending SMS credit", async () => {
  m.s!.people[0].admin = true;
  m.fetch.mockResolvedValue(response({ success: true, quotaRemaining: 20 }));
  await alertLowSmsCredit();
  await alertLowSmsCredit();
  expect(m.mail).toHaveBeenCalledOnce();
  expect(m.mail.mock.calls[0][1].text).toContain("20 Textbelt credits");
  expect(m.fetch).toHaveBeenCalledOnce();
  expect(m.s!.smsAttempts).toHaveLength(0);
});
it("honors the paid daily request cap for code submissions as well as activity", async () => {
  m.c.PAID_DAILY_LIMIT = "1";
  await sendActivitySms(m.s!.notices[0].id);
  expect(budgetReason(m.s!, m.c, "verification", actor.id)).toBe(
    "daily-paid-limit",
  );
  await expect(startSms(actor, phone, "verification")).rejects.toThrow(/limit/);
  expect(m.s!.smsAttempts).toHaveLength(1);
});
it("does not revive a pending code after switching providers away and back", async () => {
  const id = await startSms(undefined, phone, "login");
  m.c.SMS_PROVIDER = "none";
  await pollSmsStatus();
  m.c.SMS_PROVIDER = "textbelt";
  await pollSmsStatus();
  await expect(verifySms(id, "123456", "login")).rejects.toThrow();
  expect(m.s!.smsChallenges[0].state).toBe("cancelled");
});
it("keeps the frequency a user consented to when the administrator raises the daily limit", () => {
  m.c.SMS_USER_DAILY_LIMIT = "5";
  const p = m.s!.preferences[0];
  p.smsConsentedDailyLimit = 1;
  m.s!.smsAttempts.push({
    ...stamp(),
    userId: actor.id,
    provider: "textbelt",
    account: "test",
    purpose: "activity",
    reference: "past",
    phone,
    status: "delivered",
    segments: 1,
  });
  expect(budgetReason(m.s!, m.c, "activity", actor.id)).toBe(
    "recipient-daily-limit",
  );
  expect(notificationConsent(m.s!, p, true, false, 5)).toBe(false);
  expect(notificationConsent(m.s!, p, true, true, 5)).toBe(true);
  expect(p.smsConsentedDailyLimit).toBe(5);
  expect(m.s!.smsConsents.at(-1)?.text).toContain(
    "Up to 5 activity texts per day",
  );
});
