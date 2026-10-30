import { useState } from "react";
import type { Follow, NotificationChannel } from "../shared/model";
import {
  matchingFollows,
  resolveFollows,
  notificationChannels,
  channelLabels,
} from "../shared/follows";
import { defaultPushEvents } from "../shared/notifications";
import { familyGroupLabel, householdLabel } from "../shared/households";
import { useApp } from "./context";
import { Form, Field } from "./components";

export type FollowTarget = Pick<Follow, "target" | "targetId">;
export function useFollowSettings(target: FollowTarget) {
  const { world } = useApp();
  const follows = world.follows ?? [];
  const direct = follows.find(
    (f) => f.target === target.target && f.targetId === target.targetId,
  );
  const p = world.preferences;
  const defaults = notificationChannels.filter((c) =>
    c === "push"
      ? (p.pushEvents ?? defaultPushEvents).includes("wishlist")
      : (p.channelEvents?.[c] ?? p.events).includes("wishlist"),
  );
  const list = world.lists.find(
    (l) => target.target === "list" && l.id === target.targetId,
  );
  const household = world.households.find(
    (h) => target.target === "household" && h.id === target.targetId,
  );
  const parents = list
    ? matchingFollows(world, follows, world.me.id, list).filter(
        (f) => f.id !== direct?.id,
      )
    : household
      ? follows.filter(
          (f) => f.target === "group" && f.targetId === household.groupId,
        )
      : [];
  const effective = resolveFollows(
    [...parents, ...(direct ? [direct] : [])],
    [...defaults],
  );
  const inherited = resolveFollows(
    [...parents, { target: target.target }],
    [...defaults],
  );
  const group = world.groups.find(
    (g) => target.target === "group" && g.id === target.targetId,
  );
  const name =
    list?.name ??
    (household ? householdLabel(household, world) : undefined) ??
    (group ? familyGroupLabel(group, world) : undefined) ??
    world.people.find(
      (p) => target.target === "person" && p.id === target.targetId,
    )?.name ??
    "Unavailable";
  const sourceNames = parents
    .filter((follow) => inherited.sources.includes(follow))
    .map((follow) => {
      if (follow.target === "group") {
        const group = world.groups.find((g) => g.id === follow.targetId);
        return group
          ? familyGroupLabel(group, world)
          : "an unavailable family group";
      }
      if (follow.target === "household") {
        const household = world.households.find(
          (h) => h.id === follow.targetId,
        );
        return household
          ? householdLabel(household, world)
          : "an unavailable household";
      }
      return (
        world.people.find((p) => p.id === follow.targetId)?.name ??
        "an unavailable person"
      );
    });
  const inheritance =
    target.target === "person"
      ? "Choices depend on the wish list"
      : sourceNames.length
        ? `Uses choices from ${sourceNames.join(" and ")}`
        : "Uses your default channels";
  return { direct, effective, inherited, name, inheritance };
}

