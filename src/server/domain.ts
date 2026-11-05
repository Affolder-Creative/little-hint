import { reconcileSpendingPrivacy } from "./spending-privacy";
import { priceBaseline, priceCommand } from "./prices";
import { priceConfig } from "./price-config";
import {
  friendCommand,
  friendVisible,
  friendContext,
  checkFriendAudience,
  acceptFriend,
} from "./friends";
import { exchangeActions, exchangeCommand } from "./exchange-commands";
import { buyingActions, buyingCommand } from "./buying-commands";
import { listActions, listCommand } from "./list-commands";
export { DomainError, fail, stamp, normalizedEmail } from "./domain-common";
export {
  controllers,
  controls,
  isAdmin,
  personVisible,
  recipient,
  listVisible,
  itemVisible,
} from "./domain-access";
import {
  DomainError,
  fail,
  stamp,
  touch,
  normalizedEmail,
  text,
  id,
  ids,
  revision,
  listDates,
  spendingGuideline,
  checkSharedListPolicy,
  checkRevision,
} from "./domain-common";
import {
  controllers,
  controls,
  ownIds,
  member,
  groupAccess,
  managesGroupExchanges,
  isAdmin,
  ownedGroup,
  personVisible,
  checkRecipients,
  checkGroups,
  recipient,
  listVisible,
  itemVisible,
  canEdit,
  getItem,
  archived,
  name,
  mode,
  reconcileAccess,
} from "./domain-access";
import { spendingAvailable } from "./deployment";
import { spendingCommand, listContext, assignIdeaSpending } from "./spending";
import {
  productLookupEnabled,
  lookupDisabledMessage,
} from "../shared/product-lookup";
import { importView, retailerCollectionTimeoutMs } from "../shared/imports";
import { effectiveConfig } from "./runtime-config";
import { unavailableChannels } from "./channel-availability";
import { notificationConsent, transportBlocked } from "./sms-policy";
import { managementActions, managementCommand } from "./management";
import {
  preferenceViews,
  updateGiftPreferences,
  newPreference,
} from "./gift-discovery";
import { itemTrashed } from "../shared/organization";
import {
  activityAllowed,
  activityCommand,
  emitActivity,
  emitGiftActivity,
  followsItem,
  followVisible,
  inbox,
  accountIds,
  watchesItem,
  validateMentions,
  noteVisible,
  topicIds,
} from "./activity";
import { createHash } from "node:crypto";
import { z } from "zod";
import { dateHasElapsed, listIsArchived } from "../shared/list-dates";
import type {
  Actor,
  State,
  Person,
  Group,
  GroupEvent,
  List,
  Item,
  GiftView,
  Preferences,
  World,
  Notice,
  Exchange,
  GiftSummary,
} from "../shared/model";
import { canManageGroupEvents, peopleForGroup } from "../shared/group-events";
import {
  isAccountInvitation,
  invitationIsPending,
} from "../shared/invitations";

const eventInput = z.object({
  spendingGuidelineCents: spendingGuideline.optional(),
  ...listDates,
  name: text,
  description: z.string().max(2000).default(""),
  participantIds: ids,
  mode: z.enum(["surprise", "transparent"]),
});

function managedEventGroup(s: State, a: Actor, groupId: string): Group {
  return (
    s.groups.find((g) => g.id === groupId && canManageGroupEvents(g, a.id)) ??
    fail(404, "Event management is not available for this family group.")
  );
}
function checkEventParticipants(
  s: State,
  group: Group,
  participantIds: string[],
) {
  const eligible = new Set(peopleForGroup(s.people, group).map((p) => p.id));
  if (participantIds.some((personId) => !eligible.has(personId)))
    fail(
      400,
      "Choose people who belong to this family group. Refresh to see current members.",
    );
}
export function syncEventLists(s: State, event: GroupEvent) {
  for (const personId of event.deletedAt ? [] : event.participantIds) {
    if (
      !s.lists.some(
        (list) =>
          list.groupEventId === event.id && list.ownerIds.includes(personId),
      )
    ) {
      s.lists.push({
        ...stamp(),
        groupEventId: event.id,
        ownerIds: [personId],
        pendingOwnerIds: [],
        groupIds: [event.groupId],
        name: event.name,
        description: event.description,
        mode: event.mode,
        modeLocked: true,
        archived: event.archived,
        archiveAfter: event.archiveAfter,
        revealAfter: event.revealAfter,
        timeZone: event.timeZone,
        revealExchangeGivers: event.revealExchangeGivers,
      });
    }
  }
  for (const list of s.lists.filter((list) => list.groupEventId === event.id)) {
    const next = {
      name: event.name,
      description: event.description,
      archived:
        event.archived ||
        !!event.deletedAt ||
        !event.participantIds.includes(list.ownerIds[0]),
      archiveAfter: event.archiveAfter,
      revealAfter: event.revealAfter,
      timeZone: event.timeZone,
      mode: event.mode,
      revealExchangeGivers: event.revealExchangeGivers,
    };
    if (
      Object.entries(next).some(
        ([key, value]) => list[key as keyof List] !== value,
      )
    ) {
      Object.assign(list, next);
      touch(list);
    }
  }
}
function reconcileEventParticipants(s: State) {
  for (const event of s.groupEvents) {
    const group = s.groups.find((g) => g.id === event.groupId)!;
    const eligible = new Set(peopleForGroup(s.people, group).map((p) => p.id));
    const participantIds = event.participantIds.filter((id) =>
      eligible.has(id),
    );
    if (participantIds.length !== event.participantIds.length) {
      event.participantIds = participantIds;
      touch(event);
      syncEventLists(s, event);
    }
  }
}

function reconcileHouseholds(s: State) {
  const eligible = new Map(
    s.groups.map((g) => [
      g.id,
      new Set(peopleForGroup(s.people, g).map((p) => p.id)),
    ]),
  );
  const affected = new Set<string>();
  s.householdMemberships = s.householdMemberships.filter((m) => {
    const h = s.households.find((h) => h.id === m.householdId);
    if (h && eligible.get(h.groupId)?.has(m.personId)) return true;
    affected.add(m.personId);
    return false;
  });
  s.people.filter((p) => affected.has(p.id)).forEach(touch);
}

