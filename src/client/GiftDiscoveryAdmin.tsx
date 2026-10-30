import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { Field, Form } from "./components";
import { useApp } from "./context";
const labels: Record<string, string> = {
  GIFT_DISCOVERY_MODE: "AI gift suggestions",
  GIFT_DISCOVERY_USER_WEEKLY_LIMIT: "New searches per account each week",
  GIFT_DISCOVERY_MONTHLY_LIMIT: "Shared new-search allowance each month",
  GIFT_DISCOVERY_MODEL: "Discovery model",
};
export function GiftDiscoveryAdmin({
  settings,
}: {
  settings: Array<{ key: string; value?: string; source: string }>;
}) {
  const client = useQueryClient();
  const { toast } = useApp();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const entries = settings.filter((s) => s.key in labels);
  const changed = entries.filter(
    (s) =>
      s.source !== "environment" &&
      draft[s.key] !== undefined &&
      draft[s.key] !== s.value,
  );
  const fields = entries.map((s) => (
    <Field
      key={s.key}
      label={labels[s.key]}
      hint={
        s.source === "environment"
          ? `Set on the server with ${s.key}.`
          : undefined
      }
    >
      {s.key === "GIFT_DISCOVERY_MODE" ? (
        <select
          name={s.key}
          value={draft[s.key] ?? s.value ?? "off"}
          disabled={s.source === "environment"}
          onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
        >
          <option value="off">Off throughout the app</option>
          <option value="givers">For others only</option>
          <option value="receivers">For own lists only</option>
          <option value="both">Both</option>
        </select>
      ) : (
        <input
          name={s.key}
          type={s.key.endsWith("LIMIT") ? "number" : "text"}
          min={0}
          max={999999}
          step={1}
          maxLength={100}
          required
          disabled={s.source === "environment"}
          value={draft[s.key] ?? s.value ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
        />
      )}
    </Field>
  ));
  return (
    <section
      className="gift-discovery-admin admin-panel"
      aria-label="AI gift suggestions"
    >
      <h3>AI gift suggestions</h3>
      <p>
        Choose who can find gift suggestions and how many new searches are
        available.
      </p>
      {entries.length > 0 &&
        (entries.every((s) => s.source === "environment") ? (
          <div className="admin-fields">
            {fields}
            <p className="muted">These settings are managed on the server.</p>
          </div>
        ) : (
          <Form
            submit="Save gift suggestion settings"
            disabled={!changed.length}
            dirty={changed.length > 0}
            onSubmit={async () => {
              await api("admin/settings/batch", {
                settings: changed.map((s) => ({
                  key: s.key,
                  value: draft[s.key],
                })),
              });
              await client.invalidateQueries();
              setDraft({});
              toast("Gift suggestion settings saved.");
            }}
          >
            {fields}
          </Form>
        ))}
      <details className="admin-explanation">
        <summary>How suggestions and allowances work</summary>
        <p>
          Off stops new searches and queued work. Saved gifts and preferences
          are kept. Requests already sent may still be charged.
        </p>
        <p>
          Allowances cover all recipients and both modes. Weeks reset Monday at
          00:00 UTC; months reset on the first at 00:00 UTC.
        </p>
        <p>
          Each new search makes at most two web-search calls. Shuffling and
          reopening results do not call AI. Suggestions do not use paid shop
          scraping.
        </p>
        <p>
          A configured OpenAI API key is required. Selected accounts may have
          separate server-configured allowances.
        </p>
      </details>
    </section>
  );
}
