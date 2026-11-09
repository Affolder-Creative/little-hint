import { itemPhotos, removeItemPhoto } from "../shared/item-photos";
import { reconcileEventParticipants, reconcileHouseholds } from "./domain";
import { profileOwner, managerCandidates } from "./profile-management";
import { randomUUID } from "node:crypto";
import type { Actor, State } from "../shared/model";
import { noteVisible } from "./activity";
import {
  draftAccess,
  controllers,
  isAdmin,
  personVisible,
  itemVisible,
  reconcileAccess,
} from "./domain-access";
import { fail, stamp, touch } from "./domain-common";

const active = (e: State["exchanges"][number]) =>
  !e.archived && !e.deletedAt && e.status !== "cancelled";
export function closurePlan(
  s: State,
  a: Actor,
  options: { removeAuthoredContent?: boolean } = {},
) {
  const people = s.people.filter((p) => p.userId === a.id);
  const own = new Set(people.map((p) => p.id));
  const privateLists = new Set(
    s.lists
      .filter((l) => l.ownerIds.length && l.ownerIds.every((id) => own.has(id)))
      .map((l) => l.id),
  );
  const removedItems = new Set(
    s.items
      .filter(
        (i) =>
          (i.listId && privateLists.has(i.listId)) ||
          (!i.listId && i.creatorId === a.id) ||
          (options.removeAuthoredContent && i.creatorId === a.id),
      )
      .map((i) => i.id),
  );
  const blockers: {
    kind: string;
    id: string;
    title: string;
    detail: string;
    href: string;
  }[] = [];
  if (
    isAdmin(s, a) &&
    !s.people.some((p) => p.admin && p.userId && p.userId !== a.id)
  )
    blockers.push({
      kind: "admin",
      id: people.find((p) => p.admin)!.id,
      title: "Hand off app administration",
      detail:
        "Another account must accept administration before the last administrator can leave.",
      href: "/settings?section=security",
    });
  for (const g of s.groups.filter(
    (g) => g.ownerId === a.id && g.memberIds.some((id) => id !== a.id),
  ))
    blockers.push({
      kind: "group",
      id: g.id,
      title: `Transfer ${g.name}`,
      detail: "Ask another member to accept ownership in Family groups.",
      href: `/settings?section=groups&group=${g.id}`,
    });
  for (const p of s.people.filter(
    (p) => !p.userId && p.guardians.includes(a.id) && profileOwner(p) === a.id,
  ))
    blockers.push({
      kind: "guardian",
      id: p.id,
      title: `Hand off ${p.name}'s profile`,
      detail:
        "Another trusted member must accept responsibility for this managed profile.",
      href: "/settings?section=security",
    });
  for (const e of s.exchanges.filter(
    (e) =>
      active(e) &&
      (e.organizerId === a.id || e.participantIds.some((id) => own.has(id))),
  ))
    blockers.push({
      kind: "exchange",
      id: e.id,
      title: `Resolve ${e.name}`,
      detail:
        "Finish and archive or cancel this exchange with its organizer before closing your account.",
      href: `/exchanges/${e.id}`,
    });
  if (
    s.reservations.some(
      (r) => r.buyerId === a.id && r.quantity > r.purchased,
    ) ||
    s.contributions.some(
      (c) =>
        (["pledged", "sent"].includes(c.status) ||
          c.returns?.some((r) => r.status === "sent")) &&
        (c.userId === a.id ||
          s.reservations.some(
            (r) => r.id === c.reservationId && r.buyerId === a.id,
          )),
    )
  )
    blockers.push({
      kind: "commitments",
      id: "buying",
      title: "Settle your gift commitments",
      detail:
        "Resolve unpurchased reservations, pledged or sent contributions, and returns awaiting receipt. Account closure does not cancel them.",
      href: "/buying",
    });
  if (
    s.reservations.some(
      (r) =>
        removedItems.has(r.itemId) &&
        (r.quantity > r.purchased ||
          s.contributions.some(
            (c) =>
              c.reservationId === r.id &&
              ["pledged", "sent"].includes(c.status),
          )),
    )
  )
    blockers.push({
      kind: "shared-activity",
      id: "shared",
      title: "Resolve shared gift activity",
      detail:
        "Ask your group organizer to resolve open gift activity before closing your account. Private buying details are not shown here.",
      href: "/settings?section=groups",
    });
  return { blockers, own, privateLists, removedItems };
}
export function handoffCandidates(s: State, a: Actor) {
  return s.people
    .filter((p) => p.userId && p.userId !== a.id && personVisible(s, a, p))
    .map((p) => ({ id: p.userId!, name: p.name }));
}
export function requestHandoff(
  s: State,
  a: Actor,
  kind: "admin" | "guardian",
  personId: string,
  userId: string,
  keepPreviousOwner = false,
) {
  const source = s.people.find((p) => p.id === personId);
  const candidates =
    kind === "guardian" && source
      ? managerCandidates(s, a, source)
      : handoffCandidates(s, a);
  if (userId === a.id || !candidates.some((p) => p.id === userId))
    fail(404, "Choose another trusted member.");
  const person = s.people.find((p) => p.id === personId);
  if (
    !person ||
    (kind === "admin"
      ? person.userId !== a.id || !person.admin
      : !!person.userId || profileOwner(person) !== a.id)
  )
    fail(403, "You cannot transfer this responsibility.");
  s.links = s.links.filter(
    (l) =>
      l.kind !== kind ||
      l.targetId !== personId ||
      (kind !== "guardian" && l.requestedBy !== a.id) ||
      l.consumed,
  );
  s.links.push({
    ...stamp(),
    kind,
    userId,
    requestedBy: a.id,
    keepPreviousOwner,
    targetId: personId,
    consumed: false,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
}
export function acceptHandoff(s: State, a: Actor, id: string) {
  const link = s.links.find(
    (l) =>
      l.id === id &&
      l.userId === a.id &&
      !l.consumed &&
      Date.parse(l.expiresAt) > Date.now() &&
      ["guardian", "admin"].includes(l.kind),
  );
  if (!link) fail(404, "This handoff is no longer available.");
  const source = s.people.find((p) => p.id === link.targetId);
  const from = s.people.find((p) => p.userId === link.requestedBy);
  const target = s.people.find((p) => p.userId === a.id);
  if (
    !source ||
    !from ||
    !target ||
    !(
      link.kind === "guardian"
        ? managerCandidates(
            s,
            { id: from.userId!, name: from.name, email: "" },
            source,
          )
        : handoffCandidates(s, {
            id: from.userId!,
            name: from.name,
            email: "",
          })
    ).some((p) => p.id === a.id)
  )
    fail(409, "This handoff is no longer available.");
  if (link.kind === "admin") {
    if (!source.admin || source.userId !== link.requestedBy)
      fail(409, "Administration already changed.");
    target.admin = true;
    source.admin = false;
    touch(target);
  } else {
    if (source.userId || profileOwner(source) !== link.requestedBy)
      fail(409, "This profile already changed.");
    source.guardians = [
      ...new Set([
        ...source.guardians.filter(
          (id) => link.keepPreviousOwner || id !== link.requestedBy,
        ),
        a.id,
      ]),
    ];
  }
  if (link.kind === "guardian") {
    source.managedOwnerId = a.id;
    for (const old of s.links.filter(
      (l) =>
        l.targetId === source.id &&
        ["guardian", "profile"].includes(l.kind) &&
        l.id !== link.id &&
        !l.consumed,
    )) {
      old.consumed = true;
      old.cancelled = true;
      touch(old);
      const invitation = s.invitations.find((i) => i.id === old.invitationId);
      if (invitation && !invitation.acceptedBy) {
        invitation.revoked = true;
        touch(invitation);
      }
    }
    if (source.managedGroupIds)
      source.managedGroupIds = source.managedGroupIds.filter((id) =>
        s.groups.some(
          (g) =>
            g.id === id &&
            source.guardians.some((u) => g.memberIds.includes(u)),
        ),
      );
    reconcileEventParticipants(s);
    reconcileHouseholds(s);
    reconcileAccess(s);
  }
  touch(source);
  link.consumed = true;
  touch(link);
}
/** Deletes private records; retains only anonymous links needed by shared history. */
export function closeAccountData(
  s: State,
  a: Actor,
  options: {
    keepSharedContent?: boolean;
    removeAuthoredContent?: boolean;
  } = {},
) {
  const plan = closurePlan(s, a, options);
  if (plan.blockers.length)
    fail(
      409,
      "Resolve the listed responsibilities and gift commitments first.",
    );
  const anonymous = randomUUID();
  const formerNames = new Set(
    s.people.filter((p) => plan.own.has(p.id)).map((p) => p.name),
  );
  const formerlyOwnedLists = new Set(
    s.lists
      .filter((l) => l.ownerIds.some((id) => plan.own.has(id)))
      .map((l) => l.id),
  );
  const scrubSnapshot = (value: unknown): unknown =>
    typeof value === "string"
      ? formerNames.has(value) || value === a.email
        ? "Former member"
        : value
      : Array.isArray(value)
        ? value.map(scrubSnapshot)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([k, v]) => [k, scrubSnapshot(v)]),
            )
          : value;
  const orphanFriends = new Set(
    s.friendEntries
      .filter((f) => f.creatorId === a.id)
      .map((f) => f.originalPersonId),
  );
  const soloGroups = new Set(
    s.groups.filter((g) => g.ownerId === a.id).map((g) => g.id),
  );
  const remainingAccounts = s.people
    .filter((p) => p.userId && p.userId !== a.id)
    .map((p) => ({ id: p.userId!, name: p.name, email: "" }));
  const hasRemainingGroupAudience = (groupIds: string[]) =>
    s.groups.some(
      (g) =>
        groupIds.includes(g.id) &&
        !soloGroups.has(g.id) &&
        g.memberIds.some((id) => remainingAccounts.some((p) => p.id === id)),
    );
  const removedLists = options.keepSharedContent
    ? new Set(
        [...plan.privateLists].filter(
          (id) =>
            !hasRemainingGroupAudience(
              s.lists.find((l) => l.id === id)?.groupIds ?? [],
            ),
        ),
      )
    : plan.privateLists;
  const removedItems = options.keepSharedContent
    ? new Set(
        s.items
          .filter(
            (i) =>
              (i.listId && removedLists.has(i.listId)) ||
              (!i.listId &&
                i.creatorId === a.id &&
                !remainingAccounts.some((p) => itemVisible(s, p, i))),
          )
          .map((i) => i.id),
      )
    : new Set([
        ...plan.removedItems,
        ...(options.removeAuthoredContent
          ? s.items.filter((i) => i.creatorId === a.id).map((i) => i.id)
          : []),
      ]);
  for (const item of s.items) {
    if (
      item.publicationState === "draft" &&
      (item.draftOwnerId ?? item.creatorId) === a.id &&
      !remainingAccounts.some((p) => draftAccess(s, p, item))
    )
      removedItems.add(item.id);
  }
  const retainedNotes = new Set(
    s.comments
      .filter((c) => {
        const item = s.items.find((i) => i.id === c.itemId);
        return (
          item &&
          !removedItems.has(item.id) &&
          remainingAccounts.some((p) => noteVisible(s, p, item, c.giverId, c))
        );
      })
      .map((c) => c.id),
  );
  if (options.keepSharedContent) {
    s.comments = s.comments.filter(
      (c) => c.authorId !== a.id || retainedNotes.has(c.id),
    );
    for (const list of s.lists.filter(
      (l) => plan.privateLists.has(l.id) && !removedLists.has(l.id),
    )) {
      list.archived = true;
      touch(list);
    }
    for (const item of s.items.filter(
      (i) => !i.listId && i.creatorId === a.id && !removedItems.has(i.id),
    )) {
      item.archived = true;
      touch(item);
    }
  }
  const privateItems = new Set(
    s.items
      .filter(
        (i) =>
          removedItems.has(i.id) && !i.listId && i.visibility === "private",
      )
      .map((i) => i.id),
  );
  const privateReservations = new Set(
    s.reservations
      .filter(
        (r) =>
          r.buyerId === a.id &&
          (privateItems.has(r.itemId) || (!r.quantity && !r.purchased)) &&
          !s.contributions.some(
            (c) => c.reservationId === r.id && c.userId !== a.id,
          ),
      )
      .map((r) => r.id),
  );
  const removedEvents = new Set(
    s.groupEvents.filter((e) => soloGroups.has(e.groupId)).map((e) => e.id),
  );
  s.groups = s.groups.filter((g) => !soloGroups.has(g.id));
  for (const g of s.groups.filter(
    (g) => g.memberIds.includes(a.id) || g.eventLeaderIds?.includes(a.id),
  )) {
    g.memberIds = g.memberIds.filter((id) => id !== a.id);
    g.eventLeaderIds = g.eventLeaderIds?.filter((id) => id !== a.id);
    touch(g);
  }
  s.households = s.households.filter((h) => !soloGroups.has(h.groupId));
  s.householdMemberships = s.householdMemberships.filter(
    (m) =>
      !plan.own.has(m.personId) &&
      s.households.some((h) => h.id === m.householdId),
  );
  s.groupEvents = s.groupEvents.filter((e) => !soloGroups.has(e.groupId));
  for (const e of s.groupEvents.filter((e) =>
    e.participantIds.some((id) => plan.own.has(id)),
  )) {
    e.participantIds = e.participantIds.filter((id) => !plan.own.has(id));
    touch(e);
  }
  s.lists = s.lists.filter((l) => !removedLists.has(l.id));
  for (const l of s.lists.filter(
    (l) =>
      l.ownerIds.some((id) => plan.own.has(id)) ||
      l.pendingOwnerIds.some((id) => plan.own.has(id)) ||
      l.groupIds.some((id) => soloGroups.has(id)),
  )) {
    l.ownerIds = l.ownerIds.filter((id) => !plan.own.has(id));
    l.pendingOwnerIds = l.pendingOwnerIds.filter((id) => !plan.own.has(id));
    l.groupIds = l.groupIds.filter((id) => !soloGroups.has(id));
    if (l.groupEventId && removedEvents.has(l.groupEventId))
      delete l.groupEventId;
    touch(l);
  }
  s.items = s.items.filter((i) => !removedItems.has(i.id));
  for (const i of s.items) {
    i.groupIds = i.groupIds.filter((id) => !soloGroups.has(id));
    if (i.creatorId === a.id) i.creatorId = anonymous;
    if (i.draftOwnerId === a.id) i.draftOwnerId = anonymous;
  }
  for (const p of s.people) {
    if (plan.own.has(p.id)) {
      delete p.userId;
      p.name = "Former member";
      p.admin = false;
    }
    if (p.guardians.includes(a.id)) {
      p.guardians = p.guardians.filter((id) => id !== a.id);
      p.managedGroupIds = p.managedGroupIds?.filter((id) =>
        s.groups.some(
          (g) =>
            g.id === id && p.guardians.some((u) => g.memberIds.includes(u)),
        ),
      );
      touch(p);
    }
  }
  reconcileEventParticipants(s);
  reconcileHouseholds(s);
  reconcileAccess(s);
  s.giftPreferences = s.giftPreferences.filter(
    (p) => !plan.own.has(p.personId) && !orphanFriends.has(p.personId),
  );
  s.friendEntries = s.friendEntries.filter((f) => f.creatorId !== a.id);
  for (const f of s.friendEntries)
    if (plan.own.has(f.personId)) {
      f.name = "Former member";
      f.archived = true;
      touch(f);
    }
  for (const p of s.people)
    if (
      orphanFriends.has(p.id) &&
      !controllers(p).length &&
      !s.friendEntries.some(
        (f) => f.personId === p.id || f.originalPersonId === p.id,
      )
    )
      p.name = "Former recipient";
  s.reservations = s.reservations.filter((r) => !privateReservations.has(r.id));
  s.contributions = s.contributions.filter(
    (c) => !privateReservations.has(c.reservationId),
  );
  for (const r of s.reservations)
    if (r.sourceReviewedBy) delete r.sourceReviewedBy[a.id];
  for (const c of s.contributions)
    for (const ret of c.returns ?? [])
      if (ret.recordedBy === a.id) ret.recordedBy = anonymous;
  for (const r of s.reservations)
    if (r.buyerId === a.id) {
      r.buyerId = anonymous;
      r.former = true;
      touch(r);
    }
  for (const c of s.contributions)
    if (c.userId === a.id) {
      c.userId = anonymous;
      touch(c);
    }
  for (const c of s.comments) {
    if (c.authorId === a.id) {
      c.authorId = anonymous;
      if (!options.keepSharedContent) c.body = "Comment removed";
      c.mentions = [];
      touch(c);
    } else if (c.mentions?.some((m) => m.userId === a.id)) {
      for (const m of c.mentions
        .filter((m) => m.userId === a.id)
        .sort((x, y) => y.start - x.start))
        c.body =
          c.body.slice(0, m.start) + "Former member" + c.body.slice(m.end);
      c.mentions = [];
      touch(c);
    }
  }
  s.comments = s.comments.filter((c) => !removedItems.has(c.itemId));
  for (const e of s.exchanges)
    if (e.organizerId === a.id) e.organizerId = anonymous;
  s.exchanges = s.exchanges.filter((e) => !soloGroups.has(e.groupId));
  s.spendingRecords = s.spendingRecords.filter((r) => r.ownerId !== a.id);
  for (const r of s.spendingRecords) {
    r.recipientNames = r.recipientNames.map((name, n) =>
      plan.own.has(r.recipientIds[n]) ? "Former member" : name,
    );
    if (r.listId && removedLists.has(r.listId)) {
      r.listName = "Former member's list";
      r.listOwnerNames = ["Former member"];
    }
    if (r.listId && formerlyOwnedLists.has(r.listId))
      r.listOwnerNames = r.listOwnerNames?.map((name) =>
        formerNames.has(name) ? "Former member" : name,
      );
    r.history = r.history.filter((h) => h.actorId !== a.id);
    if (
      r.recipientIds.some((id) => plan.own.has(id)) ||
      (!!r.listId && formerlyOwnedLists.has(r.listId))
    )
      for (const h of r.history)
        if (h.changes) h.changes = scrubSnapshot(h.changes) as typeof h.changes;
  }
  const connections = new Set(
    s.spendingConnections
      .filter((c) => c.users.includes(a.id))
      .map((c) => c.id),
  );
  s.spendingConnections = s.spendingConnections.filter(
    (c) => !connections.has(c.id),
  );
  for (const r of s.spendingRecords)
    if (r.connectionId && connections.has(r.connectionId)) {
      delete r.connectionId;
      r.sharing = "private";
    }
  s.spendingBudgets = s.spendingBudgets.filter((r) => r.ownerId !== a.id);
  s.spendingOccasions = s.spendingOccasions.filter((r) => r.ownerId !== a.id);
  for (const record of [...s.spendingBudgets, ...s.spendingOccasions])
    if (record.connectionId && connections.has(record.connectionId))
      delete record.connectionId;
  const removedInvitations = new Set(
    s.invitations
      .filter(
        (i) =>
          i.invitedById === a.id ||
          i.acceptedBy === a.id ||
          i.email.toLowerCase() === a.email.toLowerCase() ||
          (!!i.groupId && soloGroups.has(i.groupId)),
      )
      .map((i) => i.id),
  );
  s.groupInviteRequests = s.groupInviteRequests.filter(
    (r) =>
      r.requestedBy !== a.id &&
      !soloGroups.has(r.groupId) &&
      r.email.toLowerCase() !== a.email.toLowerCase(),
  );
  s.invitations = s.invitations.filter((i) => !removedInvitations.has(i.id));
  s.links = s.links.filter(
    (l) =>
      l.userId !== a.id &&
      l.requestedBy !== a.id &&
      l.email?.toLowerCase() !== a.email.toLowerCase() &&
      !plan.own.has(l.targetId ?? ""),
  );
  s.notices = s.notices.filter(
    (n) =>
      n.userId !== a.id &&
      n.actorId !== a.id &&
      !removedItems.has(n.itemId ?? "") &&
      !removedLists.has(n.listId ?? "") &&
      !removedInvitations.has(n.invitationId ?? ""),
  );
  for (const kind of [
    "preferences",
    "pushDevices",
    "imports",
    "giftDiscoveryJobs",
    "organization",
    "follows",
    "watches",
    "priceWatches",
    "replays",
    "notificationBatches",
    "spendingSettings",
    "smsChallenges",
    "smsGrants",
    "smsAttempts",
    "smsConsents",
  ] as const) {
    (s[kind] as { userId: string }[]) = s[kind].filter(
      (r) => r.userId !== a.id,
    );
  }
  s.giftDiscoveryJobs = s.giftDiscoveryJobs.filter(
    (j) => !plan.own.has(j.input.personId),
  );
  s.follows = s.follows.filter(
    (f) =>
      !plan.own.has(f.targetId) &&
      !removedLists.has(f.targetId) &&
      !soloGroups.has(f.targetId),
  );
  s.watches = s.watches.filter((w) => !removedItems.has(w.itemId));
  s.priceWatches = s.priceWatches.filter((w) => !removedItems.has(w.itemId));
  s.priceChanges = s.priceChanges.filter((c) => !removedItems.has(c.itemId));
  for (const check of s.priceChecks)
    check.targets = check.targets.filter((t) => !removedItems.has(t.id));
  s.priceChecks = s.priceChecks.filter((c) => c.targets.length);
  s.notificationBatches = s.notificationBatches.filter(
    (b) => !removedLists.has(b.listId),
  );
  for (const b of s.notificationBatches)
    b.noticeIds = b.noticeIds.filter((id) =>
      s.notices.some((n) => n.id === id),
    );
  s.usage = s.usage.filter((u) => !u.key.split(":").includes(a.id));
  for (const m of s.media.filter((m) => m.userId === a.id)) {
    m.userId = anonymous;
    if (
      options.keepSharedContent &&
      s.items.some((i) => itemPhotos(i).includes(`/api/v1/media/${m.id}`))
    )
      continue;
    m.deletedAt = new Date().toISOString();
    m.purgeAfterAccountClosure = true;
    const url = `/api/v1/media/${m.id}`;
    for (const i of s.items)
      if (itemPhotos(i).includes(url)) removeItemPhoto(i, url);
    for (const j of s.imports) {
      if (j.result?.image === url) j.result.image = "";
      if (j.draft && itemPhotos(j.draft.fields).includes(url))
        removeItemPhoto(j.draft.fields, url);
    }
    for (const j of s.giftDiscoveryJobs)
      for (const c of j.candidates) if (c.image === url) c.image = "";
  }
  const privateReferences = [
    a.id,
    ...plan.own,
    ...removedLists,
    ...removedItems,
  ];
  s.replays = s.replays.filter(
    (r) =>
      !privateReferences.some((id) =>
        (JSON.stringify(r.result) ?? "").includes(id),
      ),
  );
  // Remaining shared snapshots can contain user IDs as object keys or nested values.
  const replace = (value: unknown): unknown =>
    typeof value === "string"
      ? value === a.id
        ? anonymous
        : value
      : Array.isArray(value)
        ? value.map(replace)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([k, v]) => [
                k === a.id ? anonymous : k,
                replace(v),
              ]),
            )
          : value;
  Object.assign(s, replace(s));
}
