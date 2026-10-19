import { useEffect, useRef, useState } from "react";
import {
  Link as LinkIcon,
  Upload,
  LoaderCircle,
  Check,
  Plus,
} from "lucide-react";
import type { GiftView, List } from "../shared/model";
import { Form, Field, Privacy } from "./components";
import { useApp } from "./context";
import { api } from "./api";
import { ListPolicyFields, listPolicyValues } from "./ListPolicyFields";
export const value = (f: FormData, k: string) => String(f.get(k) ?? "");
const selected = (f: FormData, k: string) => f.getAll(k).map(String);
export function GroupForm() {
  const { mutate, close } = useApp();
  return (
    <Form
      submit="Create group"
      onSubmit={async (f) => {
        await mutate("groups", { name: value(f, "name") });
        close();
      }}
    >
      <Field label="Group name">
        <input
          name="name"
          required
          maxLength={160}
          placeholder="The Morgan family"
        />
      </Field>
      <p className="muted">
        Invite friends and family after creating your group. Only its members
        can see lists shared with it.
      </p>
    </Form>
  );
}
export function PersonForm({ id }: { id?: string }) {
  const { world, mutate, close } = useApp();
  const person = world.people.find((p) => p.id === id);
  return (
    <Form
      submit={person ? "Save profile" : "Create managed profile"}
      onSubmit={async (f) => {
        await mutate(person ? "people/update" : "people", {
          ...(person ? { id: person.id, revision: person.revision } : {}),
          name: value(f, "name"),
          household: value(f, "household"),
        });
        close();
      }}
    >
      <Field label="Name">
        <input name="name" required defaultValue={person?.name} />
      </Field>
      <Field
        label="Household"
        hint="Use the same name for people in one household. Exchanges can avoid household matches."
      >
        <input name="household" defaultValue={person?.household} />
      </Field>
      {!person && (
        <p className="muted">
          You’ll manage this person’s wishes. They can claim the profile later
          through an email verification and confirmation.
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
              {!mine.includes(p) && <small>Invitation to co-own</small>}
            </label>
          ))}
          <small>
            Include yourself or a profile you manage. Joint owners must accept
            before sharing.
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
              {g.name}
            </label>
          ))
        ) : (
          <p>Create a group in Settings to share this list.</p>
        )}
        <small>Leaving every group unchecked keeps the list private.</small>
      </fieldset>
      <ListPolicyFields list={list} />
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
        job.error ?? "Preview unavailable. You can add this gift manually.",
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
      setError((e as Error).message);
      setImporting(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    try {
      const r = await fetch("/api/v1/media", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      change("image", j.url);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Form
      submit={
        gift ? "Save changes" : idea ? "Save gift idea" : "Add to wish list"
      }
      disabled={!!duplicate && !allowDuplicate}
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
              "Go online to save this gift, or enable personal drafts in Settings.",
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
        toast(gift ? "Gift updated." : "A little hint, saved.");
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
        <p className="success">
          <Check size={16} /> Preview found. Review the details before saving.
        </p>
      )}
      <Field label="Gift name">
        <input
          value={data.title}
          required
          maxLength={160}
          onChange={(e) => change("title", e.target.value)}
          placeholder="Something they’ll love"
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
        <span>{data.image ? "Replace photo" : "Add a photo"}</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </label>
      {data.image && (
        <div className="image-preview">
          <img src={data.image} alt="Gift preview" />
          <button
            className="text-button"
            type="button"
            onClick={() => change("image", "")}
          >
            Remove photo
          </button>
        </div>
      )}
      {job?.result?.importedAt && (
        <small className="muted">
          From {job.result.source}, retrieved{" "}
          {new Date(job.result.importedAt).toLocaleString()}. Prices can change.
        </small>
      )}
      {idea && (
        <>
          <Field label="Who can see this idea?">
            <select
              name="visibility"
              defaultValue={gift?.visibility ?? "private"}
            >
              <option value="private">Only me</option>
              <option value="hidden">
                Selected groups, hidden from recipient
              </option>
              <option value="visible">Selected groups and the recipient</option>
            </select>
          </Field>
          <fieldset className="choice-group">
            <legend>Share with these groups</legend>
            {world.groups.map((g) => (
              <label className="check" key={g.id}>
                <input
                  name="groupIds"
                  type="checkbox"
                  value={g.id}
                  defaultChecked={gift?.groupIds.includes(g.id)}
                />
                {g.name}
              </label>
            ))}
          </fieldset>
          <p className="muted">
            Buying activity stays a surprise, even when the recipient can see
            this idea.
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
          Archive this gift
        </label>
      )}
      {duplicate && (
        <div className="duplicate">
          <strong>This looks like an existing gift: {duplicate.title}</strong>
          <p>
            Use the existing entry to coordinate one purchase, or create a
            separate gift intentionally.
          </p>
          <a href={`/gift/${duplicate.id}`}>View existing gift</a>
          <label className="check">
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(e) => setAllowDuplicate(e.target.checked)}
            />
            Create a separate entry with its own reservations
          </label>
        </div>
      )}
    </Form>
  );
}
export function ExchangeForm() {
  const { world, mutate, close } = useApp();
  const [groupId, setGroupId] = useState(world.groups[0]?.id ?? "");
  const group = world.groups.find((g) => g.id === groupId);
  const people = world.people.filter((p) =>
    [p.userId, ...p.guardians].some((u) => u && group?.memberIds.includes(u)),
  );
  return (
    <Form
      submit="Create exchange"
      onSubmit={async (f) => {
        const exclusions = value(f, "exclusions")
          .split("\n")
          .filter(Boolean)
          .map((line) => line.split(">").map((v) => v.trim()))
          .map(([a, b]) => {
            const giver = people.find(
                (p) => p.name.toLowerCase() === a?.toLowerCase(),
              ),
              recipient = people.find(
                (p) => p.name.toLowerCase() === b?.toLowerCase(),
              );
            if (!giver || !recipient)
              throw new Error(
                "Use exact participant names in exclusions, separated by >.",
              );
            return [giver.id, recipient.id];
          });
        await mutate("exchanges", {
          name: value(f, "name"),
          groupId,
          count: Number(value(f, "count")),
          participantIds: selected(f, "participants"),
          excludeHousehold: f.get("households") === "on",
          exclusions,
          previousId: value(f, "previousId") || undefined,
        });
        close();
      }}
    >
      <Field label="Exchange name">
        <input
          name="name"
          required
          placeholder="A just-because gift exchange"
        />
      </Field>
      <Field label="Group">
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {world.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="People each participant gives to"
        hint="Choose 2 and each participant gives to 2 people and receives from 2 people."
      >
        <select name="count">
          <option value="1">1 person</option>
          <option value="2">2 people</option>
          <option value="3">3 people</option>
        </select>
      </Field>
      <fieldset className="choice-group" key={groupId}>
        <legend>Participants</legend>
        {people.map((p) => (
          <label className="check" key={p.id}>
            <input
              type="checkbox"
              name="participants"
              value={p.id}
              defaultChecked
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input type="checkbox" name="households" defaultChecked />
        Avoid matching people in the same household
      </label>
      <Field
        label="Other exclusions"
        hint="One direction per line, using exact names: Alex Morgan > Sam Morgan"
      >
        <textarea name="exclusions" rows={2} />
      </Field>
      <Field label="Prefer different matches from">
        <select name="previousId">
          <option value="">No previous exchange</option>
          {world.exchanges
            .filter((e) => e.groupId === groupId && e.status !== "draft")
            .map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </Field>
      <p className="muted">
        Every participant needs a Surprise list shared with the group before the
        draw. Only givers and their guardians see their assignments.
      </p>
    </Form>
  );
}
