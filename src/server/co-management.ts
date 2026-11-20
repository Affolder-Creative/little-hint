import { z } from "zod";
import type { Actor, State, List, Item } from "../shared/model";
import type { CoManagementView } from "../shared/co-management";
import {
  controls,
  personVisible,
  reconcileAccess,
  administersAudience,
  groupAccess,
} from "./domain-access";
import { fail, stamp, touch } from "./domain-common";
import { emitActivity } from "./activity";

export const eligibleList = (l: Pick<List, "ownerIds" | "pendingOwnerIds">) =>
  l.ownerIds.length === 1 && l.pendingOwnerIds.length === 0;
export const coManages = (s: State, a: Actor, personId: string) =>
  s.coManagement.some(
    (g) =>
      g.personId === personId &&
      g.helperId === a.id &&
      g.status === "active" &&
      s.people.some(
        (p) => p.id === personId && p.userId === g.ownerId && !p.mergedIntoId,
      ),
  );
export const delegatedList = (
  s: State,
  a: Actor,
  l: Pick<List, "ownerIds" | "pendingOwnerIds">,
) => eligibleList(l) && coManages(s, a, l.ownerIds[0]);
export const listCanManagePolicy = (s: State, a: Actor, l: List) =>
  l.ownerIds.some((id) => controls(s, a, id)) || delegatedList(s, a, l);
export const listCanEdit = (s: State, a: Actor, l: List): boolean =>
  listCanManagePolicy(s, a, l) ||
  (l.groupIds.some((g) => groupAccess(s, a, g)) &&
    administersAudience(s, a, l.groupIds));
