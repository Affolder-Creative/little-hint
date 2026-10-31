import { effectiveConfig } from "./runtime-config";
import { unavailableChannels } from "./channel-availability";
import { z } from "zod";
import type {
  Actor,
  Item,
  Notice,
  State,
  NotificationView,
  NotificationPage,
  Mention,
  Follow,
  NotificationChannel,
  NotificationBatch,
  NotificationBatchView,
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
import {
  matchingFollows,
  resolveFollows,
  notificationChannels,
} from "../shared/follows";
import { wishlistCopy } from "../shared/wishlist-copy";
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
export function followVisible(
  s: State,
  a: Actor,
  f: Pick<Follow, "target" | "targetId">,
) {
  if (f.target === "list")
    return s.lists.some((l) => l.id === f.targetId && listVisible(s, a, l));
  if (f.target === "person")
    return s.people.some(
      (p) =>
        p.id === f.targetId &&
        (controllers(p).includes(a.id) ||
          s.groups.some(
            (g) =>
              g.memberIds.includes(a.id) &&
              controllers(p).some((id) => g.memberIds.includes(id)),
          )),
    );
  const groupId =
    f.target === "group"
      ? f.targetId
      : s.households.find((h) => h.id === f.targetId)?.groupId;
  return s.groups.some((g) => g.id === groupId && g.memberIds.includes(a.id));
}
export function wishlistFollowing(
  s: State,
  userId: string,
  item: Pick<Item, "listId">,
) {
  const list = s.lists.find((l) => l.id === item.listId);
  const a = actor(s, userId);
  const p = preferences(s, a);
  const defaults = notificationChannels.filter((c) =>
    c === "push"
      ? (p.pushEvents ?? defaultPushEvents).includes("wishlist")
      : (p.channelEvents?.[c] ?? p.events).includes("wishlist"),
  );
  return resolveFollows(
    list && listVisible(s, a, list)
      ? matchingFollows(s, s.follows, userId, list)
      : [],
    [...defaults],
  );
}
export function followsItem(s: State, userId: string, item: Item) {
  return wishlistFollowing(s, userId, item).following;
}
export function wishlistChannelEnabled(
  s: State,
  userId: string,
  item: Pick<Item, "listId">,
  channel: NotificationChannel,
) {
  const p = preferences(s, actor(s, userId));
  return (
    wishlistFollowing(s, userId, item).channels.includes(channel) &&
    (channel === "push" ||
      (p[channel] &&
        (channel !== "telegram" || !!p.chatId) &&
        (channel !== "sms" || (!!p.phone && p.phoneVerified && !p.smsOptOut))))
  );
}
export function wishlistEligible(
  s: State,
  n: Notice,
  channel: NotificationChannel,
) {
  const item = s.items.find((i) => i.id === n.itemId);
  return (
    !(channel === "telegram" || channel === "sms"
      ? n.suppressedChannels?.includes(channel)
      : false) &&
    !n.readAt &&
    activityAllowed(s, n) &&
    !!item &&
    !item.archived &&
    !s.lists.some((l) => l.id === item.listId && listIsArchived(l)) &&
    (!n.deliveryChannels || n.deliveryChannels.includes(channel)) &&
    wishlistChannelEnabled(s, n.userId, item, channel)
  );
}
export function wishlistMessage(s: State, notices: Notice[]) {
  const list = s.lists.find((l) => l.id === notices[0]?.listId);
  const owner =
    list?.ownerIds.length === 1
      ? s.people.find((p) => p.id === list.ownerIds[0])
      : undefined;
  const who =
    owner?.userId && notices.every((n) => n.actorId === owner.userId)
      ? owner.name
      : undefined;
  return wishlistCopy(
    list?.name ?? "Wish list",
    who,
    notices.map((n) => n.prioritySnapshot),
  );
}
export function batchNotices(s: State, batch: NotificationBatch) {
  return s.notices.filter(
    (n) =>
      n.batchId === batch.id &&
      n.userId === batch.userId &&
      n.listId === batch.listId &&
      batch.noticeIds.includes(n.id),
  );
}
export function notificationBatchEntry(
  s: State,
  a: Actor,
  id: string,
): NotificationBatchView {
  const batch = s.notificationBatches.find(
    (b) => b.id === id && b.userId === a.id,
  );
  const notices = batch
    ? batchNotices(s, batch).filter((n) => activityAllowed(s, n))
    : [];
  if (!batch || !notices.length)
    fail(404, "This update is no longer available.");
  return { ids: notices.map((n) => n.id), href: `/lists/${batch.listId}` };
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
    return (
      !!list &&
      !list.deletedAt &&
      list.pendingOwnerIds.some((id) => controls(s, a, id))
    );
  }
  if (n.exchangeId) {
    const e = s.exchanges.find((e) => e.id === n.exchangeId);
    return (
      !!e &&
      !e.deletedAt &&
      (n.action === "cancelled"
        ? e.status === "cancelled"
        : e.status === "drawn") &&
      s.groups.some((g) => g.id === e.groupId && g.memberIds.includes(a.id)) &&
      e.participantIds.some((id) => controls(s, a, id))
    );
  }
  if (n.groupEventId) {
    const event = s.groupEvents.find(
      (e) => e.id === n.groupEventId && !e.deletedAt,
    );
    return (
      !!event &&
      s.groups.some((g) => g.id === event.groupId && g.memberIds.includes(a.id))
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
      suppressedChannels: unavailableChannels(effectiveConfig()),
    };
    if (!activityAllowed(s, n)) continue;
    if (event === "wishlist" && n.listId) {
      const item = s.items.find((i) => i.id === n.itemId);
      if (!item || !followsItem(s, userId, item)) continue;
      let batch = s.notificationBatches.find(
        (b) =>
          b.userId === userId &&
          b.listId === n.listId &&
          Date.parse(b.dueAt) > Date.now() &&
          b.status === "pending",
      );
      if (!batch) {
        batch = {
          ...stamp(),
          userId,
          listId: n.listId,
          noticeIds: [],
          dueAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          status: "pending",
          deliveries: {},
        };
        s.notificationBatches.push(batch);
      }
      batch.noticeIds.push(n.id);
      batch.revision++;
      n.batchId = batch.id;
      n.prioritySnapshot = item.priority ?? null;
      n.deliveryChannels = notificationChannels.filter((c) =>
        wishlistChannelEnabled(s, userId, item, c),
      );
      n.pushDueAt = batch.dueAt;
    }
    s.notices.push(n);
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
    wishlist: wishlistMessage(s, [n]),
    reservation: `${who} updated a reservation`,
    purchase: `${who} marked a gift as purchased`,
    invitation: "You have an invitation",
    exchange: "Names have been drawn",
    access: "Your gift plans have changed",
  };
  const actions: Record<string, string> = {
    "spending-guideline-updated": "The spending guideline has changed",
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
      (n.groupEventId
        ? s.groupEvents.find((e) => e.id === n.groupEventId)?.name
        : undefined) ??
      (n.exchangeId
        ? s.exchanges.find((e) => e.id === n.exchangeId)?.name
        : undefined),
    href: n.invitationId
      ? `/invite/${n.invitationId}`
      : n.event === "invitation" && n.listId
        ? "/lists"
        : n.event === "invitation"
          ? "/settings?section=groups"
          : n.groupEventId
            ? `/events/${n.groupEventId}`
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
        target: z.enum(["person", "list", "group", "household"]),
        targetId: z.string().uuid(),
        following: z.boolean(),
        muted: z.boolean().optional(),
        channels: z
          .array(z.enum(notificationChannels))
          .max(4)
          .nullable()
          .optional(),
      })
      .parse(raw);
    if (p.muted && (p.target !== "list" || p.following))
      fail(400, "Only an unfollowed list can be muted.");
    if ((p.following || p.muted) && !followVisible(s, a, p))
      fail(404, "This follow target is not available.");
    const existing = s.follows.find(
      (f) =>
        f.userId === a.id && f.target === p.target && f.targetId === p.targetId,
    );
    if (p.channels) {
      const unavailable = unavailableChannels(effectiveConfig());
      p.channels = [
        ...new Set([
          ...p.channels.filter(
            (c) => !unavailable.includes(c as "sms" | "telegram"),
          ),
          ...(existing?.channels ?? []).filter((c) =>
            unavailable.includes(c as "sms" | "telegram"),
          ),
        ]),
      ];
    }
    s.follows = s.follows.filter(
      (f) =>
        !(
          f.userId === a.id &&
          f.target === p.target &&
          f.targetId === p.targetId
        ),
    );
    if (p.following || p.muted)
      s.follows.push({
        ...(existing ?? stamp()),
        revision: (existing?.revision ?? 0) + 1,
        muted: p.muted ?? false,
        channels:
          p.muted || p.channels === null
            ? undefined
            : p.channels === undefined
              ? existing?.channels
              : [...new Set(p.channels)],
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
