import { useId, useState, type SyntheticEvent, type ReactNode } from "react";
import { Eye, LockKeyhole } from "lucide-react";
import type { List } from "../shared/model";
import { dateHasElapsed } from "../shared/list-dates";
import { Field } from "./components";

type Policy = Pick<
  List,
  | "mode"
  | "modeLocked"
  | "archiveAfter"
  | "revealAfter"
  | "timeZone"
  | "revealExchangeGivers"
>;
export function listPolicyValues(form: FormData, list?: Policy) {
  const revealLocked =
    !!list?.modeLocked &&
    (!list.revealAfter || dateHasElapsed(list.revealAfter, list.timeZone));
  const revealAfter = revealLocked
    ? (list?.revealAfter ?? null)
    : String(form.get("revealAfter") ?? "") || null;
  return {
    mode: list?.modeLocked
      ? list.mode
      : String(form.get("mode") ?? "transparent"),
    archiveAfter: String(form.get("archiveAfter") ?? "") || null,
    revealAfter,
    timeZone: list?.modeLocked
      ? (list.timeZone ?? "UTC")
      : String(
          form.get("timeZone") ??
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
    revealExchangeGivers: list?.modeLocked
      ? !!list.revealExchangeGivers
      : !!revealAfter && form.get("revealExchangeGivers") === "on",
  };
}
export function ListPolicyFields({
  list,
  event = false,
  children,
}: {
  list?: Policy;
  event?: boolean;
  children?: ReactNode;
}) {
  const exchangeHintId = useId();
  const privacyHintId = useId();
  const [mode, setMode] = useState(list?.mode ?? "");
  const [revealAfter, setRevealAfter] = useState(list?.revealAfter ?? "");
  const [revealExchangeGivers, setRevealExchangeGivers] = useState(
    !!list?.revealExchangeGivers,
  );
  const timeZone =
    list?.timeZone ??
    (list?.modeLocked
      ? "UTC"
      : Intl.DateTimeFormat().resolvedOptions().timeZone);
  const revealLocked =
    !!list?.modeLocked &&
    (!list.revealAfter || dateHasElapsed(list.revealAfter, timeZone));
  const syncRevealDate = (event: SyntheticEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    // WebKit can retain a stale :invalid state after clearing its date editor,
    // even when every validity flag is clear. Refresh the unchanged value so
    // native form submission agrees with validity; preserve real input errors.
    if (!input.value && input.validity.valid && input.matches(":invalid")) {
      input.value = "";
    }
    setRevealAfter(input.value);
  };
  return (
    <>
      <fieldset
        className="choice-group form-section"
        disabled={list?.modeLocked}
        aria-describedby={privacyHintId}
      >
        <legend>How should gifting work?</legend>
        <label
          className={`mode-choice ${mode === "transparent" ? "chosen" : ""}`}
        >
          <input
            type="radio"
            name="mode"
            value="transparent"
            required
            checked={mode === "transparent"}
            onChange={() => setMode("transparent")}
          />
          <Eye size={20} />
          <span>
            <strong>See the plans</strong>
            <small>
              {event
                ? "Each recipient can see who reserves or purchases their gifts."
                : "See who reserves or purchases a gift for you."}
            </small>
          </span>
        </label>
        <label className={`mode-choice ${mode === "surprise" ? "chosen" : ""}`}>
          <input
            type="radio"
            name="mode"
            value="surprise"
            checked={mode === "surprise"}
            onChange={() => setMode("surprise")}
          />
          <LockKeyhole size={20} />
          <span>
            <strong>Keep it a surprise</strong>
            <small>
              {event
                ? "Each person adds items. Buying plans stay hidden from them."
                : "Add items to your wish list. Buying plans stay hidden from you."}
            </small>
          </span>
        </label>
        <small id={privacyHintId}>
          {list?.modeLocked
            ? "This privacy choice cannot change after sharing."
            : "Choose before sharing. This privacy choice cannot change later."}
        </small>
      </fieldset>
      {children}
      <details
        className="policy-options"
        open={!!(list?.archiveAfter || list?.revealAfter)}
      >
        <summary>Optional dates and gift summaries</summary>
        <fieldset className="choice-group form-section">
          <legend>After the occasion</legend>
          <Field
            label="Archive after"
            hint={
              event
                ? "Optional. Archive all event lists after this day. An event leader can restore them."
                : "Optional. Hide this list from active browsing after this day. Restore it anytime."
            }
          >
            <input
              type="date"
              name="archiveAfter"
              defaultValue={list?.archiveAfter ?? ""}
            />
          </Field>
          <div className="policy-summary">
            <Field
              label={
                mode === "transparent"
                  ? "Gift summary available after"
                  : "Reveal gifts after"
              }
              hint={
                <span className="policy-guidance">
                  {list?.modeLocked && !list.revealAfter ? (
                    <span>
                      Shared without a reveal date. Gift summaries stay hidden.
                    </span>
                  ) : (
                    <>
                      <span>
                        Optional. After this day,{" "}
                        {event ? "each recipient" : "list owners"} can view
                        purchased gifts, buyers, and contributor names
                        {mode === "surprise"
                          ? ", even with Keep it a surprise."
                          : "."}
                        {mode === "transparent" &&
                          " Purchase activity is already visible with See the plans."}
                      </span>
                      <span>
                        {list?.modeLocked
                          ? revealLocked
                            ? "Gift summaries are now available. This date is fixed."
                            : "After sharing, this date can only move later."
                          : event
                            ? "Choose before creating the event. After creation, this date can only move later."
                            : "Choose before first sharing. After sharing, this date can only move later."}
                      </span>
                    </>
                  )}
                  <span>
                    Contribution amounts and private notes always stay private.
                  </span>
                </span>
              }
            >
              <input
                type="date"
                name="revealAfter"
                // iOS Reset falls back to the HTML default value. Keep it at
                // the initial date instead of mirroring each picker selection.
                defaultValue={list?.revealAfter ?? ""}
                disabled={revealLocked}
                min={
                  list?.modeLocked ? (list.revealAfter ?? undefined) : undefined
                }
                onInput={syncRevealDate}
                onChange={syncRevealDate}
                onBlur={syncRevealDate}
              />
            </Field>
            <div className="policy-exchange">
              <label className="check">
                <input
                  type="checkbox"
                  name="revealExchangeGivers"
                  aria-describedby={exchangeHintId}
                  checked={!!revealAfter && revealExchangeGivers}
                  disabled={list?.modeLocked || !revealAfter}
                  onChange={(e) => setRevealExchangeGivers(e.target.checked)}
                />
                Include secret exchange gifts and giver names
              </label>
              <small id={exchangeHintId} className="policy-guidance">
                <span>
                  {list?.modeLocked
                    ? "This choice cannot change after sharing."
                    : !revealAfter
                      ? mode === "transparent"
                        ? "Choose a gift summary date above to enable this option."
                        : "Choose a reveal date above to enable this option."
                      : "This choice cannot change after sharing."}
                </span>
                <span>
                  Leave unchecked to keep secret exchange gifts and giver names
                  out of the summary. Other purchased gifts are included either
                  way.
                </span>
              </small>
            </div>
          </div>
          <Field
            label={event ? "Event time zone" : "List time zone"}
            hint="Dates take effect after the selected day ends in this time zone. The time zone cannot change after sharing."
          >
            <select
              name="timeZone"
              defaultValue={timeZone}
              disabled={list?.modeLocked}
            >
              {[
                ...new Set([
                  timeZone,
                  "UTC",
                  ...Intl.supportedValuesOf("timeZone"),
                ]),
              ].map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </select>
          </Field>
        </fieldset>
      </details>
    </>
  );
}

export function SharingReview({
  data,
  audience,
  list,
}: {
  data: FormData;
  audience: string[];
  list?: Policy;
}) {
  const policy = listPolicyValues(data, list);
  return (
    <section aria-label="Review sharing">
      <h3>Review before sharing</h3>
      <p>
        <strong>{String(data.get("name"))}</strong>
      </p>
      <p>Shared with: {audience.join(", ") || "Only the list owners"}.</p>
      <p>
        {policy.mode === "surprise"
          ? "Keep it a surprise: recipients cannot see who reserves or buys their gifts."
          : "See the plans: recipients can see who reserves and buys their gifts."}
      </p>
      <p>
        {policy.revealAfter
          ? `Gift summaries become available after ${policy.revealAfter} in ${policy.timeZone}. ${policy.revealExchangeGivers ? "Secret exchange gifts and giver names are included." : "Secret exchange gifts and giver names stay hidden."}`
          : "No gift summary is scheduled. This cannot be enabled after sharing."}
      </p>
      <p>
        After sharing, you cannot change who sees gift plans or whether secret
        exchange gifts appear in the summary. You can only move a future summary
        date later. Contribution amounts and private notes stay private.
      </p>
    </section>
  );
}
