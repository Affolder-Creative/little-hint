import { randomInt, randomUUID, createHmac, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pool, readState, transact } from "./db";
import { config } from "./settings";
import { stamp, fail, preferences, noticeAllowed } from "./domain";
import { sendEmail } from "./notifications";
import type { Actor, SmsAttempt, SmsChallenge, State } from "../shared/model";
import {
  smsAccount,
  smsInfo,
  providerQuota,
  providerSend,
  providerVerify,
  providerStatus,
  normalizePhone,
  type SmsConfig,
} from "./sms-provider";
import {
  activityReason,
  budgetReason,
  consent,
  transportBlocked,
  challengeRateLimited,
} from "./sms-policy";
// One connection-level lock serializes quota reads and submissions across API and
// worker. Network I/O never holds the application's state transaction lock.
export async function withSmsLock<T>(fn: () => Promise<T>) {
  const connection = await pool.connect();
  try {
    await connection.query("SELECT pg_advisory_lock(742903120)");
    return await fn();
  } finally {
    try {
      await connection.query("SELECT pg_advisory_unlock(742903120)");
    } finally {
      connection.release();
    }
  }
}
async function syncProviderLocked(c: SmsConfig) {
  await transact((s) => {
    const account = smsAccount(c);
    let marker = s.smsQuotas.find((q) => q.account === "active-provider");
    if (!marker) {
      marker = {
        ...stamp(),
        account: "active-provider",
        activeAccount: account,
      };
      s.smsQuotas.push(marker);
    } else if (marker.activeAccount !== account) {
      marker.activeAccount = account;
      for (const ch of s.smsChallenges)
        if (ch.purpose !== "reauth") ch.state = "cancelled";
    }
  });
}
async function quotaLocked(c: SmsConfig) {
  if (smsInfo(c).provider !== "textbelt" || !c.TEXTBELT_API_KEY) return;
  const account = smsAccount(c),
    now = Date.now();
  const prior = (await readState()).smsQuotas.find(
    (q) => q.account === account,
  );
  if (prior?.attemptedAt && now - Date.parse(prior.attemptedAt) < 60000) return;
  await transact((s) => {
    let q = s.smsQuotas.find((q) => q.account === account);
    if (!q) {
      q = { ...stamp(), account };
      s.smsQuotas.push(q);
    }
    q.attemptedAt = new Date(now).toISOString();
  });
  let remaining: number | undefined;
  try {
    remaining = await providerQuota(c);
  } catch {
    /* Keep last known balance, mark unavailable. */
  }
  await transact((s) => {
    const q = s.smsQuotas.find((q) => q.account === account)!;
    q.unavailable = remaining === undefined;
    if (remaining !== undefined) {
      q.remaining = remaining;
      q.checkedAt = new Date().toISOString();
    }
  });
}
export async function refreshSmsQuota() {
  const c = await config();
  if (c.SMS_PROVIDER === "textbelt" && c.TEXTBELT_API_KEY)
    await withSmsLock(() => quotaLocked(c));
}
async function pace(c: SmsConfig) {
  if (c.SMS_PROVIDER !== "textbelt") return;
  const last = (await readState()).smsAttempts
    .filter((a) => a.provider === "textbelt" && a.status !== "skipped")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .at(-1);
  if (last)
    await delay(Math.max(0, 1100 - (Date.now() - Date.parse(last.createdAt))));
}
async function submit(c: SmsConfig, attempt: SmsAttempt) {
  try {
    const result = await providerSend(
      c,
      attempt.phone,
      attempt.reference,
      attempt.purpose,
    );
    await transact((s) => {
      const a = s.smsAttempts.find((a) => a.id === attempt.id)!;
      // A signed callback can arrive before the submission response.
      if (a.status === "uncertain")
        a.status = result.accepted ? "accepted" : "failed";
      a.providerId = result.providerId;
      if (!result.accepted) {
        a.reason = "provider-rejected";
        a.providerError = result.providerError;
      }
      if (result.remaining !== undefined) {
        let q = s.smsQuotas.find((q) => q.account === a.account);
        if (!q) {
          q = { ...stamp(), account: a.account };
          s.smsQuotas.push(q);
        }
        q.remaining = result.remaining;
        q.checkedAt = new Date().toISOString();
        q.unavailable = false;
      } else if (c.SMS_PROVIDER === "textbelt") {
        const q = s.smsQuotas.find((q) => q.account === a.account);
        if (q) q.unavailable = true;
      }
    });
    return result.accepted;
  } catch {
    await transact((s) => {
      const a = s.smsAttempts.find((a) => a.id === attempt.id);
      if (a && a.status === "uncertain") a.reason = "submission-unknown";
    });
    return false;
  }
}
function attempt(
  s: State,
  c: SmsConfig,
  userId: string,
  phone: string,
  purpose: SmsAttempt["purpose"],
  reference: string,
  reason?: string,
) {
  const a: SmsAttempt = {
    ...stamp(),
    userId,
    phone,
    purpose,
    reference,
    provider: smsInfo(c).provider,
    account: smsAccount(c),
    status: reason ? "skipped" : "uncertain",
    segments: reason ? 0 : 1,
    reason,
  };
  s.smsAttempts.push(a);
  return a;
}
export async function sendActivitySms(noticeId: string) {
  const initial = await readState();
  const n = initial.notices.find((n) => n.id === noticeId);
  if (!n || !initial.preferences.some((p) => p.userId === n.userId && p.sms))
    return;
  await withSmsLock(async () => {
    const c = await config();
    if (!smsInfo(c).available || n.suppressedChannels?.includes("sms")) {
      await transact((s) => {
        const notice = s.notices.find((row) => row.id === noticeId);
        if (notice) {
          notice.suppressedChannels = [
            ...new Set([...(notice.suppressedChannels ?? []), "sms" as const]),
          ];
          notice.revision++;
        }
      });
      return;
    }
    if (
      (await readState()).smsAttempts.some(
        (a) => a.reference === noticeId && a.purpose === "activity",
      )
    )
      return;
    await quotaLocked(c);
    await pace(c);
    const a = await transact((s) => {
      const n = s.notices.find((n) => n.id === noticeId);
      if (
        !n ||
        n.suppressedChannels?.includes("sms") ||
        s.smsAttempts.some(
          (a) => a.reference === noticeId && a.purpose === "activity",
        )
      )
        return;
      const p = s.preferences.find((p) => p.userId === n.userId);
      const reason = !noticeAllowed(s, n)
        ? "no-longer-authorized"
        : (activityReason(s, n, c) ?? budgetReason(s, c, "activity", n.userId));
      return attempt(
        s,
        c,
        n.userId,
        p?.phone ?? "",
        "activity",
        noticeId,
        reason,
      );
    });
    if (a && a.status !== "skipped") await submit(c, a);
  });
}
const invalid = () =>
  fail(
    400,
    "The code was not accepted or has expired. Request a new code, or use email or a passkey.",
  );
