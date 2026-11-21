import type { Base } from "./model";
export interface SpendingSettings extends Base {
  userId: string;
  enabled: boolean;
  enabledSource?: "default";
  summaries: boolean;
}
export interface SpendingConnection extends Base {
  users: string[];
  status: "pending" | "active" | "ended";
  editing: string[];
  resumed: string[];
  rules: Record<string, string[]>;
}
export interface SpendingOccasion extends Base {
  ownerId: string;
  name: string;
  connectionId?: string;
}
export interface SpendingAllocation {
  recipientId: string;
  share: number;
  listId?: string | null;
  listName?: string;
  listOwnerNames?: string[];
  eventId?: string;
  eventName?: string;
}
export interface SpendingRecord extends Base {
  allocations?: SpendingAllocation[];
  contributionReturnId?: string;
  contributionId?: string;
  ownerId: string;
  title: string;
  recipientIds: string[];
  recipientNames: string[];
  listId?: string;
  listName?: string;
  listOwnerNames?: string[];
  eventName?: string;
  eventId?: string;
  occasionId?: string;
  reservationId?: string;
  quantity: number;
  amountCents: number | null;
  unitEstimateCents?: number | null;
  promisedCents?: number;
  date: string | null;
  planningYear: number;
  kind: "plan" | "purchase" | "refund" | "contribution";
  sourceId?: string;
  connectionId?: string;
  sharing: "private" | "rule" | "explicit";
  rule?: string;
  splits: number[];
  voided?: boolean;
  protected?: boolean;
  privacyRevoked?: boolean;
  history: Array<{
    actorId: string;
    at: string;
    description: string;
    changes?: Record<string, { before: unknown; after: unknown }>;
  }>;
}
export interface SpendingBudget extends Base {
  originalScope?: string;
  friendEntryId?: string;
  ownerId: string;
  connectionId?: string;
  scope: string;
  year: number | null;
  amountCents: number;
}
export interface SpendingView {
  settings: SpendingSettings;
  connection?: SpendingConnection;
  partnerName?: string;
  records: Array<
    SpendingRecord & {
      canEdit: boolean;
      canShare?: boolean;
      canAssignList?: boolean;
      payerName: string;
    }
  >;
  occasions: SpendingOccasion[];
  budgets: SpendingBudget[];
}
export interface SpendingFilter {
  shared?: boolean;
  person?: string;
  list?: string;
  event?: string;
  occasion?: string;
  year?: number;
}
export function recordAllocations(r: SpendingRecord): SpendingAllocation[] {
  return (
    r.allocations ??
    r.recipientIds.map((recipientId, i) => ({
      recipientId,
      share: r.splits[i],
      listId: r.listId,
      listName: r.listName,
      listOwnerNames: r.listOwnerNames,
      eventId: r.eventId,
      eventName: r.eventName,
    }))
  );
}
export function allocationMatches(a: SpendingAllocation, f: SpendingFilter) {
  return (
    (!f.person || a.recipientId === f.person) &&
    (!f.list || a.listId === f.list) &&
    (!f.event || a.eventId === f.event)
  );
}
export function scopedCents(r: SpendingRecord, f: SpendingFilter) {
  if (!f.person && !f.list && !f.event) return r.amountCents;
  if (r.amountCents === null) return null;
  const allocations = recordAllocations(r);
  const amounts = splitCents(
    r.amountCents,
    allocations.map((v) => v.share),
  );
  return allocations.reduce(
    (sum, value, index) =>
      sum + (allocationMatches(value, f) ? amounts[index] : 0),
    0,
  );
}
export function spendingMatches(r: SpendingRecord, f: SpendingFilter) {
  return (
    ((!f.person && !f.list && !f.event) ||
      recordAllocations(r).some((a) => allocationMatches(a, f))) &&
    (!f.occasion || r.occasionId === f.occasion) &&
    (!f.year ||
      (r.kind === "plan"
        ? r.planningYear === f.year
        : r.date?.startsWith(String(f.year))))
  );
}
export function allocatedCents(r: SpendingRecord, person?: string) {
  return scopedCents(r, { person });
}
export function splitCents(amountCents: number, shares: number[]) {
  const total = shares.reduce((a, b) => a + b, 0);
  if (!total) return shares.map(() => 0);
  const amounts = shares.map((v) => Math.floor((amountCents * v) / total));
  let remainder = amountCents - amounts.reduce((a, b) => a + b, 0);
  const order = shares
    .map((weight, index) => ({
      index,
      weight,
      fraction: (amountCents * weight) / total - amounts[index],
    }))
    .filter((v) => v.weight > 0)
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let n = 0; remainder > 0; n++, remainder--)
    amounts[order[n % order.length].index]++;
  return amounts;
}

