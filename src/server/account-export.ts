import { draftAccess } from "./domain-access";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Actor, State } from "../shared/model";
import { z } from "zod";
import { accountCsv } from "./account-csv";
import { readState } from "./db";

/** Deliberate allowlist: never serialize State, World, auth rows, or provider jobs. */
export function accountExport(s: State, a: Actor) {
  const people = s.people.filter(
    (p) => p.userId === a.id || p.guardians.includes(a.id),
  );
  const peopleIds = new Set(people.map((p) => p.id));
  const lists = s.lists.filter((l) =>
    l.ownerIds.some((id) => peopleIds.has(id)),
  );
  const listIds = new Set(lists.map((l) => l.id));
  const pref = s.preferences.find((p) => p.userId === a.id);
  return {
    format: "little-hint-personal-data",
    version: 1,
    exportedAt: new Date().toISOString(),
    account: { id: a.id, name: a.name, email: a.email },
    profiles: people.map((p) => ({
      id: p.id,
      name: p.name,
      managed: !p.userId,
      createdAt: p.createdAt,
    })),
    giftPreferences: s.giftPreferences.filter((p) => peopleIds.has(p.personId)),
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      ownerIds: l.ownerIds,
      groupIds: l.groupIds,
      groupEventId: l.groupEventId,
      mode: l.mode,
      archived: l.archived,
      deletedAt: l.deletedAt,
      archiveAfter: l.archiveAfter,
      revealAfter: l.revealAfter,
      timeZone: l.timeZone,
      createdAt: l.createdAt,
    })),
    items: s.items
      .filter(
        (i) =>
          draftAccess(s, a, i) &&
          (i.creatorId === a.id || (!!i.listId && listIds.has(i.listId))),
      )
      .map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        descriptionRich: i.descriptionRich,
        url: i.url,
        image: i.image,
        images: i.images ?? (i.image ? [i.image] : []),
        priceCents: i.priceCents,
        currency: i.currency,
        quantity: i.quantity,
        tags: i.tags,
        priority: i.priority,
        listId: i.listId,
        recipientIds: i.recipientIds,
        publicationState: i.publicationState ?? "published",
        visibility: i.visibility,
        groupIds: i.groupIds,
        archived: i.archived,
        deletedAt: i.deletedAt,
        createdAt: i.createdAt,
      })),
    reservations: s.reservations.filter((r) => r.buyerId === a.id),
    contributions: s.contributions.filter(
      (c) =>
        c.userId === a.id ||
        s.reservations.some(
          (r) => r.id === c.reservationId && r.buyerId === a.id,
        ),
    ),
    comments: s.comments.filter((c) => c.authorId === a.id),
    friends: s.friendEntries.filter((f) => f.creatorId === a.id),
    spending: {
      records: s.spendingRecords.filter((r) => r.ownerId === a.id),
      budgets: s.spendingBudgets.filter((r) => r.ownerId === a.id),
      occasions: s.spendingOccasions.filter((r) => r.ownerId === a.id),
      settings: s.spendingSettings.filter((r) => r.userId === a.id),
    },
    drafts: s.imports
      .filter((j) => j.userId === a.id && j.draft?.state === "active")
      .map((j) => ({
        id: j.id,
        url: j.url,
        draft: j.draft,
        createdAt: j.createdAt,
      })),
    preferences: pref
      ? {
          hideArchivedItems: pref.hideArchivedItems ?? false,
          email: pref.email,
          telegram: pref.telegram,
          sms: pref.sms,
          events: pref.events,
          pushEvents: pref.pushEvents,
          channelEvents: pref.channelEvents,
          notificationDetails: pref.notificationDetails,
          recipientUpdates: pref.recipientUpdates,
        }
      : null,
    organization: s.organization.filter((o) => o.userId === a.id),
    follows: s.follows.filter((f) => f.userId === a.id),
    discussionWatches: s.watches.filter((w) => w.userId === a.id),
    priceWatches: s.priceWatches.filter((w) => w.userId === a.id),
    uploads: s.media
      .filter((m) => m.userId === a.id && !m.deletedAt)
      .map((m) => ({
        id: m.id,
        url: `/api/v1/media/${m.id}`,
        createdAt: m.createdAt,
      })),
  };
}
export function registerAccountExport(
  app: FastifyInstance,
  actor: (req: FastifyRequest) => Promise<Actor>,
) {
  app.post(
    "/api/v1/account/export",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const a = await actor(req);
      reply.header("Cache-Control", "no-store");
      const options = z
        .object({
          format: z.enum(["json", "csv"]).default("json"),
          table: z.enum(["wishes", "buying", "spending"]).default("wishes"),
        })
        .parse(req.body ?? {});
      const state = await readState();
      if (options.format === "csv") return accountCsv(state, a, options.table);
      reply.header(
        "Content-Disposition",
        'attachment; filename="little-hint-personal-data.json"',
      );
      return accountExport(state, a);
    },
  );
}
