import { useApp } from "./context";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { Field, Form } from "./components";

type Setting = { key: string; source: string; value?: string };
const archiveKey = "HIDE_ARCHIVED_ITEMS_FROM_OTHERS";
const groupKey = "FAMILY_GROUP_CREATION";
const photoKey = "AUTO_IMPORT_PRODUCT_PHOTOS";
const cacheKey = "PRODUCT_IMAGE_CACHE_ENABLED";
const preloadKey = "PRODUCT_IMAGE_PREFETCH_ENABLED";
const photoKeys = [photoKey, cacheKey, preloadKey];

function PreferenceGroup({
  settings,
  title,
  submit,
  children,
}: {
  settings: Setting[];
  title: string;
  submit: string;
  children: (
    value: (key: string) => string,
    change: (key: string, value: string) => void,
  ) => ReactNode;
}) {
  const client = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const editable = settings.filter((s) => s.source !== "environment");
  const updates = editable
    .filter((s) => edits[s.key] !== undefined && edits[s.key] !== s.value)
    .map((s) => ({ key: s.key, value: edits[s.key] }));
  const dirty = updates.length > 0;
  const value = (key: string) => {
    const setting = settings.find((s) => s.key === key);
    return (
      (setting?.source === "environment"
        ? setting.value
        : (edits[key] ?? setting?.value)) ?? "false"
    );
  };
  const change = (key: string, value: string) => {
    setSaved(false);
    setEdits((previous) => {
      const next = { ...previous };
      if (value === settings.find((s) => s.key === key)?.value)
        delete next[key];
      else next[key] = value;
      return next;
    });
  };
  return (
    <section className="admin-preference" aria-label={title}>
      <h4>{title}</h4>
      {editable.length ? (
        <Form
          className="admin-preference-form"
          submit={submit}
          disabled={!dirty}
          dirty={dirty}
          onBusyChange={setBusy}
          cancelLabel="Discard changes"
          cancel={
            dirty
              ? () => {
                  setEdits({});
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
                  ? `${title} saved.`
                  : undefined
          }
          onSubmit={async () => {
            await api("admin/settings", { updates });
            client.setQueryData<Setting[]>(["admin-settings"], (previous) =>
              previous?.map((setting) => {
                const update = updates.find(
                  (update) => update.key === setting.key,
                );
                return update
                  ? { ...setting, value: update.value, source: "settings" }
                  : setting;
              }),
            );
            await Promise.all([
              client.invalidateQueries({ queryKey: ["admin-settings"] }),
              client.invalidateQueries({ queryKey: ["world"] }),
              client.invalidateQueries({ queryKey: ["collection"] }),
              client.invalidateQueries({ queryKey: ["notifications"] }),
            ]);
            setEdits({});
            setSaved(true);
          }}
        >
          {children(value, change)}
        </Form>
      ) : (
        children(value, change)
      )}
    </section>
  );
}

export function AdminPreferences({ settings }: { settings: Setting[] }) {
  const { world } = useApp();
  const group = settings.filter((s) => s.key === groupKey);
  const photos = settings.filter((s) => photoKeys.includes(s.key));
  const locked = (key: string) =>
    settings.find((s) => s.key === key)?.source === "environment";
  return (
    <>
      <PreferenceGroup
        settings={settings.filter((s) => s.key === "FAMILY_GROUP_INVITATIONS")}
        title="Family-group invitations"
        submit="Save invitation setting"
      >
        {(value, change) => (
          <>
            <Field label="Who can invite family-group members?">
              <select
                value={value("FAMILY_GROUP_INVITATIONS")}
                onChange={(e) =>
                  change("FAMILY_GROUP_INVITATIONS", e.target.value)
                }
              >
                <option value="owners">Group owners only</option>
                <option value="members">All group members</option>
              </select>
            </Field>
            <p>
              When invitations are restricted, members can ask the owner to send
              one. This does not change who can create groups.
            </p>
          </>
        )}
      </PreferenceGroup>
      <PreferenceGroup
        settings={settings.filter((s) => s.key === "SPENDING_DEFAULT_ENABLED")}
        title="Spending"
        submit="Save spending default"
      >
        {(value, change) => (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={value("SPENDING_DEFAULT_ENABLED") === "true"}
                onChange={(e) =>
                  change("SPENDING_DEFAULT_ENABLED", String(e.target.checked))
                }
              />
              Enable spending tracking for new accounts
            </label>
            <p>
              Applied at first verified sign-in. Existing accounts stay
              unchanged. Each person can turn tracking off, and records stay
              private.
            </p>
          </>
        )}
      </PreferenceGroup>
      {settings.some((s) => s.key === archiveKey) && (
        <PreferenceGroup
          settings={settings.filter((s) => s.key === archiveKey)}
          title="Archive privacy"
          submit="Save archive privacy"
        >
          {(value, change) => (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={value(archiveKey) === "true"}
                  disabled={locked(archiveKey)}
                  onChange={(e) => change(archiveKey, String(e.target.checked))}
                  aria-describedby={`archive-privacy-help${locked(archiveKey) ? " archive-privacy-lock" : ""}`}
                />
                Require archive privacy for everyone
              </label>
              <p className="muted" id="archive-privacy-help">
                When off, users choose their own archive privacy. Personal
                hiding preferences always apply. Archived wishes stay visible to
                their list owners and profile managers. Archived gift ideas stay
                visible to their creators. Buyers and contributors keep their
                personal history, including saved item names.
              </p>
              {locked(archiveKey) && (
                <p className="muted" id="archive-privacy-lock">
                  Managed in hosting configuration.
                </p>
              )}
            </>
          )}
        </PreferenceGroup>
      )}
      {!!group.length && (
        <PreferenceGroup
          settings={group}
          title="Family-group creation"
          submit="Save group setting"
        >
          {(value, change) => (
            <>
              <p>
                Choose who can start a family group. Existing groups and their
                owners keep their permissions.
              </p>
              <Field label="Who can create family groups?">
                <select
                  value={value(groupKey)}
                  disabled={locked(groupKey)}
                  onChange={(e) => change(groupKey, e.target.value)}
                  aria-describedby={
                    locked(groupKey) ? "group-policy-lock" : undefined
                  }
                >
                  <option value="everyone">Everyone signed in</option>
                  <option value="admins">Administrators only</option>
                </select>
              </Field>
              {locked(groupKey) && (
                <p className="muted" id="group-policy-lock">
                  Managed in hosting configuration.
                </p>
              )}
            </>
          )}
        </PreferenceGroup>
      )}
      {!!photos.length && (
        <PreferenceGroup
          settings={photos}
          title="Product photos"
          submit="Save photo settings"
        >
          {(value, change) => (
            <div className="admin-photo-options">
              {[
                [
                  photoKey,
                  "Add photos from shop links automatically",
                  "Save a photo when looking up a shop link. Turn this off to save storage space. You can still upload photos yourself. Existing photos are kept, and lookups already running may still add a photo.",
                ],
                [
                  cacheKey,
                  "Cache product photos on devices",
                  "Keep downloaded photos for faster repeat visits. Turning this off clears saved photos as devices reconnect and increases repeat downloads.",
                ],
                [
                  preloadKey,
                  "Preload larger product photos",
                  "Download a few larger photos after visible content loads so items open faster. Turn off to reduce background data use.",
                ],
              ]
                .filter(([key]) => photos.some((s) => s.key === key))
                .map(([key, label, help]) => {
                  const paused =
                    key === preloadKey && value(cacheKey) !== "true";
                  return (
                    <div
                      className={`admin-photo-option${key === preloadKey ? " admin-photo-dependent" : ""}`}
                      key={key}
                    >
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={!paused && value(key) === "true"}
                          disabled={
                            locked(key) ||
                            paused ||
                            (key === photoKey &&
                              world.productLookupEnabled === false)
                          }
                          onChange={(e) =>
                            change(key, String(e.target.checked))
                          }
                          aria-describedby={`${key}-help${locked(key) ? ` ${key}-lock` : ""}${paused ? ` ${key}-paused` : ""}`}
                        />
                        {label}
                      </label>
                      <p className="muted" id={`${key}-help`}>
                        {key === photoKey &&
                        world.productLookupEnabled === false
                          ? "Automatic shop lookups are off. Your photo preference is saved; you can still upload photos."
                          : help}
                      </p>
                      {paused && (
                        <p className="muted" id={`${key}-paused`}>
                          Turn on photo caching to enable preloading. Your
                          previous choice will be restored.
                        </p>
                      )}
                      {locked(key) && (
                        <p className="muted" id={`${key}-lock`}>
                          Managed in hosting configuration.
                        </p>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </PreferenceGroup>
      )}
    </>
  );
}
