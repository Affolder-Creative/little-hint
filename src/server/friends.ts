import { z } from "zod";
import type {
  Actor,
  FriendEntry,
  State,
  Invitation,
  Visibility,
} from "../shared/model";
import {
  stamp,
  touch,
  fail,
  id,
  ids,
  text,
  revision,
  checkRevision,
  normalizedEmail,
} from "./domain-common";
import { groupAccess, reconcileAccess } from "./domain-access";
import { invitationIsPending } from "../shared/invitations";

export const friendVisible = (s: State, a: Actor, f: FriendEntry) =>
  f.creatorId === a.id ||
  (!f.archived && f.groupIds.some((g) => groupAccess(s, a, g)));
export function friendContext(
  s: State,
  a: Actor,
  personId: string,
  supplied?: string,
  editing = false,
) {
  const entries = s.friendEntries.filter(
    (f) => f.personId === personId && !f.archived && friendVisible(s, a, f),
  );
  if (supplied) {
    const f = s.friendEntries.find(
      (f) => f.id === supplied && f.personId === personId,
    );
    if (
      !f ||
      (!editing &&
        (f.archived ||
          (!friendVisible(s, a, f) &&
            !s.items.some(
              (i) => i.friendEntryId === f.id && i.creatorId === a.id,
            ) &&
            !s.imports.some(
              (j) => j.userId === a.id && j.draft?.friendEntryId === f.id,
            ))))
    )
      fail(404, "Friend entry not available.");
    return f;
  }
  const own = entries.find((f) => f.creatorId === a.id);
  if (own) return own;
  if (entries.length > 1) fail(400, "Choose the friend entry for this idea.");
  if (entries.length) return entries[0];
  if (
    s.friendEntries.some(
      (f) => f.originalPersonId === personId && !f.connectedAt,
    )
  )
    fail(404, "Friend entry is archived or no longer shared with you.");
  return undefined;
}
export function checkFriendAudience(
  s: State,
  a: Actor,
  f: FriendEntry | undefined,
  visibility: Visibility,
  groups: string[],
) {
  if (!f) return;
  if (visibility === "visible")
    fail(400, "Ideas for this friend must stay hidden from the recipient.");
  if (
    groups.some((g) => !f.groupIds.includes(g) || !groupAccess(s, a, g)) ||
    (f.archived && groups.length)
  )
    fail(400, "Choose groups this friend is currently shared with.");
}
function removeAudience(s: State, f: FriendEntry, groups: string[]) {
  for (const i of s.items.filter((i) => i.friendEntryId === f.id)) {
    const next = i.groupIds.filter((g) => groups.includes(g));
    if (next.length !== i.groupIds.length) {
      i.groupIds = next;
      if (!next.length) i.visibility = "private";
      touch(i);
    }
  }
  for (const j of s.imports.filter((j) => j.draft?.friendEntryId === f.id)) {
    j.draft!.groupIds = (j.draft!.groupIds ?? []).filter((g) =>
      groups.includes(g),
    );
    if (!j.draft!.groupIds.length) j.draft!.visibility = "private";
    j.draft!.revision++;
    touch(j);
  }
  reconcileAccess(s);
}
export function friendCommand(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
) {
  if (action === "friends.create") {
    const p = z.object({ name: text }).parse(raw);
    const person = { ...stamp(), name: p.name, guardians: [] as string[] };
    const f: FriendEntry = {
      ...stamp(),
      creatorId: a.id,
      name: p.name,
      personId: person.id,
      originalPersonId: person.id,
      groupIds: [],
      archived: false,
    };
    s.people.push(person);
    s.friendEntries.push(f);
    return f;
  }
  const p = z.object({ id }).passthrough().parse(raw);
  const f =
    s.friendEntries.find((f) => f.id === p.id && f.creatorId === a.id) ??
    fail(404, "Friend entry not found.");
  if (action === "friends.invite") {
    const { email } = z
      .object({ email: z.string().trim().pipe(z.email()) })
      .parse(raw);
    if (f.archived || f.connectedAt)
      fail(400, "This friend cannot be invited to connect.");
    if (normalizedEmail(email) === normalizedEmail(a.email))
      fail(400, "Choose your friend's email, not your own.");
    for (const inv of s.invitations.filter(
      (i) => i.friendEntryId === f.id && invitationIsPending(i),
    )) {
      inv.revoked = true;
      touch(inv);
    }
    const inv: Invitation = {
      ...stamp(),
      friendEntryId: f.id,
      email: normalizedEmail(email),
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
  const v = z.object({ revision }).parse(raw);
  checkRevision(f, v.revision);
  if (action === "friends.archive") {
    const { archived } = z.object({ archived: z.boolean() }).parse(raw);
    f.archived = archived;
    f.groupIds = [];
    removeAudience(s, f, []);
    for (const inv of s.invitations.filter(
      (i) => i.friendEntryId === f.id && invitationIsPending(i),
    )) {
      inv.revoked = true;
      touch(inv);
    }
  } else if (action === "friends.update") {
    const v = z
      .object({
        name: text,
        groupIds: ids,
        confirmSharing: z.boolean().optional(),
      })
      .parse(raw);
    if (f.archived) fail(400, "Restore this friend before editing.");
    if (v.groupIds.some((g) => !groupAccess(s, a, g)))
      fail(404, "Family group not found.");
    if (v.groupIds.some((g) => !f.groupIds.includes(g)) && !v.confirmSharing)
      fail(409, "Review who can see this friend before sharing.");
    f.name = v.name;
    f.groupIds = v.groupIds;
    if (!f.connectedAt) {
      const person = s.people.find((p) => p.id === f.personId)!;
      person.name = v.name;
      touch(person);
    }
    removeAudience(s, f, v.groupIds);
  } else fail(404, "Action not found.");
  touch(f);
  return f;
}
export function acceptFriend(s: State, a: Actor, inv: Invitation) {
  const f =
    s.friendEntries.find(
      (f) => f.id === inv.friendEntryId && !f.archived && !f.connectedAt,
    ) ?? fail(404, "Connection request no longer available.");
  if (f.creatorId === a.id)
    fail(400, "You cannot connect this entry to yourself.");
  const person =
    s.people.find((p) => p.userId === a.id) ??
    fail(400, "Finish creating your account first.");
  const old = f.personId;
  // A mistaken link must never turn the recipient into a giver for their own gifts.
  if (
    s.items.some(
      (i) =>
        i.recipientIds.includes(old) &&
        (i.creatorId === a.id ||
          s.reservations.some((r) => r.itemId === i.id && r.buyerId === a.id)),
    ) ||
    s.spendingRecords.some(
      (r) => r.ownerId === a.id && r.recipientIds.includes(old),
    )
  )
    fail(
      409,
      "You have saved ideas for this entry. Ask the inviter to check the recipient.",
    );
  for (const i of s.items.filter((i) => i.recipientIds.includes(old))) {
    i.recipientIds = [
      ...new Set(i.recipientIds.map((x) => (x === old ? person.id : x))),
    ];
    touch(i);
  }
  for (const j of s.imports.filter((j) => j.draft?.recipientId === old)) {
    j.draft!.recipientId = person.id;
    j.draft!.revision++;
    touch(j);
  }
  for (const r of s.spendingRecords.filter((r) =>
    r.recipientIds.includes(old),
  )) {
    r.recipientIds = [...r.recipientIds];
    r.recipientNames = [...r.recipientNames];
    r.splits = [...r.splits];
    const index = r.recipientIds.indexOf(old),
      existing = r.recipientIds.indexOf(person.id);
    if (existing >= 0) {
      r.splits[existing] += r.splits[index];
      r.splits.splice(index, 1);
      r.recipientIds.splice(index, 1);
      r.recipientNames.splice(index, 1);
    } else r.recipientIds[index] = person.id;
    if (r.rule === `person:${old}`) r.rule = `person:${person.id}`;
    touch(r);
  }
  for (const budget of s.spendingBudgets.filter((b) =>
    b.scope.split("|").includes(`person:${old}`),
  )) {
    budget.originalScope ??= budget.scope;
    budget.friendEntryId ??= f.id;
    budget.scope = budget.scope
      .split("|")
      .map((x) => (x === `person:${old}` ? `person:${person.id}` : x))
      .join("|");
    touch(budget);
  }
  for (const connection of s.spendingConnections) {
    for (const [userId, rules] of Object.entries(connection.rules)) {
      if (rules.includes(`person:${old}`)) {
        connection.rules[userId] = [
          ...new Set(
            rules.map((x) =>
              x === `person:${old}` ? `person:${person.id}` : x,
            ),
          ),
        ];
        touch(connection);
      }
    }
  }
  for (const j of s.giftDiscoveryJobs.filter((j) => j.input.personId === old)) {
    j.status = "cancelled";
    j.error = "This friend connected an account. Start a new search.";
    touch(j);
  }
  for (const o of s.organization.filter(
    (o) => o.scope === `items:person:${old}`,
  )) {
    const scope = `items:person:${person.id}`;
    if (
      !s.organization.some((x) => x.userId === o.userId && x.scope === scope)
    ) {
      o.scope = scope;
      touch(o);
    }
  }
  f.personId = person.id;
  f.connectedAt = new Date().toISOString();
  touch(f);
  s.people = s.people.filter((p) => p.id !== old);
  inv.acceptedBy = a.id;
  touch(inv);
  for (const other of s.invitations.filter(
    (i) =>
      i.friendEntryId === f.id && i.id !== inv.id && invitationIsPending(i),
  )) {
    other.revoked = true;
    touch(other);
  }
  reconcileAccess(s);
  return { ok: true, personId: person.id };
}
