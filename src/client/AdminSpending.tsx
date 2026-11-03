import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { Field } from "./components";
import { Confirm } from "./Confirm";
import { useApp } from "./context";
import type {
  AdminSpending as Summary,
  SpendingEnableScope,
  SpendingEnableResult,
} from "../shared/admin-spending";
export function AdminSpending() {
  const client = useQueryClient();
  const { open } = useApp();
  const [scope, setScope] = useState("");
  const [result, setResult] = useState<SpendingEnableResult>();
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const summary = useQuery({
    queryKey: ["admin-spending"],
    queryFn: () => api<Summary>("admin/spending"),
  });
  const counts =
    scope === "all"
      ? summary.data?.overall
      : summary.data?.groups.find((g) => g.id === scope);
  return (
    <div className="admin-preference admin-spending-bulk">
      <h4>Enable for existing accounts</h4>
      <p>
        Enable private tracking for everyone or current members of a family
        group. Saved opt-outs are preserved. Group selection applies to each
        member's whole account.
      </p>
      {summary.isPending && <p role="status">Loading accounts…</p>}
      {summary.isError && (
        <p role="alert">
          Unable to load accounts.{" "}
          <button type="button" onClick={() => void summary.refetch()}>
            Try again
          </button>
        </p>
      )}
      {summary.data && (
        <>
          {!summary.data.available && (
            <p>
              Spending is unavailable in hosting configuration. The new-account
              default is saved, but tracking stays unavailable until it is
              restored.
            </p>
          )}
          <Field label="Accounts to enable">
            <select
              value={scope}
              disabled={!summary.data.available || reviewing}
              onChange={(e) => {
                setScope(e.target.value);
                setResult(undefined);
                setError("");
              }}
            >
              <option value="">Choose accounts</option>
              <option value="all">All accounts</option>
              {summary.data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          {!summary.data.groups.length && (
            <p>No family groups yet. You can still select all accounts.</p>
          )}
          {counts && (
            <p>
              {counts.eligible} eligible · {counts.alreadyEnabled} already
              enabled · {counts.optedOut} opted out
            </p>
          )}
          {counts?.eligible === 0 && (
            <p>No accounts need enabling in this selection.</p>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={!summary.data.available || !counts?.eligible || reviewing}
            onClick={async () => {
              setReviewing(true);
              setError("");
              try {
                const fresh = await summary.refetch();
                if (fresh.error || !fresh.data)
                  throw new Error("Unable to refresh accounts. Try again.");
                if (!fresh.data.available)
                  throw new Error("Spending is unavailable.");
                const current =
                  scope === "all"
                    ? fresh.data.overall
                    : fresh.data.groups.find((g) => g.id === scope);
                if (!current)
                  throw new Error(
                    "Family group not found. Choose another group.",
                  );
                if (!current.eligible)
                  throw new Error(
                    "No eligible accounts remain in this selection.",
                  );
                const target: SpendingEnableScope =
                  scope === "all"
                    ? { scope: "all" }
                    : { scope: "group", groupId: scope };
                const label =
                  scope === "all"
                    ? "all accounts"
                    : fresh.data.groups.find((g) => g.id === scope)!.name;
                const key = crypto.randomUUID();
                open(
                  "Enable spending tracking",
                  <Confirm
                    label="Enable tracking"
                    onConfirm={async () => {
                      const applied = await api<SpendingEnableResult>(
                        "admin/spending/enable",
                        target,
                        { idempotencyKey: key },
                      );
                      setResult(applied);
                      await Promise.all(
                        ["admin-spending", "world", "spending"].map((key) =>
                          client.invalidateQueries({ queryKey: [key] }),
                        ),
                      );
                    }}
                  >
                    Enable private tracking for eligible accounts in {label}?
                    Currently {current.eligible} are eligible,{" "}
                    {current.alreadyEnabled} already enabled, and{" "}
                    {current.optedOut} opted out. Membership and preferences are
                    checked again when you confirm. Tracking covers each
                    account. Records stay private, sharing stays unchanged, and
                    each person can turn tracking off.
                  </Confirm>,
                );
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unable to review accounts.",
                );
              } finally {
                setReviewing(false);
              }
            }}
          >
            {reviewing ? "Refreshing…" : "Review accounts"}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <p role="status">
          Tracking enabled for {result.enabled} accounts.{" "}
          {result.alreadyEnabled} were already enabled; {result.optedOut}{" "}
          opt-outs were preserved.
        </p>
      )}
    </div>
  );
}
