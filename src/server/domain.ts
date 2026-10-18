import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  dateHasElapsed,
  listIsArchived,
  validCalendarDate,
  validTimeZone,
} from "../shared/list-dates";
import type {
  Actor,
  Base,
  State,
  Person,
  Group,
  List,
  Item,
  Reservation,
  GiftView,
  Preferences,
  World,
  Notice,
  Exchange,
  GiftSummary,
} from "../shared/model";
import { matchExchange as solveExchange } from "./exchange";
function matchExchange(...args: Parameters<typeof solveExchange>) {
  try {
    return solveExchange(...args);
  } catch {
    fail(
      400,
      "These restrictions cannot produce a balanced draw. Add participants, reduce recipients per giver, or relax household and pair exclusions.",
    );
  }
}
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new DomainError(status, message);
}
export const stamp = (): Base => ({
  id: randomUUID(),
  revision: 1,
  createdAt: new Date().toISOString(),
});
const touch = (r: Base) => {
  r.revision++;
};
export const normalizedEmail = (s: string) => s.trim().toLowerCase();
const text = z.string().trim().min(1).max(160);
const id = z.string().uuid();
const ids = z
  .array(id)
  .max(100)
  .refine(
    (v) => new Set(v).size === v.length,
    "Duplicate selections are not allowed.",
  );
const revision = z.number().int().positive();
const listDates = {
  archiveAfter: z
    .string()
    .refine(validCalendarDate, "Choose a valid archive date.")
    .nullable()
    .optional(),
  revealAfter: z
    .string()
    .refine(validCalendarDate, "Choose a valid reveal date.")
    .nullable()
    .optional(),
  timeZone: z
    .string()
    .max(100)
    .refine(validTimeZone, "Choose a valid timezone.")
    .optional(),
  revealExchangeGivers: z.boolean().optional(),
};
export const controllers = (p: Person) =>
  [p.userId, ...p.guardians].filter((v): v is string => !!v);
export const controls = (s: State, a: Actor, id: string) =>
  !!s.people.find((p) => p.id === id && controllers(p).includes(a.id));
const ownIds = (s: State, a: Actor) =>
  s.people.filter((p) => controllers(p).includes(a.id)).map((p) => p.id);
const member = (g: Group, a: Actor) => g.memberIds.includes(a.id);
const groupAccess = (s: State, a: Actor, groupId: string) =>
  !!s.groups.find((g) => g.id === groupId && member(g, a));
export const isAdmin = (s: State, a: Actor) =>
  s.people.some((p) => p.userId === a.id && p.admin);
const ownedGroup = (s: State, a: Actor, id: string) =>
  s.groups.find((g) => g.id === id && g.ownerId === a.id) ??
  fail(404, "Group not found.");
const personVisible = (s: State, a: Actor, p: Person) =>
  controllers(p).includes(a.id) ||
  s.groups.some(
    (g) => member(g, a) && controllers(p).some((u) => g.memberIds.includes(u)),
  );
const checkRecipients = (s: State, a: Actor, rs: string[]) => {
  if (
    !rs.length ||
    rs.some(
      (id) => !s.people.some((p) => p.id === id && personVisible(s, a, p)),
    )
  )
    fail(400, "Choose an available recipient.");
};
const checkGroups = (s: State, a: Actor, gs: string[]) => {
  if (gs.some((g) => !groupAccess(s, a, g))) fail(404, "Group not found.");
};
export const recipient = (s: State, a: Actor, i: Item) =>
  i.recipientIds.some((p) => controls(s, a, p));
export const listVisible = (s: State, a: Actor, l: List) =>
  l.ownerIds.some((p) => controls(s, a, p)) ||
  l.groupIds.some((g) => groupAccess(s, a, g));
export function itemVisible(s: State, a: Actor, i: Item): boolean {
  if (i.listId) {
    const l = s.lists.find((l) => l.id === i.listId);
    return !!l && listVisible(s, a, l);
  }
  if (i.creatorId === a.id) return true;
  if (i.visibility === "private") return false;
  if (recipient(s, a, i)) return i.visibility === "visible";
  return i.groupIds.some((g) => groupAccess(s, a, g));
}
const canEdit = (s: State, a: Actor, i: Item) =>
  i.listId
    ? !!s.lists.find(
        (l) => l.id === i.listId && l.ownerIds.some((p) => controls(s, a, p)),
      )
    : i.creatorId === a.id;
const getItem = (s: State, a: Actor, id: string) =>
  s.items.find((i) => i.id === id && itemVisible(s, a, i)) ??
  fail(404, "Gift not found.");
const archived = (s: State, i: Item) =>
  i.archived || !!s.lists.find((l) => l.id === i.listId && listIsArchived(l));
const name = (s: State, userId: string) =>
  s.people.find((p) => p.userId === userId)?.name ?? "Former member";
const mode = (s: State, i: Item) =>
  s.lists.find((l) => l.id === i.listId)?.mode ?? "surprise";
export function archiveDueLists(s: State) {
  for (const list of s.lists) {
    if (!list.archived && listIsArchived(list)) {
      list.archived = true;
      touch(list);
    }
  }
}

