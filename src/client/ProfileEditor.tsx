import { useId, useState } from "react";
import { PersonForm } from "./forms";
import { GiftPreferencesForm } from "./GiftPreferences";
import { useModalDismiss } from "./components";
import { useApp } from "./context";

export function ProfileEditor({ personId }: { personId: string }) {
  const { world, toast } = useApp();
  const dismiss = useModalDismiss();
  const id = useId();
  const [tab, setTab] = useState("profile");
  const [profileBusy, setProfileBusy] = useState(false);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const person = world.people.find((p) => p.id === personId);
  if (
    !person ||
    !(person.userId === world.me.id || person.guardians.includes(world.me.id))
  )
    return null;
  const busy = profileBusy || preferencesBusy;
  const tabs = ["profile", "preferences"];
  return (
    <div className="profile-editor">
      <div className="tabs" role="tablist" aria-label="Profile settings">
        {tabs.map((key) => (
          <button
            key={key}
            id={`${id}-${key}-tab`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${id}-${key}-panel`}
            tabIndex={tab === key ? 0 : -1}
            disabled={busy}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              if (
                busy ||
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "profile"
                  : event.key === "End"
                    ? "preferences"
                    : key === "profile"
                      ? "preferences"
                      : "profile";
              setTab(next);
              document.getElementById(`${id}-${next}-tab`)?.focus();
            }}
          >
            {key === "profile" ? "Profile" : "Gift preferences"}
          </button>
        ))}
      </div>
      <div
        id={`${id}-profile-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-profile-tab`}
        hidden={tab !== "profile"}
        tabIndex={0}
      >
        <PersonForm
          id={personId}
          onBusyChange={setProfileBusy}
          onSaved={() => toast("Profile saved.")}
        />
      </div>
      <div
        id={`${id}-preferences-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-preferences-tab`}
        hidden={tab !== "preferences"}
        tabIndex={0}
      >
        <GiftPreferencesForm
          personId={personId}
          onBusyChange={setPreferencesBusy}
          onSaved={() => {}}
        />
      </div>
      <div className="profile-editor-done">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => dismiss?.()}
        >
          Done
        </button>
      </div>
    </div>
  );
}
