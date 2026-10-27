import { z } from "zod";
import type {
  Actor,
  Base,
  State,
  TrashEntry,
  TrashKind,
} from "../shared/model";
import { itemTrashed, ordered } from "../shared/organization";
import { canManageGroupEvents } from "../shared/group-events";
import { listIsArchived } from "../shared/list-dates";
import { controls, fail, stamp, syncEventLists, world } from "./domain";

const identity = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
});
const uniqueIds = z
  .array(z.string().uuid())
  .max(10000)
  .refine((ids) => new Set(ids).size === ids.length, "Choose each item once.");
const sort = z.enum([
  "manual",
  "priority",
  "name-asc",
  "name-desc",
  "price-asc",
  "price-desc",
  "newest",
  "oldest",
]);
export const managementActions = [
  ...["items", "lists", "group-events", "exchanges"].flatMap((kind) =>
    ["trash", "restore", "purge"].map((action) => `${kind}.${action}`),
  ),
  "items.organize",
  "items.archive",
  "lists.reorder",
  "exchanges.archive",
  "organization.update",
];
function current(row: Base, revision: number) {
  if (row.revision !== revision)
    fail(409, "This changed since you opened it. Refresh and try again.");
}
function collection(s: State, kind: TrashKind) {
  return kind === "group-events" ? s.groupEvents : s[kind];
}
function manages(s: State, a: Actor, kind: TrashKind, id: string): boolean {
  if (kind === "items") {
    const i = s.items.find((i) => i.id === id);
    return (
      !!i &&
      (i.listId
        ? !!s.lists.find(
            (l) =>
              l.id === i.listId &&
              !l.deletedAt &&
              l.ownerIds.some((p) => controls(s, a, p)),
          )
        : i.creatorId === a.id)
    );
  }
  if (kind === "lists")
    return s.lists.some(
      (l) =>
        l.id === id &&
        !l.groupEventId &&
        l.ownerIds.some((p) => controls(s, a, p)),
    );
  if (kind === "group-events") {
    const e = s.groupEvents.find((e) => e.id === id);
    const g = s.groups.find((g) => g.id === e?.groupId);
    return !!g && canManageGroupEvents(g, a.id);
  }
  return s.exchanges.some(
    (e) =>
      e.id === id &&
      e.organizerId === a.id &&
      s.groups.some((g) => g.id === e.groupId && g.memberIds.includes(a.id)),
  );
}
export function trash(s: State, a: Actor): TrashEntry[] {
  return (["items", "lists", "group-events", "exchanges"] as const)
    .flatMap((kind) =>
      collection(s, kind).flatMap((row) =>
        row.deletedAt && manages(s, a, kind, row.id)
          ? [
              {
                id: row.id,
                revision: row.revision,
                createdAt: row.createdAt,
                kind,
                name: "title" in row ? row.title : row.name,
                deletedAt: row.deletedAt,
              },
            ]
          : [],
      ),
    )
    .sort(
      (a, b) =>
        b.deletedAt.localeCompare(a.deletedAt) || a.id.localeCompare(b.id),
    );
}
export function managementCommand(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
) {
  if (action === "organization.update") {
    const p = z
      .object({
        scope: z
          .string()
          .max(100)
          .regex(
            /^(lists|events|exchanges|items:(home|person:[a-zA-Z0-9-]+|list:[a-zA-Z0-9-]+))$/,
          ),
        revision: z.number().int().nonnegative(),
        sort,
        order: uniqueIds.optional(),
      })
      .parse(raw);
    const existing = s.organization.find(
      (o) => o.userId === a.id && o.scope === p.scope,
    );
    if ((existing?.revision ?? 0) !== p.revision)
      fail(409, "Your organization settings changed. Refresh and try again.");
    if (p.order) {
      const view = world(s, a);
      const allowed =
        p.scope === "lists"
          ? view.lists.filter(
              (l) =>
                l.canEdit &&
                (!l.groupEventId ||
                  !view.groupEvents.some((e) => e.id === l.groupEventId)),
            )
          : p.scope === "events"
            ? view.groupEvents
            : p.scope === "exchanges"
              ? view.exchanges
              : [];
      if (p.order.some((id) => !allowed.some((row) => row.id === id)))
        fail(400, "Choose entries you can currently access.");
      // Keep hidden entries in their saved slots so restoring from Trash does
      // not silently reset their position. Only incoming accessible IDs move.
      if (existing) {
        const incoming = new Set(p.order);
        const slots = [
          ...existing.order,
          ...p.order.filter((id) => !existing.order.includes(id)),
        ];
        let next = 0;
        p.order = slots.map((id) => (incoming.has(id) ? p.order![next++] : id));
      }
    }
    if (existing) {
      existing.sort = p.sort;
      if (p.order) existing.order = p.order;
      existing.revision++;
    } else
      s.organization.push({
        ...stamp(),
        userId: a.id,
        scope: p.scope,
        sort: p.sort,
        order: p.order ?? [],
      });
    return { ok: true };
  }
  const p = identity.parse(raw);
  if (action === "lists.reorder") {
    const input = identity.extend({ order: uniqueIds }).parse(raw);
    const list =
      s.lists.find(
        (l) =>
          l.id === p.id &&
          !l.deletedAt &&
          !listIsArchived(l) &&
          l.ownerIds.some((id) => controls(s, a, id)),
      ) ?? fail(404, "Active wish list not found.");
    current(list, p.revision);
    const active = s.items.filter(
      (i) => i.listId === list.id && !i.archived && !i.deletedAt,
    );
    if (
      input.order.length !== active.length ||
      input.order.some((id) => !active.some((i) => i.id === id))
    )
      fail(409, "The items changed. Refresh and reorder the complete list.");
    const activeIds = new Set(input.order);
    const all = ordered(
      s.items.filter((i) => i.listId === list.id),
      "manual",
      list.itemOrder,
    ).map((i) => i.id);
    let next = 0;
    list.itemOrder = all.map((id) =>
      activeIds.has(id) ? input.order[next++] : id,
    );
    list.revision++;
    return { ok: true };
  }
  if (action === "items.organize" || action === "items.archive") {
    const i = s.items.find((i) => i.id === p.id && !itemTrashed(s, i));
    if (!i || !manages(s, a, "items", p.id)) fail(404, "Item not found.");
    current(i, p.revision);
    if (action === "items.organize") {
      const input = identity
        .extend({
          priority: z
            .enum(["most-wanted", "would-love", "nice-to-have"])
            .nullable(),
        })
        .parse(raw);
      if (!i.listId)
        fail(400, "Only wish-list items have a recipient priority.");
      i.priority = input.priority;
    } else
      i.archived = identity
        .extend({ archived: z.boolean() })
        .parse(raw).archived;
    i.revision++;
    return { ok: true };
  }
  const [kind, operation] = action.split(".") as [TrashKind, string];
  const row = collection(s, kind).find((r) => r.id === p.id);
  if (!row || !manages(s, a, kind, p.id)) fail(404, "Entry not found.");
  current(row, p.revision);
  if (operation === "archive" && kind === "exchanges") {
    if (row.deletedAt) fail(404, "Exchange not found.");
    const exchange = s.exchanges.find((e) => e.id === row.id)!;
    exchange.archived = identity
      .extend({ archived: z.boolean() })
      .parse(raw).archived;
    exchange.revision++;
    return { ok: true };
  }
  if (operation === "trash") {
    if (row.deletedAt) fail(409, "This entry is already in Trash.");
    if (
      kind === "exchanges" &&
      s.exchanges.find((e) => e.id === row.id)!.status === "drawn"
    )
      fail(
        409,
        "Cancel this exchange before moving it to Trash. You can archive it to keep the draw.",
      );
    row.deletedAt = new Date().toISOString();
  } else if (operation === "restore") {
    if (!row.deletedAt) fail(409, "This entry is not in Trash.");
    delete row.deletedAt;
  } else {
    if (!row.deletedAt)
      fail(409, "Move this entry to Trash before deleting it permanently.");
    purge(s, kind, row.id);
    return { ok: true };
  }
  row.revision++;
  if (kind === "group-events")
    syncEventLists(
      s,
      s.groupEvents.find((e) => e.id === row.id)!,
    );
  return { ok: true };
}
function purge(s: State, kind: TrashKind, id: string) {
  const removed = new Set([id]);
  if (kind === "group-events") {
    for (const list of s.lists.filter((l) => l.groupEventId === id)) {
      delete list.groupEventId;
      list.archived = true;
      list.revision++;
    }
    s.groupEvents = s.groupEvents.filter((e) => e.id !== id);
  }
  if (kind === "lists") {
    s.items.filter((i) => i.listId === id).forEach((i) => removed.add(i.id));
    s.lists = s.lists.filter((l) => l.id !== id);
  }
  const images = s.items.filter((i) => removed.has(i.id)).map((i) => i.image);
  s.items = s.items.filter((i) => !removed.has(i.id));
  if (kind === "exchanges") {
    s.exchanges = s.exchanges.filter((e) => e.id !== id);
    for (const e of s.exchanges)
      if (e.previousId === id) {
        delete e.previousId;
        e.revision++;
      }
  }
  s.comments = s.comments.filter((c) => !removed.has(c.itemId));
  s.follows = s.follows.filter((f) => !removed.has(f.targetId));
  s.watches = s.watches.filter((w) => !removed.has(w.itemId));
  s.notices = s.notices.filter(
    (n) =>
      ![n.itemId, n.listId, n.exchangeId].some(
        (ref) => ref && removed.has(ref),
      ),
  );
  for (const o of s.organization) {
    const next = o.order.filter((id) => !removed.has(id));
    if (next.length !== o.order.length) {
      o.order = next;
      o.revision++;
    }
  }
  for (const list of s.lists)
    if (list.itemOrder?.some((id) => removed.has(id))) {
      list.itemOrder = list.itemOrder.filter((id) => !removed.has(id));
      list.revision++;
    }
  // Keep replay keys to prevent old create requests from resurrecting deleted data.
  for (const replay of s.replays)
    if ([...removed].some((id) => JSON.stringify(replay.result)?.includes(id)))
      replay.result = { ok: true, deleted: true };
  for (const media of s.media) {
    const url = `/api/v1/media/${media.id}`;
    if (
      images.includes(url) &&
      !s.items.some((i) => i.image === url) &&
      !s.imports.some((i) => i.result?.image === url)
    ) {
      media.deletedAt = new Date().toISOString();
      media.revision++;
    }
  }
}
