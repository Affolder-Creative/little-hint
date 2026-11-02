import { spendingMatches, spendingTotals } from "../shared/spending";
import { z } from "zod";
import type { Actor, State } from "../shared/model";
import type {
  SpendingRecord,
  SpendingConnection,
  SpendingView,
} from "../shared/spending";
import {
  command,
  fail,
  stamp,
  personVisible,
  itemVisible,
  recipient,
} from "./domain";
const id = z.string().uuid();
const cents = z.number().int().min(0).max(100000000);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
  );
const year = z.number().int().min(1900).max(2200);
const name = (s: State, user: string) =>
  s.people.find((p) => p.userId === user)?.name ?? "Former member";
export function spendingSettings(s: State, a: Actor) {
  return (
    s.spendingSettings.find((p) => p.userId === a.id) ?? {
      ...stamp(),
      userId: a.id,
      enabled: false,
      summaries: true,
    }
  );
}
function connection(s: State, a: Actor) {
  return s.spendingConnections.find(
    (c) => c.users.includes(a.id) && c.status !== "ended",
  );
}
function active(s: State, c?: SpendingConnection): c is SpendingConnection {
  return (
    !!c &&
    c.status === "active" &&
    c.users.every(
      (u) =>
        c.resumed.includes(u) &&
        s.spendingSettings.some((p) => p.userId === u && p.enabled),
    )
  );
}
function protectedRecord(s: State, r: SpendingRecord, c: SpendingConnection) {
  const original = s.reservations.find((v) => v.id === r.reservationId);
  const item = s.items.find((i) => i.id === original?.itemId);
  return (
    r.protected ||
    !!original?.exchangeId ||
    [...r.recipientIds, ...(item?.recipientIds ?? [])].some((id) =>
      s.people.some(
        (p) => p.id === id && !!p.userId && c.users.includes(p.userId),
      ),
    )
  );
}
function shared(s: State, r: SpendingRecord, c?: SpendingConnection) {
  return (
    active(s, c) &&
    r.connectionId === c.id &&
    r.sharing !== "private" &&
    !protectedRecord(s, r, c) &&
    (r.sharing === "explicit" ||
      (!!r.rule && !!c.rules[r.ownerId]?.includes(r.rule)))
  );
}
function editable(s: State, a: Actor, r: SpendingRecord) {
  const c = connection(s, a);
  return (
    r.ownerId === a.id ||
    (shared(s, r, c) && c!.users.every((u) => c!.editing.includes(u)))
  );
}
function revision(r: { revision: number }, raw: any) {
  if (r.revision !== raw.revision)
    fail(
      409,
      "This changed since you opened it. Refresh and review the latest record.",
    );
}
function touch(r: SpendingRecord, a: Actor, description: string) {
  r.revision++;
  r.history.push({ actorId: a.id, at: new Date().toISOString(), description });
}
function autoShare(s: State, a: Actor, r: SpendingRecord) {
  const c = connection(s, a);
  if (!active(s, c) || protectedRecord(s, r, c)) return;
  if (r.date && r.date.slice(0, 10) < c.createdAt.slice(0, 10)) return;
  const rules = [
    ...r.recipientIds.map((p) => "person:" + p),
    ...(r.eventId ? ["event:" + r.eventId] : []),
    ...(r.occasionId ? ["occasion:" + r.occasionId] : []),
  ];
  const match = rules.find((v) => c.rules[a.id]?.includes(v));
  if (match) {
    r.connectionId = c.id;
    r.sharing = "rule";
    r.rule = match;
  }
}
function snapshot(s: State, a: Actor, reservationId: string): SpendingRecord {
  const r =
    s.reservations.find((r) => r.id === reservationId && r.buyerId === a.id) ??
    fail(404, "Reservation not found.");
  const i = s.items.find((i) => i.id === r.itemId && itemVisible(s, a, i));
  const l = s.lists.find((l) => l.id === i?.listId);
  const recipients = i?.recipientIds ?? [];
  return {
    ...stamp(),
    ownerId: a.id,
    title: r.titleSnapshot,
    recipientIds: recipients,
    recipientNames: recipients.map(
      (id) => s.people.find((p) => p.id === id)?.name ?? "Recipient",
    ),
    listId: l?.id,
    listName: l?.name,
    eventName: s.groupEvents.find((e) => e.id === l?.groupEventId)?.name,
    eventId: l?.groupEventId,
    reservationId: r.id,
    quantity: r.quantity - r.purchased,
    unitEstimateCents: i?.priceCents ?? null,
    amountCents:
      i?.priceCents == null ? null : i.priceCents * (r.quantity - r.purchased),
    date: null,
    planningYear: new Date().getFullYear(),
    kind: "plan",
    splits: recipients.map(() => 1),
    sharing: "private",
    protected: !!r.exchangeId || (!i?.listId && i?.visibility === "private"),
    history: [],
  };
}
// Called only inside the domain transaction. Importing legacy status never invents cost or dates.
export function syncSpending(s: State, a: Actor) {
  if (!spendingSettings(s, a).enabled) return;
  for (const r of s.reservations.filter((r) => r.buyerId === a.id)) {
    let plan = s.spendingRecords.find(
      (p) =>
        p.reservationId === r.id &&
        p.kind === "plan" &&
        !p.sourceId &&
        p.ownerId === a.id,
    );
    if (!plan) {
      plan = snapshot(s, a, r.id);
      s.spendingRecords.push(plan);
    }
    const remaining = r.quantity - r.purchased;
    if (remaining !== plan.quantity) {
      plan.amountCents =
        plan.unitEstimateCents == null
          ? null
          : Math.round(plan.unitEstimateCents * remaining);
      plan.quantity = remaining;
      plan.revision++;
    }
    plan.voided = remaining === 0;
    const tracked = s.spendingRecords
      .filter(
        (p) => p.reservationId === r.id && p.kind === "purchase" && !p.voided,
      )
      .reduce((n, p) => n + p.quantity, 0);
    if (r.purchased > tracked)
      s.spendingRecords.push({
        ...plan,
        ...stamp(),
        kind: "purchase",
        quantity: r.purchased - tracked,
        amountCents: null,
        date: null,
        voided: false,
        sharing: "private",
        connectionId: undefined,
        history: [],
      });
  }
}
export function syncContributions(s: State) {
  for (const c of s.contributions) {
    const reservation = s.reservations.find((r) => r.id === c.reservationId);
    if (!reservation) continue;
    for (const owner of [c.userId, reservation.buyerId]) {
      const actor = { id: owner, name: "", email: "" };
      if (!spendingSettings(s, actor).enabled) continue;
      const receiving = owner === reservation.buyerId;
      let entry = s.spendingRecords.find(
        (r) => r.sourceId === c.id && r.ownerId === owner,
      );
      if (receiving && c.status !== "received") continue;
      if (!entry) {
        const source = snapshot(
          s,
          { ...actor, id: reservation.buyerId },
          reservation.id,
        );
        entry = {
          ...source,
          ...stamp(),
          ownerId: owner,
          sourceId: c.id,
          quantity: 0,
          amountCents: c.amountCents,
          history: [],
          sharing: "private",
        };
        s.spendingRecords.push(entry);
        if (c.createdAt >= spendingSettings(s, actor).createdAt)
          autoShare(s, actor, entry);
      }
      entry.kind = receiving
        ? "refund"
        : c.status === "pledged"
          ? "plan"
          : "contribution";
      entry.date = (receiving ? c.receivedAt : c.sentAt)?.slice(0, 10) ?? null;
      entry.amountCents = c.amountCents;
      entry.voided = c.status === "cancelled";
    }
  }
}

