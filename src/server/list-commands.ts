import { z } from "zod";
import type { State, Actor, List } from "../shared/model";
import { listIsArchived } from "../shared/list-dates";

import { emitActivity } from "./activity";

import {
  fail,
  stamp,
  touch,
  text,
  id,
  ids,
  revision,
  listDates,
  checkSharedListPolicy,
  checkRevision,
} from "./domain-common";
import {
  controllers,
  controls,
  checkRecipients,
  checkGroups,
  archived,
  name,
  mode,
  reconcileAccess,
} from "./domain-access";

export const listActions = ["lists.create", "lists.accept", "lists.update"];
export function listCommand(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
): unknown {
  const b = raw as Record<string, unknown>;
  switch (action) {
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
      if (
        p.ownerIds.some((id) =>
          s.friendEntries.some((f) => f.personId === id && !f.connectedAt),
        )
      )
        fail(400, "Friends must connect an account before owning a wish list.");
      checkGroups(s, a, p.groupIds);
      const mine = p.ownerIds.filter((id) => controls(s, a, id));
      if (!mine.length) fail(403, "Create a list for a profile you manage.");
      const pending = p.ownerIds.filter((id) => !mine.includes(id));
      if (p.revealExchangeGivers && !p.revealAfter)
        fail(400, "Choose a reveal date to reveal exchange givers.");
      if (pending.length && p.groupIds.length)
        fail(
          400,
          "Create the list without sharing it with a family group. Everyone on the list must accept shared ownership first.",
        );
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
      emitActivity(
        s,
        "invitation",
        pending.flatMap((id) =>
          controllers(s.people.find((p) => p.id === id)!),
        ),
        { listId: l.id, action: "ownership-request", actorId: a.id },
      );
      return l;
    }
    case "lists.accept": {
      const p = z.object({ id }).parse(b);
      const l =
        s.lists.find(
          (l) =>
            l.id === p.id &&
            !l.deletedAt &&
            l.pendingOwnerIds.some((id) => controls(s, a, id)),
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
          (l) =>
            l.id === p.id &&
            !l.deletedAt &&
            l.ownerIds.some((id) => controls(s, a, id)),
        ) ?? fail(404, "List not found.");
      if (l.groupEventId)
        fail(403, "This list is managed through its group event.");
      checkRevision(l, p.revision);
      checkGroups(s, a, p.groupIds);
      checkSharedListPolicy(l, { ...l, ...p });
      if (l.pendingOwnerIds.length && p.groupIds.length)
        fail(
          409,
          "Wait for everyone to accept shared ownership before sharing this list with a family group.",
        );
      if (listIsArchived(l) && !p.archived) p.archiveAfter = null;
      Object.assign(l, p, {
        modeLocked: l.modeLocked || p.groupIds.length > 0,
      });
      touch(l);
      reconcileAccess(s);
      return l;
    }
    default:
      fail(400, "Unknown action.");
  }
}
