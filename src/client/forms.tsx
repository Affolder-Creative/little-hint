import { itemPhotos } from "../shared/item-photos";
import { HelpfulNoteEditor } from "./NoteEditor";
import type { NoteDocument } from "../shared/helpful-note";
import { ManagedProfileManagers } from "./ManagedProfileManagers";
import { ManagedProfileSharing } from "./ManagedProfileSharing";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PurchaseListField } from "./SpendingPurchase";
import { dollars } from "./api";
import { ProductSources } from "./ProductSources";
import { DiscoveryLink } from "./GiftPreferences";
import { GuidelineField, guidelineValue } from "./SpendingGuidance";
import { PrioritySelect } from "./Management";
import type { ImportJob, ItemPriority } from "../shared/model";
import { actionError } from "./copy";
import { useNavigate } from "react-router-dom";
import { familyGroupLabel } from "../shared/households";
import { canManageGroupEvents } from "../shared/group-events";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import {
  Link as LinkIcon,
  Upload,
  LoaderCircle,
  ImagePlus,
  Star,
  Trash2,
  Check,
  Plus,
} from "lucide-react";
import type { GiftView, Group, List, World } from "../shared/model";
import { Form, Field, Privacy, privateIdeaDescription } from "./components";
import { useApp } from "./context";
import { api, ApiError } from "./api";
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
  onDone,
}: {
  onDone?: () => void;
  id?: string;
  onSaved?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { world, mutate, close } = useApp();
  const person = world.people.find((p) => p.id === id);
  const [loadedRevision, setLoadedRevision] = useState(person?.revision);
  return (
    <Form
      cancel={onDone}
      cancelLabel="Done"
      submit={person ? "Save profile" : "Create profile"}
      onBusyChange={onBusyChange}
      onSubmit={async (f) => {
        const saved = await mutate<{ revision: number }>(
          person ? "people/update" : "people",
          {
            ...(person ? { id: person.id, revision: loadedRevision } : {}),
            ...(person &&
            !person.userId &&
            (person.managedOwnerId ?? person.guardians[0]) === world.me.id
              ? { managerUserIds: selected(f, "managerUserIds") }
              : {}),
            name: value(f, "name"),
            ...(!person?.userId
              ? { managedGroupIds: selected(f, "managedGroupIds") }
              : {}),
          },
        );
        setLoadedRevision(saved.revision);
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
      {person && !person.userId && (
        <ManagedProfileManagers key={person.id} person={person} />
      )}
      {!person?.userId && <ManagedProfileSharing person={person} />}
      {!person && (
        <p className="muted">
          You will manage this person’s wish lists. They can take over later by
          verifying their email and accepting your invitation.
        </p>
      )}
    </Form>
  );
}
export function ListForm({
  list,
  personId,
  onCreated,
}: {
  list?: List;
  personId?: string;
  onCreated?: (list: List) => void;
}) {
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
        const saved = await mutate<List>(list ? "lists/update" : "lists", {
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
        if (!list && onCreated) onCreated(saved);
        else close();
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
                  defaultChecked={p.id === (personId ?? mine[0]?.id)}
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
                  defaultChecked={
                    list
                      ? list.groupIds.includes(g.id)
                      : !!world.people
                          .find((p) => p.id === personId)
                          ?.managedGroupIds?.includes(g.id)
                  }
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
  descriptionRich?: NoteDocument | null;
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
// Reopening always reads the current revision before creating editable state.
export function GiftForm(props: ComponentProps<typeof GiftEditor>) {
  const [generation, setGeneration] = useState(0);
  const [reviewDraft, setReviewDraft] = useState(props.importDraft);
  const reloadDraft = (job: ImportJob) => {
    setReviewDraft(job);
    setGeneration((v) => v + 1);
  };
  return reviewDraft ? (
    <FreshDraft
      key={generation}
      {...props}
      importDraft={reviewDraft}
      reloadDraft={reloadDraft}
    />
  ) : (
    <GiftEditor {...props} reloadDraft={reloadDraft} />
  );
}
function FreshDraft(props: ComponentProps<typeof GiftEditor>) {
  const { world } = useApp();
  const [initial, setInitial] = useState<ImportJob>();
  const query = useQuery({
    queryKey: ["import", world.me.id, props.importDraft!.id],
    queryFn: () => api<ImportJob>(`imports/${props.importDraft!.id}`),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (query.isFetchedAfterMount && query.data)
      setInitial((previous) => previous ?? query.data);
  }, [query.isFetchedAfterMount, query.data]);
  if (initial?.draft?.state === "active")
    return <GiftEditor {...props} importDraft={initial} />;
  if (query.isError)
    return (
      <p role="alert">
        Could not open this draft.{" "}
        <button
          className="button secondary"
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </p>
    );
  if (!query.isFetchedAfterMount || !query.data)
    return <p role="status">Opening your draft…</p>;
  if (query.data.draft?.state !== "active")
    return <p>This draft is no longer available.</p>;
  return <GiftEditor {...props} importDraft={query.data} />;
}
function draftFields(job?: ImportJob) {
  const fields = job?.draft?.fields ?? {};
  if (job?.status !== "complete" || !job.result) return fields;
  const r = job.result;
  return {
    ...fields,
    ...Object.fromEntries(
      Object.entries({
        title: r.title,
        description: r.description,
        price: r.priceCents == null ? "" : String(r.priceCents / 100),
        image: r.image,
        tags: r.tags?.join(", "),
      }).filter(
        ([k, v]) =>
          v !== undefined && !job.draft?.touched.includes(k) && !fields[k],
      ),
    ),
  };
}
function GiftEditor({
  gift,
  listId,
  recipientId: initialRecipientId,
  recipientOptions,
  initialSpendingListId,
  onSaved,
  draft,
  importDraft,
  capture,
  reloadDraft,
}: {
  gift?: GiftView;
  listId?: string;
  recipientId?: string;
  recipientOptions?: string[];
  initialSpendingListId?: string;
  onSaved?: (gift: GiftView) => void;
  draft?: Draft;
  importDraft?: ImportJob;
  reloadDraft?: (job: ImportJob) => void;
  capture?: { url: string; title: string };
}) {
  const { world, mutate, close, toast } = useApp();
  const lists = world.lists.filter((l) => l.canEdit && !l.archived);
  const [noteRich, setNoteRich] = useState<NoteDocument | null | undefined>(
    gift?.descriptionRich ??
      draft?.descriptionRich ??
      importDraft?.draft?.descriptionRich,
  );
  const [noteBusy, setNoteBusy] = useState(false);
  const [data, setData] = useState({
    title: gift?.title ?? draft?.title ?? capture?.title ?? "",
    url: gift?.url ?? draft?.url ?? capture?.url ?? "",
    description: gift?.description ?? draft?.description ?? "",
    price: gift?.priceCents == null ? "" : String(gift.priceCents / 100),
    image: gift?.image ?? "",
    images: itemPhotos(gift ?? {}),
    tags: gift?.tags.join(", ") ?? "",
    quantity: gift?.quantity ?? 1,
    ...(importDraft?.draft
      ? Object.fromEntries(
          Object.entries(draftFields(importDraft)).filter(([k]) =>
            [
              "title",
              "url",
              "description",
              "price",
              "image",
              "images",
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
  const importing =
    importQuery.busy ||
    !!(
      importQuery.job && ["pending", "running"].includes(importQuery.job.status)
    );
  const [switchingToManual, setSwitchingToManual] = useState(false);
  const [archived, setArchived] = useState(gift?.archived ?? false);
  const [closing, setClosing] = useState(false);
  const [manualLookup, setManualLookup] = useState(false);
  const ignoringLookup = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const draftSavingRef = useRef(false);
  const [detailsOpen, setDetailsOpen] = useState(!!gift || !!draft);
  const [photoError, setPhotoError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [failedUploads, setFailedUploads] = useState<
    Array<{ file: File; replace?: string }>
  >([]);
  const uploadLock = useRef(false);
  const photos = itemPhotos(data);
  const originalPhotos = useRef(
    JSON.stringify({ image: data.image, images: photos }),
  );
  const photosChanged =
    originalPhotos.current !==
    JSON.stringify({ image: data.image, images: photos });
  const photoLimit = world.itemPhotoLimit ?? 5;
  function setPhotos(images: string[], cover: string) {
    touched.current.add("image");
    touched.current.add("images");
    setData((previous) => ({ ...previous, images, image: cover }));
  }
  const [duplicate, setDuplicate] = useState<GiftView | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const job = importQuery.job;
  const [destination, setDestination] = useState(
    importDraft?.draft?.listId ?? listId ?? lists[0]?.id ?? "",
  );
  const client = useQueryClient();
  const savedDraft = useRef(importDraft);
  const baseline = useRef<string | undefined>(undefined);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const conflict = useRef(false);
  const [recovery, setRecovery] = useState<"reload" | "close" | null>(null);
  const [autosaving, setAutosaving] = useState(false);
  useEffect(() => () => clearTimeout(autosaveTimer.current), []);
  const [draftSaved, setDraftSaved] = useState("");
  const [saveError, setSaveError] = useState("");
  const saveStatus = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (saveError) saveStatus.current?.focus();
  }, [saveError]);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const saveQueue = useRef(Promise.resolve());
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!importing) return;
    const t = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(t);
  }, [importing]);
  async function flushDraft() {
    clearTimeout(autosaveTimer.current);
    const next = saveQueue.current
      .catch(() => {})
      .then(async () => {
        if (conflict.current)
          throw new Error(
            "This draft has newer changes. Reload the latest draft before saving.",
          );
        while (
          savedDraft.current?.draft &&
          currentSnapshot.current !== baseline.current
        ) {
          const active = savedDraft.current;
          const captured = currentSnapshot.current;
          setAutosaving(true);
          try {
            const updated = await api<ImportJob>("imports/update", {
              id: active.id,
              revision: active.draft!.revision,
              ...JSON.parse(captured),
            });
            if (savedDraft.current?.id !== active.id) return;
            savedDraft.current = updated;
            baseline.current = captured;
            setDraftSaved(captured);
            client.setQueryData(["import", world.me.id, updated.id], updated);
            client.setQueriesData<World>({ queryKey: ["world"] }, (previous) =>
              previous
                ? {
                    ...previous,
                    imports: previous.imports.map((j) =>
                      j.id === updated.id ? updated : j,
                    ),
                  }
                : previous,
            );
            void client.invalidateQueries({ queryKey: ["world"] });
            setSaveError("");
            setSavedFeedback(true);
          } catch (e) {
            if (savedDraft.current?.id !== active.id) return;
            conflict.current = e instanceof ApiError && e.status === 409;
            setSaveError(
              conflict.current
                ? "This draft has newer changes. Reload the latest draft before saving."
                : "Your draft could not be saved. Your changes are still here. Try again.",
            );
            throw e;
          } finally {
            setAutosaving(false);
          }
        }
      });
    saveQueue.current = next;
    return next;
  }

  const applied = useRef(
    importDraft?.status === "complete" ? importDraft.id : "",
  );
  const recipients = world.people.filter(
    (person) =>
      recipientOptions?.includes(person.id) && person.userId !== world.me.id,
  );
  const [recipientId, setRecipientId] = useState(
    importDraft?.draft?.recipientId ??
      initialRecipientId ??
      (recipients.length === 1 ? recipients[0].id : ""),
  );
  const idea =
    importDraft?.draft?.kind === "idea" ||
    !!initialRecipientId ||
    !!recipientOptions ||
    (!!gift && !gift.listId);
  const [spendingListId, setSpendingListId] = useState(
    gift?.spendingListId ??
      importDraft?.draft?.spendingListId ??
      initialSpendingListId ??
      "",
  );
  const assignmentChanged =
    !!gift && spendingListId !== (gift.spendingListId ?? "");
  const needsAssignmentPreview = !!(
    idea &&
    world.spendingEnabled &&
    assignmentChanged &&
    spendingListId
  );
  const assignmentPreview = useQuery({
    queryKey: [
      "spending",
      world.me.id,
      "assignment-preview",
      gift?.id,
      spendingListId,
    ],
    queryFn: () =>
      api<{
        token: string;
        records: Array<{
          id: string;
          revision: number;
          title: string;
          kind: string;
          amountCents: number | null;
          voided?: boolean;
        }>;
      }>(`spending/assignment-preview?item=${gift!.id}&list=${spendingListId}`),
    enabled: needsAssignmentPreview,
  });
  const recipientName =
    gift?.recipientNames.join(" & ") ??
    world.people.find((person) => person.id === recipientId)?.name;
  const [visibility, setVisibility] = useState(
    importDraft?.draft?.visibility ?? gift?.visibility ?? "private",
  );
  const [groupIds, setGroupIds] = useState(
    importDraft?.draft?.groupIds ?? gift?.groupIds ?? [],
  );
  const friendEntries = (world.friendEntries ?? []).filter(
    (entry) =>
      (!gift || !!gift.friendEntryId) &&
      entry.personId === (gift?.recipientIds[0] ?? recipientId) &&
      !entry.archived,
  );
  const preferredFriend =
    friendEntries.find((entry) => entry.creatorId === world.me.id) ??
    (friendEntries.length === 1 ? friendEntries[0] : undefined);
  const [chosenFriend, setChosenFriend] = useState(
    importDraft?.draft?.friendEntryId ?? gift?.friendEntryId ?? "",
  );
  const friendEntryId = chosenFriend || preferredFriend?.id;
  const friendEntry = (world.friendEntries ?? []).find(
    (entry) => entry.id === friendEntryId,
  );
  const ideaGroups = world.groups.filter(
    (group) => !friendEntry || friendEntry.groupIds.includes(group.id),
  );
  const snapshot = JSON.stringify({
    fields: { ...data, priority },
    descriptionRich: noteRich,
    touched: [...touched.current],
    ...(idea
      ? {
          kind: "idea",
          recipientId,
          visibility,
          groupIds,
          friendEntryId,
          spendingListId: spendingListId || null,
        }
      : { listId: destination }),
  });
  const editSnapshot = JSON.stringify({ snapshot, archived });
  const originalEditSnapshot = useRef(editSnapshot);
  baseline.current ??= snapshot;
  const currentSnapshot = useRef(snapshot);
  currentSnapshot.current = snapshot;
  useEffect(() => {
    if (
      switchingToManual ||
      !savedDraft.current?.draft ||
      snapshot === baseline.current ||
      conflict.current
    )
      return;
    autosaveTimer.current = setTimeout(() => {
      void flushDraft().catch(() => {});
    }, 1000);
    return () => clearTimeout(autosaveTimer.current);
  }, [snapshot, draftSaved, job?.id]);
  const audienceGroups = world.groups.filter((group) =>
    groupIds.includes(group.id),
  );
  const sharingIdea = idea && visibility !== "private";
  const change = (key: keyof typeof data, v: string | number) => {
    if (key === "url") {
      clearTimeout(autosaveTimer.current);
      conflict.current = false;
      setSavedFeedback(false);
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
      setSaveError("");
      setDraftSaved("");
      setError("");
    }
    touched.current.add(key);
    setData((d) => ({ ...d, [key]: v }));
    setDuplicate(null);
  };
  useEffect(() => {
    if (
      !ignoringLookup.current &&
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
          }).filter(
            ([k, v]) =>
              v !== undefined &&
              !touched.current.has(k) &&
              !d[k as keyof typeof d],
          ),
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
    ignoringLookup.current = false;
    setError("");
    try {
      if (idea && !recipientId)
        throw new Error("Choose who this idea is for first.");
      if (savedDraft.current?.draft && job?.status === "failed") {
        await api("imports/retry", { id: job.id });
        await importQuery.retry();
        return;
      }
      if (savedDraft.current?.draft) {
        await api("imports/discard", { id: savedDraft.current.id });
        savedDraft.current = undefined;
        setDraftSaved("");
      }
      const created = await importQuery.start(
        data.url,
        forceRefresh,
        !gift
          ? {
              ...(idea
                ? {
                    kind: "idea" as const,
                    recipientId,
                    visibility,
                    groupIds,
                    spendingListId: spendingListId || null,
                  }
                : { listId: destination }),
              fields: { ...data, priority },
              descriptionRich: noteRich,
              touched: [...touched.current],
            }
          : undefined,
      );
      savedDraft.current = created;
      baseline.current = snapshot;
      setDraftSaved(snapshot);
    } catch (e) {
      setError(actionError(e));
    }
  }
  const captureStarted = useRef(false);
  useEffect(() => {
    if (!capture || captureStarted.current || (!idea && !destination)) return;
    // Let Strict Mode finish its setup/cleanup cycle before starting a write.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || captureStarted.current) return;
      captureStarted.current = true;
      if (world.productLookupEnabled !== false) void importUrl();
    });
    return () => {
      cancelled = true;
    };
  }, [capture, destination, idea]);
  async function enterManually() {
    if (switchingToManual || importQuery.creating) return;
    ignoringLookup.current = true;
    setSwitchingToManual(true);
    clearTimeout(autosaveTimer.current);
    try {
      await saveQueue.current.catch(() => {});
      if (savedDraft.current?.draft)
        await api("imports/discard", { id: savedDraft.current.id });
      savedDraft.current = undefined;
      setManualLookup(true);
      importQuery.reset();
      setSavedFeedback(false);
      setSaveError("");
      setError("");
      void client.invalidateQueries({ queryKey: ["world"] });
    } catch (error) {
      ignoringLookup.current = false;
      setError(actionError(error));
    } finally {
      setSwitchingToManual(false);
    }
  }
  async function saveBeforeClose() {
    if (draftSavingRef.current)
      throw new Error("Saving is already in progress.");
    draftSavingRef.current = true;
    setClosing(true);
    try {
      await flushDraft();
    } finally {
      draftSavingRef.current = false;
      setClosing(false);
    }
  }
  async function upload(files: Array<{ file: File; replace?: string }>) {
    if (!files.length || uploadLock.current) return;
    if (
      photos.length + files.filter((entry) => !entry.replace).length >
        photoLimit &&
      files.some((entry) => !entry.replace)
    ) {
      setPhotoError(
        `Choose up to ${Math.max(0, photoLimit - photos.length)} more photos.`,
      );
      return;
    }
    uploadLock.current = true;
    setUploading(true);
    setPhotoError("");
    setFailedUploads([]);
    let nextPhotos = [...photos],
      cover = data.image;
    const failed: typeof files = [];
    for (const [index, entry] of files.entries()) {
      setUploadStatus(`Uploading photo ${index + 1} of ${files.length}…`);
      try {
        const response = await fetch("/api/v1/media", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: entry.file,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (entry.replace)
          nextPhotos = nextPhotos.map((url) =>
            url === entry.replace ? result.url : url,
          );
        else nextPhotos.push(result.url);
        if (!cover || cover === entry.replace) cover = result.url;
        setPhotos([...nextPhotos], cover);
      } catch (error) {
        failed.push(entry);
        setPhotoError(actionError(error));
      }
    }
    setFailedUploads(failed);
    setUploadStatus(
      failed.length
        ? `${files.length - failed.length} uploaded; ${failed.length} failed.`
        : files.length === 1
          ? "Photo uploaded."
          : `${files.length} photos uploaded.`,
    );
    uploadLock.current = false;
    setUploading(false);
  }
  return (
    <Form
      className="gift-form"
      dialogLayout
      externalBusy={
        draftSaving ||
        uploading ||
        importQuery.creating ||
        switchingToManual ||
        closing
      }
      busyLabel={uploading ? "Uploading photos…" : "Saving…"}
      secondaryActionsPosition="after"
      actionHint={
        savedDraft.current?.draft && importing ? (
          <>
            Only you can see this unfinished lookup. Save for later keeps it
            running.
          </>
        ) : !idea && (!gift || gift.publicationState === "draft") ? (
          <>
            {world.people.some(
              (p) =>
                (
                  gift?.recipientIds ??
                  world.lists.find((l) => l.id === destination)?.ownerIds ??
                  []
                ).includes(p.id) && p.guardians.length,
            )
              ? "Drafts are visible to their owner and this profile’s guardians until published."
              : "Only you can see this draft until you publish."}
          </>
        ) : undefined
      }
      secondaryActions={(busy) => (
        <>
          {!idea &&
          (!gift || gift.publicationState === "draft") &&
          !(!gift && importing) ? (
            <div className="wishlist-draft-actions">
              <button
                type="submit"
                name="draftAction"
                value={gift ? "publish" : "save"}
                className="button secondary"
                disabled={
                  busy ||
                  importing ||
                  uploading ||
                  !!gift?.archived ||
                  !navigator.onLine
                }
              >
                {gift ? "Publish" : "Save draft"}
              </button>
            </div>
          ) : null}
          {(idea || importing) && savedDraft.current?.draft ? (
            <div className="gift-draft-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy || uploading}
                onClick={async () => {
                  if (draftSavingRef.current || busy || uploading) return;
                  draftSavingRef.current = true;
                  setDraftSaving(true);
                  try {
                    await flushDraft();
                    toast(
                      idea
                        ? `Private draft saved. Find it in Gift ideas for ${recipientName ?? "this person"}.`
                        : "Private draft saved. Find it in My lists.",
                    );
                    close();
                  } catch {
                    // flushDraft owns the single save error and recovery region.
                  } finally {
                    draftSavingRef.current = false;
                    setDraftSaving(false);
                  }
                }}
              >
                {draftSaving ? "Saving draft…" : "Save for later"}
              </button>
            </div>
          ) : null}
        </>
      )}
      dirty={
        savedDraft.current?.draft
          ? snapshot !== baseline.current
          : manualLookup ||
            editSnapshot !== originalEditSnapshot.current ||
            photosChanged
      }
      onBusyChange={setNoteBusy}
      onBeforeClose={savedDraft.current?.draft ? saveBeforeClose : undefined}
      onBeforeCloseError={() => {}}
      submit={
        gift ? "Save changes" : idea ? "Save gift idea" : "Add to wish list"
      }
      disabled={
        importing ||
        switchingToManual ||
        data.description.length > 5000 ||
        uploading ||
        (needsAssignmentPreview &&
          (!assignmentPreview.data || assignmentPreview.isFetching)) ||
        (idea && !gift && !recipientId) ||
        (!!duplicate && !allowDuplicate) ||
        (sharingIdea && !audienceGroups.length)
      }
      allowOffline={
        !idea &&
        !!localStorage.getItem(`little-hint:draft-optin:${world.me.id}`)
      }
      onSubmit={async (f) => {
        const saveAsDraft = f.get("draftAction") === "save";
        const publishDraft = f.get("draftAction") === "publish";
        if (savedDraft.current?.draft) {
          try {
            await flushDraft();
          } catch {
            return;
          }
        }
        const payload = {
          publicationState: saveAsDraft ? "draft" : undefined,
          importDraftRevision: savedDraft.current?.draft?.revision,
          ...data,
          descriptionRich: noteRich,
          ...(!idea ? { priority } : {}),
          ...(idea && world.spendingEnabled
            ? {
                spendingListId: spendingListId || null,
                spendingAssignmentToken: needsAssignmentPreview
                  ? assignmentPreview.data?.token
                  : undefined,
              }
            : {}),
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
          ...(idea && friendEntryId ? { friendEntryId } : {}),
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
            descriptionRich: noteRich,
          });
          toast("Personal draft saved on this device.");
          close();
          return;
        }
        await saveQueue.current.catch(() => {});
        const result = await mutate(
          publishDraft ? "items/publish" : gift ? "items/update" : "items",
          payload,
        );
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
          saveAsDraft
            ? "Draft saved."
            : publishDraft
              ? "Item published."
              : gift
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
      {savedDraft.current?.draft && !importing && (
        <div className="lookup-draft-status">
          <p className="muted">
            Your unfinished lookup is saved automatically. Close this dialog to
            finish later.
          </p>
        </div>
      )}
      {savedDraft.current?.draft &&
        (saveError || autosaving || savedFeedback) && (
          <div className="draft-save-region">
            <p
              ref={saveStatus}
              tabIndex={-1}
              className={`draft-save-feedback ${saveError ? "error" : "muted"}`}
              role={saveError ? "alert" : "status"}
            >
              {saveError ||
                (autosaving ? "Saving draft…" : "Private draft saved")}
            </p>
            {saveError && (
              <div className="actions">
                {conflict.current ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setRecovery("reload")}
                  >
                    Reload latest
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void flushDraft().catch(() => {})}
                  >
                    Try saving again
                  </button>
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setRecovery("close")}
                >
                  Discard changes and close
                </button>
              </div>
            )}
            {recovery && (
              <div className="notice">
                <p>
                  Discard your unsaved changes
                  {recovery === "reload"
                    ? " and load the latest saved draft"
                    : " and close this window"}
                  ? Your saved draft will be kept.
                </p>
                <div className="actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setRecovery(null)}
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => {
                      clearTimeout(autosaveTimer.current);
                      if (recovery === "reload" && savedDraft.current)
                        reloadDraft?.(savedDraft.current);
                      else close();
                    }}
                  >
                    Discard changes
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      {idea && importDraft && (
        <Field label="Who is this idea for?">
          <select
            value={recipientId}
            onChange={(e) => {
              setRecipientId(e.target.value);
              setSpendingListId((current) =>
                world.lists.some(
                  (list) =>
                    list.id === current &&
                    list.ownerIds.includes(e.target.value),
                )
                  ? current
                  : "",
              );
              setChosenFriend("");
              setGroupIds([]);
              setVisibility("private");
            }}
            required
          >
            <option value="">Choose a person</option>
            {world.people
              .filter((p) => p.userId !== world.me.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
      )}
      {idea && (
        <>
          {!gift &&
            !importDraft &&
            friendEntries.length > 1 &&
            !preferredFriend && (
              <Field label="Planning entry">
                <select
                  required
                  value={chosenFriend}
                  onChange={(event) => {
                    setChosenFriend(event.target.value);
                    setGroupIds([]);
                    setVisibility("private");
                  }}
                >
                  <option value="">Choose where to plan this gift</option>
                  {friendEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} ·{" "}
                      {entry.groupIds
                        .map(
                          (id) => world.groups.find((g) => g.id === id)?.name,
                        )
                        .filter(Boolean)
                        .join(", ") || "Private"}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          {recipientOptions && !gift && recipients.length > 1 && (
            <Field label="Who is this idea for?">
              <select
                required
                value={recipientId}
                onChange={(event) => {
                  setRecipientId(event.target.value);
                  setSpendingListId((current) =>
                    world.lists.some(
                      (list) =>
                        list.id === current &&
                        list.ownerIds.includes(event.target.value),
                    )
                      ? current
                      : "",
                  );
                  setChosenFriend("");
                  setGroupIds([]);
                  setVisibility("private");
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
                {!friendEntries.length && !friendEntry && (
                  <option value="visible">
                    Selected family groups and the recipient
                  </option>
                )}
              </select>
            </Field>
            <fieldset
              className="choice-group"
              hidden={!sharingIdea}
              disabled={!sharingIdea}
            >
              <legend>Share with these family groups</legend>
              {ideaGroups.map((g) => (
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
                  ? ideaGroups.length
                    ? "Choose at least one family group to share this idea."
                    : friendEntries.length || friendEntry
                      ? "Share this friend with a group first, or choose Only me."
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
      {idea && world.spendingEnabled && (
        <>
          <PurchaseListField
            recipientIds={
              gift?.recipientIds ?? (recipientId ? [recipientId] : [])
            }
            value={spendingListId}
            onChange={setSpendingListId}
          />
          {assignmentChanged && !spendingListId && (
            <p className="muted">
              This clears the default for future plans. Existing spending
              assignments stay unchanged.
            </p>
          )}
          {needsAssignmentPreview && (
            <div className="assignment-preview" role="status">
              <button
                type="button"
                className="text-button"
                disabled={assignmentPreview.isFetching}
                onClick={() => void assignmentPreview.refetch()}
              >
                Refresh review
              </button>
              {assignmentPreview.isPending && (
                <p>Checking existing plans and purchases…</p>
              )}
              {assignmentPreview.error && (
                <p role="alert">
                  Unable to review existing records.{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => void assignmentPreview.refetch()}
                  >
                    Try again
                  </button>
                </p>
              )}
              {assignmentPreview.data &&
                (assignmentPreview.data.records.some((r) => !r.voided) ? (
                  <>
                    <p>
                      Saving will also assign these existing unassigned records.
                      Records already assigned elsewhere will keep their
                      choices.
                    </p>
                    <ul>
                      {assignmentPreview.data.records
                        .filter((r) => !r.voided)
                        .map((r) => (
                          <li key={r.id}>
                            {r.title} ·{" "}
                            {r.kind === "plan" ? "Plan" : "Purchase"} ·{" "}
                            {r.amountCents === null
                              ? "Amount not recorded"
                              : dollars(r.amountCents)}
                          </li>
                        ))}
                    </ul>
                  </>
                ) : (
                  <p>
                    This assignment will be used for your future plans for this
                    idea.
                  </p>
                ))}
            </div>
          )}
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
      <section className="gift-lookup" aria-label="Product link and details">
        <div
          className={`url-entry${world.productLookupEnabled === false ? " manual-entry" : ""}`}
        >
          <Field label="Product link (optional)">
            <input
              type="url"
              value={data.url}
              onChange={(e) => change("url", e.target.value)}
              placeholder="Paste a link from your favorite shop"
            />
          </Field>
          {world.productLookupEnabled !== false &&
            job?.status !== "complete" && (
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
              {actionError(importQuery.error)} You can retry or enter the
              details manually.
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
        {importing && (
          <p className="muted" role="status">
            {slow
              ? savedDraft.current?.draft
                ? "This is taking a little longer. You can keep editing or save for later while we keep working."
                : "This is taking a little longer. You can keep editing."
              : savedDraft.current?.draft
                ? "Finding product details. You can keep editing or save for later."
                : "Finding product details. Save when the lookup finishes, or enter details manually."}
          </p>
        )}
        {(importing || importQuery.error) && !importQuery.creating && (
          <button
            type="button"
            className="text-button"
            onClick={() => void enterManually()}
          >
            Enter details manually
          </button>
        )}
        {!job && !importing && !error && (
          <p className="muted">Or enter the details below.</p>
        )}
        {job?.status === "complete" && (
          <>
            <div className="gift-lookup-result">
              <p className="success" role="status">
                <Check size={16} /> Details found. Check them before saving.
              </p>
              {world.productLookupEnabled !== false && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => importUrl(true)}
                >
                  Refresh from shop
                </button>
              )}
            </div>
            {(data.image || data.price || job.result?.source) && (
              <div className="gift-import-preview">
                {data.image && (
                  <img
                    key={data.image}
                    src={data.image}
                    alt="Product preview"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                )}
                <div>
                  {job.result?.source && (
                    <small className="muted">{job.result.source}</small>
                  )}
                  {data.price !== "" && (
                    <p>
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(Number(data.price))}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <ProductSources
          sources={(job?.result?.productSources ?? gift?.productSources)
            ?.map((source) => ({
              ...source,
              fields: source.fields.filter(
                (field) => data[field] === (job?.result ?? gift)?.[field],
              ),
            }))
            .filter((source) => source.fields.length)}
        />
        {job?.result?.warnings?.map((warning) => (
          <p className="notice" key={warning}>
            {warning}
          </p>
        ))}
      </section>
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
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary>
          <span>More details</span>
          <small className="muted">
            {[
              data.description && "Note added",
              data.price !== "" &&
                new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(Number(data.price)),
              Number(data.quantity) !== 1 && `Quantity: ${data.quantity}`,
              priority && "Priority set",
              data.tags && "Tags added",
              data.image && "Photo added",
            ]
              .filter(Boolean)
              .join(" · ") ||
              (idea
                ? "Note, price, quantity, tags & photo"
                : "Note, price, quantity, priority, tags & photo")}
          </small>
        </summary>
        <HelpfulNoteEditor
          value={data.description}
          rich={noteRich}
          disabled={noteBusy}
          onChange={(text, doc) => {
            setNoteRich(doc);
            change("description", text);
          }}
        />
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
        <div className="gift-photo-editor">
          <p className="muted">
            {photos.length} of {photoLimit} photos
          </p>
          <label className="upload">
            <Upload size={18} aria-hidden="true" />
            <span>{uploading ? "Uploading photos…" : "Add photos"}</span>
            <input
              type="file"
              multiple
              disabled={uploading || photos.length >= photoLimit}
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void upload(files.map((file) => ({ file })));
              }}
            />
          </label>
          {photos.length >= photoLimit && (
            <p className="muted">
              Remove a photo to add another. You can still replace photos.
            </p>
          )}
          {uploadStatus && <p role="status">{uploadStatus}</p>}
          {photoError && (
            <p className="error" role="alert">
              {photoError}
            </p>
          )}
          {failedUploads.length > 0 && (
            <button
              type="button"
              className="text-button"
              disabled={uploading}
              onClick={() => void upload(failedUploads)}
            >
              Retry failed uploads
            </button>
          )}
          <div className="item-photo-previews">
            {photos.map((photo, index) => (
              <div className="item-photo-preview" key={photo}>
                <img
                  src={`${photo}?size=card`}
                  alt={`${idea ? "Gift idea" : "Item"} photo ${index + 1}`}
                />
                <div className="item-photo-actions">
                  {photo === data.image ? (
                    <span className="item-photo-cover">
                      <Check size={16} aria-hidden="true" />
                      Cover photo
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="button secondary item-photo-make-cover"
                      disabled={uploading}
                      onClick={() => setPhotos(photos, photo)}
                      aria-label={`Use photo ${index + 1} as cover`}
                    >
                      <Star size={16} aria-hidden="true" />
                      Make cover
                    </button>
                  )}
                  <div className="item-photo-tools">
                    <label className="upload">
                      <ImagePlus size={16} aria-hidden="true" />
                      <span>Replace</span>
                      <input
                        type="file"
                        aria-label={`Replace photo ${index + 1}`}
                        disabled={uploading}
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void upload([{ file, replace: photo }]);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={uploading}
                      aria-label={`Remove photo ${index + 1}`}
                      onClick={() => {
                        const remaining = photos.filter((url) => url !== photo);
                        setPhotos(
                          remaining,
                          data.image === photo
                            ? (remaining[0] ?? "")
                            : data.image,
                        );
                        setFailedUploads([]);
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
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
