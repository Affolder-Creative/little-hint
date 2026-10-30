import type { State } from "../shared/model";
import type { SmsUsage } from "../shared/admin-usage";
import { smsAccount, smsInfo, type SmsConfig } from "./sms-provider";
export function smsUsage(s: State, c: SmsConfig, now = new Date()): SmsUsage {
  const policy = smsInfo(c),
    month = now.toISOString().slice(0, 7);
  const rows = s.smsAttempts.filter((a) => a.createdAt.startsWith(month));
  const submissions = rows.filter((a) => a.status !== "skipped");
  const q = s.smsQuotas.find((q) => q.account === smsAccount(c));
  const quotaState =
    policy.provider !== "textbelt"
      ? "not-applicable"
      : q?.remaining === undefined || q.unavailable
        ? "unavailable"
        : !q.checkedAt || now.getTime() - Date.parse(q.checkedAt) > 60000
          ? "stale"
          : "fresh";
  const uncertain = s.smsAttempts
    .filter((a) => a.account === smsAccount(c) && a.status === "uncertain")
    .reduce((sum, a) => sum + a.segments, 0);
  return {
    enabled: policy.available,
    provider: policy.provider,
    requests: submissions.length,
    history: s.smsAttempts.length,
    signIn: submissions.filter((a) => a.purpose === "login").length,
    verification: submissions.filter((a) => a.purpose === "verification")
      .length,
    activity: submissions
      .filter((a) => a.purpose === "activity")
      .reduce((n, a) => n + a.segments, 0),
    monthlyLimit: policy.monthlyLimit,
    reserve: policy.reserve,
    balance: policy.provider === "textbelt" ? (q?.remaining ?? null) : null,
    availableForNotifications:
      quotaState === "fresh"
        ? Math.max(0, q!.remaining! - policy.reserve - uncertain)
        : null,
    quotaState,
    checkedAt: policy.provider === "textbelt" ? q?.checkedAt : undefined,
    outcomes: ["accepted", "delivered", "failed", "uncertain", "skipped"].map(
      (status) => ({
        status,
        count: rows.filter((a) => a.status === status).length,
      }),
    ),
    recentFailures: rows
      .filter((a) => a.status === "failed" || a.status === "uncertain")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        createdAt: a.createdAt,
        provider: a.provider,
        purpose: a.purpose,
        reason: a.reason ?? a.status,
        detail: a.providerError,
      })),
    skipped: [
      ...new Set(
        rows
          .filter((a) => a.status === "skipped")
          .map((a) => a.reason ?? "unknown"),
      ),
    ].map((reason) => ({
      reason,
      count: rows.filter((a) => a.status === "skipped" && a.reason === reason)
        .length,
    })),
    providers: [...new Set(submissions.map((a) => a.provider))].map(
      (provider) => ({
        provider,
        requests: submissions.filter((a) => a.provider === provider).length,
      }),
    ),
  };
}