export function archiveDueLists(s: State) {
  for (const event of s.groupEvents) {
    if (!event.archived && listIsArchived(event)) {
      event.archived = true;
      touch(event);
      syncEventLists(s, event);
    }
  }
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
      (l) =>
        l.id === listId &&
        !l.deletedAt &&
        l.ownerIds.some((p) => controls(s, a, p)),
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
        itemTrashed(s, item) ||
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
  const { creatorId, spendingListId, ...fields } = i;
  const own = recipient(s, a, i);
  const view: GiftView = {
    ...fields,
    watchingNotes: !own && watchesItem(s, a.id, i.id),
    priceWatching: s.priceWatches.some(
      (w) => w.userId === a.id && w.itemId === i.id,
    ),
    archived: archived(s, i),
    recipientNames: i.recipientIds.map(
      (id) => s.people.find((p) => p.id === id)?.name ?? "Recipient",
    ),
    canEdit: canEdit(s, a, i),
    isRecipient: own,
    mode: mode(s, i),
  };
  if (!i.listId && creatorId === a.id) view.spendingListId = spendingListId;
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
        revision: c.revision,
        canEdit: c.authorId === a.id && !archived(s, i),
        canDelete: c.authorId === a.id || isAdmin(s, a),
        editedAt: c.editedAt,
        author: name(s, c.authorId),
        body: c.body,
        mentions: c.mentions,
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
  if (n.inbox) return activityAllowed(s, n);
  if (n.invitationId) {
    const inv = s.invitations.find((i) => i.id === n.invitationId);
    return (
      !!inv &&
      invitationIsPending(inv) &&
      (isAccountInvitation(inv) ||
        !!s.friendEntries.find(
          (f) => f.id === inv.friendEntryId && !f.archived && !f.connectedAt,
        ) ||
        !!s.groups.find((g) => g.id === inv.groupId))
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
  emitActivity(s, event, userIds, refs);
}
function notifyGift(s: State, a: Actor, i: Item, event: Notice["event"]) {
  emitGiftActivity(s, a, i, event);
}

export function world(
  s: State,
  a: Actor,
  compact = false,
  paged = false,
): World {
  const people = s.people.filter((p) => personVisible(s, a, p));
  const ps = ownIds(s, a);
  return {
    compact,
    paged,
    ...(paged
      ? {
          hasActiveItems: s.items.some(
            (i) => itemVisible(s, a, i) && !archived(s, i),
          ),
        }
      : {}),
    priceChecksEnabled:
      priceConfig().enabled && productLookupEnabled(effectiveConfig()),
    friendEntries: s.friendEntries
      .filter((f) => friendVisible(s, a, f) && !controls(s, a, f.personId))
      .map((f) => ({
        ...f,
        groupIds:
          f.creatorId === a.id
            ? f.groupIds
            : f.groupIds.filter((g) => groupAccess(s, a, g)),
        canManage: f.creatorId === a.id,
      })),
    personRedirects: Object.fromEntries(
      s.friendEntries
        .filter(
          (f) =>
            f.connectedAt &&
            (friendVisible(s, a, f) ||
              s.items.some(
                (i) => i.friendEntryId === f.id && i.creatorId === a.id,
              )),
        )
        .map((f) => [f.originalPersonId, f.personId]),
    ),
    spendingAvailable: spendingAvailable(),
    spendingInvitation:
      spendingAvailable() &&
      s.spendingConnections.some(
        (c) => c.status === "pending" && c.users[1] === a.id,
      ),
    spendingEnabled:
      spendingAvailable() &&
      s.spendingSettings.some((p) => p.userId === a.id && p.enabled),
    giftPreferences: preferenceViews(s, a),
    organization: s.organization.filter((o) => o.userId === a.id),
    me: {
      ...a,
      name: s.people.find((p) => p.userId === a.id)?.name ?? a.name,
      admin: isAdmin(s, a),
    },
    people,
    groups: s.groups.filter((g) => member(g, a)),
    households: s.households.filter((h) => groupAccess(s, a, h.groupId)),
    householdMemberships: s.householdMemberships.filter((m) =>
      s.households.some(
        (h) => h.id === m.householdId && groupAccess(s, a, h.groupId),
      ),
    ),
    groupEvents: s.groupEvents
      .filter((event) => !event.deletedAt && groupAccess(s, a, event.groupId))
      .map((event) => ({
        ...event,
        archived: listIsArchived(event),
        canManage: canManageGroupEvents(
          s.groups.find((g) => g.id === event.groupId)!,
          a.id,
        ),
      })),
    invitations: s.invitations
      .filter(
        (i) =>
          invitationIsPending(i) &&
          (normalizedEmail(i.email) === normalizedEmail(a.email) ||
            ((isAccountInvitation(i) || !!i.friendEntryId) &&
              i.invitedById === a.id) ||
            !!s.groups.find((g) => g.id === i.groupId && g.ownerId === a.id)),
      )
      .map((i) => ({
        ...i,
        friendName: s.friendEntries.find((f) => f.id === i.friendEntryId)?.name,
        groupName: s.groups.find((g) => g.id === i.groupId)?.name,
        inviterName: s.people.find((p) => p.userId === i.invitedById)?.name,
      })),
    lists: s.lists
      .filter(
        (l) =>
          !l.deletedAt &&
          (listVisible(s, a, l) ||
            l.pendingOwnerIds.some((id) => ps.includes(id))),
      )
      .map((l) => ({
        ...l,
        archived: listIsArchived(l),
        canEdit: l.ownerIds.some((p) => ps.includes(p)),
        hasOtherItemEditors: s.people.some(
          (p) =>
            l.ownerIds.includes(p.id) &&
            controllers(p).some((id) => id !== a.id),
        ),
        canManageSettings:
          !l.groupEventId && l.ownerIds.some((p) => ps.includes(p)),
        revealAvailable: dateHasElapsed(l.revealAfter, l.timeZone),
      })),
    items: paged
      ? []
      : s.items
          .filter((i) => itemVisible(s, a, i))
          .map((i) => giftView(s, a, i)),
    contributionHistory: compact
      ? []
      : s.contributions.flatMap((contribution) => {
          const r = s.reservations.find(
            (r) => r.id === contribution.reservationId,
          );
          if (!r || (contribution.userId !== a.id && r.buyerId !== a.id))
            return [];
          return [
            {
              contribution: { ...contribution },
              title: r.titleSnapshot,
              purchaser: r.buyerId === a.id,
              contributorName:
                s.people.find((p) => p.userId === contribution.userId)?.name ??
                "Former member",
              purchaserName:
                s.people.find((p) => p.userId === r.buyerId)?.name ??
                "Former member",
            },
          ];
        }),
    buying: paged
      ? []
      : s.reservations
          .filter((r) => r.buyerId === a.id && (!compact || r.quantity > 0))
          .map((r) => ({
            ...r,
            item:
              !compact &&
              s.items.some((i) => i.id === r.itemId && itemVisible(s, a, i))
                ? giftView(
                    s,
                    a,
                    s.items.find((i) => i.id === r.itemId)!,
                  )
                : undefined,
          })),
    exchanges: s.exchanges
      .filter((e) => !e.deletedAt && groupAccess(s, a, e.groupId))
      .map(({ assignments, ...e }) => {
        const canManage = managesGroupExchanges(s, a, e.groupId);
        return {
          ...e,
          canManage,
          myAssignments:
            e.status === "drawn"
              ? assignments.filter(([giver]) => ps.includes(giver))
              : [],
          delivery: {
            sent: s.notices.filter(
              (n) => canManage && n.exchangeId === e.id && n.status === "sent",
            ).length,
            pending: s.notices.filter(
              (n) =>
                canManage && n.exchangeId === e.id && n.status === "pending",
            ).length,
            failed: s.notices.filter(
              (n) =>
                canManage && n.exchangeId === e.id && n.status === "failed",
            ).length,
          },
        };
      }),
    preferences: preferences(s, a),
    notificationCount: inbox(s, a).unreadCount,
    follows: s.follows.filter(
      (f) => f.userId === a.id && followVisible(s, a, f),
    ),
    watches: paged
      ? []
      : s.items
          .filter((i) => itemVisible(s, a, i) && !recipient(s, a, i))
          .map((i) => ({
            ...stamp(),
            userId: a.id,
            itemId: i.id,
            watching: watchesItem(s, a.id, i.id),
          })),
    imports: s.imports
      .filter(
        (j) =>
          j.userId === a.id &&
          (!compact ||
            j.draft?.state === "active" ||
            (!j.draft && ["pending", "running"].includes(j.status))),
      )
      .map(importView),
    links: s.links
      .filter(
        (l) =>
          !l.consumed &&
          Date.parse(l.expiresAt) > Date.now() &&
          (l.userId === a.id || l.email === normalizedEmail(a.email)),
      )
      .map(({ tokenHash, ...l }) => ({
        ...l,
        targetName:
          l.kind === "profile"
            ? s.people.find((p) => p.id === l.targetId)?.name
            : l.kind === "ownership"
              ? s.groups.find((g) => g.id === l.targetId)?.name
              : undefined,
        requesterName: s.people.find(
          (p) => p.userId === (l.requestedBy ?? l.userId),
        )?.name,
      })),
  };
}
export function activateAccount(s: State, a: Actor, spendingDefault = false) {
  let p = s.people.find((p) => p.userId === a.id);
  const grants = s.invitations.filter(
    (i) =>
      normalizedEmail(i.email) === normalizedEmail(a.email) &&
      invitationIsPending(i),
  );
  if (!p) {
    const grant = grants[0];
    if (!grant) fail(403, "An active invitation is required.");
    p = {
      ...stamp(),
      name: a.name || a.email.split("@")[0],
      userId: a.id,
      guardians: [],
      admin: !!grant.bootstrap,
    };
    s.people.push(p);
    s.giftPreferences.push(newPreference(p.id));
    if (spendingDefault && !s.spendingSettings.some((v) => v.userId === a.id))
      s.spendingSettings.push({
        ...stamp(),
        userId: a.id,
        enabled: true,
        summaries: true,
        enabledSource: "default",
      });
    if (grant.bootstrap) {
      grant.acceptedBy = a.id;
      touch(grant);
    }
  }
  // Verified sign-in uses account invitations, never family-group membership.
  for (const invitation of grants.filter(isAccountInvitation)) {
    invitation.acceptedBy = a.id;
    touch(invitation);
  }
  return p;
}
export function signupAllowed(s: State, email: string) {
  return s.invitations.some(
    (i) =>
      normalizedEmail(i.email) === normalizedEmail(email) &&
      invitationIsPending(i),
  );
}
function checkImage(s: State, a: Actor, url: string) {
  if (!url) return;
  const id = url.split("/").pop();
  if (
    !s.media.some(
      (m) =>
        m.id === id &&
        !m.deletedAt &&
        (m.userId === a.id ||
          s.items.some((i) => i.image === url && itemVisible(s, a, i))),
    )
  )
    fail(404, "Image not found.");
}
const itemInput = z.object({
  spendingListId: id.nullable().optional(),
  spendingAssignmentToken: z.string().max(128).optional(),
  priority: z
    .enum(["most-wanted", "would-love", "nice-to-have"])
    .nullable()
    .optional(),
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
  reconcileSpendingPrivacy(s);
  const result = commandCore(s, a, action, raw);
  reconcileSpendingPrivacy(s);
  return result;
}
function commandCore(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
): unknown {
  if (action.startsWith("friends.")) return friendCommand(s, a, action, raw);
  if (listActions.includes(action)) return listCommand(s, a, action, raw);
  if (buyingActions.includes(action)) return buyingCommand(s, a, action, raw);
  if (exchangeActions.includes(action))
    return exchangeCommand(s, a, action, raw);
  if (action.startsWith("spending.")) return spendingCommand(s, a, action, raw);
  if (managementActions.includes(action))
    return managementCommand(s, a, action, raw);
  if (action.startsWith("prices.")) return priceCommand(s, a, action, raw);
  const b = raw as Record<string, unknown>;
  if (
    ["notifications.read", "follows.update", "watches.update"].includes(action)
  )
    return activityCommand(s, a, action, raw);
  switch (action) {
    case "gift-preferences.update":
      return updateGiftPreferences(s, a, raw);
    case "households.create": {
      const p = z.object({ groupId: id, name: text }).parse(b);
      ownedGroup(s, a, p.groupId);
      const household = { ...stamp(), ...p };
      s.households.push(household);
      return household;
    }
    case "households.update": {
      const p = z.object({ id, revision, name: text }).parse(b);
      const household =
        s.households.find((h) => h.id === p.id) ??
        fail(404, "Household not found.");
      ownedGroup(s, a, household.groupId);
      checkRevision(household, p.revision);
      household.name = p.name;
      touch(household);
      return household;
    }
    case "households.delete": {
      const p = z.object({ id, revision }).parse(b);
      const household =
        s.households.find((h) => h.id === p.id) ??
        fail(404, "Household not found.");
      ownedGroup(s, a, household.groupId);
      checkRevision(household, p.revision);
      const affected = new Set(
        s.householdMemberships
          .filter((m) => m.householdId === p.id)
          .map((m) => m.personId),
      );
      s.householdMemberships = s.householdMemberships.filter(
        (m) => m.householdId !== p.id,
      );
      s.households = s.households.filter((h) => h.id !== p.id);
      s.follows = s.follows.filter(
        (f) => f.target !== "household" || f.targetId !== p.id,
      );
      s.people.filter((p) => affected.has(p.id)).forEach(touch);
      return { ok: true };
    }
    case "households.memberships": {
      const p = z
        .object({ groupId: id, personId: id, revision, householdIds: ids })
        .parse(b);
      const group =
        s.groups.find((g) => g.id === p.groupId && member(g, a)) ??
        fail(404, "Family group not found.");
      const person =
        peopleForGroup(s.people, group).find((q) => q.id === p.personId) ??
        fail(404, "Person not found in this family group.");
      if (group.ownerId !== a.id && !controls(s, a, person.id))
        fail(
          403,
          "Only the family-group owner or this person's controller can change their households.",
        );
      checkRevision(person, p.revision);
      const householdIds = new Set(
        s.households.filter((h) => h.groupId === group.id).map((h) => h.id),
      );
      if (p.householdIds.some((id) => !householdIds.has(id)))
        fail(400, "Choose households in this family group.");
      s.householdMemberships = s.householdMemberships.filter(
        (m) =>
          m.personId !== person.id ||
          !householdIds.has(m.householdId) ||
          p.householdIds.includes(m.householdId),
      );
      for (const householdId of p.householdIds) {
        if (
          !s.householdMemberships.some(
            (m) => m.personId === person.id && m.householdId === householdId,
          )
        )
          s.householdMemberships.push({
            ...stamp(),
            householdId,
            personId: person.id,
          });
      }
      touch(person);
      return { ok: true };
    }
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
    case "groups.event-leaders": {
      const p = z
        .object({
          groupId: id,
          revision,
          userIds: z.array(z.string().min(1)).max(100),
        })
        .parse(b);
      const group = ownedGroup(s, a, p.groupId);
      checkRevision(group, p.revision);
      if (
        new Set(p.userIds).size !== p.userIds.length ||
        p.userIds.some(
          (userId) =>
            !group.memberIds.includes(userId) || userId === group.ownerId,
        )
      )
        fail(400, "Choose current members other than the family-group owner.");
      group.eventLeaderIds = p.userIds;
      touch(group);
      return { ok: true };
    }
    case "group-events.create": {
      const p = eventInput
        .extend({ groupId: id, participantIds: ids.min(1) })
        .parse(b);
      const group = managedEventGroup(s, a, p.groupId);
      checkEventParticipants(s, group, p.participantIds);
      if (p.revealExchangeGivers && !p.revealAfter)
        fail(400, "Choose a reveal date to reveal exchange givers.");
      const event: GroupEvent = {
        ...stamp(),
        ...p,
        archived: false,
        timeZone: p.timeZone ?? "UTC",
        revealExchangeGivers: p.revealExchangeGivers ?? false,
      };
      s.groupEvents.push(event);
      syncEventLists(s, event);
      return { id: event.id };
    }
    case "group-events.repeat": {
      const p = eventInput
        .extend({
          sourceId: id,
          sourceRevision: revision,
          participantIds: ids.min(1),
        })
        .parse(b);
      const source =
        s.groupEvents.find(
          (event) => event.id === p.sourceId && !event.deletedAt,
        ) ?? fail(404, "Event not found.");
      managedEventGroup(s, a, source.groupId);
      checkRevision(source, p.sourceRevision);
      for (const date of [p.archiveAfter, p.revealAfter]) {
        if (dateHasElapsed(date, p.timeZone ?? "UTC"))
          fail(400, "Choose new dates that have not already passed.");
      }
      // Only creation fields are accepted. Source activity and list IDs are never copied.
      return command(s, a, "group-events.create", {
        ...p,
        groupId: source.groupId,
      });
    }
    case "group-events.update": {
      const p = eventInput
        .extend({ id, revision, archived: z.boolean() })
        .parse(b);
      const event =
        s.groupEvents.find((event) => event.id === p.id && !event.deletedAt) ??
        fail(404, "Event not found.");
      const group = managedEventGroup(s, a, event.groupId);
      checkRevision(event, p.revision);
      checkEventParticipants(s, group, p.participantIds);
      checkSharedListPolicy({ ...event, modeLocked: true }, { ...event, ...p });
      if (listIsArchived(event) && !p.archived) p.archiveAfter = null;
      const guidelineChanged =
        p.spendingGuidelineCents !== undefined &&
        (event.spendingGuidelineCents ?? null) !== p.spendingGuidelineCents;
      Object.assign(event, p);
      touch(event);
      syncEventLists(s, event);
      if (guidelineChanged)
        notify(s, "access", group.memberIds, {
          groupEventId: event.id,
          actorId: a.id,
          action: "spending-guideline-updated",
        });
      return { id: event.id };
    }
    case "invitations.create":
    case "groups.invite": {
      const p: { email: string; groupId?: string } = (
        action === "groups.invite"
          ? z.object({ groupId: id, email: z.string().trim().pipe(z.email()) })
          : z.object({ email: z.string().trim().pipe(z.email()) }).strict()
      ).parse(b);
      const groupId = p.groupId;
      if (groupId) ownedGroup(s, a, groupId);
      else {
        if (!s.people.some((person) => person.userId === a.id))
          fail(403, "Sign in to invite someone.");
        if (
          s.invitations.some(
            (i) =>
              isAccountInvitation(i) &&
              invitationIsPending(i) &&
              i.invitedById === a.id &&
              i.email === normalizedEmail(p.email),
          )
        )
          fail(409, "You already have a pending invitation for this address.");
      }
      const inv = {
        ...stamp(),
        email: normalizedEmail(p.email),
        ...(groupId ? { groupId } : {}),
        invitedById: a.id,
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
    case "invitations.decline": {
      const { id: requestId } = z.object({ id }).parse(b);
      const inv =
        s.invitations.find(
          (i) =>
            i.id === requestId &&
            i.friendEntryId &&
            i.email === normalizedEmail(a.email) &&
            invitationIsPending(i),
        ) ?? fail(404, "Invitation not found.");
      inv.declined = true;
      touch(inv);
      return { ok: true };
    }
    case "invitations.accept": {
      const p = z.object({ id }).parse(b);
      const inv =
        s.invitations.find(
          (i) =>
            i.id === p.id &&
            i.email === normalizedEmail(a.email) &&
            !i.revoked &&
            !i.declined &&
            !i.acceptedBy &&
            Date.parse(i.expiresAt) > Date.now(),
        ) ?? fail(404, "Invitation not found.");
      if (inv.friendEntryId) return acceptFriend(s, a, inv);
      const g =
        s.groups.find((g) => g.id === inv.groupId) ??
        fail(404, "Family group not found.");
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
      if (isAccountInvitation(inv) || inv.friendEntryId) {
        if (inv.invitedById !== a.id) fail(404, "Invitation not found.");
        if (!invitationIsPending(inv))
          fail(409, "This invitation is no longer pending.");
      } else ownedGroup(s, a, inv.groupId!);
      inv.revoked = true;
      touch(inv);
      return { ok: true };
    }
    case "groups.remove": {
      const p = z.object({ groupId: id, userId: z.string() }).parse(b);
      const g =
        s.groups.find((g) => g.id === p.groupId && member(g, a)) ??
        fail(404, "Family group not found.");
      if (p.userId !== a.id && g.ownerId !== a.id)
        fail(403, "Only the owner can remove another member.");
      if (g.ownerId === p.userId)
        fail(409, "Transfer ownership before leaving.");
      g.memberIds = g.memberIds.filter((u) => u !== p.userId);
      g.eventLeaderIds = (g.eventLeaderIds ?? []).filter((u) => u !== p.userId);
      reconcileEventParticipants(s);
      reconcileHouseholds(s);
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
      emitActivity(s, "invitation", [p.userId], {
        linkId: s.links.at(-1)!.id,
        action: "ownership-request",
        actorId: a.id,
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
          ) ?? fail(404, "Family group not found.");
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
      reconcileEventParticipants(s);
      reconcileHouseholds(s);
      return { ok: true };
    }
    case "people.create": {
      const p = z.object({ name: text }).parse(b);
      const person: Person = { ...stamp(), ...p, guardians: [a.id] };
      s.people.push(person);
      return person;
    }
    case "people.update": {
      const p = z.object({ id, revision, name: text }).parse(b);
      const person =
        s.people.find((q) => q.id === p.id && controls(s, a, q.id)) ??
        fail(404, "Profile not found.");
      checkRevision(person, p.revision);
      person.name = p.name;
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
    case "items.create": {
      const p = itemInput
        .extend({
          listId: id.optional(),
          friendEntryId: id.optional(),
          recipientIds: ids.default([]),
          groupIds: ids.default([]),
          visibility: z
            .enum(["private", "hidden", "visible"])
            .default("private"),
          allowDuplicate: z.boolean().default(false),
          importId: id.optional(),
          importDraftRevision: z.number().int().optional(),
        })
        .parse(b);
      checkImage(s, a, p.image);
      if (!p.listId && p.priority)
        fail(400, "Only wish-list items have a recipient priority.");
      let recipients = p.recipientIds;
      if (p.listId) {
        if (p.friendEntryId)
          fail(400, "Friend ideas stay separate from wish lists.");
        const l =
          s.lists.find(
            (l) =>
              l.id === p.listId &&
              !l.deletedAt &&
              !listIsArchived(l) &&
              l.ownerIds.some((id) => controls(s, a, id)),
          ) ?? fail(404, "List not found.");
        recipients = l.ownerIds;
      } else {
        checkRecipients(s, a, recipients);
        if (
          recipients.length !== 1 &&
          recipients.some((r) => s.friendEntries.some((f) => f.personId === r))
        )
          fail(400, "Choose one friend for this idea.");
        const context = friendContext(s, a, recipients[0], p.friendEntryId);
        p.friendEntryId = context?.id;
        checkFriendAudience(s, a, context, p.visibility, p.groupIds);
        if (recipients.some((id) => controls(s, a, id)))
          fail(400, "Add items for yourself to a wish list.");
        checkGroups(s, a, p.groupIds);
        if (p.visibility !== "private" && !p.groupIds.length)
          fail(400, "Select a family group to share this idea.");
      }
      if (p.spendingListId) {
        if (p.listId) fail(400, "Wish-list items use their source list.");
        listContext(s, a, p.spendingListId, recipients);
      }
      const duplicate = s.items.find(
        (i) =>
          itemVisible(s, a, i) &&
          !itemTrashed(s, i) &&
          !archived(s, i) &&
          i.recipientIds.some((r) => recipients.includes(r)) &&
          ((p.url && canonicalUrl(i.url) === canonicalUrl(p.url)) ||
            i.title.toLowerCase() === p.title.toLowerCase()),
      );
      if (duplicate && !p.allowDuplicate)
        return { duplicate: giftView(s, a, duplicate) };
      const {
        allowDuplicate,
        importId,
        importDraftRevision,
        spendingAssignmentToken,
        ...fields
      } = p;
      const imported = s.imports.find(
        (j) =>
          j.id === importId &&
          j.userId === a.id &&
          j.status === "complete" &&
          j.url === p.url,
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
              productSources: imported.result?.productSources
                ?.map((source) => ({
                  ...source,
                  fields: source.fields.filter(
                    (field) => fields[field] === imported.result?.[field],
                  ),
                }))
                .filter((source) => source.fields.length),
            }
          : {}),
      };
      const draftImport = s.imports.find(
        (j) => j.id === importId && j.userId === a.id && j.draft,
      );
      if (draftImport) {
        if (
          importDraftRevision !== undefined &&
          importDraftRevision !== draftImport.draft!.revision
        )
          fail(409, "This draft changed. Reopen it before saving.");
        if (
          draftImport.draft!.kind === "idea"
            ? !!p.listId || p.recipientIds[0] !== draftImport.draft!.recipientId
            : p.listId !== draftImport.draft!.listId
        )
          fail(409, "The draft destination changed. Reopen it before saving.");
        if (draftImport.draft!.state !== "active" || draftImport.url !== p.url)
          fail(409, "This draft has already been added or changed.");
        draftImport.draft!.state = "published";
        touch(draftImport);
      }
      priceBaseline(i, "when added");
      s.items.push(i);
      if (i.listId)
        emitActivity(
          s,
          "wishlist",
          accountIds(s).filter((userId) => followsItem(s, userId, i)),
          { itemId: i.id, listId: i.listId, actorId: a.id },
        );
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
          importId: id.optional(),
          importDraftRevision: z.number().int().optional(),
        })
        .parse(b);
      const i = getItem(s, a, p.id);
      if (!canEdit(s, a, i)) fail(403, "You cannot edit this item.");
      checkRevision(i, p.revision);
      checkImage(s, a, p.image);
      if (!i.listId) {
        checkFriendAudience(
          s,
          a,
          i.friendEntryId
            ? friendContext(s, a, i.recipientIds[0], i.friendEntryId, true)
            : undefined,
          p.visibility,
          p.groupIds,
        );
        checkGroups(s, a, p.groupIds);
        if (p.visibility !== "private" && !p.groupIds.length)
          fail(400, "Select a family group to share this idea.");
      }
      if (!i.listId && p.priority)
        fail(400, "Only wish-list items have a recipient priority.");
      if (
        p.spendingListId !== undefined &&
        p.spendingListId !== i.spendingListId
      ) {
        if (i.listId) fail(400, "Wish-list items use their source list.");
        if (p.spendingListId)
          assignIdeaSpending(
            s,
            a,
            i.id,
            p.spendingListId,
            p.spendingAssignmentToken,
          );
      }
      const {
        importId,
        importDraftRevision,
        spendingAssignmentToken,
        ...fields
      } = p;
      if (fields.spendingListId === undefined) delete fields.spendingListId;
      if (fields.priority === undefined) delete fields.priority;
      const imported = s.imports.find(
        (j) =>
          j.id === importId &&
          j.userId === a.id &&
          j.status === "complete" &&
          j.url === p.url,
      );
      if (imported) {
        i.importedAt = imported.result?.importedAt;
        i.source = imported.result?.source;
        i.productSources = imported.result?.productSources;
      } else if (i.url !== p.url) {
        delete i.importedAt;
        delete i.source;
      }
      if (i.url !== p.url) {
        delete i.purchaseOffers;
        delete i.recommendationEvidence;
      }
      if (i.url !== p.url && !imported) delete i.productSources;
      i.productSources = i.productSources
        ?.map((source) => ({
          ...source,
          fields: source.fields.filter(
            (field) =>
              fields[field] === undefined ||
              fields[field] === (imported?.result ?? i)[field],
          ),
        }))
        .filter((source) => source.fields.length);
      if (i.url !== p.url) {
        priceBaseline(i, "when link changed");
        i.pricing!.baseline = p.priceCents;
      } else if (i.priceCents !== p.priceCents) {
        if (!i.pricing) priceBaseline(i, "when tracking started");
        s.priceChanges.push({
          ...stamp(),
          itemId: i.id,
          generation: i.pricing!.generation,
          from: i.priceCents,
          to: p.priceCents,
          source: "manual",
        });
        i.pricing!.paused = true;
        delete i.pricing!.checkedAt;
        for (const w of s.priceWatches.filter((w) => w.itemId === i.id))
          w.reference = null;
      }
      Object.assign(i, fields);
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
    case "comments.update":
    case "comments.delete": {
      const p = z
        .object({
          id,
          revision,
          body: z
            .string()
            .min(1)
            .max(4000)
            .refine((v) => !!v.trim(), "Write a note.")
            .optional(),
          mentions: z
            .array(
              z.object({
                userId: z.string(),
                start: z.number().int().min(0),
                end: z.number().int().positive(),
              }),
            )
            .max(20)
            .default([]),
        })
        .parse(b);
      const c =
        s.comments.find((c) => c.id === p.id) ??
        fail(404, "Note not available.");
      const i = getItem(s, a, c.itemId);
      if (!noteVisible(s, a, i, c.giverId)) fail(404, "Note not available.");
      if (
        c.authorId !== a.id &&
        !(action === "comments.delete" && isAdmin(s, a))
      )
        fail(403, "You cannot change this note.");
      checkRevision(c, p.revision);
      if (action === "comments.delete") {
        s.comments = s.comments.filter((entry) => entry.id !== c.id);
        s.notices = s.notices.filter((n) => n.commentId !== c.id);
        return { ok: true };
      }
      if (archived(s, i)) fail(403, "Archived notes cannot be edited.");
      if (!p.body) fail(400, "Write a note.");
      validateMentions(s, a, i, p.body, p.mentions, c.giverId, true);
      const previous = new Set(c.mentions?.map((m) => m.userId));
      if (
        c.body === p.body &&
        JSON.stringify(c.mentions ?? []) === JSON.stringify(p.mentions)
      )
        return { ok: true };
      c.body = p.body;
      c.mentions = p.mentions;
      c.editedAt = new Date().toISOString();
      touch(c);
      emitActivity(
        s,
        "mention",
        p.mentions.map((m) => m.userId).filter((id) => !previous.has(id)),
        { itemId: i.id, commentId: c.id, actorId: a.id },
      );
      return { ok: true };
    }
    case "comments.create": {
      const p = z
        .object({
          itemId: id,
          body: z
            .string()
            .min(1)
            .max(4000)
            .refine((v) => !!v.trim(), "Write a note."),
          mentions: z
            .array(
              z.object({
                userId: z.string().min(1).max(200),
                start: z.number().int().min(0),
                end: z.number().int().positive(),
              }),
            )
            .max(20)
            .default([]),
        })
        .parse(b);
      const i = getItem(s, a, p.itemId);
      if (recipient(s, a, i) || archived(s, i))
        fail(403, "Private notes are not available for this item.");
      const exchangeReservation = s.reservations.find(
        (r) =>
          r.itemId === i.id &&
          r.buyerId === a.id &&
          r.exchangeId &&
          r.quantity > 0,
      );
      validateMentions(s, a, i, p.body, p.mentions);
      const comment = {
        ...stamp(),
        ...p,
        authorId: a.id,
        giverId: exchangeReservation?.giverId,
      };
      s.comments.push(comment);
      const mentioned = [...new Set(p.mentions.map((m) => m.userId))];
      const refs = { itemId: i.id, commentId: comment.id, actorId: a.id };
      emitActivity(s, "mention", mentioned, refs);
      emitActivity(
        s,
        "discussion",
        accountIds(s).filter(
          (userId) =>
            !mentioned.includes(userId) && watchesItem(s, userId, i.id),
        ),
        refs,
      );
      return { ok: true };
    }
    case "preferences.update": {
      const p = z
        .object({
          notificationDetails: z
            .object({
              push: z.boolean().optional(),
              email: z.boolean().optional(),
              telegram: z.boolean().optional(),
              sms: z.boolean().optional(),
            })
            .optional(),
          email: z.boolean().optional(),
          recipientUpdates: z.boolean().default(false),
          telegram: z.boolean().optional(),
          sms: z.boolean().optional(),
          smsConsentAcknowledged: z.boolean().optional(),
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
                "mention",
                "wishlist",
                "price-drop",
              ]),
            )
            .max(10),
          pushEvents: z
            .array(z.string().refine((v) => topicIds.includes(v as any)))
            .max(10)
            .optional(),
          channelEvents: z
            .object({
              email: z
                .array(z.string().refine((v) => topicIds.includes(v as any)))
                .max(10)
                .optional(),
              telegram: z
                .array(z.string().refine((v) => topicIds.includes(v as any)))
                .max(10)
                .optional(),
              sms: z
                .array(z.string().refine((v) => topicIds.includes(v as any)))
                .max(10)
                .optional(),
            })
            .optional(),
        })
        .parse(b);
      const prefs = preferences(s, a);
      const cfg = effectiveConfig();
      for (const channel of unavailableChannels(cfg)) {
        delete p[channel];
        if (p.channelEvents) delete p.channelEvents[channel];
        if (p.notificationDetails) delete p.notificationDetails[channel];
      }
      // Materialize legacy defaults before updating the shared events fallback.
      const channelEvents = { ...prefs.channelEvents };
      for (const channel of ["email", "telegram", "sms"] as const)
        channelEvents[channel] =
          p.channelEvents?.[channel] ??
          prefs.channelEvents?.[channel] ??
          prefs.events;
      if (
        p.sms &&
        (!prefs.phoneVerified ||
          prefs.smsOptOut ||
          !prefs.phone ||
          transportBlocked(s, prefs.phone))
      )
        fail(
          400,
          "Verify your phone number and agree to receive text messages first.",
        );
      if (p.telegram && !prefs.chatId)
        fail(400, "Link Telegram before enabling notifications.");
      if (
        p.sms !== undefined &&
        !notificationConsent(
          s,
          prefs,
          p.sms,
          p.smsConsentAcknowledged === true,
          Number(cfg.SMS_USER_DAILY_LIMIT || 2),
        )
      )
        fail(
          400,
          "Agree to recurring SMS updates before enabling text messages.",
        );
      const {
        smsConsentAcknowledged,
        notificationDetails,
        channelEvents: suppliedTopics,
        ...values
      } = p;
      Object.assign(prefs, values, {
        channelEvents,
        notificationDetails: {
          ...prefs.notificationDetails,
          ...notificationDetails,
        },
      });
      touch(prefs);
      if (!s.preferences.some((x) => x.id === prefs.id))
        s.preferences.push(prefs);
      return prefs;
    }
    case "imports.update":
    case "imports.discard":
    case "imports.retry": {
      const p = z
        .object({
          id,
          revision: z.number().int().optional(),
          fields: z
            .record(
              z.string().max(40),
              z.union([z.string().max(5000), z.number().finite(), z.null()]),
            )
            .optional(),
          touched: z.array(z.string().max(40)).max(20).optional(),
          listId: id.optional(),
          spendingListId: id.nullable().optional(),
          kind: z.enum(["item", "idea"]).optional(),
          friendEntryId: id.optional(),
          recipientId: id.optional(),
          visibility: z.enum(["private", "hidden", "visible"]).optional(),
          groupIds: ids.optional(),
        })
        .parse(b);
      const j =
        s.imports.find(
          (j) =>
            j.id === p.id && j.userId === a.id && j.draft?.state === "active",
        ) ?? fail(404, "Draft not found.");
      if (action === "imports.discard") {
        j.draft!.state = "discarded";
        touch(j);
        return importView(j);
      }
      if (action === "imports.retry") {
        if (!productLookupEnabled(effectiveConfig()))
          fail(403, lookupDisabledMessage);
        if (j.status !== "failed") return importView(j);
        if (j.providerState?.terminal) delete j.providerState;
        if (j.providerState && !j.providerState.snapshotId)
          fail(
            409,
            "The shop request may still be running. Enter details manually to avoid another paid request.",
          );
        if (j.providerState) {
          j.providerState.deadline = new Date(
            Date.now() + retailerCollectionTimeoutMs,
          ).toISOString();
          delete j.providerState.nextPollAt;
        }
        j.status = "pending";
        delete j.error;
        delete j.diagnostic;
        delete j.diagnostics;
        delete j.unlockerRetry;
        delete j.recoveryState;
        delete j.recoveryCheckpoint;
        touch(j);
        return importView(j);
      }
      if (p.revision !== j.draft!.revision)
        fail(
          409,
          "This draft changed on another device. Reopen it before editing.",
        );
      if (
        p.listId &&
        !s.lists.some(
          (l) =>
            l.id === p.listId &&
            !l.deletedAt &&
            !listIsArchived(l) &&
            l.ownerIds.some((id) => controls(s, a, id)),
        )
      )
        fail(404, "List not found.");
      if (j.draft!.kind === "idea") {
        const recipientId = p.recipientId ?? j.draft!.recipientId!;
        checkRecipients(s, a, [recipientId]);
        if (controls(s, a, recipientId)) fail(400, "Choose another recipient.");
        checkGroups(s, a, p.groupIds ?? j.draft!.groupIds ?? []);
        const context = friendContext(
          s,
          a,
          recipientId,
          p.friendEntryId ??
            (recipientId === j.draft!.recipientId
              ? j.draft!.friendEntryId
              : undefined),
        );
        checkFriendAudience(
          s,
          a,
          context,
          p.visibility ?? j.draft!.visibility ?? "private",
          p.groupIds ?? j.draft!.groupIds ?? [],
        );
        const spendingListId =
          p.spendingListId !== undefined
            ? p.spendingListId
            : j.draft!.spendingListId;
        if (spendingListId) listContext(s, a, spendingListId, [recipientId]);
        Object.assign(j.draft!, {
          spendingListId,
          friendEntryId: context?.id,
          recipientId,
          visibility: p.visibility ?? j.draft!.visibility,
          groupIds: p.groupIds ?? j.draft!.groupIds,
        });
      } else if (p.listId) j.draft!.listId = p.listId;
      if (p.fields) j.draft!.fields = p.fields;
      if (p.touched) j.draft!.touched = p.touched;
      j.draft!.revision++;
      touch(j);
      return importView(j);
    }
    case "imports.create": {
      if (!productLookupEnabled(effectiveConfig()))
        fail(403, lookupDisabledMessage);
      const p = z
        .object({
          url: z.url().max(2048),
          forceRefresh: z.boolean().default(false),
          draft: z
            .object({
              listId: id.optional(),
              spendingListId: id.nullable().optional(),
              kind: z.enum(["item", "idea"]).optional(),
              friendEntryId: id.optional(),
              recipientId: id.optional(),
              visibility: z.enum(["private", "hidden", "visible"]).optional(),
              groupIds: ids.optional(),
              fields: z.record(
                z.string().max(40),
                z.union([z.string().max(5000), z.number().finite(), z.null()]),
              ),
              touched: z.array(z.string().max(40)).max(20),
            })
            .optional(),
        })
        .parse(b);
      if (!/^https?:\/\//.test(p.url))
        fail(400, "Use a full shop link starting with https:// or http://.");
      if (
        p.draft &&
        p.draft.kind !== "idea" &&
        !s.lists.some(
          (l) =>
            l.id === p.draft!.listId &&
            !l.deletedAt &&
            !listIsArchived(l) &&
            l.ownerIds.some((id) => controls(s, a, id)),
        )
      )
        fail(404, "List not found.");
      if (p.draft?.kind === "idea") {
        if (!p.draft.recipientId) fail(400, "Choose a recipient.");
        checkRecipients(s, a, [p.draft.recipientId]);
        const context = friendContext(
          s,
          a,
          p.draft.recipientId,
          p.draft.friendEntryId,
        );
        p.draft.friendEntryId = context?.id;
        checkFriendAudience(
          s,
          a,
          context,
          p.draft.visibility ?? "private",
          p.draft.groupIds ?? [],
        );
        if (controls(s, a, p.draft.recipientId))
          fail(400, "Choose another recipient.");
        checkGroups(s, a, p.draft.groupIds ?? []);
        if (p.draft.spendingListId)
          listContext(s, a, p.draft.spendingListId, [p.draft.recipientId]);
        delete p.draft.listId;
      }
      const j = {
        ...stamp(),
        ...(p.draft
          ? { draft: { ...p.draft, revision: 1, state: "active" as const } }
          : {}),
        userId: a.id,
        url: p.url,
        forceRefresh: p.forceRefresh,
        status: "pending" as const,
      };
      s.imports.push(j);
      return importView(j);
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
    fail(
      400,
      "We could not identify this action. Refresh the page and try again.",
    );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([action, body]))
    .digest("hex");
  const prior = s.replays.find((r) => r.userId === a.id && r.key === key);
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      fail(
        409,
        "We could not confirm this action. Refresh to check your changes before trying again.",
      );
    // Return only the operation identifier, never a historical private DTO.
    const result = prior.result as { id?: unknown; duplicate?: unknown } | null;
    if (action === "friends.create") {
      const entry =
        s.friendEntries.find(
          (f) => f.id === result?.id && f.creatorId === a.id,
        ) ?? fail(404, "Friend entry not found.");
      return { ...entry, replayed: true };
    }
    if (action.startsWith("imports.")) {
      const job =
        s.imports.find((j) => j.id === result?.id && j.userId === a.id) ??
        fail(404, "Import not found.");
      // Forms need the current status and draft revision to resume polling/saving.
      // Reauthorize the live record instead of replaying its historical snapshot.
      return { ...importView(job), replayed: true };
    }
    if (result?.duplicate) {
      const current = command(s, a, action, body);
      prior.result = current;
      return current;
    }
    return {
      ok: true,
      replayed: true,
      ...(typeof result?.id === "string" ? { id: result.id } : {}),
    };
  }
  const result = command(s, a, action, body);
  s.replays.push({ ...stamp(), userId: a.id, key, fingerprint, result });
  s.replays = s.replays.filter(
    (r) => Date.parse(r.createdAt) > Date.now() - 7 * 86400000,
  );
  return result;
}
