import type { State, Actor, Person, Group, Item, List } from "../shared/model";
import { canManageGroupEvents } from "../shared/group-events";
import { itemTrashed } from "../shared/organization";
import { listIsArchived } from "../shared/list-dates";
import { fail, touch } from "./domain-common";
import { emitActivity } from "./activity";
export const controllers = (p: Person) =>
  [p.userId, ...p.guardians].filter((v): v is string => !!v);
export const controls = (s: State, a: Actor, id: string) =>
  !!s.people.find((p) => p.id === id && controllers(p).includes(a.id));
export const ownIds = (s: State, a: Actor) =>
  s.people.filter((p) => controllers(p).includes(a.id)).map((p) => p.id);
export const member = (g: Group, a: Actor) => g.memberIds.includes(a.id);
export const groupAccess = (s: State, a: Actor, groupId: string) =>
  !!s.groups.find((g) => g.id === groupId && member(g, a));
export const managesGroupExchanges = (s: State, a: Actor, groupId: string) =>
  s.groups.some((g) => g.id === groupId && canManageGroupEvents(g, a.id));
export const isAdmin = (s: State, a: Actor) =>
  s.people.some((p) => p.userId === a.id && p.admin);
export const ownedGroup = (s: State, a: Actor, id: string) =>
  s.groups.find((g) => g.id === id && g.ownerId === a.id) ??
  fail(404, "Family group not found.");
export const personVisible = (s: State, a: Actor, p: Person) =>
  !p.mergedIntoId &&
  (s.imports.some(
    (j) =>
      j.userId === a.id &&
      !!j.draft?.friendEntryId &&
      j.draft?.recipientId === p.id,
  ) ||
    s.spendingRecords.some(
      (r) =>
        r.ownerId === a.id &&
        r.recipientIds.includes(p.id) &&
        s.friendEntries.some((f) => f.personId === p.id),
    ) ||
    s.friendEntries.some(
      (f) =>
        f.personId === p.id &&
        (f.creatorId === a.id ||
          (!f.archived && f.groupIds.some((g) => groupAccess(s, a, g)))),
    ) ||
    s.items.some(
      (i) =>
        !!i.friendEntryId &&
        i.recipientIds.includes(p.id) &&
        i.creatorId === a.id,
    ) ||
    controllers(p).includes(a.id) ||
    s.groups.some(
      (g) =>
        member(g, a) &&
        (p.userId ||
          p.managedGroupIds === undefined ||
          p.managedGroupIds.includes(g.id)) &&
        controllers(p).some((u) => g.memberIds.includes(u)),
    ) ||
    s.lists.some(
      (l) =>
        !l.deletedAt &&
        l.ownerIds.includes(p.id) &&
        l.groupIds.some((g) => groupAccess(s, a, g)),
    ) ||
    s.items.some(
      (i) => !i.listId && i.recipientIds.includes(p.id) && itemVisible(s, a, i),
    ));

export const checkRecipients = (s: State, a: Actor, rs: string[]) => {
  if (
    !rs.length ||
    rs.some(
      (id) => !s.people.some((p) => p.id === id && personVisible(s, a, p)),
    )
  )
    fail(400, "Choose an available recipient.");
};
export const checkGroups = (s: State, a: Actor, gs: string[]) => {
  if (gs.some((g) => !groupAccess(s, a, g)))
    fail(404, "Family group not found.");
};
export const recipient = (s: State, a: Actor, i: Item) =>
  i.recipientIds.some((p) => controls(s, a, p));
export const listVisible = (s: State, a: Actor, l: List) =>
  !l.deletedAt &&
  (l.ownerIds.some((p) => controls(s, a, p)) ||
    l.groupIds.some((g) => groupAccess(s, a, g)));
/** Draft access also applies to Trash and exports, independently of deletion. */
export function draftAccess(s: State, a: Actor, i: Item): boolean {
  if (i.publicationState !== "draft") return true;
  const list = s.lists.find((l) => l.id === i.listId);
  if (!list || !list.ownerIds.some((id) => controls(s, a, id))) return false;
  return (
    (i.draftOwnerId ?? i.creatorId) === a.id ||
    s.people.some(
      (p) => list.ownerIds.includes(p.id) && p.guardians.includes(a.id),
    )
  );
}
export function itemVisible(s: State, a: Actor, i: Item): boolean {
  if (itemTrashed(s, i) || !draftAccess(s, a, i)) return false;
  if (i.listId) {
    const l = s.lists.find((l) => l.id === i.listId);
    return !!l && listVisible(s, a, l);
  }
  if (i.creatorId === a.id) return true;
  if (i.visibility === "private") return false;
  if (recipient(s, a, i)) return i.visibility === "visible";
  return i.groupIds.some(
    (g) =>
      groupAccess(s, a, g) &&
      (!i.friendEntryId ||
        s.friendEntries.some(
          (f) =>
            f.id === i.friendEntryId && !f.archived && f.groupIds.includes(g),
        )),
  );
}
export const canEdit = (s: State, a: Actor, i: Item) =>
  draftAccess(s, a, i) &&
  (i.listId
    ? !!s.lists.find(
        (l) => l.id === i.listId && l.ownerIds.some((p) => controls(s, a, p)),
      )
    : i.creatorId === a.id);
export const getItem = (s: State, a: Actor, id: string) =>
  s.items.find((i) => i.id === id && itemVisible(s, a, i)) ??
  fail(404, "Item not found.");
export const archived = (s: State, i: Item) =>
  i.archived || !!s.lists.find((l) => l.id === i.listId && listIsArchived(l));
export const name = (s: State, userId: string) =>
  s.people.find((p) => p.userId === userId)?.name ?? "Former member";
export const mode = (s: State, i: Item) =>
  s.lists.find((l) => l.id === i.listId)?.mode ?? "surprise";
export function reconcileAccess(s: State) {
  for (const r of s.reservations) {
    const i = s.items.find((i) => i.id === r.itemId);
    if (
      r.quantity &&
      !r.former &&
      i &&
      !itemTrashed(s, i) &&
      !itemVisible(s, { id: r.buyerId, email: "", name: "" }, i)
    ) {
      r.quantity = r.purchased;
      r.former = true;
      touch(r);
      emitActivity(s, "access", [r.buyerId], { action: "access-lost" });
      for (const c of s.contributions.filter((c) => c.reservationId === r.id)) {
        if (c.status === "pledged") c.status = "cancelled";
        emitActivity(s, "access", [c.userId], { action: "access-lost" });
        touch(c);
      }
    }
  }
}

/** Editing a dependent's wishes does not make the guardian the gift recipient. */
export const selfRecipient = (s: State, a: Actor, ids: string[]) =>
  ids.some((id) => s.people.some((p) => p.id === id && p.userId === a.id));
export const canShop = (s: State, a: Actor, i: Item) =>
  i.publicationState !== "draft" &&
  !selfRecipient(s, a, i.recipientIds) &&
  !s.people.some(
    (p) =>
      !!p.userId && p.guardians.includes(a.id) && i.recipientIds.includes(p.id),
  ) &&
  itemVisible(s, a, i);