export function spendingView(s: State, a: Actor): SpendingView {
  const settings = spendingSettings(s, a);
  const c = connection(s, a);
  const allowed = settings.enabled
    ? s.spendingRecords.filter((r) => r.ownerId === a.id || shared(s, r, c))
    : [];
  const records = allowed.map((r) => ({
    ...r,
    connectionId: shared(s, r, c) ? r.connectionId : undefined,
    sharing: shared(s, r, c) ? r.sharing : ("private" as const),
    promisedCents:
      r.kind === "plan" && !r.sourceId
        ? s.contributions
            .filter(
              (c) =>
                c.reservationId === r.reservationId && c.status !== "cancelled",
            )
            .reduce((n, c) => n + c.amountCents, 0)
        : undefined,
    canEdit:
      !s.contributions.some((c) => c.id === r.sourceId) && editable(s, a, r),
    payerName: name(s, r.ownerId),
    history: r.history.map((h) => ({
      ...h,
      description: `${name(s, h.actorId)}: ${h.description}`,
    })),
  }));
  return {
    settings,
    connection: c
      ? { ...c, rules: { [a.id]: c.rules[a.id] ?? [] } }
      : undefined,
    partnerName: c
      ? name(
          s,
          c.users.find((u) => u !== a.id)!,
        )
      : undefined,
    records,
    occasions: s.spendingOccasions.filter(
      (o) => o.ownerId === a.id || (active(s, c) && o.connectionId === c.id),
    ),
    budgets: s.spendingBudgets.filter((b) =>
      b.connectionId
        ? active(s, c) && b.connectionId === c.id
        : b.ownerId === a.id,
    ),
  };
}
export function spendingCommand(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
): unknown {
  const b = raw as any;
  if (action === "spending.settings") {
    const p = z
      .object({ enabled: z.boolean(), summaries: z.boolean() })
      .parse(b);
    let setting = s.spendingSettings.find((v) => v.userId === a.id);
    if (!setting) {
      setting = { ...stamp(), userId: a.id, ...p };
      s.spendingSettings.push(setting);
    } else Object.assign(setting, p, { revision: setting.revision + 1 });
    if (!p.enabled) {
      const c = connection(s, a);
      if (c) {
        c.resumed = c.resumed.filter((u) => u !== a.id);
        c.editing = [];
        c.revision++;
      }
    }
    syncSpending(s, a);
    syncContributions(s);
    return { ok: true };
  }
  if (!spendingSettings(s, a).enabled)
    fail(403, "Turn on spending tracking first.");
  if (action === "spending.connect") {
    const p = z.object({ userId: id }).parse(b);
    const person = s.people.find(
      (p2) => p2.userId === p.userId && personVisible(s, a, p2),
    );
    if (!person || p.userId === a.id) fail(404, "Person not available.");
    if (
      connection(s, a) ||
      s.spendingConnections.some(
        (c) => c.status !== "ended" && c.users.includes(p.userId),
      )
    )
      fail(409, "One of you already has a spending connection.");
    s.spendingConnections.push({
      ...stamp(),
      users: [a.id, p.userId],
      status: "pending",
      editing: [],
      resumed: [a.id],
      rules: {},
    });
    return { ok: true };
  }
  if (action === "spending.connection") {
    const p = z
      .object({
        id,
        revision: z.number(),
        operation: z.enum([
          "accept",
          "disconnect",
          "resume",
          "edit-on",
          "edit-off",
          "rules",
        ]),
        rules: z.array(z.string()).optional(),
      })
      .parse(b);
    const c = connection(s, a);
    if (!c || c.id !== p.id) fail(404, "Connection not found.");
    revision(c, p);
    if (p.operation === "accept") {
      if (c.status !== "pending" || c.users[1] !== a.id)
        fail(403, "Only the invited person can accept.");
      c.status = "active";
      c.resumed = [...c.users];
    }
    if (p.operation === "disconnect") {
      c.status = "ended";
      c.editing = [];
      c.resumed = [];
    }
    if (p.operation === "resume" && !c.resumed.includes(a.id))
      c.resumed.push(a.id);
    if (p.operation === "edit-on" && !c.editing.includes(a.id))
      c.editing.push(a.id);
    if (p.operation === "edit-off") c.editing = [];
    if (p.operation === "rules") {
      const allowed = [
        ...s.people
          .filter((v) => personVisible(s, a, v))
          .map((v) => "person:" + v.id),
        ...s.groupEvents
          .filter((e) =>
            s.groups.some(
              (g) => g.id === e.groupId && g.memberIds.includes(a.id),
            ),
          )
          .map((e) => "event:" + e.id),
        ...s.spendingOccasions
          .filter((o) => o.ownerId === a.id || o.connectionId === c.id)
          .map((o) => "occasion:" + o.id),
      ];
      if (p.rules?.some((r) => !allowed.includes(r)))
        fail(400, "Choose an available person or occasion.");
      c.rules[a.id] = p.rules ?? [];
    }
    c.revision++;
    return { ok: true };
  }
  if (action === "spending.occasion") {
    const p = z
      .object({
        name: z.string().trim().min(1).max(150),
        shared: z.boolean().default(false),
      })
      .parse(b);
    const c = connection(s, a);
    if (p.shared && !active(s, c))
      fail(403, "Connect your spending partner first.");
    const o = {
      ...stamp(),
      ownerId: a.id,
      name: p.name,
      connectionId: p.shared ? c!.id : undefined,
    };
    s.spendingOccasions.push(o);
    return o;
  }
  if (action === "spending.budget") {
    const p = z
      .object({
        scope: z.string().max(250),
        year: year.nullable(),
        amountCents: cents,
        shared: z.boolean(),
      })
      .parse(b);
    const c = connection(s, a);
    if (p.shared && !active(s, c))
      fail(403, "Connect your spending partner first.");
    const valid = [
      "all",
      ...s.people
        .filter((v) => personVisible(s, a, v))
        .map((v) => "person:" + v.id),
      ...s.lists
        .filter(
          (l) =>
            l.ownerIds.some((id) =>
              s.people.some(
                (q) =>
                  q.id === id &&
                  (q.userId === a.id || q.guardians.includes(a.id)),
              ),
            ) ||
            l.groupIds.some((id) =>
              s.groups.some((g) => g.id === id && g.memberIds.includes(a.id)),
            ),
        )
        .map((l) => "list:" + l.id),
      ...s.groupEvents
        .filter((e) =>
          s.groups.some(
            (g) => g.id === e.groupId && g.memberIds.includes(a.id),
          ),
        )
        .map((e) => "event:" + e.id),
      ...spendingView(s, a).occasions.map((o) => "occasion:" + o.id),
    ];
    if (p.scope.split("|").some((k) => !valid.includes(k)))
      fail(400, "Choose an available budget scope.");
    const budget = s.spendingBudgets.find(
      (v) =>
        v.scope === p.scope &&
        v.year === p.year &&
        (p.shared
          ? v.connectionId === c!.id
          : !v.connectionId && v.ownerId === a.id),
    );
    if (budget) {
      revision(budget, b);
      budget.amountCents = p.amountCents;
      budget.revision++;
    } else
      s.spendingBudgets.push({
        ...stamp(),
        ownerId: a.id,
        connectionId: p.shared ? c!.id : undefined,
        scope: p.scope,
        year: p.year,
        amountCents: p.amountCents,
      });
    return { ok: true };
  }
  if (action === "spending.purchase") {
    const p = z
      .object({
        reservationId: id.optional(),
        title: z.string().trim().min(1).max(200),
        recipientIds: z.array(id).min(1).max(20),
        amountCents: cents.nullable(),
        date: date.nullable(),
        quantity: z.number().int().min(1).max(999).default(1),
        occasionId: id.optional(),
        eventId: id.optional(),
        payerId: id.optional(),
        keepPrivate: z.boolean().default(false),
        planRevision: z.number().int().optional(),
      })
      .parse(b);
    const c = connection(s, a);
    let base: SpendingRecord | undefined;
    let reservation = p.reservationId
      ? s.reservations.find((r) => r.id === p.reservationId)
      : undefined;
    if (p.reservationId) {
      base = s.spendingRecords.find(
        (r) =>
          r.reservationId === p.reservationId &&
          r.kind === "plan" &&
          !r.sourceId &&
          r.ownerId === reservation?.buyerId,
      );
      if (!reservation || !base || !editable(s, a, base))
        fail(404, "Reservation not available.");
      revision(base, { revision: p.planRevision });
      if (p.quantity > reservation.quantity - reservation.purchased)
        fail(409, "Refresh to see how many still need buying.");
    }
    if (
      p.recipientIds.some(
        (id) => !s.people.some((q) => q.id === id && personVisible(s, a, q)),
      )
    )
      fail(400, "Choose available recipients.");
    if (
      p.occasionId &&
      !spendingView(s, a).occasions.some((o) => o.id === p.occasionId)
    )
      fail(404, "Occasion not available.");
    if (
      p.eventId &&
      !s.groupEvents.some(
        (e) =>
          e.id === p.eventId &&
          s.groups.some(
            (g) => g.id === e.groupId && g.memberIds.includes(a.id),
          ),
      )
    )
      fail(404, "Event not available.");
    const payer = p.payerId ?? a.id;
    if (p.keepPrivate && payer !== a.id)
      fail(403, "Purchases recorded for your partner must stay shared.");
    if (
      payer !== a.id &&
      !(
        active(s, c) &&
        c.users.includes(payer) &&
        c.users.every((u) => c.editing.includes(u)) &&
        base &&
        shared(s, base, c)
      )
    )
      fail(403, "You cannot record a purchase for that payer.");
    if (reservation) {
      const item = s.items.find((i) => i.id === reservation.itemId);
      if (!item || !itemVisible(s, a, item) || recipient(s, a, item))
        fail(403, "This gift is not available for purchase.");
      // The delegated operation retains source authorization; only buyer identity changes for this command.
      command(s, { ...a, id: reservation.buyerId }, "reservations.update", {
        id: reservation.id,
        revision: reservation.revision,
        quantity: reservation.quantity,
        purchased: reservation.purchased + p.quantity,
      });
    }
    const r: SpendingRecord = {
      ...stamp(),
      ownerId: payer,
      title: base?.title ?? p.title,
      recipientIds: base?.recipientIds ?? p.recipientIds,
      recipientNames:
        base?.recipientNames ??
        p.recipientIds.map((id) => s.people.find((q) => q.id === id)!.name),
      quantity: p.quantity,
      amountCents: p.amountCents,
      date: p.date,
      planningYear: new Date().getFullYear(),
      kind: "purchase",
      splits: base?.splits ?? p.recipientIds.map(() => 1),
      sharing: "private",
      history: [
        {
          actorId: a.id,
          at: new Date().toISOString(),
          description: "Recorded purchase",
        },
      ],
      reservationId: p.reservationId,
      listId: base?.listId,
      listName: base?.listName,
      eventName:
        base?.eventName ?? s.groupEvents.find((e) => e.id === p.eventId)?.name,
      eventId: base?.eventId ?? p.eventId,
      occasionId: p.occasionId ?? base?.occasionId,
      protected: base?.protected,
    };
    if (!p.keepPrivate && base && shared(s, base, c)) {
      r.connectionId = c!.id;
      r.sharing = base.ownerId === payer ? base.sharing : "explicit";
      r.rule = base.ownerId === payer ? base.rule : undefined;
    } else if (!base && !p.keepPrivate) autoShare(s, a, r);
    s.spendingRecords.push(r);
    if (reservation) syncSpending(s, { ...a, id: reservation.buyerId });
    return { id: r.id };
  }
  const r = s.spendingRecords.find((r) => r.id === b.id);
  if (!r || !editable(s, a, r)) fail(404, "Spending record not found.");
  revision(r, b);
  if (action === "spending.record") {
    if (s.contributions.some((c) => c.id === r.sourceId))
      fail(400, "Update contributions from Buying.");
    const p = z
      .object({
        amountCents: cents.nullable(),
        date: date.nullable(),
        planningYear: year,
        splits: z.array(z.number().min(0).max(1000000)).min(1),
      })
      .parse(b);
    if (
      p.splits.length !== r.recipientIds.length ||
      !p.splits.some((v) => v > 0)
    )
      fail(400, "Enter a split for every recipient.");
    const before = r.amountCents;
    const changes = Object.fromEntries(
      Object.keys(p)
        .filter(
          (key) =>
            JSON.stringify((r as any)[key]) !== JSON.stringify((p as any)[key]),
        )
        .map((key) => [
          key,
          { before: (r as any)[key], after: (p as any)[key] },
        ]),
    );
    if (r.kind === "plan" && !r.sourceId)
      r.unitEstimateCents =
        p.amountCents === null ? null : p.amountCents / Math.max(1, r.quantity);
    Object.assign(r, p);
    touch(
      r,
      a,
      `Changed amount from ${before === null ? "unknown" : (before / 100).toFixed(2)} to ${p.amountCents === null ? "unknown" : (p.amountCents / 100).toFixed(2)}`,
    );
    r.history[r.history.length - 1].changes = changes;
    return { ok: true };
  }
  if (action === "spending.share") {
    if (r.ownerId !== a.id) fail(403, "Only the payer can change sharing.");
    const p = z.object({ shared: z.boolean() }).parse(b);
    const c = connection(s, a);
    if (p.shared && (!active(s, c) || protectedRecord(s, r, c)))
      fail(403, "This gift cannot be shared.");
    r.connectionId = p.shared ? c!.id : undefined;
    r.sharing = p.shared ? "explicit" : "private";
    if (!p.shared)
      for (const child of s.spendingRecords.filter(
        (v) => v.sourceId === r.id,
      )) {
        child.connectionId = undefined;
        child.sharing = "private";
        touch(child, a, "Kept related record private");
      }
    touch(r, a, p.shared ? "Shared spending record" : "Kept record private");
    return { ok: true };
  }
  if (action === "spending.refund") {
    const p = z.object({ amountCents: cents, date }).parse(b);
    if (r.kind !== "purchase")
      fail(400, "Choose a purchase to record a refund.");
    const refund: SpendingRecord = {
      ...r,
      ...stamp(),
      kind: "refund",
      sourceId: r.id,
      amountCents: p.amountCents,
      date: p.date,
      quantity: 0,
      history: [
        {
          actorId: a.id,
          at: new Date().toISOString(),
          description: "Recorded refund",
        },
      ],
    };
    s.spendingRecords.push(refund);
    return { ok: true };
  }
  fail(404, "Spending action not found.");
}

