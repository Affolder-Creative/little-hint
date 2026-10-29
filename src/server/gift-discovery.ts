import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Actor, State, Item } from "../shared/model";
import {
  discoveryAllowed,
  discoveryLifetimeMs,
  giftCategories,
  inferredInterests,
  offerFreshnessMs,
  type DiscoveryConfig,
  type DiscoveryInput,
  type DiscoverySelection,
  type GiftPreferences,
  type GiftPreferenceView,
  type GiftDiscoveryJob,
} from "../shared/gift-discovery";
import {
  command,
  controls,
  controllers,
  fail,
  itemVisible,
  listVisible,
  stamp,
} from "./domain";
import { listIsArchived } from "../shared/list-dates";
import { itemTrashed } from "../shared/organization";
import { discoveryUserOverrides } from "./gift-discovery-limits";
import { syntheticEnvironment } from "./deployment";

const uuid = z.string().uuid();
const ids = z
  .array(uuid)
  .max(100)
  .refine((v) => new Set(v).size === v.length);
const categories = z
  .array(z.enum(giftCategories.map(([id]) => id)))
  .max(giftCategories.length)
  .refine((v) => new Set(v).size === v.length);
const notes = {
  categoryIds: categories,
  interests: z.string().trim().max(500),
  likes: z.string().trim().max(1000),
  avoid: z.string().trim().max(1000),
};
export const discoveryInputSchema = z
  .object({
    personId: uuid,
    ...notes,
    maxPriceCents: z.number().int().positive().max(100000000).nullable(),
  })
  .refine(
    (v) => v.categoryIds.length > 0 || v.interests.length > 0,
    "Choose an interest first.",
  );
const selectionSchema = z.object({
  candidateId: uuid,
  offerUrl: z.url().max(2048),
  listId: uuid.optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000),
  visibility: z.enum(["private", "hidden", "visible"]).default("private"),
  groupIds: ids.default([]),
  allowDuplicate: z.boolean().default(false),
});
export const selectionsSchema = z
  .array(selectionSchema)
  .min(1)
  .max(12)
  .refine((v) => new Set(v.map((x) => x.candidateId)).size === v.length);
