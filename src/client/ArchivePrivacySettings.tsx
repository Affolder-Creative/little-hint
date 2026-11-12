import { useState } from "react";
import { useApp } from "./context";
import { InfoHelp } from "./InfoHelp";
import { Form } from "./components";

export function ArchivePrivacySettings() {
  const { world, mutate } = useApp();
  const savedValue = world.preferences.hideArchivedItems ?? false;
  const [edit, setEdit] = useState<boolean | undefined>();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const value = edit ?? savedValue;
  const dirty = value !== savedValue;
  return (
    <section className="archive-privacy-settings" aria-label="Archive privacy">
      <h3>Archive privacy</h3>
      {world.archivePrivacyForced && (
        <p className="notice" id="personal-archive-policy">
          Your administrator currently requires archive privacy for everyone.
          Your choice below applies when that requirement is off.
        </p>
      )}
      <Form
        className="archive-privacy-form"
        submit="Save archive privacy"
        disabled={!dirty}
        dirty={dirty}
        onBusyChange={setBusy}
        cancelLabel="Discard changes"
        cancel={
          dirty
            ? () => {
                setEdit(undefined);
                setSaved(false);
              }
            : undefined
        }
        status={
          busy
            ? "Saving…"
            : dirty
              ? "Unsaved changes"
              : saved
                ? "Archive privacy saved."
                : undefined
        }
        onSubmit={async () => {
          await mutate("preferences/archive-privacy", {
            hideArchivedItems: value,
          });
          setEdit(undefined);
          setSaved(true);
        }}
      >
        <div className="archive-privacy-option">
          <label className="check">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => {
                setEdit(e.target.checked);
                setSaved(false);
              }}
              aria-describedby={
                world.archivePrivacyForced
                  ? "personal-archive-policy"
                  : undefined
              }
            />
            Hide my archived wishes and gift ideas from other users
          </label>
          <InfoHelp title="Archive privacy">
            <div className="text-stack">
              <p>
                Applies to your wishes, gift ideas you created, and wishes for
                managed profiles you own. On joint wish lists, any owner's hide
                preference protects archived wishes.
              </p>
              <p>
                List owners and profile managers keep access to wishes. Buyers
                and contributors keep their personal history, including saved
                item names. Turning this off keeps normal sharing rules,
                including Only me.
              </p>
            </div>
          </InfoHelp>
        </div>
      </Form>
    </section>
  );
}