export function FollowSettings({ target, targetId }: FollowTarget) {
  const { world, mutate, close, toast } = useApp();
  const { direct, inherited, name, inheritance } = useFollowSettings({
    target,
    targetId,
  });
  const [mode, setMode] = useState(
    direct?.muted ? "mute" : direct?.channels ? "custom" : "inherit",
  );
  const [channels, setChannels] = useState<NotificationChannel[]>(
    (direct?.channels ?? inherited.channels).filter((c) => c !== "sms"),
  );
  const p = world.preferences;
  return (
    <Form
      className="follow-settings"
      submit="Save follow settings"
      onSubmit={async () => {
        await mutate("follows", {
          target,
          targetId,
          following: mode !== "mute" && mode !== "remove",
          muted: mode === "mute",
          channels: mode === "custom" ? channels : null,
        });
        toast(mode === "mute" ? "Wish list muted." : "Follow settings saved.");
        close();
      }}
    >
      <p>
        New wish-list items from {name} appear in your inbox immediately.
        External updates are grouped for 15 minutes per list. SMS does not send
        wish-list summaries.
      </p>
      <Field label="Updates for this follow">
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="inherit">Follow with inherited channels</option>
          <option value="custom">Follow with custom channels</option>
          {target === "list" && (
            <option value="mute">Mute this list everywhere</option>
          )}
          <option value="remove">
            {direct?.muted
              ? "Remove mute and use other follows"
              : "Stop this follow and use other follows"}
          </option>
        </select>
      </Field>
      {mode === "inherit" && (
        <p className="muted">
          {target === "person"
            ? "Uses the first available custom choices for each wish list: the list, its people, its household, then its family group. Otherwise, uses your default channels."
            : `${inheritance}: ${
                inherited.channels
                  .filter((c) => c !== "sms")
                  .map((c) => channelLabels[c])
                  .join(", ") || "Inbox only"
              }.`}
        </p>
      )}
      {mode === "custom" && (
        <fieldset className="choice-group">
          <legend>Send summaries through</legend>
          {notificationChannels
            .filter((c) => c !== "sms")
            .map((c) => (
              <label className="check" key={c}>
                <input
                  type="checkbox"
                  checked={channels.includes(c)}
                  onChange={(e) =>
                    setChannels((v) =>
                      e.target.checked ? [...v, c] : v.filter((x) => x !== c),
                    )
                  }
                />
                {channelLabels[c]}
              </label>
            ))}
          <p className="muted">
            Leave all unchecked for inbox only. Custom channels replace broader
            follow choices. List settings win; tied choices combine.
          </p>
        </fieldset>
      )}
      {mode !== "mute" && mode !== "remove" && (
        <p className="muted">
          Push requires an enabled device.{" "}
          {(!p.email || !p.telegram || !p.sms) &&
            "Disabled or unconnected channels stay off."}{" "}
          <a href="/settings?section=notifications">Manage delivery channels</a>
          .
        </p>
      )}
      {mode === "mute" && (
        <p className="muted">
          Stops new inbox entries and queued external updates for this list,
          even when you follow its owners, household, or family group. Existing
          history stays available.
        </p>
      )}
      {mode === "remove" && (
        <p className="muted">
          Other follows may still send updates.{" "}
          {target === "list" &&
            "Choose Mute this list everywhere to stop them all."}
        </p>
      )}
    </Form>
  );
}

export function FollowingSettings() {
  const { world, open } = useApp();
  return (
    <section aria-labelledby="following-settings-title">
      <h3 id="following-settings-title">Following and muted lists</h3>
      <p className="muted">
        Follow people and lists from their pages, or family groups and
        households in Family groups. Following does not change sharing.
      </p>
      {!world.follows?.length && <p>You are not following anyone yet.</p>}
      {world.follows?.map((f) => (
        <FollowingRow
          key={f.id}
          follow={f}
          onOpen={() =>
            open(
              "Notification settings",
              <FollowSettings target={f.target} targetId={f.targetId} />,
            )
          }
        />
      ))}
    </section>
  );
}
function FollowingRow({
  follow,
  onOpen,
}: {
  follow: Follow;
  onOpen: () => void;
}) {
  const { name, effective, inheritance } = useFollowSettings(follow);
  return (
    <div className="setting-row">
      <div>
        <strong>{name}</strong>
        <p>
          {follow.target === "group"
            ? "Family group"
            : follow.target === "household"
              ? "Household"
              : follow.target === "person"
                ? "Person"
                : "Wish list"}{" "}
          ·{" "}
          {follow.muted
            ? "Muted"
            : follow.channels !== undefined
              ? effective.channels.map((c) => channelLabels[c]).join(", ") ||
                "Inbox only"
              : inheritance}
        </p>
      </div>
      <button
        type="button"
        className="text-button"
        aria-label={`Edit notifications for ${name}`}
        onClick={onOpen}
      >
        Edit notifications
      </button>
    </div>
  );
}
