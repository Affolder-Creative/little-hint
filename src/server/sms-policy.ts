import type {
  Preferences,
  SmsConsent,
  State,
  Notice,
  SmsAttempt,
} from "../shared/model";
import { stamp } from "./domain";
import {
  smsConsentVersion,
  smsNotificationDisclosure,
  smsLoginConsent,
  smsVerificationConsent,
} from "../shared/sms";
import { smsInfo, smsAccount, type SmsConfig } from "./sms-provider";
export function consent(
  s: State,
  userId: string,
  phone: string,
  purpose: SmsConsent["purpose"],
  optedIn: boolean,
  source: string,
  text?: string,
) {
  s.smsConsents.push({
    ...stamp(),
    sequence: Math.max(0, ...s.smsConsents.map((r) => r.sequence || 0)) + 1,
    userId,
    phone,
    purpose,
    optedIn,
    source,
    version: smsConsentVersion,
    text:
      text ??
      (purpose === "notifications"
        ? smsNotificationDisclosure(2)
        : purpose === "login"
          ? smsLoginConsent
          : smsVerificationConsent),
  });
}
export function transportBlocked(s: State, phone: string) {
  return (
    s.smsConsents
      .filter((r) => r.phone === phone && r.purpose === "transport")
      .sort((a, b) => a.sequence - b.sequence)
      .at(-1)?.optedIn === false
  );
}
export function recordTransport(
  s: State,
  phone: string,
  word: string,
  source: string,
) {
  const stop =
    /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i.test(
      word.trim(),
    );
  const start = /^(START|UNSTOP)$/i.test(word.trim());
  if (!stop && !start) return;
  if (s.smsConsents.some((r) => r.source === source)) return;
  const prefs = s.preferences.filter((p) => p.phone === phone);
  consent(
    s,
    prefs[0]?.userId ?? "",
    phone,
    "transport",
    !stop,
    source,
    word.toUpperCase().trim(),
  );
  for (const p of prefs) {
    if (stop && p.sms)
      consent(s, p.userId, phone, "notifications", false, source);
    if (stop) p.sms = false;
    // START removes transport suppression, never restores a subscription.
    p.smsOptOut = stop;
    p.revision++;
  }
}
export function notificationConsent(
  s: State,
  old: Preferences,
  enabled: boolean,
  acknowledged: boolean,
  dailyLimit = 2,
) {
  if (
    enabled &&
    (!old.sms ||
      old.smsConsentVersion !== smsConsentVersion ||
      old.smsConsentedDailyLimit !== dailyLimit) &&
    !acknowledged
  )
    return false;
  if (
    enabled !== old.sms ||
    (enabled &&
      (old.smsConsentVersion !== smsConsentVersion ||
        old.smsConsentedDailyLimit !== dailyLimit))
  ) {
    consent(
      s,
      old.userId,
      old.phone!,
      "notifications",
      enabled,
      "settings",
      smsNotificationDisclosure(dailyLimit),
    );
    old.smsConsentVersion = smsConsentVersion;
    old.smsConsentedDailyLimit = dailyLimit;
  }
  return true;
}
export function smsEventAllowed(
  n: Pick<Notice, "event" | "action">,
  c: SmsConfig,
) {
  const policy = smsInfo(c);
  return (
    policy.eligibleEvents.includes(n.event) &&
    (n.event !== "access" || n.action === "access-lost")
  );
}
export function activityReason(s: State, n: Notice, c: SmsConfig) {
  const p = s.preferences.find((p) => p.userId === n.userId);
  if (!smsInfo(c).available) return "provider-disabled";
  if (!smsEventAllowed(n, c)) return "topic-disabled";
  if (
    !p?.sms ||
    p.smsConsentVersion !== smsConsentVersion ||
    !p.phoneVerified ||
    !p.phone ||
    p.smsOptOut ||
    transportBlocked(s, p.phone)
  )
    return "not-consented";
  if (!(p.channelEvents?.sms ?? []).includes(n.event)) return "topic-disabled";
  return undefined;
}
export function availableCredits(s: State, c: SmsConfig) {
  const account = smsAccount(c);
  const q = s.smsQuotas.find((q) => q.account === account);
  if (
    q?.remaining === undefined ||
    q.unavailable ||
    !q.checkedAt ||
    Date.now() - Date.parse(q.checkedAt) > 60000
  )
    return undefined;
  // Unknown submissions may still settle after a quota read. Keep their reservation.
  return Math.max(
    0,
    q.remaining -
      s.smsAttempts
        .filter((a) => a.account === account && a.status === "uncertain")
        .reduce((sum, a) => sum + a.segments, 0),
  );
}
export function budgetReason(
  s: State,
  c: SmsConfig,
  purpose: SmsAttempt["purpose"],
  userId: string,
  now = new Date(),
) {
  const policy = smsInfo(c),
    date = now.toISOString(),
    attempts = s.smsAttempts.filter((a) => a.status !== "skipped");
  if (!policy.available) return "provider-disabled";
  if (
    attempts.filter((a) => a.createdAt.slice(0, 10) === date.slice(0, 10))
      .length +
      (s.usage.find((u) => u.key === `${date.slice(0, 10)}:sms`)?.count ?? 0) >=
    Number(c.PAID_DAILY_LIMIT)
  )
    return "daily-paid-limit";
  if (purpose === "activity") {
    const activity = attempts.filter((a) => a.purpose === "activity");
    if (
      activity
        .filter((a) => a.createdAt.startsWith(date.slice(0, 7)))
        .reduce((n, a) => n + a.segments, 0) >= policy.monthlyLimit
    )
      return "monthly-limit";
    if (
      activity
        .filter(
          (a) =>
            a.userId === userId && a.createdAt.startsWith(date.slice(0, 10)),
        )
        .reduce((n, a) => n + a.segments, 0) >=
      Math.min(
        policy.dailyLimit,
        s.preferences.find((p) => p.userId === userId)
          ?.smsConsentedDailyLimit ?? 2,
      )
    )
      return "recipient-daily-limit";
  }
  if (policy.provider === "textbelt") {
    const available = availableCredits(s, c);
    if (available === undefined) return "quota-unavailable";
    if (available < 1 + (purpose === "activity" ? policy.reserve : 0))
      return "credit-reserve";
  }
  return undefined;
}
export function challengeRateLimited(
  s: State,
  phone: string,
  userId: string,
  now = Date.now(),
) {
  const history = s.smsChallenges.filter(
    (ch) =>
      ch.purpose !== "reauth" &&
      (ch.phone === phone || (userId && ch.userId === userId)),
  );
  return (
    history.some((ch) => now - Date.parse(ch.createdAt) < 60000) ||
    history.filter((ch) => now - Date.parse(ch.createdAt) < 3600000).length >=
      3 ||
    history.filter((ch) => now - Date.parse(ch.createdAt) < 86400000).length >=
      5
  );
}
