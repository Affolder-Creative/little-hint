import { DiscoveryLink } from "./GiftPreferences";
import { GuidelineField, guidelineValue } from "./SpendingGuidance";
import { PrioritySelect } from "./Management";
import type { ImportJob, ItemPriority } from "../shared/model";
import { actionError } from "./copy";
import { useNavigate } from "react-router-dom";
import { familyGroupLabel } from "../shared/households";
import { canManageGroupEvents } from "../shared/group-events";
import { useEffect, useRef, useState } from "react";
import {
  Link as LinkIcon,
  Upload,
  LoaderCircle,
  Check,
  Plus,
} from "lucide-react";
import type { GiftView, Group, List, World } from "../shared/model";
import { Form, Field, Privacy, privateIdeaDescription } from "./components";
import { useApp } from "./context";
import { api } from "./api";
import { useImportJob } from "./useImportJob";
import {
  ListPolicyFields,
  listPolicyValues,
  SharingReview,
} from "./ListPolicyFields";
import { ExchangeReview, participantLabel } from "./ExchangeReview";
export const value = (f: FormData, k: string) => String(f.get(k) ?? "");
const selected = (f: FormData, k: string) => f.getAll(k).map(String);
export function GroupForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const { mutate, close, toast } = useApp();
  const navigate = useNavigate();
  return (
    <Form
      submit="Create family group"
      onSubmit={async (f) => {
        const group = await mutate<Group>("groups", { name: value(f, "name") });
        close();
        if (onCreated) onCreated(group.id);
        else
          navigate(`/settings?section=groups&group=${group.id}&view=members`);
        toast("Family group created. You can invite members now.");
      }}
    >
      <Field label="Family group name">
        <input
          name="name"
          required
          maxLength={160}
          placeholder="The Morgan family"
        />
      </Field>
      <p className="muted">
        Invite friends and family after creating your family group. Only its
        members can see lists shared with it.
      </p>
    </Form>
  );
}
export function PersonForm({
  id,
  onSaved,
  onBusyChange,
}: {
  id?: string;
  onSaved?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { world, mutate, close } = useApp();
  const person = world.people.find((p) => p.id === id);
  return (
    <Form
      submit={person ? "Save profile" : "Create profile"}
      onBusyChange={onBusyChange}
      onSubmit={async (f) => {
        await mutate(person ? "people/update" : "people", {
          ...(person ? { id: person.id, revision: person.revision } : {}),
          name: value(f, "name"),
        });
        if (onSaved) onSaved();
        else close();
      }}
    >
      <Field label="Name">
        <input name="name" required defaultValue={person?.name} />
      </Field>
      <p className="muted">
        {person?.userId === world.me.id
          ? "This is the name your people see on your profile."
          : "Choose this person’s households under each family group in Settings after saving their profile."}
      </p>
      {!person && (
        <p className="muted">
          You will manage this person’s wish lists. They can take over later by
          verifying their email and accepting your invitation.
        </p>
      )}
    </Form>
  );
}
export function ListForm({ list }: { list?: List }) {
  const { world, mutate, close } = useApp();
  const mine = world.people.filter(
    (p) => p.userId === world.me.id || p.guardians.includes(world.me.id),
  );
  return (
    <Form
      className="list-form"
      submit={list ? "Save list" : "Create list"}
      review={(data) =>
        !list?.modeLocked && data.getAll("groupIds").length > 0 ? (
          <SharingReview
            data={data}
            list={list}
            audience={world.groups
              .filter((g) => data.getAll("groupIds").includes(g.id))
              .map((g) => g.name)}
          />
        ) : null
      }
      onSubmit={async (f) => {
        await mutate(list ? "lists/update" : "lists", {
          ...(list
            ? {
                id: list.id,
                revision: list.revision,
                archived: f.get("archived") === "on",
              }
            : { ownerIds: selected(f, "ownerIds") }),
          name: value(f, "name"),
          description: value(f, "description"),
          groupIds: selected(f, "groupIds"),
          ...listPolicyValues(f, list),
        });
        close();
      }}
    >
      <Field label="List name">
        <input
          name="name"
          required
          defaultValue={list?.name}
          placeholder="A few things I’d love"
        />
      </Field>
      <Field label="A note for your people">
        <textarea
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={list?.description}
          placeholder="Favorite colors, sizes, or anything helpful."
        />
      </Field>
      <ListPolicyFields list={list}>
        {!list && (
          <fieldset className="choice-group form-section">
            <legend>Who is this list for?</legend>
            {world.people.map((p) => (
              <label className="check" key={p.id}>
                <input
                  type="checkbox"
                  name="ownerIds"
                  value={p.id}
                  defaultChecked={p.id === mine[0]?.id}
                />
                {p.name}
                {!mine.includes(p) && <small>Invite to share ownership</small>}
              </label>
            ))}
            <small>
              Include yourself or someone whose profile you manage. Everyone
              else must accept the invitation before you share this list.
            </small>
          </fieldset>
        )}
        <fieldset className="choice-group form-section">
          <legend>Share with</legend>
          {world.groups.length ? (
            world.groups.map((g) => (
              <label className="check" key={g.id}>
                <input
                  type="checkbox"
                  name="groupIds"
                  value={g.id}
                  defaultChecked={list?.groupIds.includes(g.id)}
                />
                {familyGroupLabel(g, world)}
              </label>
            ))
          ) : (
            <p>
              {world.canCreateGroups === false
                ? "Accept a family-group invitation to share this list, or ask an app administrator to create a group."
                : "Create a family group in Settings to share this list."}
            </p>
          )}
          <small>
            Leaving every family group unchecked keeps the list private.
          </small>
        </fieldset>
      </ListPolicyFields>
      {list && (
        <label className="check">
          <input
            type="checkbox"
            name="archived"
            defaultChecked={list.archived}
          />
          Archive this list
        </label>
      )}
    </Form>
  );
}
interface Draft {
  id: string;
  title: string;
  url: string;
  description: string;
  savedAt: string;
}
export const draftKey = (id: string) => `little-hint:drafts:${id}`;
export function getDrafts(id: string): Draft[] {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) ?? "[]");
  } catch {
    return [];
  }
}
export function saveDraft(id: string, data: Omit<Draft, "id" | "savedAt">) {
  const rows = getDrafts(id);
  rows.unshift({
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    ...data,
  });
  localStorage.setItem(draftKey(id), JSON.stringify(rows.slice(0, 30)));
}
export function GiftForm({
  gift,
  listId,
  recipientId: initialRecipientId,
  recipientOptions,
  onSaved,
  draft,
  importDraft,
}: {
  gift?: GiftView;
  listId?: string;
  recipientId?: string;
  recipientOptions?: string[];
  onSaved?: (gift: GiftView) => void;
  draft?: Draft;
  importDraft?: ImportJob;
}) {
  const { world, mutate, close, toast } = useApp();
  const lists = world.lists.filter((l) => l.canEdit && !l.archived);
  const [data, setData] = useState({
    title: gift?.title ?? draft?.title ?? "",
    url: gift?.url ?? draft?.url ?? "",
    description: gift?.description ?? draft?.description ?? "",
    price: gift?.priceCents == null ? "" : String(gift.priceCents / 100),
    image: gift?.image ?? "",
    tags: gift?.tags.join(", ") ?? "",
    quantity: gift?.quantity ?? 1,
    ...(importDraft?.draft
      ? Object.fromEntries(
          Object.entries(importDraft.draft.fields).filter(([k]) =>
            [
              "title",
              "url",
              "description",
              "price",
              "image",
              "tags",
              "quantity",
            ].includes(k),
          ),
        )
      : {}),
  });
  const [priority, setPriority] = useState<ItemPriority | null>(
    gift?.priority ??
      (importDraft?.draft?.fields.priority as ItemPriority | null) ??
      null,
  );
  const touched = useRef(new Set<string>(importDraft?.draft?.touched ?? []));
  const [error, setError] = useState("");
  const importQuery = useImportJob(world.me.id, importDraft);
  const importing = importQuery.busy;
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [duplicate, setDuplicate] = useState<GiftView | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const job = importQuery.job;
  const [destination, setDestination] = useState(
    importDraft?.draft?.listId ?? listId ?? lists[0]?.id ?? "",
  );
  const savedDraft = useRef(importDraft);
  const [draftSaved, setDraftSaved] = useState("");
  const [saveError, setSaveError] = useState("");
  const saveQueue = useRef(Promise.resolve());
  const snapshot = JSON.stringify({
    fields: { ...data, priority },
    touched: [...touched.current],
    listId: destination,
  });
  const currentSnapshot = useRef(snapshot);
  currentSnapshot.current = snapshot;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!importing) return;
    const t = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(t);
  }, [importing]);
  async function flushDraft() {
    const next = saveQueue.current
      .catch(() => {})
      .then(async () => {
        const active = savedDraft.current;
        if (!active?.draft) return;
        const captured = currentSnapshot.current;
        const updated = await api<ImportJob>("imports/update", {
          id: active.id,
          revision: active.draft.revision,
          ...JSON.parse(captured),
        });
        savedDraft.current = updated;
        setDraftSaved(captured);
        setSaveError("");
      });
    saveQueue.current = next;
    return next;
  }
  useEffect(() => {
    if (!savedDraft.current?.draft || snapshot === draftSaved) return;
    const timer = setTimeout(() => {
      void flushDraft().catch(() =>
        setSaveError(
          "Your latest changes have not been saved. Try saving the draft again.",
        ),
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [snapshot, draftSaved, job?.id]);

  const applied = useRef("");
  const recipients = world.people.filter(
    (person) =>
      recipientOptions?.includes(person.id) &&
      person.userId !== world.me.id &&
      !person.guardians.includes(world.me.id),
  );
  const [recipientId, setRecipientId] = useState(
    initialRecipientId ?? (recipients.length === 1 ? recipients[0].id : ""),
  );
  const idea =
    !!initialRecipientId || !!recipientOptions || (!!gift && !gift.listId);
  const recipientName =
    gift?.recipientNames.join(" & ") ??
    world.people.find((person) => person.id === recipientId)?.name;
  const [visibility, setVisibility] = useState(gift?.visibility ?? "private");
  const [groupIds, setGroupIds] = useState(gift?.groupIds ?? []);
  const audienceGroups = world.groups.filter((group) =>
    groupIds.includes(group.id),
  );
  const sharingIdea = idea && visibility !== "private";
  const change = (key: keyof typeof data, v: string | number) => {
    if (key === "url") {
      if (savedDraft.current?.draft) {
        const previous = savedDraft.current;
        savedDraft.current = undefined;
        void api("imports/discard", { id: previous.id }).catch(() =>
          setError(
            "Could not remove the previous draft. You can remove it from My lists.",
          ),
        );
      }
      importQuery.reset();
      setError("");
    }
    touched.current.add(key);
    setData((d) => ({ ...d, [key]: v }));
    setDuplicate(null);
  };
  useEffect(() => {
    if (
      job?.status === "complete" &&
      job.result &&
      applied.current !== job.id
    ) {
      applied.current = job.id;
      const r = job.result;
      setData((d) => ({
        ...d,
        ...Object.fromEntries(
          Object.entries({
            title: r.title,
            description: r.description,
            price: r.priceCents == null ? "" : String(r.priceCents / 100),
            image: r.image,
            tags: r.tags?.join(", "),
          }).filter(([k, v]) => v !== undefined && !touched.current.has(k)),
        ),
      }));
    }
    if (job?.status === "failed") {
      setError(
        job.error ??
          "We could not get the details. You can still enter them yourself.",
      );
    }
  }, [job?.id, job?.status]);
  async function importUrl(forceRefresh = false) {
    setError("");
    try {
      if (savedDraft.current?.draft && job?.status === "failed") {
        await api("imports/retry", { id: job.id });
        await importQuery.retry();
        return;
      }
      if (savedDraft.current?.draft)
        await api("imports/discard", { id: savedDraft.current.id });
      const created = await importQuery.start(
        data.url,
        forceRefresh,
        !gift && !idea
          ? {
              listId: destination,
              fields: { ...data, priority },
              touched: [...touched.current],
            }
          : undefined,
      );
      savedDraft.current = created;
      setDraftSaved(snapshot);
    } catch (e) {
      setError(actionError(e));
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    setUploading(true);
    setUploadStatus("Uploading photo…");
    try {
      const r = await fetch("/api/v1/media", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      change("image", j.url);
      setUploadStatus("Photo uploaded.");
    } catch (e) {
      setError(actionError(e));
      setUploadStatus("");
    } finally {
      setUploading(false);
    }
  }
  return (
    <Form
      dirty={savedDraft.current?.draft ? snapshot !== draftSaved : undefined}
      onBeforeClose={savedDraft.current?.draft ? flushDraft : undefined}
      submit={
        gift ? "Save changes" : idea ? "Save gift idea" : "Add to wish list"
      }
      disabled={
        uploading ||
        (idea && !gift && !recipientId) ||
        (!!duplicate && !allowDuplicate) ||
        (sharingIdea && !audienceGroups.length)
      }
      allowOffline={
        !idea &&
        !!localStorage.getItem(`little-hint:draft-optin:${world.me.id}`)
      }
      onSubmit={async (f) => {
        const payload = {
          ...data,
          ...(!idea ? { priority } : {}),
          tags: data.tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          priceCents:
            data.price === "" ? null : Math.round(Number(data.price) * 100),
          quantity: Number(data.quantity),
          ...(gift
            ? {
                id: gift.id,
                revision: gift.revision,
                archived: f.get("archived") === "on",
              }
            : {
                listId: idea ? undefined : value(f, "listId"),
                recipientIds: idea ? [recipientId] : [],
                allowDuplicate,
              }),
          visibility,
          groupIds: sharingIdea ? audienceGroups.map((group) => group.id) : [],
          importId:
            savedDraft.current?.id ??
            (job?.status === "complete" ? job.id : undefined),
        };
        if (!navigator.onLine) {
          if (
            idea ||
            !localStorage.getItem(`little-hint:draft-optin:${world.me.id}`)
          )
            throw new Error(
              "Reconnect to save, or turn on personal drafts in Settings for your own wish-list items.",
            );
          saveDraft(world.me.id, {
            title: data.title,
            url: data.url,
            description: data.description,
          });
          toast("Personal draft saved on this device.");
          close();
          return;
        }
        await saveQueue.current.catch(() => {});
        const result = await mutate(gift ? "items/update" : "items", payload);
        if (result.duplicate) {
          setDuplicate(result.duplicate);
          return;
        }
        savedDraft.current = undefined;
        if (draft)
          localStorage.setItem(
            draftKey(world.me.id),
            JSON.stringify(
              getDrafts(world.me.id).filter((d) => d.id !== draft.id),
            ),
          );
        window.dispatchEvent(new Event("little-hint:drafts-changed"));
        toast(
          gift
            ? idea
              ? "Gift idea updated."
              : "Item updated."
            : idea
              ? "Gift idea saved."
              : "A little hint, saved.",
        );
        close();
        onSaved?.(result);
      }}
    >
      {idea && (
        <>
          {recipientOptions && !gift && recipients.length > 1 && (
            <Field label="Who is this idea for?">
              <select
                required
                value={recipientId}
                onChange={(event) => {
                  setRecipientId(event.target.value);
                  setDuplicate(null);
                  setAllowDuplicate(false);
                }}
              >
                <option value="">Choose a recipient</option>
                {recipients.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className="muted">
            {recipientName
              ? `Saved under Gift ideas for ${recipientName}, separately from their wish lists.`
              : "Saved under the recipient's Gift ideas, separately from their wish lists."}
          </p>
          <div className="text-stack idea-audience">
            <Field label="Who can see this idea?">
              <select
                name="visibility"
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as typeof visibility)
                }
              >
                <option value="private">Only me</option>
                <option value="hidden">
                  Selected family groups, but not the recipient
                </option>
                <option value="visible">
                  Selected family groups and the recipient
                </option>
              </select>
            </Field>
            <fieldset
              className="choice-group"
              hidden={!sharingIdea}
              disabled={!sharingIdea}
            >
              <legend>Share with these family groups</legend>
              {world.groups.map((g) => (
                <label className="check" key={g.id}>
                  <input
                    name="groupIds"
                    type="checkbox"
                    value={g.id}
                    checked={groupIds.includes(g.id)}
                    onChange={(e) =>
                      setGroupIds((ids) =>
                        e.target.checked
                          ? [...ids, g.id]
                          : ids.filter((id) => id !== g.id),
                      )
                    }
                  />
                  {familyGroupLabel(g, world)}
                </label>
              ))}
            </fieldset>
            <p className="muted" role="status">
              {!sharingIdea
                ? privateIdeaDescription
                : !audienceGroups.length
                  ? world.groups.length
                    ? "Choose at least one family group to share this idea."
                    : "Join a family group to share this idea, or choose Only me."
                  : visibility === "hidden"
                    ? `Visible to you and members of ${audienceGroups.map((g) => familyGroupLabel(g, world)).join(", ")}. Hidden from the recipient and anyone managing their profile.`
                    : `Visible to you, members of ${audienceGroups.map((g) => familyGroupLabel(g, world)).join(", ")}, the recipient and anyone managing their profile.`}
            </p>
            {sharingIdea && (
              <p className="muted">
                Who reserves or buys this gift stays hidden from the recipient,
                even if they can see the idea.
              </p>
            )}
          </div>
        </>
      )}
      {!gift && (!idea || recipientId) && (
        <>
          {idea && recipientId ? (
            <DiscoveryLink personId={recipientId} />
          ) : (
            <DiscoveryLink
              personId={
                world.people.find((p) => p.userId === world.me.id)?.id ?? ""
              }
              listId={listId}
            />
          )}
        </>
      )}
      {job?.result?.warnings?.map((w) => (
        <p className="notice" key={w}>
          {w}
        </p>
      ))}
      {savedDraft.current?.draft && (
        <div className="import-draft-status">
          {job?.status !== "complete" && (
            <p role="status">
              {slow
                ? "This is taking a little longer. Save your draft and we’ll keep working."
                : importing
                  ? "Getting product details. You can keep editing."
                  : job?.status === "failed"
                    ? "Your draft is safe. Enter details or try again."
                    : "Your draft is saved. Retry checking progress or enter details."}
            </p>
          )}
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              try {
                await flushDraft();
                toast("Private draft saved. Find it in My lists.");
                close();
              } catch {
                setSaveError(
                  "Your draft could not be saved. Please try again.",
                );
              }
            }}
          >
            {importing ? "Save draft and continue" : "Save for later"}
          </button>
          {saveError && (
            <p role="alert" className="error">
              {saveError}
            </p>
          )}
        </div>
      )}
      <div
        className={`url-entry${world.productLookupEnabled === false ? " manual-entry" : ""}`}
      >
        <Field
          label={
            world.productLookupEnabled === false
              ? "Product link (optional)"
              : "Start with a product link"
          }
        >
          <input
            type="url"
            value={data.url}
            onChange={(e) => change("url", e.target.value)}
            placeholder="Paste a link from your favorite shop"
          />
        </Field>
        {world.productLookupEnabled !== false && (
          <button
            className="button secondary small"
            type="button"
            disabled={!data.url || importing}
            onClick={() => importUrl()}
          >
            {importing ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <LinkIcon size={16} />
            )}{" "}
            {importing ? "Finding details…" : "Get details"}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {importQuery.error && (
        <div className="error" role="alert">
          <p>
            {actionError(importQuery.error)} You can retry or enter the details
            manually.
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => importQuery.retry()}
          >
            Retry status
          </button>
        </div>
      )}
      {world.productLookupEnabled !== false && job?.status === "complete" && (
        <button
          type="button"
          className="text-button"
          disabled={importing}
          onClick={() => importUrl(true)}
        >
          Refresh from shop
        </button>
      )}
      {world.productLookupEnabled !== false && job?.status === "complete" && (
        <p className="success" role="status">
          <Check size={16} /> Details found. Check them before saving.
        </p>
      )}
      <Field label={idea ? "Gift idea name" : "Item name"}>
        <input
          value={data.title}
          required
          maxLength={160}
          onChange={(e) => change("title", e.target.value)}
          placeholder={
            idea ? "Something they would love" : "A book, a game, a day out"
          }
        />
      </Field>
      {!idea && !gift && (
        <Field label="Wish list">
          <select
            name="listId"
            required
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            {!lists.length && <option value="">Create a list first</option>}
            {lists.map((l) => (
              <option value={l.id} key={l.id}>
                {l.name}
                {l.groupEventId
                  ? ` · ${l.ownerIds.map((id) => world.people.find((p) => p.id === id)?.name ?? "Recipient").join(", ")}`
                  : ""}
              </option>
            ))}
          </select>
        </Field>
      )}
      <details
        className="optional-fields"
        open={!!gift || !!draft || job?.status === "complete"}
      >
        <summary>More details</summary>
        <Field label="A helpful note">
          <textarea
            rows={3}
            value={data.description}
            onChange={(e) => change("description", e.target.value)}
            maxLength={5000}
            placeholder="A size, a favorite color, or why it caught your eye."
          />
        </Field>
        <div className="form-row">
          <Field label="Price in USD">
            <input
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              value={data.price}
              onChange={(e) => change("price", e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Quantity wanted">
            <input
              type="number"
              min="1"
              max="999"
              required
              value={data.quantity}
              onChange={(e) => change("quantity", Number(e.target.value))}
            />
          </Field>
        </div>
        {!idea && <PrioritySelect value={priority} onChange={setPriority} />}
        <Field label="Tags" hint="Separate tags with commas.">
          <input
            value={data.tags}
            onChange={(e) => change("tags", e.target.value)}
            placeholder="Coffee, Kitchen, Slow mornings"
          />
        </Field>
        <label className="upload">
          <Upload size={18} />
          <span>
            {uploading
              ? "Uploading photo…"
              : data.image
                ? "Replace photo"
                : "Add a photo"}
          </span>
          <input
            type="file"
            disabled={uploading}
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
        <p role="status">{uploadStatus}</p>
        {data.image && (
          <div className="image-preview">
            <img
              src={data.image}
              alt={idea ? "Gift idea photo" : "Item photo"}
            />
            <button
              className="text-button"
              type="button"
              disabled={uploading}
              onClick={() => change("image", "")}
            >
              Remove photo
            </button>
          </div>
        )}
        {job?.result?.importedAt && (
          <small className="muted">
            From {job.result.source}, checked{" "}
            {new Date(job.result.importedAt).toLocaleString()}. Prices can
            change.
          </small>
        )}
      </details>
      {gift && (
        <label className="check">
          <input
            type="checkbox"
            name="archived"
            defaultChecked={gift.archived}
          />
          {idea ? "Archive this gift idea" : "Archive this item"}
        </label>
      )}
      {duplicate && (
        <div className="duplicate">
          <strong>
            This looks like something already saved: {duplicate.title}
          </strong>
          <p>
            Open what is already saved to keep gift plans together, or save
            another if you want it listed separately.
          </p>
          <a href={`/gift/${duplicate.id}`}>
            {duplicate.listId ? "View saved item" : "View saved gift idea"}
          </a>
          <label className="check">
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
            />
            Save separately with its own gift plans
          </label>
        </div>
      )}
    </Form>
  );
}
export function ExchangeForm({
  exchange,
}: {
  exchange?: World["exchanges"][number];
}) {
  const { world, mutate, close } = useApp();
  const groups = world.groups.filter((g) =>
    canManageGroupEvents(g, world.me.id),
  );
  const [groupId, setGroupId] = useState(
    exchange?.groupId ?? groups[0]?.id ?? "",
  );
  const group = groups.find((g) => g.id === groupId);
  const people = world.people.filter((p) =>
    [p.userId, ...p.guardians].some((u) => u && group?.memberIds.includes(u)),
  );
  const [participants, setParticipants] = useState(
    exchange?.participantIds ?? people.map((p) => p.id),
  );
  const [exclusions, setExclusions] = useState<[string, string][]>(
    exchange?.exclusions ?? [],
  );
  const [giver, setGiver] = useState("");
  const [recipient, setRecipient] = useState("");
  const [bothDirections, setBothDirections] = useState(false);
  const [excludeHousehold, setExcludeHousehold] = useState(
    exchange?.excludeHousehold ?? true,
  );
  const [previousId, setPreviousId] = useState(exchange?.previousId ?? "");
  const requestedExclusions: [string, string][] = bothDirections
    ? [
        [giver, recipient],
        [recipient, giver],
      ]
    : [[giver, recipient]];
  const newExclusions = requestedExclusions.filter(
    ([from, to]) =>
      from && to && !exclusions.some(([a, b]) => a === from && b === to),
  );
  const rulesSummary = [
    excludeHousehold
      ? "Avoid same-household matches"
      : "Allow same-household matches",
    exclusions.length
      ? `${exclusions.length} ${exclusions.length === 1 ? "match" : "matches"} blocked`
      : "No individual matches blocked",
    previousId
      ? `Prefer different matches from ${world.exchanges.find((e) => e.id === previousId)?.name ?? "the previous exchange"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const plan = (f: FormData) => ({
    name: value(f, "name"),
    groupId,
    participantIds: participants,
    count: Number(value(f, "count")) as 1 | 2 | 3,
    spendingGuidelineCents: guidelineValue(f),
    excludeHousehold,
    exclusions,
    previousId: previousId || undefined,
  });
  if (!group)
    return (
      <p>
        You can no longer manage exchanges in this family group. Close this form
        and refresh the page.
      </p>
    );
  return (
    <Form
      submit={exchange ? "Save exchange" : "Create exchange"}
      disabled={participants.length < 2}
      review={(f) => (
        <>
          <h3>Review your exchange</h3>
          <p>{value(f, "name")}</p>
          <ExchangeReview world={world} exchange={plan(f)} />
        </>
      )}
      onSubmit={async (f) => {
        await mutate(exchange ? "exchanges/update" : "exchanges", {
          ...plan(f),
          ...(exchange ? { id: exchange.id, revision: exchange.revision } : {}),
        });
        close();
      }}
    >
      <Field label="Exchange name">
        <input
          name="name"
          required
          defaultValue={exchange?.name}
          maxLength={160}
          placeholder="A just-because gift exchange"
        />
      </Field>
      <Field label="Family group">
        <select
          value={groupId}
          disabled={!!exchange}
          onChange={(e) => {
            const next = groups.find((g) => g.id === e.target.value)!;
            setGroupId(next.id);
            setParticipants(
              world.people
                .filter((p) =>
                  [p.userId, ...p.guardians].some(
                    (u) => u && next.memberIds.includes(u),
                  ),
                )
                .map((p) => p.id),
            );
            setExclusions([]);
            setPreviousId("");
            setGiver("");
            setRecipient("");
          }}
        >
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {familyGroupLabel(g, world)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="People each participant gives to"
        hint="Each person gives and receives the same number of gifts."
      >
        <select name="count" defaultValue={exchange?.count ?? 1}>
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "person" : "people"}
            </option>
          ))}
        </select>
      </Field>
      <GuidelineField amount={exchange?.spendingGuidelineCents} />
      <fieldset className="choice-group">
        <legend>Participants</legend>
        {people.map((p) => (
          <label className="check" key={p.id}>
            <input
              type="checkbox"
              checked={participants.includes(p.id)}
              onChange={(e) => {
                setParticipants((current) =>
                  e.target.checked
                    ? [...current, p.id]
                    : current.filter((id) => id !== p.id),
                );
                if (!e.target.checked) {
                  setExclusions((current) =>
                    current.filter((pair) => !pair.includes(p.id)),
                  );
                  setGiver("");
                  setRecipient("");
                }
              }}
            />
            {participantLabel(world, p.id)}
          </label>
        ))}
        {participants.length < 2 && <p>Select at least two people.</p>}
      </fieldset>
      <details className="optional-fields exchange-matching" open={!!exchange}>
        <summary>
          Matching rules
          <span className="matching-rules-summary">{rulesSummary}</span>
        </summary>
        <div className="exchange-matching-fields">
          <label className="check">
            <input
              name="households"
              type="checkbox"
              checked={excludeHousehold}
              onChange={(e) => setExcludeHousehold(e.target.checked)}
            />
            Avoid matching people in the same household
          </label>
          <p className="muted">
            Households are optional and managed in family-group Settings.
            Matching names alone do not exclude anyone.
          </p>
          <fieldset className="choice-group">
            <legend>Matches to avoid</legend>
            <div className="form-row exchange-rule-people">
              <Field label="Giver">
                <select
                  value={giver}
                  onChange={(e) => {
                    setGiver(e.target.value);
                    if (recipient === e.target.value) setRecipient("");
                  }}
                >
                  <option value="">Choose a person</option>
                  {people
                    .filter((p) => participants.includes(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {participantLabel(world, p.id)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Will not give to">
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                >
                  <option value="">Choose a person</option>
                  {people
                    .filter(
                      (p) => participants.includes(p.id) && p.id !== giver,
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {participantLabel(world, p.id)}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={bothDirections}
                onChange={(e) => setBothDirections(e.target.checked)}
              />
              Both directions
            </label>
            <small>
              Also stop the second person from drawing the first. Leave
              unchecked to block only the direction shown above.
            </small>
            <button
              type="button"
              className="button secondary"
              data-form-change
              disabled={newExclusions.length === 0}
              onClick={() => {
                setExclusions([...exclusions, ...newExclusions]);
                setGiver("");
                setRecipient("");
              }}
            >
              Add rule
            </button>
            {exclusions.map(([a, b]) => (
              <div className="setting-row" key={`${a}:${b}`}>
                <span>
                  {participantLabel(world, a)} will not give to{" "}
                  {participantLabel(world, b)}
                </span>
                <button
                  type="button"
                  className="text-button"
                  data-form-change
                  aria-label={`Remove rule: ${participantLabel(world, a)} to ${participantLabel(world, b)}`}
                  onClick={() =>
                    setExclusions(
                      exclusions.filter(
                        (pair) => pair[0] !== a || pair[1] !== b,
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </fieldset>
          <Field label="Prefer different matches from">
            <select
              name="previousId"
              value={previousId}
              onChange={(e) => setPreviousId(e.target.value)}
            >
              <option value="">Do not use a previous exchange</option>
              {world.exchanges
                .filter(
                  (e) =>
                    e.groupId === groupId &&
                    e.status !== "draft" &&
                    e.id !== exchange?.id,
                )
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </details>
      <p className="muted">
        Before drawing names, everyone needs a wish list set to Keep it a
        surprise and shared with this group. Each person can only see who they
        drew, plus matches for profiles they manage.
      </p>
    </Form>
  );
}
