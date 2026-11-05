import { z } from "zod";
import type { Actor, State, Reservation } from "../shared/model";
import { ordered } from "../shared/organization";
import {
  pageRows,
  type ItemPage,
  type BuyingPage,
  type PagedWorld,
} from "../shared/pagination";
import { giftView, world } from "./domain";
import { listIsArchived } from "../shared/list-dates";
import { mode } from "./domain-access";
import {
  archived,
  canEdit,
  controls,
  getItem,
  itemVisible,
  listVisible,
  recipient,
} from "./domain-access";
import { fail } from "./domain-common";
import { pool, hydrateCollectionItems, readCollectionState } from "./db";
import { spendingSummary } from "../shared/spending-guidance";
export function collectionWorld(s: State, a: Actor): PagedWorld {
  return {
    ...world(s, a, true, true),
    paged: true,
    items: [],
    buying: [],
    watches: [],
  };
}
const page = z.coerce.number().int().min(1).max(1000000).default(1);
export const browseQuery = z.object({
  scope: z.enum(["home", "person", "list"]).default("home"),
  id: z.string().uuid().optional(),
  tab: z.enum(["wishes", "ideas"]).default("wishes"),
  page,
  search: z.string().max(500).default(""),
  tag: z.string().max(200).default(""),
  people: z.string().max(10000).default(""),
  available: z.enum(["true", "false"]).default("true"),
  type: z.enum(["all", "wish", "idea"]).default("all"),
  status: z.enum(["active", "archived"]).default("active"),
  sort: z
    .enum([
      "manual",
      "priority",
      "name-asc",
      "name-desc",
      "price-asc",
      "price-desc",
      "newest",
      "oldest",
    ])
    .default("manual"),
});
export async function itemPage(
  s: State,
  a: Actor,
  raw: unknown,
  hydrate = hydrateCollectionItems,
): Promise<ItemPage> {
  const q = browseQuery.parse(raw);
  let items = s.items.filter((i) => itemVisible(s, a, i));
  const list =
    q.scope === "list"
      ? s.lists.find((l) => l.id === q.id && listVisible(s, a, l))
      : undefined;
  if (q.scope === "list" && !list) fail(404, "Wish list not found.");
  if (q.scope === "home") {
    items = items.filter((i) => !archived(s, i));
    const others = items.filter((i) => !recipient(s, a, i));
    if (others.length) items = others;
  }
  if (q.scope === "list") items = items.filter((i) => i.listId === q.id);
  if (q.scope === "person")
    items = items.filter(
      (i) =>
        i.recipientIds.includes(q.id ?? "") &&
        !!i.listId === (q.tab === "wishes") &&
        (!archived(s, i) || canEdit(s, a, i)),
    );
  const canManage =
    items.some((i) => canEdit(s, a, i)) ||
    !!list?.ownerIds.some((id) => controls(s, a, id));
  const tags = [...new Set(items.flatMap((i) => i.tags))].sort();
  const people = [...new Set(items.flatMap((i) => i.recipientIds))];
  const quantities = new Map<string, number>();
  for (const r of s.reservations)
    if (r.quantity > 0)
      quantities.set(r.itemId, (quantities.get(r.itemId) ?? 0) + r.quantity);
  const availability = (i: State["items"][number]) =>
    !recipient(s, a, i) || mode(s, i) === "transparent"
      ? Math.max(0, i.quantity - (quantities.get(i.id) ?? 0))
      : undefined;
  const names = new Map(s.people.map((p) => [p.id, p.name]));
  const showAvailability = items.some((i) => availability(i) !== undefined);
  const chosen = q.people.split(",").filter((id) => people.includes(id));
  const collectionTotal = items.length;
  const filtered = ordered(
    items.filter((i) => {
      const available = availability(i);
      return (
        ((!!list && listIsArchived(list)) ||
          archived(s, i) === (canManage && q.status === "archived")) &&
        `${i.title} ${i.recipientIds.map((id) => names.get(id) ?? "Recipient").join(" ")} ${i.tags.join(" ")}`
          .toLowerCase()
          .includes(q.search.trim().toLowerCase()) &&
        (q.type === "all" || !!i.listId === (q.type === "wish")) &&
        (!q.tag || i.tags.includes(q.tag)) &&
        (!chosen.length || i.recipientIds.some((id) => chosen.includes(id))) &&
        (!showAvailability ||
          q.available !== "true" ||
          !!q.search.trim() ||
          q.status === "archived" ||
          (!!list && listIsArchived(list)) ||
          available === undefined ||
          available > 0)
      );
    }),
    q.sort,
    list?.itemOrder,
  );
  const result = pageRows(filtered, q.page);
  await hydrate(
    s,
    result.rows.map((i) => i.id),
  );
  return {
    ...result,
    rows: result.rows.map((i) => {
      const v = giftView(s, a, getItem(s, a, i.id));
      delete v.comments;
      delete v.reservations;
      delete v.purchaseOffers;
      delete v.recommendationEvidence;
      delete v.productSources;
      v.description = "";
      return v;
    }),
    tags,
    people,
    showAvailability,
    canManage,
    collectionTotal,
  };
}
export async function buyingPage(
  s: State,
  a: Actor,
  raw: unknown,
): Promise<BuyingPage> {
  const q = z
    .object({
      page,
      view: z
        .enum(["needs-buying", "purchased", "all"])
        .default("needs-buying"),
    })
    .parse(raw);
  const rows = s.reservations
    .filter((r) => r.buyerId === a.id && r.quantity > 0)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  const purchased = rows.filter((r) => r.purchased >= r.quantity).length;
  const result = pageRows(
    rows.filter(
      (r) =>
        q.view === "all" ||
        (q.view === "purchased"
          ? r.purchased >= r.quantity
          : r.purchased < r.quantity),
    ),
    q.page,
  );
  await hydrateCollectionItems(
    s,
    result.rows.map((r) => r.itemId),
  );
  return {
    ...result,
    rows: result.rows.map((r) => ({
      ...r,
      item: s.items.some((i) => i.id === r.itemId && itemVisible(s, a, i))
        ? giftView(s, a, getItem(s, a, r.itemId))
        : undefined,
    })),
    counts: {
      all: rows.length,
      purchased,
      needsBuying: rows.length - purchased,
    },
  };
}
export function registerCollections(
  app: any,
  actor: (req: any) => Promise<Actor>,
) {
  app.get("/api/v1/media/access", async (req: any) => {
    const a = await actor(req);
    const { ids } = z
      .object({
        ids: z
          .string()
          .max(7500)
          .transform((v) => (v ? v.split(",") : []))
          .pipe(z.array(z.string().uuid()).max(200)),
      })
      .parse(req.query);
    const s = await readCollectionState();
    const media = await pool.query(
      "SELECT id FROM app_record WHERE kind = 'media' AND id = ANY($1::text[]) AND data->>'deletedAt' IS NULL",
      [ids],
    );
    const existing = new Set(media.rows.map((r) => r.id));
    return ids.filter(
      (id) =>
        existing.has(id) &&
        s.items.some(
          (i) => i.image === `/api/v1/media/${id}` && itemVisible(s, a, i),
        ),
    );
  });
  app.get("/api/v1/buying/contribution-context/:id", async (req: any) => {
    const a = await actor(req),
      s = await readCollectionState();
    const r = s.reservations.find(
      (r) =>
        r.id === req.params.id &&
        r.quantity > 0 &&
        !r.exchangeId &&
        (r.buyerId === a.id ||
          s.contributions.some(
            (c) => c.reservationId === r.id && c.userId === a.id,
          )),
    );
    if (!r || !s.items.some((i) => i.id === r.itemId && itemVisible(s, a, i)))
      return null;
    return giftView(s, a, getItem(s, a, r.itemId));
  });
  app.get("/api/v1/items", async (req: any) => {
    const a = await actor(req);
    return itemPage(await readCollectionState(), a, req.query);
  });
  app.get("/api/v1/items/search", async (req: any) => {
    const a = await actor(req),
      s = await readCollectionState();
    const { search } = z
      .object({ search: z.string().max(500).default("") })
      .parse(req.query);
    const gifts = s.items.filter(
      (i) =>
        itemVisible(s, a, i) &&
        !recipient(s, a, i) &&
        !archived(s, i) &&
        `${i.title} ${i.recipientIds.map((id) => s.people.find((p) => p.id === id)?.name).join(" ")} ${s.lists.find((l) => l.id === i.listId)?.name ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
    const choices = gifts
      .flatMap<{ id: string; reservation: Reservation | undefined }>((i) => {
        const rs = s.reservations.filter(
          (r) =>
            r.buyerId === a.id &&
            r.itemId === i.id &&
            !r.former &&
            r.purchased < r.quantity,
        );
        return rs.length
          ? rs.map((r) => ({ id: i.id, reservation: r }))
          : (giftView(s, a, i).available ?? 0) > 0
            ? [{ id: i.id, reservation: undefined }]
            : [];
      })
      .slice(0, 8);
    await hydrateCollectionItems(
      s,
      choices.map((c) => c.id),
    );
    return choices.map((c) => ({
      gift: giftView(s, a, getItem(s, a, c.id)),
      reservation: c.reservation,
    }));
  });
  app.get("/api/v1/items/:id", async (req: any) => {
    const a = await actor(req),
      s = await readCollectionState();
    const id = z.string().uuid().parse(req.params.id);
    getItem(s, a, id);
    await hydrateCollectionItems(s, [id], true);
    return giftView(s, a, getItem(s, a, id));
  });
  app.get("/api/v1/lists/:id/item-order", async (req: any) => {
    const a = await actor(req),
      s = await readCollectionState();
    const l = s.lists.find(
      (l) =>
        l.id === req.params.id && l.ownerIds.some((id) => controls(s, a, id)),
    );
    if (!l) fail(404, "Wish list not found.");
    return ordered(
      s.items.filter((i) => i.listId === l.id && !i.archived && !i.deletedAt),
      "manual",
      l.itemOrder,
    ).map((i) => ({ id: i.id, name: i.title }));
  });
  app.get("/api/v1/buying/active", async (req: any) => {
    const a = await actor(req);
    return buyingPage(await readCollectionState(), a, req.query);
  });
  app.get("/api/v1/buying/reservations/:id", async (req: any) => {
    const a = await actor(req),
      s = await readCollectionState();
    const r = s.reservations.find(
      (r) => r.id === req.params.id && r.buyerId === a.id,
    );
    if (!r) fail(404, "Reservation not found.");
    await hydrateCollectionItems(s, [r.itemId]);
    return {
      ...r,
      item: s.items.some((i) => i.id === r.itemId && itemVisible(s, a, i))
        ? giftView(s, a, getItem(s, a, r.itemId))
        : undefined,
    };
  });
  app.get("/api/v1/buying/guidance", async (req: any) => {
    const a = await actor(req),
      s = await readCollectionState();
    const q = z
      .object({
        kind: z.enum(["event", "exchange"]),
        id: z.string().uuid(),
        recipientId: z.string().uuid(),
        giverId: z.string().uuid().optional(),
        itemId: z.string().uuid().optional(),
        quantity: z.coerce.number().int().min(0).optional(),
        poolReservationId: z.string().uuid().optional(),
        poolTargetCents: z.coerce.number().int().min(0).optional(),
        contributionReservationId: z.string().uuid().optional(),
        amountCents: z.coerce.number().int().min(0).optional(),
      })
      .parse(req.query);
    return spendingSummary(world(s, a), q, q);
  });
}
