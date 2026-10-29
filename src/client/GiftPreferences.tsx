import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { giftCategories, discoveryAllowed } from "../shared/gift-discovery";
import { useApp } from "./context";
import { Field, Form, useModalDismiss } from "./components";

export function InterestFields({
  value,
  onChange,
}: {
  value: {
    categoryIds: string[];
    interests: string;
    likes: string;
    avoid: string;
  };
  onChange: (v: typeof value) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <>
      <Field label="Find an interest">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Coffee, gardening, games…"
        />
      </Field>
      <fieldset className="gift-interests">
        <legend>Choose any interests that fit</legend>
        <div className="gift-interest-options">
          {giftCategories
            .filter(([, label, keywords]) =>
              `${label} ${keywords}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map(([id, label]) => (
              <label className="check" key={id}>
                <input
                  type="checkbox"
                  checked={value.categoryIds.includes(id)}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      categoryIds: e.target.checked
                        ? [...value.categoryIds, id]
                        : value.categoryIds.filter((x) => x !== id),
                    })
                  }
                />
                {label}
              </label>
            ))}
        </div>
        {search &&
          !giftCategories.some(([, label, keywords]) =>
            `${label} ${keywords}`.toLowerCase().includes(search.toLowerCase()),
          ) && <p>No matching categories. Add a specific interest below.</p>}
      </fieldset>
      <Field
        label="Specific interests"
        hint="Optional. For example, pour-over coffee, watercolor painting, or cooperative board games."
      >
        <input
          value={value.interests}
          maxLength={500}
          onChange={(e) => onChange({ ...value, interests: e.target.value })}
        />
      </Field>
      <Field
        label="Likes and favorites"
        hint="Optional details that help someone choose."
      >
        <textarea
          value={value.likes}
          maxLength={1000}
          onChange={(e) => onChange({ ...value, likes: e.target.value })}
        />
      </Field>
      <Field
        label="Things to avoid"
        hint="Optional. For example, already owns a grinder or prefers unscented products."
      >
        <textarea
          value={value.avoid}
          maxLength={1000}
          onChange={(e) => onChange({ ...value, avoid: e.target.value })}
        />
      </Field>
    </>
  );
}
export function GiftPreferencesForm({
  personId,
  onboarding = false,
  onSaved,
  onBusyChange,
}: {
  personId: string;
  onboarding?: boolean;
  onSaved?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { world, mutate, close, toast } = useApp();
  const existing = world.giftPreferences?.find((p) => p.personId === personId);
  const [data, setData] = useState({
    categoryIds: existing?.categoryIds ?? [],
    interests: existing?.interests ?? "",
    likes: existing?.likes ?? "",
    avoid: existing?.avoid ?? "",
  });
  const [groups, setGroups] = useState(existing?.groupIds ?? []);
  const [skipError, setSkipError] = useState("");
  const [skipping, setSkipping] = useState(false);
  const newlyShared = groups.some((g) => !existing?.groupIds?.includes(g));
  const ReviewHeading = onboarding ? "h1" : "h2";
  async function save() {
    await mutate("gift-preferences", {
      personId,
      revision: existing?.revision,
      ...data,
      groupIds: groups,
      setup: "done",
      confirmSharing: true,
    });
    if (onSaved) onSaved();
    else if (!onboarding) close();
    toast("Gift preferences saved.");
  }
  return (
    <>
      <Form
        submit="Save gift preferences"
        onBusyChange={onBusyChange}
        disabled={skipping}
        review={() =>
          newlyShared ? (
            <>
              <ReviewHeading>Share these gift preferences?</ReviewHeading>
              <p>
                Your interests and notes will be visible to members of{" "}
                {world.groups
                  .filter((g) => groups.includes(g.id))
                  .map((g) => g.name)
                  .join(", ")}
                . They can use them when finding gift ideas.
              </p>
            </>
          ) : null
        }
        onSubmit={save}
      >
        {onboarding && (
          <div className="gift-preference-welcome">
            <h1>What would you love?</h1>
            <p>
              Choose a few interests to help your people find gifts. You can
              skip this and come back any time.
            </p>
            <button
              type="button"
              className="button secondary wide"
              disabled={skipping}
              onClick={async () => {
                setSkipping(true);
                setSkipError("");
                try {
                  // Skipping never publishes edits made during this optional step.
                  await mutate("gift-preferences", {
                    personId,
                    revision: existing?.revision,
                    categoryIds: existing?.categoryIds ?? [],
                    interests: existing?.interests ?? "",
                    likes: existing?.likes ?? "",
                    avoid: existing?.avoid ?? "",
                    groupIds: existing?.groupIds ?? [],
                    setup: "deferred",
                  });
                } catch (e) {
                  setSkipError((e as Error).message);
                } finally {
                  setSkipping(false);
                }
              }}
            >
              {skipping ? "Skipping…" : "Skip for now"}
            </button>
          </div>
        )}
        {skipError && (
          <p className="error" role="alert">
            {skipError}
          </p>
        )}
        <InterestFields value={data} onChange={setData} />
        <fieldset className="gift-interests">
          <legend>Who can see these preferences?</legend>
          <p className="muted">
            Private unless you select a family group. All interest details and
            notes use this audience.
          </p>
          {world.groups.map((g) => (
            <label className="check" key={g.id}>
              <input
                type="checkbox"
                checked={groups.includes(g.id)}
                onChange={(e) =>
                  setGroups(
                    e.target.checked
                      ? [...groups, g.id]
                      : groups.filter((id) => id !== g.id),
                  )
                }
              />
              {g.name}
            </label>
          ))}
          {!world.groups.length && (
            <p>You can share preferences after joining a family group.</p>
          )}
        </fieldset>
      </Form>
    </>
  );
}
export function GiftPreferenceOnboarding({
  children,
}: {
  children: ReactNode;
}) {
  const { world } = useApp();
  const location = useLocation();
  const [entryKey] = useState(location.key);
  const [deferred, setDeferred] = useState(location.pathname !== "/");
  const preference = world.giftPreferences?.find(
    (p) =>
      p.setup === "new" &&
      world.people.some(
        (person) => person.id === p.personId && person.userId === world.me.id,
      ),
  );
  const showing = !!preference && !deferred && location.key === entryKey;
  const wasShowing = useRef(showing);
  useEffect(() => {
    // Navigation defers optional setup for this signed-in visit. Never save
    // unfinished preference fields or interrupt an incoming deep link.
    if (location.key !== entryKey) setDeferred(true);
  }, [location.key, entryKey]);
  useEffect(() => {
    if (wasShowing.current && !showing) {
      const main = document.getElementById("main");
      const heading = main?.querySelector("h1");
      document.title = heading?.textContent
        ? `${heading.textContent} · Little Hint`
        : "Little Hint";
      main?.focus({ preventScroll: true });
    }
    wasShowing.current = showing;
  }, [showing]);
  if (!showing) return children;
  return (
    <section className="gift-discovery-page">
      <GiftPreferencesForm personId={preference.personId} onboarding />
    </section>
  );
}
export function PreferenceSummary({ personId }: { personId: string }) {
  const { world } = useApp();
  const p = world.giftPreferences?.find((p) => p.personId === personId);
  if (!p || !(p.categoryIds.length || p.interests || p.likes || p.avoid))
    return null;
  return (
    <section className="gift-preference-summary" aria-label="Gift preferences">
      <h2>Gift preferences</h2>
      <>
        {!!p.categoryIds.length && (
          <p>
            {giftCategories
              .filter(([id]) => p.categoryIds.includes(id))
              .map(([, name]) => name)
              .join(" · ")}
          </p>
        )}
        {p.interests && <p>{p.interests}</p>}
        {p.likes && <p>Likes: {p.likes}</p>}
        {p.avoid && <p>Things to avoid: {p.avoid}</p>}
      </>
    </section>
  );
}
export function DiscoveryLink({
  personId,
  listId,
}: {
  personId: string;
  listId?: string;
}) {
  const { world } = useApp();
  const dismiss = useModalDismiss();
  const navigate = useNavigate();
  const p = world.people.find((p) => p.id === personId);
  if (
    !p ||
    !world.giftDiscovery ||
    !discoveryAllowed(
      world.giftDiscovery,
      p.userId === world.me.id || p.guardians.includes(world.me.id),
    )
  )
    return null;
  const destination = `/people/${personId}/gift-ideas${listId ? `?list=${listId}` : ""}`;
  return (
    <Link
      className="button secondary"
      onClick={(event) => {
        if (
          !dismiss ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        dismiss(() => navigate(destination));
      }}
      to={destination}
    >
      Find gift ideas
    </Link>
  );
}
export function GiftPreferencePrompt() {
  const { world, mutate, open } = useApp();
  const person = world.people.find((p) => p.userId === world.me.id);
  const pref = world.giftPreferences?.find((p) => p.personId === person?.id);
  const [error, setError] = useState("");
  const [dismissing, setDismissing] = useState(false);
  if (!person || pref?.setup === "done" || pref?.setup === "skipped")
    return null;
  return (
    <section className="gift-preference-prompt">
      <h2>Give your people a few hints</h2>
      <p>Share interests and things to avoid. You can change them any time.</p>
      <div className="actions">
        <button
          className="button secondary"
          disabled={dismissing}
          onClick={() =>
            open(
              "Your gift preferences",
              <GiftPreferencesForm personId={person.id} />,
            )
          }
        >
          Choose gift preferences
        </button>
        <button
          className="text-button"
          disabled={dismissing}
          onClick={async () => {
            setDismissing(true);
            setError("");
            try {
              await mutate("gift-preferences", {
                personId: person.id,
                revision: pref?.revision,
                categoryIds: pref?.categoryIds ?? [],
                interests: pref?.interests ?? "",
                likes: pref?.likes ?? "",
                avoid: pref?.avoid ?? "",
                groupIds: pref?.groupIds ?? [],
                setup: "skipped",
              });
              document.getElementById("main")?.focus({ preventScroll: true });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setDismissing(false);
            }
          }}
        >
          {dismissing ? "Dismissing…" : "Not now"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