export function spendingTotals(
  records: SpendingRecord[],
  person?: string,
  shared = false,
  authorizedRecords = records,
  scope: SpendingFilter = {},
) {
  let spent = 0,
    planned = 0,
    missing = 0,
    knownActual = 0,
    missingActual = 0,
    knownPlanned = 0,
    missingPlanned = 0;
  const rows = records.filter((r) => !r.voided);
  const internal = shared
    ? authorizedRecords.filter(
        (r) =>
          !r.contributionReturnId &&
          (r.kind === "contribution" || (r.kind === "plan" && r.sourceId)) &&
          authorizedRecords.some(
            (p) =>
              p.reservationId === r.reservationId &&
              p.ownerId !== r.ownerId &&
              (p.kind === "purchase" || (p.kind === "plan" && !p.sourceId)),
          ),
      )
    : [];
  for (const r of rows) {
    if (
      shared &&
      r.contributionReturnId &&
      internal.some((c) => c.sourceId === r.contributionId)
    )
      continue;
    if (
      internal.includes(r) ||
      (r.kind === "refund" && internal.some((c) => c.sourceId === r.sourceId))
    )
      continue;
    const restored = internal
      .filter((c) => c.reservationId === r.reservationId)
      .reduce((n, c) => {
        const returns = new Map(
          authorizedRecords
            .filter(
              (v) =>
                v.contributionId === c.sourceId &&
                v.contributionReturnId &&
                !v.voided,
            )
            .map((v) => [v.contributionReturnId, v.amountCents ?? 0]),
        );
        return (
          n +
          (c.amountCents ?? 0) -
          [...returns.values()].reduce((sum, value) => sum + value, 0)
        );
      }, 0);
    const estimate =
      r.kind === "plan" && !r.sourceId && r.amountCents !== null
        ? {
            ...r,
            amountCents: Math.max(
              0,
              r.amountCents - (r.promisedCents ?? 0) + restored,
            ),
          }
        : r;
    const amount = scopedCents(estimate, { ...scope, person });
    if (amount === null) {
      missing++;
      if (r.kind === "plan") missingPlanned++;
      else missingActual++;
      continue;
    }
    if (r.kind === "plan") {
      planned += amount;
      knownPlanned++;
    } else {
      spent += r.kind === "refund" ? -amount : amount;
      knownActual++;
    }
  }
  return {
    spent,
    planned,
    missing,
    knownActual,
    missingActual,
    knownPlanned,
    missingPlanned,
  };
}

export interface SpendingHistoryView {
  unassignedCount: number;
  records: SpendingView["records"];
  total: number;
  giftCount: number;
  summary: ReturnType<typeof spendingTotals>;
  years: number[];
  recipients: Array<{ id: string; name: string }>;
  lists: Array<{ id: string; name: string; ownerNames?: string[] }>;
  events: Array<{ id: string; name: string }>;
}

/** Compare choices, not JSONB key order or saved display metadata. */
export function ideaAllocationChoices(item: {
  recipientIds: string[];
  spendingListId?: string | null;
  spendingAllocations?: SpendingAllocation[];
}): SpendingAllocation[] {
  return (
    item.spendingAllocations ??
    item.recipientIds.map((recipientId) => ({
      recipientId,
      share: 1,
      listId: item.spendingListId ?? null,
    }))
  );
}
export function sameAllocationChoices(
  a: SpendingAllocation[],
  b: SpendingAllocation[],
) {
  return (
    a.length === b.length &&
    a.every((entry, index) => {
      const other = b[index];
      return (
        entry.recipientId === other.recipientId &&
        entry.share === other.share &&
        (entry.listId ?? null) === (other.listId ?? null)
      );
    })
  );
}
