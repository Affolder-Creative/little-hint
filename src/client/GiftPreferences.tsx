import { useState } from "react";
import { Link } from "react-router-dom";
import { giftCategories, discoveryAllowed } from "../shared/gift-discovery";
import { useApp } from "./context";
import { Field, Form } from "./components";

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
}: {
  personId: string;
  onboarding?: boolean;
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
  async function save(setup: "done" | "skipped") {
    await mutate("gift-preferences", {
      personId,
      revision: existing?.revision,
      ...data,
      groupIds: groups,
      setup,
      confirmSharing: setup === "done",
    });
    if (!onboarding) close();
    if (setup === "done") toast("Gift preferences saved.");
  }
  return (
    <>
      <Form
        submit="Save gift preferences"
        review={() =>
          newlyShared ? (
            <>
              <h2>Share these gift preferences?</h2>
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
        onSubmit={() => save("done")}
      >
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
      {onboarding && (
        <button
          type="button"
          className="text-button"
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
                setup: "skipped",
              });
            } catch (e) {
              setSkipError((e as Error).message);
            } finally {
              setSkipping(false);
            }
          }}
        >
          Skip for now
        </button>
      )}
      {skipError && (
        <p className="error" role="alert">
          {skipError}
        </p>
      )}
    </>
  );
}
export function GiftPreferenceOnboarding({ personId }: { personId: string }) {
  return (
    <section className="gift-discovery-page">
      <h1>What would you love?</h1>
      <p>
        Choose a few interests to help your people find gifts. You can skip this
        and come back in profile settings.
      </p>
      <GiftPreferencesForm personId={personId} onboarding />
    </section>
  );
}
export function PreferenceButton({ personId }: { personId: string }) {
  const { open, world } = useApp();
  const person = world.people.find((p) => p.id === personId);
  if (
    !person ||
    !(person.userId === world.me.id || person.guardians.includes(world.me.id))
  )
    return null;
  return (
    <button
      className="text-button"
      onClick={() =>
        open(
          `Gift preferences for ${person.name}`,
          <GiftPreferencesForm personId={personId} />,
        )
      }
    >
      Gift preferences
    </button>
  );
}
export function PreferenceSummary({ personId }: { personId: string }) {
  const { world } = useApp();
  const p = world.giftPreferences?.find((p) => p.personId === personId);
  return (
    <section className="gift-preference-summary" aria-label="Gift preferences">
      <h2>Gift preferences</h2>
      {p && (p.categoryIds.length || p.interests || p.likes || p.avoid) ? (
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
      ) : (
        <p className="muted">No gift preferences shared here yet.</p>
      )}
      <PreferenceButton personId={personId} />
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
  const { world, close } = useApp();
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
  return (
    <Link
      className="button secondary"
      onClick={close}
      to={`/people/${personId}/gift-ideas${listId ? `?list=${listId}` : ""}`}
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
  if (!person || pref?.setup) return null;
  return (
    <section className="gift-preference-prompt">
      <h2>Give your people a few hints</h2>
      <p>Share interests and things to avoid. You can change them any time.</p>
      <button
        className="button secondary"
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
        onClick={async () => {
          try {
            await mutate("gift-preferences", {
              personId: person.id,
              categoryIds: [],
              interests: "",
              likes: "",
              avoid: "",
              groupIds: [],
              setup: "skipped",
            });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Not now
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