export function registerSpendingReservation(s: State, a: Actor, id: string) {
  syncSpending(s, a);
  const r = s.spendingRecords.find(
    (p) =>
      p.reservationId === id &&
      p.kind === "plan" &&
      !p.sourceId &&
      p.ownerId === a.id,
  );
  if (r) autoShare(s, a, r);
}

/** Authorize the complete ledger before classifying transfers or applying time filters. */
export function spendingHistory(s: State, a: Actor, raw: unknown) {
  const q = z
    .object({
      shared: z.enum(["true", "false"]).optional(),
      person: id.optional(),
      list: id.optional(),
      event: id.optional(),
      occasion: id.optional(),
      year: z.coerce.number().int().min(1900).max(2200).optional(),
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .parse(raw);
  const view = spendingView(s, a);
  const isShared = q.shared === "true";
  const ledger = view.records.filter(
    (r) =>
      !r.voided &&
      (isShared
        ? !!view.connection &&
          r.connectionId === view.connection.id &&
          r.sharing !== "private"
        : r.ownerId === a.id),
  );
  const rows = ledger
    .filter((r) => spendingMatches(r, { ...q, shared: isShared }))
    .sort(
      (a, b) =>
        (b.date ?? b.createdAt).localeCompare(a.date ?? a.createdAt) ||
        a.id.localeCompare(b.id),
    );
  return {
    records: rows.slice((q.page - 1) * 30, q.page * 30),
    total: rows.length,
    summary: spendingTotals(rows, q.person, isShared, ledger),
    years: [
      ...new Set([
        new Date().getFullYear(),
        new Date().getFullYear() + 1,
        ...ledger.map((r) =>
          r.date ? Number(r.date.slice(0, 4)) : r.planningYear,
        ),
      ]),
    ],
    recipients: [
      ...new Map(
        ledger.flatMap((r) =>
          r.recipientIds.map(
            (id, i) => [id, { id, name: r.recipientNames[i] }] as const,
          ),
        ),
      ).values(),
    ],
    lists: [
      ...new Map(
        ledger
          .filter((r) => r.listId)
          .map((r) => [
            r.listId!,
            { id: r.listId!, name: r.listName ?? "Previous wish list" },
          ]),
      ).values(),
    ],
    events: [
      ...new Map(
        ledger
          .filter((r) => r.eventId)
          .map((r) => [
            r.eventId!,
            { id: r.eventId!, name: r.eventName ?? "Previous event" },
          ]),
      ).values(),
    ],
  };
}
