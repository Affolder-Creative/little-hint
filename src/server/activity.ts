import { z } from "zod";
import type {
  Actor,
  Item,
  Notice,
  State,
  NotificationView,
  NotificationPage,
  Mention,
} from "../shared/model";
import {
  controls,
  controllers,
  recipient,
  itemVisible,
  listVisible,
  preferences,
  stamp,
  fail,
} from "./domain";
import { defaultPushEvents, notificationTopics } from "../shared/notifications";
import { listIsArchived } from "../shared/list-dates";

const actor = (s: State, id: string): Actor => ({
  id,
  email: "",
  name: s.people.find((p) => p.userId === id)?.name ?? "Former member",
});
export const accountIds = (s: State) => [
  ...new Set(s.people.flatMap((p) => controllers(p))),
];
export const noteVisible = (s: State, a: Actor, item: Item, giverId?: string) =>
  itemVisible(s, a, item) &&
  !recipient(s, a, item) &&
  (!giverId || controls(s, a, giverId));
export function noteGiver(s: State, a: Actor, itemId: string) {
  return s.reservations.find(
    (r) =>
      r.itemId === itemId &&
      r.buyerId === a.id &&
      r.exchangeId &&
      r.quantity > 0,
  )?.giverId;
}
export function mentionCandidates(
  s: State,
  a: Actor,
  itemId: string,
  query = "",
) {
  const item = s.items.find((i) => i.id === itemId);
  if (
    !item ||
    !noteVisible(s, a, item) ||
    item.archived ||
    s.lists.some((l) => l.id === item.listId && listIsArchived(l))
  )
    fail(404, "Private notes are not available for this item.");
  const giverId = noteGiver(s, a, itemId);
  const people = s.people
    .filter(
      (p, index, people) =>
        !!p.userId &&
        people.findIndex((other) => other.userId === p.userId) === index,
    )
    .filter(
      (p) =>
        p.userId &&
        p.userId !== a.id &&
        noteVisible(s, actor(s, p.userId), item, giverId),
    )
    .filter((p) =>
      p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );
  return people
    .map((p) => ({
      userId: p.userId!,
      name: p.name,
      detail: people.some((other) => other.id !== p.id && other.name === p.name)
        ? `Profile ${p.id.slice(0, 8)}`
        : "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 20);
}
export function validateMentions(
  s: State,
  a: Actor,
  item: Item,
  body: string,
  mentions: Mention[],
) {
  const giverId = noteGiver(s, a, item.id);
  let end = 0;
  for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
    const person = s.people.find((p) => p.userId === m.userId);
    if (
      !person ||
      m.userId === a.id ||
      !noteVisible(s, actor(s, m.userId), item, giverId)
    )
      fail(
        409,
        "Someone you mentioned can no longer read this note. Remove their mention and try again.",
      );
    if (
      m.start < end ||
      m.end > body.length ||
      body.slice(m.start, m.end) !== `@${person.name}`
    )
      fail(400, "A mention changed. Select the person again before posting.");
    end = m.end;
  }
}
export function followsItem(s: State, userId: string, item: Item) {
  const list = s.lists.find((l) => l.id === item.listId);
  return (
    !!list &&
    s.follows.some(
      (f) =>
        f.userId === userId &&
        (f.target === "list"
          ? f.targetId === list.id
          : list.ownerIds.includes(f.targetId)),
    )
  );
}
export function watchesItem(s: State, userId: string, itemId: string) {
  const explicit = s.watches.find(
    (w) => w.userId === userId && w.itemId === itemId,
  );
  if (explicit) return explicit.watching;
  return (
    s.comments.some((c) => c.itemId === itemId && c.authorId === userId) ||
    s.reservations.some(
      (r) =>
        r.itemId === itemId &&
        !r.former &&
        r.quantity > 0 &&
        (r.buyerId === userId ||
          s.contributions.some(
            (c) =>
              c.reservationId === r.id &&
              c.userId === userId &&
              c.status !== "cancelled",
          )),
    )
  );
}
export function activityAllowed(s: State, n: Notice): boolean {
  const a = actor(s, n.userId);
  if (!accountIds(s).includes(a.id)) return false;
  if (n.invitationId) {
    const inv = s.invitations.find((i) => i.id === n.invitationId);
    // Account binding is established when the invitation is created, not inferred from a client ID.
    return (
      !!inv &&
      !inv.revoked &&
      !inv.acceptedBy &&
      Date.parse(inv.expiresAt) > Date.now() &&
      !!s.groups.find((g) => g.id === inv.groupId)
    );
  }
  if (n.linkId) {
    const link = s.links.find((l) => l.id === n.linkId);
    const group = s.groups.find((g) => g.id === link?.targetId);
    return (
      !!link &&
      link.kind === "ownership" &&
      link.userId === a.id &&
      !link.consumed &&
      Date.parse(link.expiresAt) > Date.now() &&
      !!group &&
      group.ownerId === link.requestedBy &&
      group.memberIds.includes(a.id)
    );
  }
  if (n.action === "ownership-request") {
    const list = s.lists.find((l) => l.id === n.listId);
    return !!list && list.pendingOwnerIds.some((id) => controls(s, a, id));
  }
  if (n.exchangeId) {
    const e = s.exchanges.find((e) => e.id === n.exchangeId);
    return (
      !!e &&
      (n.action === "cancelled"
        ? e.status === "cancelled"
        : e.status === "drawn") &&
      s.groups.some((g) => g.id === e.groupId && g.memberIds.includes(a.id)) &&
      e.participantIds.some((id) => controls(s, a, id))
    );
  }
  if (n.itemId) {
    const item = s.items.find((i) => i.id === n.itemId);
    if (!item || !itemVisible(s, a, item)) return false;
    if (n.event === "wishlist") return !!item.listId;
    if (n.commentId) {
      const comment = s.comments.find(
        (c) => c.id === n.commentId && c.itemId === item.id,
      );
      return !!comment && noteVisible(s, a, item, comment.giverId);
    }
    if (recipient(s, a, item)) {
      const list = s.lists.find((l) => l.id === item.listId);
      if (
        list?.mode !== "transparent" ||
        !preferences(s, a).recipientUpdates ||
        ["discussion", "mention", "contribution"].includes(n.event)
      )
        return false;
    }
    if (n.reservationId) {
      const r = s.reservations.find((r) => r.id === n.reservationId);
      if (!r || (r.exchangeId && r.buyerId !== a.id)) return false;
    }
  }
  return true;
}
export function emitActivity(
  s: State,
  event: Notice["event"],
  users: string[],
  refs: Partial<Notice> = {},
) {
  for (const userId of new Set(users)) {
    if (refs.actorId === userId && event !== "exchange") continue;
    const n: Notice = {
      ...stamp(),
      userId,
      event,
      inbox: true,
      status: "pending",
      attempts: 0,
      delivered: [],
      ...refs,
    };
    if (event === "wishlist") {
      const batch = s.notices.find(
        (x) =>
          x.inbox &&
          x.userId === userId &&
          x.event === "wishlist" &&
          x.listId === n.listId &&
          x.pushDueAt &&
          Date.parse(x.pushDueAt) > Date.now() &&
          !x.pushComplete,
      );
      n.pushDueAt =
        batch?.pushDueAt ?? new Date(Date.now() + 15 * 60_000).toISOString();
    }
    if (activityAllowed(s, n)) s.notices.push(n);
  }
}
export function emitGiftActivity(
  s: State,
  a: Actor,
  item: Item,
  event: Notice["event"],
  refs: Partial<Notice> = {},
) {
  const users = accountIds(s).filter(
    (userId) =>
      watchesItem(s, userId, item.id) ||
      (recipient(s, actor(s, userId), item) &&
        preferences(s, actor(s, userId)).recipientUpdates),
  );
  emitActivity(s, event, users, { itemId: item.id, actorId: a.id, ...refs });
}
export function topicEnabled(
  s: State,
  n: Notice,
  channel: "email" | "telegram" | "sms" | "push",
) {
  const p = preferences(s, actor(s, n.userId));
  return channel === "push"
    ? (p.pushEvents ?? defaultPushEvents).includes(n.event as any)
    : p[channel] && (p.channelEvents?.[channel] ?? p.events).includes(n.event);
}
function renderActivity(s: State, n: Notice): NotificationView {
  const who = n.actorId ? actor(s, n.actorId).name : "Someone";
  const item = s.items.find((i) => i.id === n.itemId);
  const list = s.lists.find((l) => l.id === n.listId);
  const messages: Record<string, string> = {
    mention: `${who} mentioned you in a private note`,
    discussion: `${who} added a private note`,
    wishlist: `${who} added an item to a wish list`,
    reservation: `${who} updated a reservation`,
    purchase: `${who} marked a gift as purchased`,
    invitation: "You have an invitation",
    exchange: "Names have been drawn",
    access: "Your gift plans have changed",
  };
  const actions: Record<string, string> = {
    pledged: `${who} offered to help pay for a gift`,
    sent: `${who} marked a contribution as sent`,
    received: `${who} marked a contribution as received`,
    cancelled:
      n.event === "exchange"
        ? "An exchange was cancelled"
        : `${who} cancelled a contribution`,
    funded: "A shared gift reached its contribution goal",
    "pool-cancelled": "A shared gift was cancelled",
    "ownership-request": "You have a shared ownership request",
    released: `${who} released a reservation`,
  };
  return {
    id: n.id,
    event: n.event,
    message:
      actions[n.action ?? ""] ?? messages[n.event] ?? "You have a gift update",
    context:
      item?.title ??
      list?.name ??
      (n.exchangeId
        ? s.exchanges.find((e) => e.id === n.exchangeId)?.name
        : undefined),
    href: n.invitationId
      ? `/invite/${n.invitationId}`
      : n.event === "invitation" && n.listId
        ? "/lists"
        : n.event === "invitation"
          ? "/settings?section=groups"
          : n.exchangeId
            ? `/exchanges#exchange-${n.exchangeId}`
            : item
              ? `/gift/${item.id}${n.commentId ? `#note-${n.commentId}` : ""}`
              : "/buying",
    createdAt: n.createdAt,
    readAt: n.readAt,
  };
}
export function inbox(
  s: State,
  a: Actor,
  options: { unread?: boolean; cursor?: string } = {},
): NotificationPage {
  const all = s.notices.filter(
    (n) => n.inbox && n.userId === a.id && activityAllowed(s, n),
  );
  const sorted = all
    .filter((n) => !options.unread || !n.readAt)
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    );
  const key = (n: Notice) => `${n.createdAt}|${n.id}`;
  const entries = sorted
    .filter((n) => !options.cursor || key(n) < options.cursor)
    .slice(0, 31);
  return {
    entries: entries.slice(0, 30).map((n) => renderActivity(s, n)),
    unreadCount: all.filter((n) => !n.readAt).length,
    ...(entries.length > 30 ? { nextCursor: key(entries[29]) } : {}),
  };
}
export function activityCommand(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
) {
  if (action === "notifications.read") {
    const p = z
      .object({
        ids: z.array(z.string().uuid()).max(100).optional(),
        through: z.iso.datetime().optional(),
        read: z.boolean(),
      })
      .parse(raw);
    if ((!p.ids && !p.through) || (p.through && !p.read))
      fail(400, "Choose the notifications to update.");
    for (const n of s.notices.filter(
      (n) =>
        n.inbox &&
        n.userId === a.id &&
        activityAllowed(s, n) &&
        (p.ids ? p.ids.includes(n.id) : n.createdAt <= p.through!),
    )) {
      n.readAt = p.read ? new Date().toISOString() : undefined;
      n.revision++;
    }
    return { unreadCount: inbox(s, a).unreadCount };
  }
  if (action === "follows.update") {
    const p = z
      .object({
        target: z.enum(["person", "list"]),
        targetId: z.string().uuid(),
        following: z.boolean(),
      })
      .parse(raw);
    if (p.following) {
      const visible =
        p.target === "list"
          ? s.lists.some((l) => l.id === p.targetId && listVisible(s, a, l))
          : s.people.some(
              (person) =>
                person.id === p.targetId &&
                (controls(s, a, person.id) ||
                  s.groups.some(
                    (g) =>
                      g.memberIds.includes(a.id) &&
                      controllers(person).some((id) =>
                        g.memberIds.includes(id),
                      ),
                  )),
            );
      if (!visible) fail(404, "This profile or wish list is not available.");
    }
    s.follows = s.follows.filter(
      (f) =>
        !(
          f.userId === a.id &&
          f.target === p.target &&
          f.targetId === p.targetId
        ),
    );
    if (p.following)
      s.follows.push({
        ...stamp(),
        userId: a.id,
        target: p.target,
        targetId: p.targetId,
      });
    return { ok: true };
  }
  if (action === "watches.update") {
    const p = z
      .object({ itemId: z.string().uuid(), watching: z.boolean() })
      .parse(raw);
    const item = s.items.find((i) => i.id === p.itemId);
    if (!item || !noteVisible(s, a, item))
      fail(404, "Private notes are not available for this item.");
    s.watches = s.watches.filter(
      (w) => !(w.userId === a.id && w.itemId === p.itemId),
    );
    s.watches.push({ ...stamp(), userId: a.id, ...p });
    return { ok: true };
  }
  fail(400, "Unknown notification action.");
}
export const topicIds = notificationTopics.map((t) => t.id);

export function notificationEntry(s: State, a: Actor, id: string) {
  const n = s.notices.find(
    (n) => n.id === id && n.inbox && n.userId === a.id && activityAllowed(s, n),
  );
  if (!n) fail(404, "This update is no longer available.");
  return renderActivity(s, n);
}