export function giftSummary(s: State, a: Actor, listId: string): GiftSummary {
  const list =
    s.lists.find(
      (l) => l.id === listId && l.ownerIds.some((p) => controls(s, a, p)),
    ) ?? fail(404, "List not found.");
  if (!dateHasElapsed(list.revealAfter, list.timeZone))
    fail(409, "Gift details are not available before this list's reveal date.");
  return {
    listId,
    gifts: s.reservations.flatMap((r) => {
      const item = s.items.find(
        (i) => i.id === r.itemId && i.listId === listId,
      );
      if (
        !item ||
        r.purchased < 1 ||
        (r.exchangeId && !list.revealExchangeGivers)
      )
        return [];
      return [
        {
          id: r.id,
          itemId: item.id,
          title: item.title,
          purchased: r.purchased,
          buyerName: r.former
            ? "Former member"
            : r.exchangeId && r.giverId
              ? (s.people.find((p) => p.id === r.giverId)?.name ??
                "Former member")
              : name(s, r.buyerId),
          exchange: !!r.exchangeId,
          contributors: s.contributions.flatMap((c) =>
            !r.exchangeId &&
            c.reservationId === r.id &&
            (c.status === "sent" || c.status === "received")
              ? [{ id: c.id, name: name(s, c.userId), status: c.status }]
              : [],
          ),
        },
      ];
    }),
  };
}
export function giftView(s: State, a: Actor, i: Item): GiftView {
  const { creatorId, ...fields } = i;
  const own = recipient(s, a, i);
  const view: GiftView = {
    ...fields,
    archived: archived(s, i),
    recipientNames: i.recipientIds.map(
      (id) => s.people.find((p) => p.id === id)?.name ?? "Recipient",
    ),
    canEdit: canEdit(s, a, i),
    isRecipient: own,
    mode: mode(s, i),
  };
  if (!i.listId) view.creatorName = name(s, creatorId);
  if (!own || view.mode === "transparent") {
    const rs = s.reservations.filter(
      (r) => r.itemId === i.id && r.quantity > 0,
    );
    view.reserved = rs.reduce((n, r) => n + r.quantity, 0);
    view.available = Math.max(0, i.quantity - view.reserved);
    view.purchased = rs.reduce(
      (n, r) => n + (r.exchangeId && r.buyerId !== a.id ? 0 : r.purchased),
      0,
    );
    view.reservations = rs.map((r) => ({
      id: r.id,
      buyerName:
        r.exchangeId && r.buyerId !== a.id
          ? "Exchange giver"
          : r.former
            ? "Former member"
            : name(s, r.buyerId),
      mine: r.buyerId === a.id,
      quantity: r.quantity,
      ...(!r.exchangeId || r.buyerId === a.id
        ? {
            purchased: r.purchased,
            reservedAt: r.createdAt,
            purchasedAt: r.purchasedAt,
          }
        : {}),
      exchange: !!r.exchangeId,
      ...(!own && !r.exchangeId
        ? {
            poolTargetCents: r.poolTargetCents,
            contributions: s.contributions
              .filter((c) => c.reservationId === r.id)
              .map((c) => ({ ...c })),
          }
        : {}),
    }));
  }
  if (!own)
    view.comments = s.comments
      .filter(
        (c) => c.itemId === i.id && (!c.giverId || controls(s, a, c.giverId)),
      )
      .map((c) => ({
        id: c.id,
        author: name(s, c.authorId),
        body: c.body,
        createdAt: c.createdAt,
      }));
  return view;
}
export function preferences(s: State, a: Actor): Preferences {
  return (
    s.preferences.find((p) => p.userId === a.id) ?? {
      ...stamp(),
      userId: a.id,
      email: true,
      recipientUpdates: false,
      telegram: false,
      sms: false,
      events: [
        "invitation",
        "access",
        "exchange",
        "reservation",
        "purchase",
        "contribution",
      ],
    }
  );
}
export function noticeAllowed(s: State, n: Notice): boolean {
  if (n.invitationId) {
    const inv = s.invitations.find((i) => i.id === n.invitationId);
    return (
      !!inv &&
      !inv.revoked &&
      !inv.acceptedBy &&
      Date.parse(inv.expiresAt) > Date.now() &&
      !!s.groups.find((g) => g.id === inv.groupId)
    );
  }
  const p = s.people.find((p) => p.userId === n.userId);
  if (!p) return false;
  const a = { id: n.userId, email: "", name: p.name };
  if (n.itemId) {
    const i = s.items.find((i) => i.id === n.itemId);
    if (!i || !itemVisible(s, a, i)) return false;
    if (
      recipient(s, a, i) &&
      (mode(s, i) === "surprise" ||
        !preferences(s, a).recipientUpdates ||
        n.event === "discussion" ||
        n.event === "contribution")
    )
      return false;
  }
  if (n.exchangeId) {
    const e = s.exchanges.find((e) => e.id === n.exchangeId);
    if (
      !e ||
      e.status !== "drawn" ||
      !groupAccess(s, a, e.groupId) ||
      !e.participantIds.some((p) => controls(s, a, p))
    )
      return false;
  }
  if (n.invitationId) {
    const inv = s.invitations.find((i) => i.id === n.invitationId);
    if (
      !inv ||
      inv.revoked ||
      inv.acceptedBy ||
      Date.parse(inv.expiresAt) < Date.now()
    )
      return false;
  }
  return true;
}
function notify(
  s: State,
  event: Notice["event"],
  userIds: string[],
  refs: Partial<Notice> = {},
) {
  for (const userId of new Set(userIds)) {
    const n: Notice = {
      ...stamp(),
      userId,
      event,
      status: "pending",
      attempts: 0,
      delivered: [],
      ...refs,
    };
    if (noticeAllowed(s, n)) s.notices.push(n);
  }
}
function notifyGift(s: State, a: Actor, i: Item, event: Notice["event"]) {
  const users = s.people
    .filter((p) => p.userId && p.userId !== a.id)
    .map((p) => p.userId!);
  notify(s, event, users, { itemId: i.id });
}
export function world(s: State, a: Actor): World {
  const people = s.people.filter((p) => personVisible(s, a, p));
  const ps = ownIds(s, a);
  return {
    me: {
      ...a,
      name: s.people.find((p) => p.userId === a.id)?.name ?? a.name,
      admin: isAdmin(s, a),
    },
    people,
    groups: s.groups.filter((g) => member(g, a)),
    invitations: s.invitations.filter(
      (i) =>
        !i.revoked &&
        !i.acceptedBy &&
        Date.parse(i.expiresAt) > Date.now() &&
        (normalizedEmail(i.email) === normalizedEmail(a.email) ||
          !!s.groups.find((g) => g.id === i.groupId && g.ownerId === a.id)),
    ),
    lists: s.lists
      .filter(
        (l) =>
          listVisible(s, a, l) ||
          l.pendingOwnerIds.some((id) => ps.includes(id)),
      )
      .map((l) => ({
        ...l,
        archived: listIsArchived(l),
        canEdit: l.ownerIds.some((p) => ps.includes(p)),
        revealAvailable: dateHasElapsed(l.revealAfter, l.timeZone),
      })),
    items: s.items
      .filter((i) => itemVisible(s, a, i))
      .map((i) => giftView(s, a, i)),
    contributionHistory: s.contributions.flatMap((contribution) => {
      const r = s.reservations.find((r) => r.id === contribution.reservationId);
      if (!r || (contribution.userId !== a.id && r.buyerId !== a.id)) return [];
      return [
        {
          contribution: { ...contribution },
          title: r.titleSnapshot,
          purchaser: r.buyerId === a.id,
        },
      ];
    }),
    buying: s.reservations
      .filter((r) => r.buyerId === a.id)
      .map((r) => ({
        ...r,
        item: s.items.some((i) => i.id === r.itemId && itemVisible(s, a, i))
          ? giftView(
              s,
              a,
              s.items.find((i) => i.id === r.itemId)!,
            )
          : undefined,
      })),
    exchanges: s.exchanges
      .filter((e) => groupAccess(s, a, e.groupId))
      .map(({ assignments, ...e }) => ({
        ...e,
        canManage: e.organizerId === a.id,
        myAssignments:
          e.status === "drawn"
            ? assignments.filter(([giver]) => ps.includes(giver))
            : [],
        delivery: {
          sent: s.notices.filter(
            (n) =>
              e.organizerId === a.id &&
              n.exchangeId === e.id &&
              n.status === "sent",
          ).length,
          pending: s.notices.filter(
            (n) =>
              e.organizerId === a.id &&
              n.exchangeId === e.id &&
              n.status === "pending",
          ).length,
          failed: s.notices.filter(
            (n) =>
              e.organizerId === a.id &&
              n.exchangeId === e.id &&
              n.status === "failed",
          ).length,
        },
      })),
    preferences: preferences(s, a),
    imports: s.imports.filter((j) => j.userId === a.id),
    links: s.links
      .filter(
        (l) =>
          !l.consumed &&
          Date.parse(l.expiresAt) > Date.now() &&
          (l.userId === a.id || l.email === normalizedEmail(a.email)),
      )
      .map(({ tokenHash, ...l }) => l),
  };
}
function checkRevision(r: Base, v: number) {
  if (r.revision !== v)
    fail(409, "This changed since you opened it. Refresh and try again.");
}
export function activateAccount(s: State, a: Actor) {
  let p = s.people.find((p) => p.userId === a.id);
  if (p) return p;
  const grant = s.invitations.find(
    (i) =>
      normalizedEmail(i.email) === normalizedEmail(a.email) &&
      !i.revoked &&
      !i.acceptedBy &&
      Date.parse(i.expiresAt) > Date.now(),
  );
  if (!grant) fail(403, "An active invitation is required.");
  p = {
    ...stamp(),
    name: a.name || a.email.split("@")[0],
    userId: a.id,
    guardians: [],
    household: "",
    admin: !!grant.bootstrap,
  };
  s.people.push(p);
  if (grant.bootstrap) {
    grant.acceptedBy = a.id;
    touch(grant);
  }
  return p;
}
export function signupAllowed(s: State, email: string) {
  return s.invitations.some(
    (i) =>
      normalizedEmail(i.email) === normalizedEmail(email) &&
      !i.revoked &&
      !i.acceptedBy &&
      Date.parse(i.expiresAt) > Date.now(),
  );
}
function reconcileAccess(s: State) {
  for (const r of s.reservations) {
    const i = s.items.find((i) => i.id === r.itemId);
    if (
      r.quantity &&
      !r.former &&
      i &&
      !itemVisible(s, { id: r.buyerId, email: "", name: "" }, i)
    ) {
      r.quantity = r.purchased;
      r.former = true;
      touch(r);
      notify(s, "access", [r.buyerId]);
      for (const c of s.contributions.filter((c) => c.reservationId === r.id)) {
        if (c.status === "pledged") c.status = "cancelled";
        notify(s, "access", [c.userId]);
        touch(c);
      }
    }
  }
}
function checkImage(s: State, a: Actor, url: string) {
  if (!url) return;
  const id = url.split("/").pop();
  if (
    !s.media.some(
      (m) =>
        m.id === id &&
        (m.userId === a.id ||
          s.items.some((i) => i.image === url && itemVisible(s, a, i))),
    )
  )
    fail(404, "Image not found.");
}
const itemInput = z.object({
  title: text,
  description: z.string().max(5000).default(""),
  url: z
    .string()
    .max(2048)
    .default("")
    .refine((v) => !v || /^https?:\/\//.test(v), "Use an HTTP or HTTPS URL."),
  image: z
    .string()
    .max(2048)
    .default("")
    .refine(
      (v) => !v || v.startsWith("/api/v1/media/"),
      "Choose an imported or uploaded image.",
    ),
  priceCents: z.number().int().min(0).max(100000000).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  quantity: z.number().int().min(1).max(999).default(1),
});
export function command(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
): unknown {
  const b = raw as Record<string, unknown>;
  switch (action) {
    case "groups.create": {
      const p = z.object({ name: text }).parse(b);
      const g: Group = {
        ...stamp(),
        name: p.name,
        ownerId: a.id,
        memberIds: [a.id],
      };
      s.groups.push(g);
      return g;
    }
    case "groups.invite": {
      const p = z.object({ groupId: id, email: z.email() }).parse(b);
      ownedGroup(s, a, p.groupId);
      const inv = {
        ...stamp(),
        email: normalizedEmail(p.email),
        groupId: p.groupId,
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      };
      s.invitations.push(inv);
      s.notices.push({
        ...stamp(),
        userId: `invitation:${inv.id}`,
        event: "invitation",
        invitationId: inv.id,
        status: "pending",
        attempts: 0,
        delivered: [],
      });
      return inv;
    }
    case "invitations.accept": {
      const p = z.object({ id }).parse(b);
      const inv =
        s.invitations.find(
          (i) =>
            i.id === p.id &&
            i.email === normalizedEmail(a.email) &&
            !i.revoked &&
            !i.acceptedBy &&
            Date.parse(i.expiresAt) > Date.now(),
        ) ?? fail(404, "Invitation not found.");
      const g =
        s.groups.find((g) => g.id === inv.groupId) ??
        fail(404, "Group not found.");
      g.memberIds = [...new Set([...g.memberIds, a.id])];
      inv.acceptedBy = a.id;
      touch(inv);
      touch(g);
      return { ok: true };
    }
    case "invitations.revoke": {
      const p = z.object({ id }).parse(b);
      const inv =
        s.invitations.find((i) => i.id === p.id) ??
        fail(404, "Invitation not found.");
      ownedGroup(s, a, inv.groupId!);
      inv.revoked = true;
      touch(inv);
      return { ok: true };
    }
    case "groups.remove": {
      const p = z.object({ groupId: id, userId: z.string() }).parse(b);
      const g =
        s.groups.find((g) => g.id === p.groupId && member(g, a)) ??
        fail(404, "Group not found.");
      if (p.userId !== a.id && g.ownerId !== a.id)
        fail(403, "Only the owner can remove another member.");
      if (g.ownerId === p.userId)
        fail(409, "Transfer ownership before leaving.");
      g.memberIds = g.memberIds.filter((u) => u !== p.userId);
      touch(g);
      reconcileAccess(s);
      return { ok: true };
    }
    case "groups.transfer": {
      const p = z
        .object({ groupId: id, userId: z.string(), email: z.email() })
        .parse(b);
      const g = ownedGroup(s, a, p.groupId);
      if (!g.memberIds.includes(p.userId) || p.userId === a.id)
        fail(400, "Choose another member.");
      s.links.push({
        ...stamp(),
        kind: "ownership",
        requestedBy: a.id,
        userId: p.userId,
        targetId: g.id,
        email: normalizedEmail(p.email),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        consumed: false,
      });
      return { ok: true };
    }
    case "links.accept": {
      const p = z.object({ id }).parse(b);
      const l =
        s.links.find(
          (l) =>
            l.id === p.id &&
            !l.consumed &&
            Date.parse(l.expiresAt) > Date.now(),
        ) ?? fail(404, "Request not found.");
      if (l.kind === "ownership") {
        if (l.userId !== a.id || l.email !== normalizedEmail(a.email))
          fail(404, "Request not found.");
        const g =
          s.groups.find(
            (g) =>
              g.id === l.targetId &&
              g.ownerId === l.requestedBy &&
              member(g, a),
          ) ?? fail(404, "Group not found.");
        g.ownerId = a.id;
        touch(g);
      } else if (l.kind === "profile") {
        if (l.email !== normalizedEmail(a.email))
          fail(404, "Request not found.");
        const p =
          s.people.find(
            (p) =>
              p.id === l.targetId &&
              !p.userId &&
              p.guardians.includes(l.userId),
          ) ?? fail(404, "Profile not found.");
        p.userId = a.id;
        p.guardians = [];
        touch(p);
      } else fail(400, "Use Telegram to link this account.");
      l.consumed = true;
      touch(l);
      return { ok: true };
    }
    case "people.create": {
      const p = z
        .object({ name: text, household: z.string().max(100).default("") })
        .parse(b);
      const person: Person = { ...stamp(), ...p, guardians: [a.id] };
      s.people.push(person);
      return person;
    }
    case "people.update": {
      const p = z
        .object({ id, revision, name: text, household: z.string().max(100) })
        .parse(b);
      const person =
        s.people.find((q) => q.id === p.id && controls(s, a, q.id)) ??
        fail(404, "Profile not found.");
      checkRevision(person, p.revision);
      person.name = p.name;
      person.household = p.household;
      touch(person);
      return person;
    }
    case "people.link": {
      const p = z.object({ id, email: z.email() }).parse(b);
      const person =
        s.people.find(
          (q) => q.id === p.id && !q.userId && q.guardians.includes(a.id),
        ) ?? fail(404, "Managed profile not found.");
      s.links.push({
        ...stamp(),
        kind: "profile",
        userId: a.id,
        targetId: person.id,
        email: normalizedEmail(p.email),
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        consumed: false,
      });
      return { ok: true };
    }
    case "lists.create": {
      const p = z
        .object({
          ...listDates,
          name: text,
          ownerIds: ids.min(1),
          groupIds: ids,
          mode: z.enum(["surprise", "transparent"]),
          description: z.string().max(2000).default(""),
        })
        .parse(b);
      checkRecipients(s, a, p.ownerIds);
      checkGroups(s, a, p.groupIds);
      const mine = p.ownerIds.filter((id) => controls(s, a, id));
      if (!mine.length) fail(403, "Create a list for a profile you manage.");
      const pending = p.ownerIds.filter((id) => !mine.includes(id));
      if (p.revealExchangeGivers && !p.revealAfter)
        fail(400, "Choose a reveal date to reveal exchange givers.");
      if (pending.length && p.groupIds.length)
        fail(400, "Create the joint list privately until everyone accepts.");
      const l: List = {
        ...stamp(),
        ...p,
        ownerIds: mine,
        pendingOwnerIds: pending,
        modeLocked: p.groupIds.length > 0,
        archived: false,
        timeZone: p.timeZone ?? "UTC",
        revealExchangeGivers: p.revealExchangeGivers ?? false,
      };
      s.lists.push(l);
      return l;
    }
    case "lists.accept": {
      const p = z.object({ id }).parse(b);
      const l =
        s.lists.find(
          (l) =>
            l.id === p.id && l.pendingOwnerIds.some((id) => controls(s, a, id)),
        ) ?? fail(404, "List invitation not found.");
      const mine = l.pendingOwnerIds.filter((id) => controls(s, a, id));
      l.ownerIds.push(...mine);
      l.pendingOwnerIds = l.pendingOwnerIds.filter((id) => !mine.includes(id));
      for (const i of s.items.filter((i) => i.listId === l.id)) {
        i.recipientIds = [...l.ownerIds];
        touch(i);
      }
      touch(l);
      return { ok: true };
    }
    case "lists.update": {
      const p = z
        .object({
          ...listDates,
          id,
          revision,
          name: text,
          groupIds: ids,
          mode: z.enum(["surprise", "transparent"]),
          archived: z.boolean(),
          description: z.string().max(2000),
        })
        .parse(b);
      const l =
        s.lists.find(
          (l) => l.id === p.id && l.ownerIds.some((id) => controls(s, a, id)),
        ) ?? fail(404, "List not found.");
      checkRevision(l, p.revision);
      checkGroups(s, a, p.groupIds);
      if (l.modeLocked && p.mode !== l.mode)
        fail(409, "Privacy mode is locked after sharing.");
      if (l.pendingOwnerIds.length && p.groupIds.length)
        fail(409, "Wait for joint owners to accept before sharing.");
      const next = { ...l, ...p };
      if (l.modeLocked) {
        if (p.timeZone !== undefined && p.timeZone !== (l.timeZone ?? "UTC"))
          fail(409, "The timezone is locked after sharing.");
        if (
          p.revealExchangeGivers !== undefined &&
          p.revealExchangeGivers !== !!l.revealExchangeGivers
        )
          fail(409, "Exchange gift privacy is locked after sharing.");
        if (
          (next.revealAfter ?? null) !== (l.revealAfter ?? null) &&
          (!l.revealAfter ||
            !next.revealAfter ||
            next.revealAfter < l.revealAfter ||
            dateHasElapsed(l.revealAfter, l.timeZone))
        )
          fail(
            409,
            "After sharing, an upcoming reveal date can only move later. Lists shared without a date keep gift details hidden.",
          );
      }
      if (next.revealExchangeGivers && !next.revealAfter)
        fail(400, "Choose a reveal date to reveal exchange givers.");
      if (listIsArchived(l) && !p.archived) p.archiveAfter = null;
      Object.assign(l, p, {
        modeLocked: l.modeLocked || p.groupIds.length > 0,
      });
      touch(l);
      reconcileAccess(s);
      return l;
    }
    case "items.create": {
      const p = itemInput
        .extend({
          listId: id.optional(),
          recipientIds: ids.default([]),
          groupIds: ids.default([]),
          visibility: z
            .enum(["private", "hidden", "visible"])
            .default("private"),
          allowDuplicate: z.boolean().default(false),
          importId: id.optional(),
        })
        .parse(b);
      checkImage(s, a, p.image);
      let recipients = p.recipientIds;
      if (p.listId) {
        const l =
          s.lists.find(
            (l) =>
              l.id === p.listId &&
              !listIsArchived(l) &&
              l.ownerIds.some((id) => controls(s, a, id)),
          ) ?? fail(404, "List not found.");
        recipients = l.ownerIds;
      } else {
        checkRecipients(s, a, recipients);
        if (recipients.some((id) => controls(s, a, id)))
          fail(400, "Use a wish list for your own gifts.");
        checkGroups(s, a, p.groupIds);
        if (p.visibility !== "private" && !p.groupIds.length)
          fail(400, "Select a group to share this idea.");
      }
      const duplicate = s.items.find(
        (i) =>
          itemVisible(s, a, i) &&
          !archived(s, i) &&
          i.recipientIds.some((r) => recipients.includes(r)) &&
          ((p.url && canonicalUrl(i.url) === canonicalUrl(p.url)) ||
            i.title.toLowerCase() === p.title.toLowerCase()),
      );
      if (duplicate && !p.allowDuplicate)
        return { duplicate: giftView(s, a, duplicate) };
      const { allowDuplicate, importId, ...fields } = p;
      const imported = s.imports.find(
        (j) =>
          j.id === importId &&
          j.userId === a.id &&
          j.status === "complete" &&
          canonicalUrl(j.url) === canonicalUrl(p.url),
      );
      const i: Item = {
        ...stamp(),
        ...fields,
        recipientIds: [...recipients],
        creatorId: a.id,
        archived: false,
        currency: "USD",
        ...(imported
          ? {
              importedAt: imported.result?.importedAt,
              source: imported.result?.source,
            }
          : {}),
      };
      s.items.push(i);
      return giftView(s, a, i);
    }
    case "items.update": {
      const p = itemInput
        .extend({
          id,
          revision,
          archived: z.boolean(),
          visibility: z.enum(["private", "hidden", "visible"]),
          groupIds: ids,
        })
        .parse(b);
      const i = getItem(s, a, p.id);
      if (!canEdit(s, a, i)) fail(403, "You cannot edit this gift.");
      checkRevision(i, p.revision);
      checkImage(s, a, p.image);
      if (!i.listId) {
        checkGroups(s, a, p.groupIds);
        if (p.visibility !== "private" && !p.groupIds.length)
          fail(400, "Select a group to share this idea.");
      }
      Object.assign(i, p);
      touch(i);
      reconcileAccess(s);
      notify(
        s,
        "access",
        s.reservations
          .filter((r) => r.itemId === i.id && r.buyerId !== a.id)
          .map((r) => r.buyerId),
        { itemId: i.id },
      );
      return giftView(s, a, i);
    }
    case "reservations.create": {
      const p = z
        .object({
          itemId: id,
          quantity: z.number().int().min(1).max(999),
          exchangeId: id.optional(),
          giverId: id.optional(),
        })
        .parse(b);
      const i = getItem(s, a, p.itemId);
      if (recipient(s, a, i))
        fail(403, "You cannot reserve a gift for yourself.");
      if (archived(s, i)) fail(409, "This gift is archived.");
      if (p.exchangeId) {
        const e =
          s.exchanges.find(
            (e) =>
              e.id === p.exchangeId &&
              e.status === "drawn" &&
              groupAccess(s, a, e.groupId),
          ) ?? fail(404, "Exchange not found.");
        if (
          !p.giverId ||
          !controls(s, a, p.giverId) ||
          !e.assignments.some(
            ([g, r]) => g === p.giverId && i.recipientIds.includes(r),
          ) ||
          mode(s, i) !== "surprise"
        )
          fail(403, "Choose a gift for one of your assigned recipients.");
      }
      const used = s.reservations
        .filter((r) => r.itemId === i.id)
        .reduce((n, r) => n + r.quantity, 0);
      if (used + p.quantity > i.quantity)
        fail(
          409,
          "Someone has already reserved that quantity. Refresh to see what remains.",
        );
      const r: Reservation = {
        ...stamp(),
        ...p,
        buyerId: a.id,
        purchased: 0,
        former: false,
        titleSnapshot: i.title,
      };
      s.reservations.push(r);
      if (!r.exchangeId) notifyGift(s, a, i, "reservation");
      return { id: r.id };
    }
    case "reservations.update": {
      const p = z
        .object({
          id,
          revision,
          quantity: z.number().int().min(0).max(999),
          purchased: z.number().int().min(0).max(999),
          poolTargetCents: z
            .number()
            .int()
            .positive()
            .max(100000000)
            .optional(),
        })
        .parse(b);
      const r =
        s.reservations.find((r) => r.id === p.id && r.buyerId === a.id) ??
        fail(404, "Reservation not found.");
      checkRevision(r, p.revision);
      if (p.quantity > r.quantity || p.purchased > p.quantity)
        fail(
          400,
          "Reserve additional units separately; purchased units cannot exceed the reservation.",
        );
      const i = s.items.find((i) => i.id === r.itemId)!;
      if (
        p.purchased > r.purchased &&
        (!itemVisible(s, a, i) || recipient(s, a, i))
      )
        fail(403, "This gift is no longer available for new purchases.");
      if (
        p.poolTargetCents &&
        (r.exchangeId || !itemVisible(s, a, i) || archived(s, i))
      )
        fail(400, "A contribution pool is not available for this reservation.");
      const pledged = s.contributions
        .filter((c) => c.reservationId === r.id && c.status !== "cancelled")
        .reduce((n, c) => n + c.amountCents, 0);
      if (p.poolTargetCents && p.poolTargetCents < pledged)
        fail(409, "The target cannot be below existing contributions.");
      const increased = p.purchased > r.purchased;
      if (increased) r.purchasedAt = new Date().toISOString();
      Object.assign(r, p);
      touch(r);
      if (!r.quantity)
        for (const c of s.contributions.filter(
          (c) => c.reservationId === r.id && c.status === "pledged",
        )) {
          c.status = "cancelled";
          touch(c);
        }
      if (!r.exchangeId)
        notifyGift(s, a, i, increased ? "purchase" : "reservation");
      return r;
    }
    case "contributions.create": {
      const p = z
        .object({
          reservationId: id,
          amountCents: z.number().int().positive().max(100000000),
        })
        .parse(b);
      const r =
        s.reservations.find(
          (r) =>
            r.id === p.reservationId &&
            r.quantity > 0 &&
            !r.exchangeId &&
            r.poolTargetCents,
        ) ?? fail(404, "Pool not found.");
      const i = getItem(s, a, r.itemId);
      if (recipient(s, a, i) || archived(s, i) || r.buyerId === a.id)
        fail(403, "You cannot contribute to this pool.");
      const total = s.contributions
        .filter((c) => c.reservationId === r.id && c.status !== "cancelled")
        .reduce((n, c) => n + c.amountCents, 0);
      if (total + p.amountCents > r.poolTargetCents!)
        fail(409, "That exceeds the remaining contribution target.");
      const c = { ...stamp(), ...p, userId: a.id, status: "pledged" as const };
      s.contributions.push(c);
      notify(s, "contribution", [r.buyerId], { itemId: i.id });
      return c;
    }
    case "contributions.update": {
      const p = z
        .object({
          id,
          revision,
          status: z.enum(["sent", "received", "cancelled"]),
        })
        .parse(b);
      const c =
        s.contributions.find((c) => c.id === p.id) ??
        fail(404, "Contribution not found.");
      const r = s.reservations.find((r) => r.id === c.reservationId)!;
      if (p.status === "received" ? r.buyerId !== a.id : c.userId !== a.id)
        fail(404, "Contribution not found.");
      checkRevision(c, p.revision);
      if (
        (p.status === "received" && c.status !== "sent") ||
        (p.status === "sent" && c.status !== "pledged") ||
        (p.status === "cancelled" && c.status !== "pledged")
      )
        fail(409, "That contribution transition is not available.");
      c.status = p.status;
      touch(c);
      notify(s, "contribution", [r.buyerId, c.userId], { itemId: r.itemId });
      return c;
    }
    case "comments.create": {
      const p = z
        .object({ itemId: id, body: z.string().trim().min(1).max(4000) })
        .parse(b);
      const i = getItem(s, a, p.itemId);
      if (recipient(s, a, i) || archived(s, i))
        fail(403, "Private discussion is unavailable.");
      const exchangeReservation = s.reservations.find(
        (r) =>
          r.itemId === i.id &&
          r.buyerId === a.id &&
          r.exchangeId &&
          r.quantity > 0,
      );
      s.comments.push({
        ...stamp(),
        ...p,
        authorId: a.id,
        giverId: exchangeReservation?.giverId,
      });
      if (!exchangeReservation) notifyGift(s, a, i, "discussion");
      return { ok: true };
    }
    case "exchanges.create": {
      const p = z
        .object({
          name: text,
          groupId: id,
          participantIds: ids.min(2),
          count: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          excludeHousehold: z.boolean(),
          exclusions: z
            .array(z.tuple([id, id]))
            .max(10000)
            .default([]),
          previousId: id.optional(),
        })
        .parse(b);
      if (!groupAccess(s, a, p.groupId)) fail(404, "Group not found.");
      const g = s.groups.find((g) => g.id === p.groupId)!;
      if (
        p.participantIds.some(
          (id) =>
            !s.people.some(
              (q) =>
                q.id === id &&
                controllers(q).some((u) => g.memberIds.includes(u)),
            ),
        )
      )
        fail(400, "Every participant must belong to the group.");
      if (
        p.previousId &&
        !s.exchanges.some(
          (e) => e.id === p.previousId && e.groupId === p.groupId,
        )
      )
        fail(404, "Previous exchange not found.");
      const e: Exchange = {
        ...stamp(),
        ...p,
        organizerId: a.id,
        status: "draft",
        assignments: [],
      };
      matchExchange(e, s.people);
      s.exchanges.push(e);
      return { id: e.id };
    }
    case "exchanges.draw": {
      const p = z.object({ id, revision }).parse(b);
      const e =
        s.exchanges.find(
          (e) =>
            e.id === p.id &&
            e.organizerId === a.id &&
            groupAccess(s, a, e.groupId),
        ) ?? fail(404, "Exchange not found.");
      checkRevision(e, p.revision);
      if (e.status !== "draft")
        fail(409, "This exchange has already been drawn or cancelled.");
      const g = s.groups.find((g) => g.id === e.groupId)!;
      if (
        e.participantIds.some(
          (id) =>
            !s.people.some(
              (p) =>
                p.id === id &&
                controllers(p).some((u) => g.memberIds.includes(u)),
            ),
        )
      )
        fail(409, "A participant has left the group. Create a new exchange.");
      if (
        e.participantIds.some(
          (p) =>
            !s.lists.some(
              (l) =>
                !l.archived &&
                l.mode === "surprise" &&
                l.ownerIds.includes(p) &&
                l.groupIds.includes(e.groupId),
            ),
        )
      )
        fail(
          400,
          "Each participant needs a Surprise list shared with this group.",
        );
      e.assignments = matchExchange(
        e,
        s.people,
        s.exchanges.find((p) => p.id === e.previousId)?.assignments,
      );
      e.status = "drawn";
      e.drawnAt = new Date().toISOString();
      touch(e);
      notify(
        s,
        "exchange",
        e.participantIds.flatMap((id) =>
          controllers(s.people.find((p) => p.id === id)!),
        ),
        { exchangeId: e.id },
      );
      return { ok: true };
    }
    case "exchanges.cancel": {
      const p = z.object({ id, revision }).parse(b);
      const e =
        s.exchanges.find(
          (e) =>
            e.id === p.id &&
            e.organizerId === a.id &&
            groupAccess(s, a, e.groupId),
        ) ?? fail(404, "Exchange not found.");
      checkRevision(e, p.revision);
      e.status = "cancelled";
      touch(e);
      return { ok: true };
    }
    case "preferences.update": {
      const p = z
        .object({
          email: z.boolean(),
          recipientUpdates: z.boolean().default(false),
          telegram: z.boolean(),
          sms: z.boolean(),
          events: z
            .array(
              z.enum([
                "invitation",
                "reservation",
                "purchase",
                "discussion",
                "contribution",
                "exchange",
                "access",
              ]),
            )
            .max(7),
        })
        .parse(b);
      const prefs = preferences(s, a);
      if (p.sms && (!prefs.phoneVerified || prefs.smsOptOut))
        fail(400, "Verify your phone and opt in before enabling SMS.");
      if (p.telegram && !prefs.chatId)
        fail(400, "Link Telegram before enabling notifications.");
      Object.assign(prefs, p);
      touch(prefs);
      if (!s.preferences.some((x) => x.id === prefs.id))
        s.preferences.push(prefs);
      return prefs;
    }
    case "imports.create": {
      const p = z.object({ url: z.url().max(2048) }).parse(b);
      if (!/^https?:\/\//.test(p.url))
        fail(400, "Use an HTTP or HTTPS product URL.");
      const j = {
        ...stamp(),
        userId: a.id,
        url: p.url,
        status: "pending" as const,
      };
      s.imports.push(j);
      return j;
    }
    default:
      fail(404, "Action not found.");
  }
}
export function canonicalUrl(value: string): string {
  try {
    const u = new URL(value);
    u.hash = "";
    for (const key of [...u.searchParams.keys()])
      if (/^(utm_|ref|tag$|fbclid|gclid)/i.test(key))
        u.searchParams.delete(key);
    const asin = u.hostname.match(/(^|\.)amazon\./)
      ? u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)
      : null;
    if (asin) return `amazon:${asin[1].toUpperCase()}`;
    return u.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}
export function idempotent(
  s: State,
  a: Actor,
  key: string,
  action: string,
  body: unknown,
): unknown {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
    fail(400, "A valid Idempotency-Key is required.");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([action, body]))
    .digest("hex");
  const prior = s.replays.find((r) => r.userId === a.id && r.key === key);
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      fail(409, "This request key was already used for another action.");
    return { ok: true, replayed: true };
  }
  const result = command(s, a, action, body);
  s.replays.push({ ...stamp(), userId: a.id, key, fingerprint, result });
  s.replays = s.replays.filter(
    (r) => Date.parse(r.createdAt) > Date.now() - 7 * 86400000,
  );
  return result;
}