export async function startSms(
  a: Actor | undefined,
  rawPhone: string,
  purpose: "login" | "verification",
) {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    if (!a) return randomUUID();
    fail(400, "Enter a valid US mobile number.");
  }
  return withSmsLock(async () => {
    const c = await config();
    if (!smsInfo(c).available) {
      if (purpose === "login") return randomUUID();
      fail(
        400,
        "SMS is unavailable. Ask the administrator to review its configuration.",
      );
    }
    await syncProviderLocked(c);
    const s = await readState();
    const matches = s.preferences.filter(
      (p) => p.phone === phone && p.phoneVerified,
    );
    const p = matches.length === 1 ? matches[0] : undefined;
    const userId =
      a?.id ?? (p?.smsLogin && !p.smsOptOut ? p.userId : undefined);
    if (a && transportBlocked(s, phone))
      fail(
        400,
        "Reply START to the SMS sender before requesting a code for this number. Email and passkeys remain available.",
      );
    if (
      !userId ||
      transportBlocked(s, phone) ||
      (purpose === "login" && !smsInfo(c).available)
    )
      return randomUUID();
    if (a && matches.some((p) => p.userId !== a.id))
      fail(409, "This number is already linked to an account.");
    await quotaLocked(c);
    await pace(c);
    const result = await transact((s) => {
      if (challengeRateLimited(s, phone, userId)) {
        if (purpose === "login") return;
        fail(
          429,
          "Wait 60 seconds between codes. Up to 3 per hour and 5 per day are available.",
        );
      }
      if (transportBlocked(s, phone)) return;
      if (
        purpose === "login" &&
        !s.preferences.some(
          (p) =>
            p.userId === userId &&
            p.phone === phone &&
            p.phoneVerified &&
            p.smsLogin &&
            !p.smsOptOut,
        )
      )
        return;
      const reason = budgetReason(s, c, purpose, userId);
      if (reason) {
        if (purpose === "login") return;
        fail(
          429,
          "SMS is unavailable or its sending limit has been reached. Use email or a passkey and try later.",
        );
      }
      for (const ch of s.smsChallenges.filter(
        (ch) => ch.userId === userId && ch.purpose === purpose,
      ))
        ch.state = "cancelled";
      const ch: SmsChallenge = {
        ...stamp(),
        userId,
        phone,
        purpose,
        account: smsAccount(c),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        attempts: 0,
        state: "pending",
      };
      s.smsChallenges.push(ch);
      if (purpose === "verification")
        consent(
          s,
          userId,
          phone,
          "verification",
          true,
          "phone-verification-request",
        );
      return { ch, a: attempt(s, c, userId, phone, purpose, ch.id) };
    });
    if (!result) return randomUUID();
    const accepted = await submit(c, result.a);
    if (!accepted) {
      await transact((s) => {
        const ch = s.smsChallenges.find((ch) => ch.id === result.ch.id)!;
        ch.state = "cancelled";
      });
      if (purpose === "verification")
        fail(
          503,
          "SMS could not be confirmed. Wait before requesting another code. Email and passkeys remain available.",
        );
    }
    return result.ch.id;
  });
}
export async function verifySms(
  id: string,
  code: string,
  purpose: "login" | "verification",
  a?: Actor,
) {
  if (!/^\d{6}$/.test(code)) return invalid();
  return withSmsLock(async () => {
    const c = await config();
    await syncProviderLocked(c);
    const ch = await transact((s) => {
      const ch = s.smsChallenges.find(
        (ch) => ch.id === id && ch.purpose === purpose,
      );
      if (
        !ch ||
        ch.state !== "pending" ||
        ch.account !== smsAccount(c) ||
        ch.attempts >= 5 ||
        Date.parse(ch.expiresAt) <= Date.now() ||
        (purpose === "verification" && ch.userId !== a?.id) ||
        transportBlocked(s, ch.phone) ||
        !smsInfo(c).available
      )
        return;
      ch.attempts++;
      ch.state = "checking";
      return { ...ch };
    });
    if (!ch) return invalid();
    let valid = false;
    try {
      valid = await providerVerify(c, ch.phone, ch.id, code);
    } catch {
      /* Count the attempt, reveal no provider details. */
    }
    const userId = await transact((s) => {
      const current = s.smsChallenges.find((v) => v.id === ch.id)!;
      if (current.state !== "checking") return;
      current.state = valid
        ? "used"
        : current.attempts >= 5
          ? "cancelled"
          : "pending";
      if (
        !valid ||
        Date.parse(current.expiresAt) <= Date.now() ||
        transportBlocked(s, ch.phone)
      )
        return;
      if (purpose === "login") {
        const matches = s.preferences.filter(
          (p) => p.phone === ch.phone && p.phoneVerified,
        );
        if (
          matches.length !== 1 ||
          matches[0].userId !== ch.userId ||
          !matches[0].smsLogin ||
          matches[0].smsOptOut
        )
          return;
      } else {
        if (
          s.preferences.some(
            (p) =>
              p.phone === ch.phone && p.phoneVerified && p.userId !== ch.userId,
          )
        )
          return;
        const p = preferences(s, a!);
        if (p.phone) {
          if (p.sms)
            consent(
              s,
              a!.id,
              p.phone,
              "notifications",
              false,
              "phone-replaced",
            );
          if (p.smsLogin)
            consent(s, a!.id, p.phone, "login", false, "phone-replaced");
        }
        p.phone = ch.phone;
        p.phoneVerified = true;
        p.sms = false;
        p.smsLogin = false;
        p.smsConsentVersion = undefined;
        p.smsOptOut = false;
        p.channelEvents = {
          email: p.channelEvents?.email ?? p.events,
          telegram: p.channelEvents?.telegram ?? p.events,
          sms: ["exchange", "access"],
        };
        if (!s.preferences.includes(p)) s.preferences.push(p);
        for (const v of s.smsChallenges.filter(
          (v) => v.userId === ch.userId && v.id !== ch.id,
        ))
          v.state = "cancelled";
      }
      return ch.userId;
    });
    return userId ?? invalid();
  });
}
const codeHash = (id: string, code: string) =>
  createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(`${id}:${code}`)
    .digest("hex");