export const hashDiscovery = (value: unknown) =>
  createHash("sha256")
    // PostgreSQL jsonb does not preserve object key order between transactions.
    .update(
      JSON.stringify(value, (_key, entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? Object.fromEntries(
              Object.entries(entry).sort(([a], [b]) =>
                a < b ? -1 : a > b ? 1 : 0,
              ),
            )
          : entry,
      ),
    )
    .digest("hex");

function visiblePerson(s: State, a: Actor, personId: string) {
  const p = s.people.find((p) => p.id === personId);
  if (
    !p ||
    !(
      controls(s, a, p.id) ||
      s.groups.some(
        (g) =>
          g.memberIds.includes(a.id) &&
          controllers(p).some((c) => g.memberIds.includes(c)),
      )
    )
  )
    fail(404, "Person not available.");
  return p;
}
export function preferenceViews(s: State, a: Actor): GiftPreferenceView[] {
  return s.giftPreferences.flatMap((p) => {
    const person = s.people.find((x) => x.id === p.personId);
    if (!person) return [];
    const canEdit = controls(s, a, person.id);
    const shared = p.groupIds.some((id) =>
      s.groups.some(
        (g) =>
          g.id === id &&
          g.memberIds.includes(a.id) &&
          controllers(person).some((c) => g.memberIds.includes(c)),
      ),
    );
    if (!canEdit && !shared) return [];
    const { groupIds, setup, ...fields } = p;
    return [{ ...fields, canEdit, ...(canEdit ? { groupIds, setup } : {}) }];
  });
}
export function updateGiftPreferences(s: State, a: Actor, raw: unknown) {
  const p = z
    .object({
      personId: uuid,
      revision: z.number().int().positive().optional(),
      ...notes,
      groupIds: ids,
      setup: z.enum(["done", "deferred", "skipped"]).default("done"),
      confirmSharing: z.boolean().default(false),
    })
    .parse(raw);
  if (!controls(s, a, p.personId)) fail(404, "Profile not found.");
  const current = s.giftPreferences.find((x) => x.personId === p.personId);
  if (current ? p.revision !== current.revision : p.revision !== undefined)
    fail(409, "These preferences changed. Refresh before saving.");
  if (
    p.groupIds.some(
      (id) => !s.groups.some((g) => g.id === id && g.memberIds.includes(a.id)),
    )
  )
    fail(404, "Family group not found.");
  if (
    p.groupIds.some((id) => !current?.groupIds.includes(id)) &&
    !p.confirmSharing
  )
    fail(409, "Review who can see these preferences before sharing.");
  const { revision, confirmSharing, ...fields } = p;
  if (current)
    Object.assign(current, fields, { revision: current.revision + 1 });
  else s.giftPreferences.push({ ...stamp(), ...fields });
  return { ok: true };
}
export function newPreference(personId: string): GiftPreferences {
  return {
    ...stamp(),
    personId,
    categoryIds: [],
    interests: "",
    likes: "",
    avoid: "",
    groupIds: [],
    setup: "new",
  };
}
function source(s: State, a: Actor, personId: string) {
  const preferences = preferenceViews(s, a).find(
    (p) => p.personId === personId,
  );
  const wishes = s.items.filter(
    (i) =>
      i.listId &&
      i.recipientIds.includes(personId) &&
      !i.archived &&
      !itemTrashed(s, i) &&
      itemVisible(s, a, i) &&
      !listIsArchived(s.lists.find((l) => l.id === i.listId)!),
  );
  const hasPreferences =
    preferences &&
    (preferences.categoryIds.length ||
      preferences.interests ||
      preferences.likes ||
      preferences.avoid);
  return {
    preferences: hasPreferences ? preferences : undefined,
    inferredCategoryIds: hasPreferences
      ? []
      : inferredInterests(wishes.map((i) => `${i.title} ${i.tags.join(" ")}`)),
    fingerprint: hashDiscovery(
      hasPreferences
        ? [preferences.id, preferences.revision]
        : wishes.map((i) => [i.id, i.revision]).sort(),
    ),
  };
}
export function quotaKeys(userId: string, now = new Date()) {
  const week = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
  return {
    week: `discovery:week:${week.toISOString().slice(0, 10)}:${userId}`,
    month: `discovery:month:${now.toISOString().slice(0, 7)}`,
    monthExempt: `discovery:month-exempt:${now.toISOString().slice(0, 7)}`,
    weekResetsAt: new Date(week.getTime() + 7 * 86400000).toISOString(),
    monthResetsAt: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    ).toISOString(),
  };
}
export function discoveryMonthlyUsage(s: State, now = new Date()) {
  const keys = quotaKeys("", now);
  const searches = s.usage.find((u) => u.key === keys.month)?.count ?? 0;
  const exemptSearches =
    s.usage.find((u) => u.key === keys.monthExempt)?.count ?? 0;
  return {
    searches,
    exemptSearches,
    quotaSearches: Math.max(0, searches - exemptSearches),
  };
}
export function discoveryAllowance(
  s: State,
  a: Actor,
  cfg: DiscoveryConfig,
  now = new Date(),
) {
  const keys = quotaKeys(a.id, now);
  const override = syntheticEnvironment()
    ? undefined
    : discoveryUserOverrides().get(a.id);
  const weeklyLimit = override?.weeklyLimit ?? cfg.weeklyLimit;
  return {
    weeklyRemaining:
      weeklyLimit === "unlimited"
        ? null
        : Math.max(
            0,
            weeklyLimit -
              (s.usage.find((u) => u.key === keys.week)?.count ?? 0),
          ),
    monthlyRemaining: override?.bypassMonthlyLimit
      ? null
      : Math.max(
          0,
          cfg.monthlyLimit - discoveryMonthlyUsage(s, now).quotaSearches,
        ),
    weekResetsAt: keys.weekResetsAt,
    monthResetsAt: keys.monthResetsAt,
  };
}
export function addDiscoveryUsage(s: State, key: string, count: number) {
  const row = s.usage.find((u) => u.key === key);
  if (row) {
    row.count += count;
    row.revision++;
  } else s.usage.push({ ...stamp(), key, count });
}
function authorize(s: State, a: Actor, cfg: DiscoveryConfig, personId: string) {
  visiblePerson(s, a, personId);
  if (!discoveryAllowed(cfg, controls(s, a, personId)))
    fail(403, "AI gift suggestions are not enabled for this person.");
}
export function discoveryJob(
  s: State,
  a: Actor,
  cfg: DiscoveryConfig,
  id: string,
  now = new Date(),
) {
  const j = s.giftDiscoveryJobs.find(
    (j) =>
      j.id === id &&
      j.userId === a.id &&
      Date.parse(j.expiresAt) > now.getTime(),
  );
  if (!j || j.status === "cancelled")
    fail(404, "This search is no longer available.");
  authorize(s, a, cfg, j.input.personId);
  if (source(s, a, j.input.personId).fingerprint !== j.sourceFingerprint)
    fail(
      409,
      "The shared information changed. Start a new search with current preferences.",
    );
  return j;
}
export function discoveryContext(
  s: State,
  a: Actor,
  cfg: DiscoveryConfig,
  personId: string,
  now = new Date(),
) {
  authorize(s, a, cfg, personId);
  const current = source(s, a, personId);
  const recent = [...s.giftDiscoveryJobs]
    .reverse()
    .find(
      (j) =>
        j.userId === a.id &&
        j.input.personId === personId &&
        j.sourceFingerprint === current.fingerprint &&
        Date.parse(j.expiresAt) > now.getTime() &&
        j.status !== "cancelled",
    );
  return {
    config: cfg,
    own: controls(s, a, personId),
    allowance: discoveryAllowance(s, a, cfg, now),
    preferences: current.preferences,
    inferredCategoryIds: current.inferredCategoryIds,
    recent,
  };
}
export function createDiscovery(
  s: State,
  a: Actor,
  cfg: DiscoveryConfig,
  raw: unknown,
  now = new Date(),
) {
  const { fresh = false, ...body } = z
    .object({ fresh: z.boolean().optional() })
    .passthrough()
    .parse(raw);
  const input = discoveryInputSchema.parse(body);
  authorize(s, a, cfg, input.personId);
  if (!controls(s, a, input.personId) && input.maxPriceCents === null)
    fail(400, "Enter a maximum price for each gift.");
  const fingerprint = hashDiscovery(input);
  const sourceFingerprint = source(s, a, input.personId).fingerprint;
  const reusable = [...s.giftDiscoveryJobs]
    .reverse()
    .find(
      (j) =>
        j.userId === a.id &&
        j.fingerprint === fingerprint &&
        j.sourceFingerprint === sourceFingerprint &&
        Date.parse(j.expiresAt) > now.getTime() &&
        ["pending", "running", "complete", "reviewing"].includes(j.status),
    );
  if (
    reusable &&
    (!fresh || ["pending", "running", "reviewing"].includes(reusable.status))
  )
    return reusable;
  if (
    s.giftDiscoveryJobs.some(
      (j) =>
        j.userId === a.id &&
        ["pending", "running", "reviewing"].includes(j.status),
    )
  )
    fail(409, "Wait for your current search or price check to finish.");
  const allowance = discoveryAllowance(s, a, cfg, now);
  if (allowance.weeklyRemaining === 0 || allowance.monthlyRemaining === 0)
    fail(
      429,
      "The search allowance has been used. You can still browse your recent results.",
    );
  const job: GiftDiscoveryJob = {
    ...stamp(),
    userId: a.id,
    input,
    fingerprint,
    sourceFingerprint,
    status: "pending",
    expiresAt: new Date(now.getTime() + discoveryLifetimeMs).toISOString(),
    candidates: [],
  };
  s.giftDiscoveryJobs.push(job);
  return job;
}
export function startDiscovery(
  s: State,
  a: Actor,
  cfg: DiscoveryConfig,
  id: string,
  now = new Date(),
) {
  const j = discoveryJob(s, a, cfg, id, now);
  if (j.status !== "pending") return undefined;
  const allowance = discoveryAllowance(s, a, cfg, now);
  if (allowance.weeklyRemaining === 0 || allowance.monthlyRemaining === 0)
    fail(429, "The search allowance has been used. Try again after it resets.");
  const keys = quotaKeys(a.id, now);
  addDiscoveryUsage(s, keys.week, 1);
  addDiscoveryUsage(s, keys.month, 1);
  j.monthlyQuotaExempt = allowance.monthlyRemaining === null;
  if (j.monthlyQuotaExempt) addDiscoveryUsage(s, keys.monthExempt, 1);
  j.startedAt = now.toISOString();
  j.status = "running";
  j.revision++;
  return structuredClone(j);
}
function itemPayload(
  s: State,
  a: Actor,
  j: GiftDiscoveryJob,
  selection: DiscoverySelection,
) {
  const candidate = j.candidates.find((c) => c.id === selection.candidateId);
  const offer = candidate?.offers.find((o) => o.url === selection.offerUrl);
  if (!candidate || !offer)
    fail(
      409,
      "A selected product is no longer available. Review your selection.",
    );
  if (offer.priceCents > (j.input.maxPriceCents ?? 20000))
    fail(409, "This offer is above the search price limit.");
  const own = controls(s, a, j.input.personId);
  if (own) {
    const list = s.lists.find((l) => l.id === selection.listId);
    if (
      !list ||
      !list.ownerIds.includes(j.input.personId) ||
      !listVisible(s, a, list) ||
      listIsArchived(list) ||
      !list.ownerIds.some((p) => controls(s, a, p))
    )
      fail(404, "Choose an active wish list you can edit for this person.");
  } else if (selection.listId)
    fail(400, "Save suggestions for another person as gift ideas.");
  return {
    title: selection.title,
    description: selection.description,
    url: offer.url,
    image: candidate.image,
    priceCents: offer.priceCents,
    quantity: 1,
    tags: candidate.categoryIds,
    listId: own ? selection.listId : undefined,
    recipientIds: own ? [] : [j.input.personId],
    visibility: own ? "private" : selection.visibility,
    groupIds: own ? [] : selection.groupIds,
    allowDuplicate: selection.allowDuplicate,
  };
}
function simulateSave(
  s: State,
  a: Actor,
  j: GiftDiscoveryJob,
  selections: DiscoverySelection[],
) {
  const copy = structuredClone(s);
  const conflicts: Array<{
    candidateId: string;
    itemId: string;
    title: string;
  }> = [];
  const saved: Record<string, string> = { ...j.saved };
  for (const selection of selections) {
    if (saved[selection.candidateId]) continue;
    const result = command(
      copy,
      a,
      "items.create",
      itemPayload(copy, a, j, selection),
    ) as Item & { duplicate?: Item };
    if (result.duplicate)
      conflicts.push({
        candidateId: selection.candidateId,
        itemId: result.duplicate.id,
        title: result.duplicate.title,
      });
    else {
      saved[selection.candidateId] = result.id;
      const candidate = j.candidates.find(
        (c) => c.id === selection.candidateId,
      )!;
      const item = copy.items.find((i) => i.id === result.id)!;
      item.purchaseOffers = structuredClone(candidate.offers);
      item.recommendationEvidence = structuredClone(candidate.evidence);
      item.source = new URL(item.url).hostname;
      item.importedAt = candidate.offers.find(
        (o) => o.url === item.url,
      )!.checkedAt;
    }
  }
  return { copy, conflicts, saved };
}
function reviewFingerprint(
  s: State,
  j: GiftDiscoveryJob,
  selections: DiscoverySelection[],
) {
  return hashDiscovery([
    selections,
    j.candidates,
    selections.map((x) =>
      x.listId ? s.lists.find((l) => l.id === x.listId) : null,
    ),
  ]);
}
export function prepareDiscoveryReview(
  s: State,
  a: Actor,
  cfg: DiscoveryConfig,
  id: string,
  raw: unknown,
  now = new Date(),
) {
  const j = discoveryJob(s, a, cfg, id, now);
  if (j.status !== "complete")
    fail(409, "Wait for the search or price check to finish.");
  const selections = selectionsSchema.parse(raw);
  const { conflicts } = simulateSave(s, a, j, selections);
  const stale = selections.some((selection) =>
    j.candidates
      .find((c) => c.id === selection.candidateId)!
      .offers.some(
        (o) => now.getTime() - Date.parse(o.checkedAt) >= offerFreshnessMs,
      ),
  );
  j.review = undefined;
  if (stale) {
    j.requestedSelections = selections;
    j.status = "reviewing";
    j.startedAt = now.toISOString();
  } else
    j.review = {
      id: randomUUID(),
      selections,
      conflicts,
      preparedAt: now.toISOString(),
      fingerprint: reviewFingerprint(s, j, selections),
    };
  j.revision++;
  return j;
}
export function saveDiscoveryReview(
  s: State,
  a: Actor,
  cfg: DiscoveryConfig,
  id: string,
  raw: unknown,
  now = new Date(),
) {
  const j = discoveryJob(s, a, cfg, id, now);
  const { reviewId } = z.object({ reviewId: uuid }).parse(raw);
  const review = j.review;
  if (
    j.status !== "complete" ||
    !review ||
    review.id !== reviewId ||
    review.conflicts.length ||
    review.fingerprint !== reviewFingerprint(s, j, review.selections)
  )
    fail(409, "Review the current selection before adding it.");
  if (
    review.selections.some((selection) =>
      j.candidates
        .find((c) => c.id === selection.candidateId)!
        .offers.some(
          (o) => now.getTime() - Date.parse(o.checkedAt) >= offerFreshnessMs,
        ),
    )
  )
    fail(
      409,
      "Prices need another check. Return to your selection and review again.",
    );
  const { copy, conflicts, saved } = simulateSave(s, a, j, review.selections);
  if (conflicts.length)
    fail(
      409,
      "An item was added while you were reviewing. Return to your selection to check duplicates.",
    );
  const next = copy.giftDiscoveryJobs.find((x) => x.id === id)!;
  next.sourceFingerprint = source(copy, a, j.input.personId).fingerprint;
  next.saved = saved;
  next.review = undefined;
  next.revision++;
  Object.assign(s, copy);
  return { saved };
}
// Store only an operation identifier, never private response snapshots in replay records.
export function discoveryIdempotent<T>(
  s: State,
  a: Actor,
  key: string,
  operation: string,
  body: unknown,
  run: () => T,
): T | { replayed: true; jobId?: string } {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
    fail(400, "Refresh and try this action again.");
  const fingerprint = hashDiscovery([operation, body]);
  const prior = s.replays.find((r) => r.userId === a.id && r.key === key);
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      fail(409, "This action changed. Review it again.");
    return { replayed: true, ...(prior.result as { jobId?: string }) };
  }
  const result = run();
  const jobId = (result as { id?: string })?.id;
  s.replays.push({
    ...stamp(),
    userId: a.id,
    key,
    fingerprint,
    result: jobId ? { jobId } : {},
  });
  return result;
}
export function pruneDiscovery(
  s: State,
  cfg: DiscoveryConfig,
  now = new Date(),
) {
  for (const j of s.giftDiscoveryJobs) {
    let accessible = true;
    try {
      discoveryJob(s, { id: j.userId, name: "", email: "" }, cfg, j.id, now);
    } catch {
      accessible = false;
    }
    const stuck =
      j.startedAt &&
      ["running", "reviewing"].includes(j.status) &&
      now.getTime() - Date.parse(j.startedAt) > 240000;
    if (!accessible || stuck) {
      j.status = accessible ? "failed" : "cancelled";
      j.error = accessible
        ? "This search did not finish. No automatic paid retry was made."
        : "This search is no longer available.";
      for (const c of j.candidates) markDiscoveryMedia(s, c.image);
      j.candidates = [];
      j.review = undefined;
      j.requestedSelections = undefined;
    }
  }
  const expired = s.giftDiscoveryJobs.filter(
    (j) => Date.parse(j.expiresAt) <= now.getTime(),
  );
  for (const j of expired)
    for (const c of j.candidates) markDiscoveryMedia(s, c.image);
  s.giftDiscoveryJobs = s.giftDiscoveryJobs.filter(
    (j) => Date.parse(j.expiresAt) > now.getTime(),
  );
}
export function markDiscoveryMedia(s: State, image: string) {
  if (!image || s.items.some((i) => i.image === image)) return;
  const m = s.media.find((m) => image === `/api/v1/media/${m.id}`);
  if (m) m.deletedAt = new Date().toISOString();
}
