import { useState } from "react";
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
    mode: list?.modeLocked ? list.mode : String(form.get("mode") ?? "surprise"),
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
}: {
  list?: Policy;
  event?: boolean;
}) {
  const [mode, setMode] = useState(list?.mode ?? "surprise");
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
  return (
    <>
      <fieldset className="choice-group" disabled={list?.modeLocked}>
        <legend>How should gifting work?</legend>
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
                ? "Each person adds wishes. The group coordinates gifts privately."
                : "You add wishes. Your people coordinate gifts privately."}
            </small>
          </span>
        </label>
        <label
          className={`mode-choice ${mode === "transparent" ? "chosen" : ""}`}
        >
          <input
            type="radio"
            name="mode"
            value="transparent"
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
      </fieldset>
      <p className="muted">
        {list?.modeLocked
          ? "Privacy mode is locked after sharing."
          : "Privacy mode locks when first shared."}
      </p>
      <fieldset className="choice-group">
        <legend>After the occasion</legend>
        <Field
          label="Archive after"
          hint={
            event
              ? "Optional. Archive all event lists after this day. An event leader can restore them later."
              : "Optional. Hide this list from active browsing after this day. You can restore it later."
          }
        >
          <input
            type="date"
            name="archiveAfter"
            defaultValue={list?.archiveAfter ?? ""}
          />
        </Field>
        <Field
          label="Reveal gifts after"
          hint={
            list?.modeLocked
              ? !list.revealAfter
                ? "Shared without a reveal date. Gift summaries stay hidden."
                : revealLocked
                  ? "Gifts are already eligible to be revealed. This date is fixed."
                  : "After sharing, you can only move the reveal date later."
              : "Optional. After this day, view purchased gifts and contributors. The date locks when first shared and can then only move later."
          }
        >
          <input
            type="date"
            name="revealAfter"
            value={revealAfter}
            disabled={revealLocked}
            min={list?.modeLocked ? (list.revealAfter ?? undefined) : undefined}
            onChange={(e) => setRevealAfter(e.target.value)}
          />
        </Field>
        <Field
          label={event ? "Event timezone" : "List timezone"}
          hint="Dates take effect after the selected day ends in this timezone. The timezone locks when first shared."
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
        <label className="check">
          <input
            type="checkbox"
            name="revealExchangeGivers"
            checked={!!revealAfter && revealExchangeGivers}
            disabled={list?.modeLocked || !revealAfter}
            onChange={(e) => setRevealExchangeGivers(e.target.checked)}
          />
          Reveal purchased exchange gifts after this date
        </label>
        <small>
          Otherwise, secret gift exchange identities stay hidden. This choice
          locks when first shared. Contribution amounts and private discussions
          are never revealed.
        </small>
      </fieldset>
    </>
  );
}
