import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { Field, Form } from "./components";
import { useApp } from "./context";
import type { DiscoveryConfig } from "../shared/gift-discovery";
export function GiftDiscoveryAdmin({
  settings,
}: {
  settings: Array<{ key: string; value?: string; source: string }>;
}) {
  const client = useQueryClient();
  const { toast } = useApp();
  const usage = useQuery({
    queryKey: ["admin-discovery"],
    queryFn: () =>
      api<{
        config: DiscoveryConfig;
        searches: number;
        quotaSearches: number;
        exemptSearches: number;
        searchCalls: number;
        inputTokens: number;
        outputTokens: number;
        unreportedAttempts: number;
        resetsAt: string;
        estimatedUsd: number | null;
        pricingAsOf: string;
      }>("admin/gift-discovery"),
    refetchInterval: 20000,
  });
  const labels: Record<string, string> = {
    GIFT_DISCOVERY_MODE: "AI gift suggestions",
    GIFT_DISCOVERY_USER_WEEKLY_LIMIT: "New searches per account each week",
    GIFT_DISCOVERY_MONTHLY_LIMIT: "Shared new-search allowance each month",
    GIFT_DISCOVERY_MODEL: "Discovery model",
  };
  return (
    <section className="gift-discovery-admin" aria-label="AI gift suggestions">
      <h3>AI gift suggestions</h3>
      <p>
        Off disables suggestions throughout the app, including queued work and
        further provider calls. Saved gifts and preferences are kept. A request
        already sent may still be charged.
      </p>
      {settings
        .filter((s) => s.key.startsWith("GIFT_DISCOVERY_"))
        .map((s) => (
          <Form
            key={`${s.key}:${s.value}:${s.source}`}
            submit={`Save ${labels[s.key].toLowerCase()}`}
            disabled={s.source === "environment"}
            onSubmit={async (f) => {
              await api("admin/settings", {
                key: s.key,
                value: String(f.get("value") ?? ""),
              });
              await client.invalidateQueries();
              toast("Gift suggestion setting saved.");
            }}
          >
            <Field
              label={labels[s.key]}
              hint={
                s.source === "environment"
                  ? `Locked by ${s.key} on the server. Change it there.`
                  : `Server override: ${s.key}`
              }
            >
              {s.key === "GIFT_DISCOVERY_MODE" ? (
                <select
                  name="value"
                  defaultValue={s.value}
                  disabled={s.source === "environment"}
                >
                  <option value="off">Off throughout the app</option>
                  <option value="givers">For others only</option>
                  <option value="receivers">For own lists only</option>
                  <option value="both">Both</option>
                </select>
              ) : (
                <input
                  name="value"
                  type={s.key.endsWith("LIMIT") ? "number" : "text"}
                  min={0}
                  max={999999}
                  step={1}
                  required
                  maxLength={100}
                  defaultValue={s.value}
                  disabled={s.source === "environment"}
                />
              )}
            </Field>
          </Form>
        ))}
      <p className="muted">
        Allowances cover all recipients and both modes. Weeks reset Monday at
        00:00 UTC; months reset on the first at 00:00 UTC. Each fresh search
        makes at most two web-search calls. Shuffling and reopening results do
        not call AI. Discovery does not use paid shop scraping.
      </p>
      {usage.data && (
        <div>
          <h4>This month's usage</h4>
          <p>
            {usage.data.quotaSearches} of {usage.data.config.monthlyLimit}{" "}
            shared searches used. {usage.data.exemptSearches} exempt searches.
          </p>
          <p>
            {usage.data.searches} total searches. {usage.data.searchCalls}{" "}
            reported web-search calls.
          </p>
          <p>
            {usage.data.inputTokens.toLocaleString()} input tokens ·{" "}
            {usage.data.outputTokens.toLocaleString()} output tokens.
          </p>
          <p>
            {usage.data.estimatedUsd === null
              ? "Cost estimate unavailable for the selected model."
              : `Estimated reported cost: $${usage.data.estimatedUsd.toFixed(3)} using published standard rates from ${usage.data.pricingAsOf}.`}
          </p>
          <p className="muted">
            This is an estimate, not a billing limit.{" "}
            {usage.data.unreportedAttempts} attempts have no returned usage and
            may also have been charged. Check your provider's billing for actual
            costs.
          </p>
          {!usage.data.config.available && (
            <p>
              Suggestions are unavailable. Choose an enabled mode and configure
              an OpenAI API key to use them.
            </p>
          )}
        </div>
      )}
      {usage.error && (
        <p role="alert">
          Usage could not be loaded.{" "}
          <button className="text-button" onClick={() => usage.refetch()}>
            Retry usage
          </button>
        </p>
      )}
    </section>
  );
}
