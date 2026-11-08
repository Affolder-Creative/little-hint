import type { Actor, Person, State } from "../shared/model";
import { fail, touch } from "./domain-common";
export function takeOverProfile(
  s: State,
  a: Actor,
  managed: Person,
  preferenceSource: "account" | "managed",
) {
  const account =
    s.people.find((p) => p.userId === a.id && !p.mergedIntoId) ??
    fail(409, "Finish creating your account first.");
  if (account.id === managed.id) fail(409, "This profile is already yours.");
  if (managed.guardians.includes(a.id))
    fail(409, "You cannot take over a profile you manage yourself.");
  const old = managed.id;
  // Transfer draft control without changing the historical author.
  const inheritedDrafts = s.items.filter(
    (i) =>
      i.publicationState === "draft" &&
      i.recipientIds.includes(old) &&
      !s.people.some(
        (p) =>
          p.userId === (i.draftOwnerId ?? i.creatorId) &&
          s.lists.some((l) => l.id === i.listId && l.ownerIds.includes(p.id)),
      ),
  );

  if (
    s.items.some(
      (i) =>
        i.recipientIds.includes(old) &&
        (i.creatorId === a.id ||
          s.reservations.some((r) => r.itemId === i.id && r.buyerId === a.id)),
    )
  )
    fail(
      409,
      "You have gift plans for this profile. Ask its manager to check the intended recipient.",
    );
  if (
    s.groupEvents.some(
      (e) =>
        !e.deletedAt &&
        e.participantIds.includes(old) &&
        e.participantIds.includes(account.id),
    )
  )
    fail(
      409,
      "Both profiles are selected for an event. Ask its leader to remove one participant before taking over.",
    );
  if (
    s.exchanges.some(
      (e) =>
        !e.archived &&
        !e.deletedAt &&
        e.status !== "cancelled" &&
        e.participantIds.includes(old) &&
        (e.participantIds.includes(account.id) ||
          !s.groups.some(
            (g) => g.id === e.groupId && g.memberIds.includes(a.id),
          )),
    )
  )
    fail(
      409,
      "Resolve active exchange participation first. Join its family group and ask the organizer to remove any duplicate profile, or finish the exchange before taking over.",
    );
  for (const link of s.links.filter(
    (l) =>
      l.targetId === managed.id && ["guardian", "profile"].includes(l.kind),
  )) {
    link.consumed = true;
    touch(link);
  }
  const existing = s.giftPreferences.find((p) => p.personId === account.id);
  const incoming = s.giftPreferences.find((p) => p.personId === old);
  const existingHasDetails =
    existing &&
    (existing.categoryIds.length ||
      existing.interests ||
      existing.likes ||
      existing.avoid);
  if (incoming && (!existingHasDetails || preferenceSource === "managed")) {
    if (existing)
      s.giftPreferences = s.giftPreferences.filter((p) => p.id !== existing.id);
    incoming.personId = account.id;
    incoming.groupIds = incoming.groupIds.filter((id) =>
      s.groups.some((g) => g.id === id && g.memberIds.includes(a.id)),
    );
    touch(incoming);
  } else
    s.giftPreferences = s.giftPreferences.filter((p) => p.personId !== old);
  // Replace identifier references, including nested assignment pairs and spending splits.
  // Never replace names or substrings in free-form notes.
  const remap = (value: unknown): unknown => {
    if (value === old) return account.id;
    if (
      typeof value === "string" &&
      value
        .split("|")
        .some(
          (part) => part === `person:${old}` || part === `items:person:${old}`,
        )
    )
      return value
        .split("|")
        .map((part) =>
          part === `person:${old}`
            ? `person:${account.id}`
            : part === `items:person:${old}`
              ? `items:person:${account.id}`
              : part,
        )
        .join("|");
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key === old ? account.id : key,
          remap(v),
        ]),
      );
    return value;
  };
  for (const [kind, rows] of Object.entries(s)) {
    if (["people", "giftPreferences", "settings", "replays"].includes(kind))
      continue;
    for (const row of rows) {
      const replacement = remap(row);
      if (JSON.stringify(row) !== JSON.stringify(replacement)) {
        Object.assign(row, replacement);
        touch(row);
      }
    }
  }
  for (const list of s.lists) {
    list.ownerIds = [...new Set(list.ownerIds)];
    list.pendingOwnerIds = [...new Set(list.pendingOwnerIds)];
  }
  for (const item of s.items)
    item.recipientIds = [...new Set(item.recipientIds)];
  for (const record of s.spendingRecords) {
    const unique = [...new Set(record.recipientIds)];
    if (unique.length === record.recipientIds.length) continue;
    const sums = unique.map((id) =>
      record.recipientIds.reduce(
        (sum, current, index) =>
          sum + (current === id ? record.splits[index] : 0),
        0,
      ),
    );
    record.recipientNames = unique.map((id) =>
      id === account.id
        ? account.name
        : record.recipientNames[record.recipientIds.indexOf(id)],
    );
    record.recipientIds = unique;
    record.splits = sums;
    touch(record);
  }
  for (const item of inheritedDrafts) {
    item.draftOwnerId = a.id;
    touch(item);
  }
  managed.guardians = [];
  delete managed.managedOwnerId;
  delete managed.userId;
  managed.mergedIntoId = account.id;
  touch(managed);
  touch(account);
  return account.id;
}
