import { actionError } from "./copy";
import { useNavigate } from "react-router-dom";
import { familyGroupLabel } from "../shared/households";
import { useEffect, useRef, useState } from "react";
import {
  Link as LinkIcon,
  Upload,
  LoaderCircle,
  Check,
  Plus,
} from "lucide-react";
import type { GiftView, Group, List, World } from "../shared/model";
import { Form, Field, Privacy } from "./components";
import { useApp } from "./context";
import { api } from "./api";
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
export function PersonForm({ id }: { id?: string }) {
  const { world, mutate, close } = useApp();
  const person = world.people.find((p) => p.id === id);
  return (
    <Form
      submit={person ? "Save profile" : "Create profile"}
      onSubmit={async (f) => {
        await mutate(person ? "people/update" : "people", {
          ...(person ? { id: person.id, revision: person.revision } : {}),
          name: value(f, "name"),
        });
        close();
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
            <p>Create a family group in Settings to share this list.</p>
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
  recipientId,
  draft,
}: {
  gift?: GiftView;
  listId?: string;
  recipientId?: string;
  draft?: Draft;
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
  });
  const touched = useRef(new Set<string>());
  const [jobId, setJobId] = useState(""),
    [importing, setImporting] = useState(false),
    [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [duplicate, setDuplicate] = useState<GiftView | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const job = world.imports.find((j) => j.id === jobId);
  const applied = useRef("");
  const idea = !!recipientId || (!!gift && !gift.listId);
  const change = (key: keyof typeof data, v: string | number) => {
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
      setImporting(false);
    }
    if (job?.status === "failed") {
      setImporting(false);
      setError(
        job.error ??
          "We could not get the details. You can still enter them yourself.",
      );
    }
  }, [job?.status]);
  async function importUrl() {
    setError("");
    setImporting(true);
    try {
      const j = await mutate("imports", { url: data.url });
      setJobId(j.id);
    } catch (e) {
      setError(actionError(e));
      setImporting(false);
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
      submit={
        gift ? "Save changes" : idea ? "Save gift idea" : "Add to wish list"
      }
      disabled={uploading || (!!duplicate && !allowDuplicate)}
      allowOffline={
        !idea &&
        !!localStorage.getItem(`little-hint:draft-optin:${world.me.id}`)
      }
      onSubmit={async (f) => {
        const payload = {
          ...data,
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
          visibility: value(f, "visibility") || gift?.visibility || "private",
          groupIds: selected(f, "groupIds"),
          importId: job?.status === "complete" ? job.id : undefined,
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
        const result = await mutate(gift ? "items/update" : "items", payload);
        if (result.duplicate) {
          setDuplicate(result.duplicate);
          return;
        }
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
      }}
    >
      <div className="url-entry">
        <Field label="Start with a product link">
          <input
            type="url"
            value={data.url}
            onChange={(e) => change("url", e.target.value)}
            placeholder="Paste a link from your favorite shop"
          />
        </Field>
        <button
          className="button secondary small"
          type="button"
          disabled={!data.url || importing}
          onClick={importUrl}
        >
          {importing ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <LinkIcon size={16} />
          )}{" "}
          {importing ? "Finding details…" : "Get details"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {job?.status === "complete" && (
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
            defaultValue={listId ?? lists[0]?.id ?? ""}
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
      {idea && (
        <>
          <Field label="Who can see this idea?">
            <select
              name="visibility"
              defaultValue={gift?.visibility ?? "private"}
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
          <fieldset className="choice-group">
            <legend>Share with these family groups</legend>
            {world.groups.map((g) => (
              <label className="check" key={g.id}>
                <input
                  name="groupIds"
                  type="checkbox"
                  value={g.id}
                  defaultChecked={gift?.groupIds.includes(g.id)}
                />
                {familyGroupLabel(g, world)}
              </label>
            ))}
          </fieldset>
          <p className="muted">
            Who reserves or buys this gift stays hidden from the recipient, even
            if they can see the idea.
          </p>
        </>
      )}
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
  const [groupId, setGroupId] = useState(
    exchange?.groupId ?? world.groups[0]?.id ?? "",
  );
  const group = world.groups.find((g) => g.id === groupId);
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
  const plan = (f: FormData) => ({
    name: value(f, "name"),
    groupId,
    participantIds: participants,
    count: Number(value(f, "count")) as 1 | 2 | 3,
    excludeHousehold: f.has("households"),
    exclusions,
    previousId: value(f, "previousId") || undefined,
  });
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
            const next = world.groups.find((g) => g.id === e.target.value)!;
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
            setGiver("");
            setRecipient("");
          }}
        >
          {world.groups.map((g) => (
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
      <label className="check">
        <input
          name="households"
          type="checkbox"
          defaultChecked={exchange?.excludeHousehold ?? true}
        />
        Avoid matching people in the same household
      </label>
      <p className="muted">
        Households are optional and managed in family-group Settings. Matching
        names alone do not exclude anyone.
      </p>
      <fieldset className="choice-group">
        <legend>Matches to avoid</legend>
        <div className="form-row">
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
                .filter((p) => participants.includes(p.id) && p.id !== giver)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {participantLabel(world, p.id)}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <button
          type="button"
          className="button secondary"
          data-form-change
          disabled={
            !giver ||
            !recipient ||
            exclusions.some(([a, b]) => a === giver && b === recipient)
          }
          onClick={() => {
            setExclusions([...exclusions, [giver, recipient]]);
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
                  exclusions.filter((pair) => pair[0] !== a || pair[1] !== b),
                )
              }
            >
              Remove
            </button>
          </div>
        ))}
        <small>
          This stops the giver from drawing the selected person. Add another
          rule with their names swapped to prevent the match both ways.
        </small>
      </fieldset>
      <Field label="Prefer different matches from">
        <select
          name="previousId"
          key={groupId}
          defaultValue={exchange?.previousId ?? ""}
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
      <p className="muted">
        Before drawing names, everyone needs a wish list set to Keep it a
        surprise and shared with this group. Each person can only see who they
        drew, plus matches for profiles they manage.
      </p>
    </Form>
  );
}
