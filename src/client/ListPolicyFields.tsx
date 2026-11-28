import { useId, useState, type SyntheticEvent, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { List } from "../shared/model";
import { dateHasElapsed } from "../shared/list-dates";
import { Field } from "./components";
import { ListIcon } from "./ListIcon";
import { EventDate } from "./EventDate";
import "./list-policy.css";

type Policy = Pick<
  List,
  | "mode"
  | "modeLocked"
  | "revealPolicyLocked"
  | "archiveAfter"
  | "revealAfter"
  | "timeZone"
  | "revealExchangeGivers"
>;
export const revealPolicyIsLocked = (list?: Policy) =>
  !!(list?.revealPolicyLocked ?? list?.modeLocked);

export function listPolicyValues(form: FormData, list?: Policy) {
  const revealLocked =
    revealPolicyIsLocked(list) &&
    (!list?.revealAfter || dateHasElapsed(list?.revealAfter, list?.timeZone));
  const revealAfter = revealLocked
    ? (list?.revealAfter ?? null)
    : String(form.get("revealAfter") ?? "") || null;
  return {
    mode: list?.modeLocked
      ? list.mode
      : String(form.get("mode") ?? "transparent"),
    archiveAfter: String(form.get("archiveAfter") ?? "") || null,
    revealAfter,
    timeZone: revealPolicyIsLocked(list)
      ? (list?.timeZone ?? "UTC")
      : String(
          form.get("timeZone") ??
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
    revealExchangeGivers: revealPolicyIsLocked(list)
      ? !!list?.revealExchangeGivers
      : !!revealAfter && form.get("revealExchangeGivers") === "on",
  };
}
export function ListPolicyFields({
  list,
  event = false,
  readOnly = false,
  children,
}: {
  list?: Policy;
  event?: boolean;
  readOnly?: boolean;
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
    (revealPolicyIsLocked(list)
      ? "UTC"
      : Intl.DateTimeFormat().resolvedOptions().timeZone);
  const revealLocked =
    revealPolicyIsLocked(list) &&
    (!list?.revealAfter || dateHasElapsed(list?.revealAfter, timeZone));
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
        disabled={readOnly || list?.modeLocked}
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
          <EyeOff size={20} />
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
            ? "Gifting mode can no longer be changed."
            : event
              ? "You can change this until gift planning begins on any event wish list. Once locked, gifting mode cannot change."
              : "You can change this until gift planning begins. Once locked, gifting mode cannot change."}
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
                  {revealPolicyIsLocked(list) && !list?.revealAfter ? (
                    <span>
                      Locked without a reveal date. Gift summaries stay hidden.
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
                        {revealPolicyIsLocked(list)
                          ? revealLocked
                            ? "Gift summaries are now available. This date is fixed."
                            : "Once privacy is locked, this date can only move later."
                          : event
                            ? "Choose before creating the event. After creation, this date can only move later."
                            : "Choose before first sharing. Once privacy is locked, this date can only move later."}
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
                disabled={readOnly || revealLocked}
                min={
                  revealPolicyIsLocked(list)
                    ? (list?.revealAfter ?? undefined)
                    : undefined
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
                  disabled={
                    readOnly || revealPolicyIsLocked(list) || !revealAfter
                  }
                  onChange={(e) => setRevealExchangeGivers(e.target.checked)}
                />
                Include secret exchange gifts and giver names
              </label>
              <small id={exchangeHintId} className="policy-guidance">
                <span>
                  {revealPolicyIsLocked(list)
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
              disabled={readOnly || revealPolicyIsLocked(list)}
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
  coManagerAccess = false,
  event = false,
}: {
  data: FormData;
  audience: string[];
  list?: Policy;
  coManagerAccess?: boolean;
  event?: boolean;
}) {
  const policy = listPolicyValues(data, list);
  const modeChange = !!list && policy.mode !== list.mode;
  return (
    <section className="sharing-review" aria-label="Review sharing">
      <h3>
        {modeChange
          ? "Review gifting mode"
          : coManagerAccess
            ? "Review list privacy"
            : "Review before sharing"}
      </h3>
      <div className="sharing-review-identity">
        {!event && (
          <ListIcon iconKey={String(data.get("iconKey") ?? "")} size={24} />
        )}
        <strong>{String(data.get("name"))}</strong>
      </div>
      <dl className="sharing-review-facts">
        <div>
          <dt>Shared with</dt>
          <dd>
            <strong>
              {audience.join(", ") ||
                (coManagerAccess
                  ? "The account holder and co-managers"
                  : "Only the list owners")}
            </strong>
            {coManagerAccess && (
              <p>Co-managers can access this list as soon as it is saved.</p>
            )}
          </dd>
        </div>
        <div>
          <dt>{modeChange ? "New gifting mode" : "Gifting mode"}</dt>
          <dd>
            <strong>
              {policy.mode === "surprise"
                ? "Keep it a surprise"
                : "See the plans"}
            </strong>
            <p>
              {policy.mode === "surprise"
                ? "Recipients cannot see gift plans or discussion."
                : "Recipients can see who reserves or buys their gifts and can join the discussion."}
            </p>
            {modeChange && (
              <p>
                Previously:{" "}
                {list.mode === "surprise"
                  ? "Keep it a surprise"
                  : "See the plans"}
                .{event && " This changes every wish list in the event."}
              </p>
            )}
          </dd>
        </div>
        <div>
          <dt>Gift summary</dt>
          <dd>
            <strong>
              {policy.revealAfter ? (
                <>
                  Available after <EventDate date={policy.revealAfter} />
                </>
              ) : (
                "Not scheduled"
              )}
            </strong>
            {policy.revealAfter ? (
              <>
                <p>
                  After that day ends in {policy.timeZone}, recipients can view
                  purchased gifts, buyers, and contributor names.
                </p>
                <p>
                  {policy.revealExchangeGivers
                    ? "Secret exchange gifts and giver names are included."
                    : "Secret exchange gifts and giver names stay hidden."}
                </p>
              </>
            ) : (
              <p>
                A gift summary cannot be added after sharing or co-manager
                access.
              </p>
            )}
          </dd>
        </div>
      </dl>
      <div className="sharing-review-guidance">
        <p>
          {list?.modeLocked
            ? "Gifting mode can no longer be changed."
            : event
              ? "Gift planning on any event wish list makes the gifting mode permanent for the entire event."
              : "You can change gifting mode until gift planning begins. Once locked, it cannot change."}
        </p>
        {policy.revealAfter && (
          <p>
            After sharing, only a future summary date can move later. Its time
            zone and secret exchange inclusion cannot change.
          </p>
        )}
        <p>
          Contribution amounts and private notes stay out of gift summaries.
        </p>
      </div>
    </section>
  );
}