export async function startSmsReauth(a: Actor, sessionId: string) {
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const id = await transact((s) => {
    const history = s.smsChallenges.filter(
      (ch) => ch.userId === a.id && ch.purpose === "reauth",
    );
    if (
      history.some((ch) => Date.now() - Date.parse(ch.createdAt) < 60000) ||
      history.filter((ch) => Date.now() - Date.parse(ch.createdAt) < 3600000)
        .length >= 3
    )
      fail(429, "Wait before requesting another email code.");
    for (const ch of history) ch.state = "cancelled";
    const ch: SmsChallenge = {
      ...stamp(),
      userId: a.id,
      phone: "",
      purpose: "reauth",
      account: "",
      sessionId,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      attempts: 0,
      state: "pending",
    };
    ch.codeHash = codeHash(ch.id, code);
    s.smsChallenges.push(ch);
    return ch.id;
  });
  await sendEmail(a.email, { kind: "sign-in", code, purpose: "sms-settings" });
  return id;
}
export async function verifySmsReauth(
  a: Actor,
  sessionId: string,
  id: string,
  code: string,
) {
  const ok = await transact((s) => {
    const ch = s.smsChallenges.find(
      (ch) =>
        ch.id === id &&
        ch.userId === a.id &&
        ch.sessionId === sessionId &&
        ch.purpose === "reauth",
    );
    if (
      !ch ||
      ch.state !== "pending" ||
      ch.attempts >= 5 ||
      Date.parse(ch.expiresAt) <= Date.now()
    )
      return false;
    ch.attempts++;
    if (!/^\d{6}$/.test(code) || ch.codeHash !== codeHash(ch.id, code))
      return false;
    ch.state = "used";
    delete ch.codeHash;
    s.smsGrants = s.smsGrants.filter((g) => g.sessionId !== sessionId);
    s.smsGrants.push({
      ...stamp(),
      userId: a.id,
      sessionId,
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
    return true;
  });
  if (!ok) invalid();
}
export function requireSmsGrant(s: State, a: Actor, sessionId: string) {
  if (
    !s.smsGrants.some(
      (g) =>
        g.userId === a.id &&
        g.sessionId === sessionId &&
        Date.parse(g.expiresAt) > Date.now(),
    )
  )
    fail(
      403,
      "Confirm the code sent to your account email before changing your phone or SMS sign-in.",
    );
}
export async function changeSmsLogin(
  a: Actor,
  sessionId: string,
  enabled: boolean,
  remove = false,
) {
  if (enabled && !smsInfo(await config()).available)
    fail(
      400,
      "SMS is unavailable. Ask the administrator to review its configuration.",
    );
  await transact((s) => {
    requireSmsGrant(s, a, sessionId);
    const p = preferences(s, a);
    if (!p.phone || !p.phoneVerified) fail(400, "Verify your phone first.");
    if (enabled && (p.smsOptOut || transportBlocked(s, p.phone)))
      fail(
        400,
        "Reply START to the SMS sender first. You can still use email or a passkey.",
      );
    consent(
      s,
      a.id,
      p.phone,
      "login",
      enabled,
      remove ? "phone-removed" : "settings",
    );
    p.smsLogin = enabled;
    for (const ch of s.smsChallenges.filter(
      (ch) => ch.userId === a.id && ch.purpose !== "reauth",
    ))
      ch.state = "cancelled";
    if (remove) {
      consent(s, a.id, p.phone, "notifications", false, "phone-removed");
      delete p.phone;
      p.phoneVerified = false;
      p.sms = false;
      p.smsLogin = false;
    }
    p.revision++;
  });
}
export async function pollSmsStatus() {
  const c = await config();
  await withSmsLock(() => syncProviderLocked(c));
  if (c.SMS_PROVIDER !== "textbelt" || !c.TEXTBELT_API_KEY) return;
  const rows = (await readState()).smsAttempts
    .filter(
      (a) =>
        a.account === smsAccount(c) &&
        a.providerId &&
        (a.status === "accepted" || a.status === "uncertain") &&
        Date.now() - Date.parse(a.createdAt) < 7 * 86400000 &&
        (!a.checkedAt || Date.now() - Date.parse(a.checkedAt) > 300000),
    )
    .slice(0, 10);
  for (const row of rows) {
    let status: SmsAttempt["status"] = "accepted";
    try {
      status = await providerStatus(row.providerId!);
    } catch {
      /* Retry status lookup, never submission. */
    }
    await transact((s) => {
      const a = s.smsAttempts.find((a) => a.id === row.id);
      if (a && (a.status === "accepted" || a.status === "uncertain")) {
        a.status = status;
        a.checkedAt = new Date().toISOString();
      }
    });
  }
}
export const webhookSource = (provider: string, raw: string) =>
  `${provider}:${createHash("sha256").update(raw).digest("hex")}`;

export async function alertLowSmsCredit() {
  const c = await config();
  if (c.SMS_PROVIDER !== "textbelt" || !c.TEXTBELT_API_KEY) return;
  await refreshSmsQuota();
  const alert = await transact((s) => {
    const q = s.smsQuotas.find((q) => q.account === smsAccount(c));
    if (
      !q ||
      q.unavailable ||
      q.remaining === undefined ||
      !q.checkedAt ||
      Date.now() - Date.parse(q.checkedAt) > 60000 ||
      q.remaining > smsInfo(c).reserve ||
      (q.lowCreditAlertAt &&
        Date.now() - Date.parse(q.lowCreditAlertAt) < 86400000)
    )
      return;
    q.lowCreditAlertAt = new Date().toISOString();
    return {
      balance: q.remaining,
      userIds: [
        ...new Set(
          s.people.filter((p) => p.admin && p.userId).map((p) => p.userId!),
        ),
      ],
    };
  });
  if (!alert) return;
  for (const userId of alert.userIds) {
    const { rows } = await pool.query('SELECT email FROM "user" WHERE id=$1', [
      userId,
    ]);
    if (rows[0])
      try {
        await sendEmail(rows[0].email, {
          kind: "update",
          text: `Little Hint has ${alert.balance} Textbelt credits left. Activity texts pause at the configured code reserve. Review SMS usage in Administration and refill the dedicated key if needed.`,
          actionPath: "/settings?section=admin",
        });
      } catch {
        /* At most one alert attempt per administrator per day; no SMS spending. */
      }
  }
}