export function listAudience(
  s: State,
  a: Actor,
  l: Pick<List, "ownerIds" | "pendingOwnerIds" | "groupIds">,
  groups: string[],
) {
  const userId = delegatedList(s, a, l)
    ? s.people.find((p) => p.id === l.ownerIds[0])!.userId!
    : a.id;
  if (
    groups.some(
      (id) =>
        !l.groupIds.includes(id) &&
        !s.groups.some((g) => g.id === id && g.memberIds.includes(userId)),
    )
  )
    fail(403, "Choose a group the account holder can share with.");
}
export function coNotice(
  s: State,
  users: string[],
  personId: string,
  message: string,
  actorId?: string,
  refs: { listId?: string; itemId?: string; content?: boolean } = {},
) {
  emitActivity(s, "access", users, {
    actorId,
    listId: refs.listId,
    itemId: refs.itemId,
    deliveryChannels: [],
    coManagement: { personId, message, content: refs.content },
  });
}
export function recoverDraft(s: State, i: Item) {
  const userId = i.draftOwnerId ?? i.creatorId;
  if (
    !s.recoveredDrafts.some((d) => d.sourceId === i.id && d.userId === userId)
  )
    s.recoveredDrafts.push({
      ...stamp(),
      sourceId: i.id,
      userId,
      title: i.title,
      description: i.description,
      url: i.url,
      image: i.image,
      images: i.images,
      descriptionRich: i.descriptionRich,
      priceCents: i.priceCents,
      currency: i.currency,
      quantity: i.quantity,
      tags: [...i.tags],
      priority: i.priority,
    });
}
export function reconcileCoManagement(s: State) {
  for (const g of s.coManagement) {
    if (g.status === "pending" && Date.parse(g.expiresAt) <= Date.now()) {
      g.status = "expired";
      touch(g);
      coNotice(
        s,
        [g.ownerId, g.helperId],
        g.personId,
        "A wish-list co-management request expired.",
      );
    }
    if (
      g.status === "active" &&
      (!s.people.some(
        (p) => p.id === g.personId && p.userId === g.ownerId && !p.mergedIntoId,
      ) ||
        !s.people.some((p) => p.userId === g.helperId))
    ) {
      g.status = "ended";
      touch(g);
    }
  }
  for (const g of s.coManagement.filter((g) => g.status === "active")) {
    const scope = s.lists
      .filter((l) => eligibleList(l) && l.ownerIds[0] === g.personId)
      .map((l) => l.id)
      .sort();
    if (JSON.stringify(g.scopeIds) !== JSON.stringify(scope)) {
      if (g.scopeIds)
        coNotice(
          s,
          [g.ownerId],
          g.personId,
          "A list changed co-management scope.",
        );
      g.scopeIds = scope;
      touch(g);
    }
  }
  for (const l of s.lists)
    if (
      eligibleList(l) &&
      s.coManagement.some(
        (g) => g.personId === l.ownerIds[0] && g.status === "active",
      ) &&
      !l.modeLocked
    ) {
      l.modeLocked = true;
      touch(l);
    }
  for (const i of [...s.items]) {
    if (i.publicationState !== "draft" || !i.listId) continue;
    const userId = i.draftOwnerId ?? i.creatorId;
    const l = s.lists.find((l) => l.id === i.listId);
    const a = { id: userId, email: "", name: "" };
    if (!l || !listCanEdit(s, a, l)) {
      recoverDraft(s, i);
      s.items = s.items.filter((x) => x.id !== i.id);
    }
  }
}
export function coManagementView(s: State, a: Actor): CoManagementView {
  const visible = s.coManagement.filter(
    (g) =>
      g.ownerId === a.id ||
      g.helperId === a.id ||
      (g.status === "active" && coManages(s, a, g.personId)),
  );
  const personIds = [
    ...new Set(
      visible.filter((g) => g.status === "active").map((g) => g.personId),
    ),
  ];
  return {
    arrangements: visible.map((g) => ({
      ...g,
      status:
        g.status === "pending" && Date.parse(g.expiresAt) <= Date.now()
          ? "expired"
          : g.status,
      ownerName:
        s.people.find((p) => p.userId === g.ownerId)?.name ?? "Former member",
      helperName:
        s.people.find((p) => p.userId === g.helperId)?.name ?? "Former member",
    })),
    candidates: s.people
      .filter(
        (p) =>
          p.userId &&
          p.userId !== a.id &&
          !p.mergedIntoId &&
          personVisible(s, a, p),
      )
      .map((p) => ({ personId: p.id, userId: p.userId!, name: p.name })),
    audiences: personIds.map((personId) => ({
      personId,
      groups: s.groups
        .filter((g) =>
          g.memberIds.includes(
            s.people.find((p) => p.id === personId)?.userId ?? "",
          ),
        )
        .map((g) => ({ id: g.id, name: g.name })),
    })),
    recoveredDrafts: s.recoveredDrafts.filter((d) => d.userId === a.id),
  };
}
export function coManagementCommand(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
) {
  if (action === "co-management.request") {
    const p = z
      .object({ personId: z.string().uuid(), helperId: z.string().uuid() })
      .parse(raw);
    const person =
      s.people.find(
        (x) => x.id === p.personId && x.userId && !x.mergedIntoId,
      ) ?? fail(404, "Account holder not found.");
    const helper =
      s.people.find((x) => x.userId === p.helperId && !x.mergedIntoId) ??
      fail(404, "Helper not found.");
    if (
      person.userId === p.helperId ||
      ![person.userId, p.helperId].includes(a.id)
    )
      fail(403, "Choose another connected account.");
    const owner = { id: person.userId!, email: "", name: person.name };
    if (
      !personVisible(s, owner, helper) ||
      !personVisible(s, a, a.id === person.userId ? helper : person)
    )
      fail(403, "Choose a connected person.");
    if (
      s.coManagement.some(
        (g) =>
          g.personId === person.id &&
          g.helperId === p.helperId &&
          ["active", "pending"].includes(g.status) &&
          (g.status === "active" || Date.parse(g.expiresAt) > Date.now()),
      )
    )
      fail(409, "An arrangement already exists.");
    const g = {
      ...stamp(),
      personId: person.id,
      ownerId: person.userId!,
      helperId: p.helperId,
      requestedBy: a.id,
      status: "pending" as const,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
    s.coManagement.push(g);
    coNotice(
      s,
      [g.ownerId, g.helperId],
      g.personId,
      "requested wish-list co-management.",
      a.id,
    );
    return g;
  }
  const { id } = z.object({ id: z.string().uuid() }).parse(raw);
  if (action === "co-management.discard-draft") {
    const d =
      s.recoveredDrafts.find((d) => d.id === id && d.userId === a.id) ??
      fail(404, "Draft not found.");
    s.recoveredDrafts = s.recoveredDrafts.filter((x) => x.id !== d.id);
    return { ok: true };
  }
  const g =
    s.coManagement.find(
      (g) => g.id === id && [g.ownerId, g.helperId].includes(a.id),
    ) ?? fail(404, "Arrangement not found.");
  if (action === "co-management.respond") {
    const { accept } = z.object({ accept: z.boolean() }).parse(raw);
    if (
      g.status !== "pending" ||
      Date.parse(g.expiresAt) <= Date.now() ||
      g.requestedBy === a.id
    )
      fail(409, "This request cannot be accepted or declined.");
    const owner = s.people.find(
      (p) => p.id === g.personId && p.userId === g.ownerId,
    );
    const helper = s.people.find((p) => p.userId === g.helperId);
    if (
      accept &&
      (!owner ||
        !helper ||
        !personVisible(s, { id: g.ownerId, email: "", name: "" }, helper) ||
        !personVisible(s, a, a.id === g.ownerId ? helper : owner))
    )
      fail(403, "The connection is no longer eligible.");
    g.status = accept ? "active" : "declined";
  } else if (action === "co-management.end") {
    if (!["pending", "active"].includes(g.status))
      fail(409, "This arrangement has already ended.");
    g.status = g.status === "pending" ? "cancelled" : "ended";
  } else fail(400, "Unknown co-management action.");
  touch(g);
  reconcileCoManagement(s);
  reconcileAccess(s);
  coNotice(
    s,
    [g.ownerId, g.helperId],
    g.personId,
    `${g.status === "active" ? "accepted" : g.status} wish-list co-management.`,
    a.id,
  );
  return { ok: true };
}
