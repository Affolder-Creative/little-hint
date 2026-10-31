import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { AdminUsage as Usage, AiUsage } from "../shared/admin-usage";
const number = (n: number) => n.toLocaleString();
const smsLabels: Record<string, string> = {
  textbelt: "Textbelt",
  twilio: "Twilio",
  login: "Sign-in code",
  verification: "Phone verification",
  activity: "Activity notification",
  "provider-rejected": "Request rejected by provider",
  "submission-unknown": "Submission could not be confirmed",
  uncertain: "Submission could not be confirmed",
  failed: "Send failed",
};
const smsLabel = (value: string) =>
  smsLabels[value] ??
  value.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());
function AiDetails({ usage }: { usage: AiUsage }) {
  return (
    <details className="usage-details">
      <summary>Tokens and estimate details</summary>
      <dl className="usage-metrics">
        <div>
          <dt>Input tokens</dt>
          <dd>{number(usage.inputTokens)}</dd>
        </div>
        <div>
          <dt>Output tokens</dt>
          <dd>{number(usage.outputTokens)}</dd>
        </div>
      </dl>
      {usage.models.map((m) => (
        <p key={m.model}>
          {m.model}: {number(m.inputTokens)} input · {number(m.outputTokens)}{" "}
          output
        </p>
      ))}
      {usage.unreported > 0 && (
        <p>
          {number(usage.unreported)} requests have no recorded token usage. This
          includes older requests recorded before token tracking. They may still
          have been charged.
        </p>
      )}
      <p>
        Estimates cover reported usage at known model rates. They are not
        billing limits or a complete bill.
      </p>
    </details>
  );
}
function Estimate({ usage }: { usage: AiUsage }) {
  return (
    <div>
      <dt>Reported AI estimate{usage.unreported > 0 ? " (partial)" : ""}</dt>
      <dd>
        {usage.estimatedUsd === null
          ? "Unavailable"
          : `$${usage.estimatedUsd.toFixed(3)}`}
      </dd>
    </div>
  );
}
export function AdminUsage() {
  const query = useQuery({
    queryKey: ["admin-usage"],
    queryFn: () => api<Usage>("admin/usage"),
    refetchInterval: 20000,
  });
  if (query.isPending) return <p role="status">Loading service usage…</p>;
  if (query.error)
    return (
      <p role="alert">
        Usage could not be loaded.{" "}
        <button className="text-button" onClick={() => query.refetch()}>
          Retry usage
        </button>
      </p>
    );
  const u = query.data;
  if (!u?.visible) return null;
  const month = new Date(`${u.month}-01T00:00:00Z`).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  return (
    <section
      className="admin-usage admin-panel"
      aria-label="This month's usage"
    >
      <h3>This month’s usage</h3>
      <p className="muted">
        {month} · Resets{" "}
        {new Date(u.resetsAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        })}{" "}
        at 00:00 UTC
      </p>
      {u.sms && (u.sms.enabled || u.sms.requests > 0) && (
        <section className="usage-group" aria-label="SMS">
          <h4>
            SMS{" "}
            <span className="usage-state">
              {u.sms.enabled ? u.sms.provider : "Currently off"}
            </span>
          </h4>
          <dl className="usage-metrics">
            <div>
              <dt>Sign-in code submissions</dt>
              <dd>{number(u.sms.signIn)}</dd>
            </div>
            <div>
              <dt>Phone verification submissions</dt>
              <dd>{number(u.sms.verification)}</dd>
            </div>
            <div>
              <dt>Activity segment budget</dt>
              <dd>
                {number(u.sms.activity)} / {number(u.sms.monthlyLimit)}
              </dd>
            </div>
            {u.sms.provider === "textbelt" && (
              <>
                <div>
                  <dt>Textbelt credits remaining</dt>
                  <dd>
                    {u.sms.balance === null
                      ? "Unavailable"
                      : number(u.sms.balance)}
                    {u.sms.quotaState !== "fresh" && u.sms.balance !== null
                      ? " (last known)"
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Reserved for codes</dt>
                  <dd>{number(u.sms.reserve)}</dd>
                </div>
                <div>
                  <dt>Credits available for activity</dt>
                  <dd>
                    {u.sms.availableForNotifications === null
                      ? "Unavailable"
                      : number(u.sms.availableForNotifications)}
                  </dd>
                </div>
              </>
            )}
          </dl>
          {u.sms.provider === "textbelt" && (
            <p className="muted">
              Balance {u.sms.quotaState}.
              {u.sms.checkedAt
                ? ` Last checked ${new Date(u.sms.checkedAt).toLocaleString()}.`
                : " Not yet checked."}{" "}
              <button
                className="text-button"
                disabled={query.isFetching}
                onClick={() => query.refetch()}
              >
                Refresh balance
              </button>{" "}
              Checks are limited to once per minute. Prepaid credits do not
              reset with monthly usage.
            </p>
          )}
          <details className="usage-details">
            <summary>SMS delivery and skipped updates</summary>
            <dl className="usage-metrics">
              {u.sms.outcomes.map((o) => (
                <div key={o.status}>
                  <dt>{o.status[0].toUpperCase() + o.status.slice(1)}</dt>
                  <dd>{number(o.count)}</dd>
                </div>
              ))}
            </dl>
            {u.sms.recentFailures.length > 0 && (
              <>
                <h5>Recent SMS failures</h5>
                <p>
                  Up to 10 latest failed or unconfirmed submissions this month.
                </p>
                {u.sms.recentFailures.map((failure) => (
                  <p key={failure.id}>
                    <time dateTime={failure.createdAt}>
                      {new Date(failure.createdAt).toLocaleString()}
                    </time>{" "}
                    · {smsLabel(failure.provider)}
                    <br />
                    <strong>{smsLabel(failure.purpose)}</strong> ·{" "}
                    {smsLabel(failure.reason)}.
                    <br />
                    {failure.detail ??
                      "No additional details were recorded for this attempt."}
                  </p>
                ))}
              </>
            )}
            {u.sms.skipped.map((r) => (
              <p key={r.reason}>
                {r.reason.replaceAll("-", " ")}: {number(r.count)}
              </p>
            ))}
            {u.sms.providers.map((p) => (
              <p key={p.provider}>
                {p.provider}: {number(p.requests)} submissions this month
              </p>
            ))}
            <p>
              Submissions are not proof of delivery or a bill. Failed and
              uncertain submissions keep their budget reservation. Skipped
              updates are not sent later. Provider history remains when SMS is
              disabled or switched.
            </p>
          </details>
        </section>
      )}
      {(u.suggestions.enabled || u.suggestions.requests > 0) && (
        <section className="usage-group" aria-label="Gift suggestions">
          <h4>
            Gift suggestions
            {!u.suggestions.enabled && (
              <span className="usage-state">Currently off</span>
            )}
          </h4>
          <dl className="usage-metrics">
            <div>
              <dt>New searches</dt>
              <dd>{number(u.suggestions.requests)}</dd>
            </div>
            <div>
              <dt>Shared allowance used</dt>
              <dd>
                {number(u.suggestions.quotaSearches)} /{" "}
                {number(u.suggestions.monthlyLimit)}
              </dd>
            </div>
            <Estimate usage={u.suggestions} />
          </dl>
          <p className="muted">
            {number(u.suggestions.exemptSearches)} exempt searches ·{" "}
            {number(u.suggestions.searchCalls)} reported web-search calls
          </p>
          {!u.suggestions.requests && (
            <p className="muted">No gift suggestion searches this month.</p>
          )}
          <AiDetails usage={u.suggestions} />
        </section>
      )}
      {(u.productDetails.enabled || u.productDetails.requests > 0) && (
        <section className="usage-group" aria-label="Product-detail AI">
          <h4>
            Product-detail AI
            {!u.productDetails.enabled && (
              <span className="usage-state">Currently off</span>
            )}
          </h4>
          <p className="muted">
            Cleans up names, descriptions, and tags when you use Get details.
          </p>
          <dl className="usage-metrics">
            <div>
              <dt>AI requests</dt>
              <dd>{number(u.productDetails.requests)}</dd>
            </div>
            <Estimate usage={u.productDetails} />
          </dl>
          {!u.productDetails.requests && (
            <p className="muted">No product-detail AI requests this month.</p>
          )}
          <AiDetails usage={u.productDetails} />
        </section>
      )}
      {(u.scraping.enabled || u.scraping.requests > 0) && (
        <section className="usage-group" aria-label="Paid shop lookups">
          <h4>
            Paid shop lookups
            {!u.scraping.enabled && (
              <span className="usage-state">Currently off</span>
            )}
          </h4>
          <p className="muted">
            Retrieves shop details when a direct lookup needs help.
          </p>
          <dl className="usage-metrics">
            {u.scraping.providers.map((p) => (
              <div key={p.id}>
                <dt>{p.name} requests</dt>
                <dd>{number(p.requests)}</dd>
              </div>
            ))}
          </dl>
          {!u.scraping.requests && (
            <p className="muted">No paid shop lookups this month.</p>
          )}
          <details className="usage-details">
            <summary>About shop lookup charges</summary>
            <p>
              Counts include attempted requests, including failures. Provider
              credits and charges vary by plan and request type; check your
              provider’s billing.
            </p>
          </details>
        </section>
      )}
      <details className="usage-details">
        <summary>About this report</summary>
        <p>
          Recorded usage includes attempted paid requests, even when they fail.
          Direct website lookups and cached results do not add paid requests.
          Gift suggestion searches are counted separately. Disabling a service
          preserves charges already recorded this month.
        </p>
        <p>
          AI estimates use rates recorded on {u.pricingAsOf}. Models without
          known rates show Unavailable. Check provider billing for actual costs.
        </p>
      </details>
    </section>
  );
}
