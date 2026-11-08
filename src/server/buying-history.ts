import { sourceState } from "./gift-lifecycle";
import { z } from "zod";
import type { Actor, Base, State, World } from "../shared/model";
import type { HistoryPage } from "../shared/world";
const query = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(300).optional(),
});
const cursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
});
function page<T extends Base>(rows: T[], raw: unknown): HistoryPage<T> {
  const { limit, cursor } = query.parse(raw);
  let decoded: unknown;
  if (cursor) {
    try {
      decoded = JSON.parse(cursor);
    } catch {
      decoded = null;
    }
  }
  const after = cursor ? cursorSchema.parse(decoded) : undefined;
  const ordered = rows
    .filter(
      (r) =>
        !after ||
        r.createdAt < after.createdAt ||
        (r.createdAt === after.createdAt && r.id < after.id),
    )
    .sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.id > b.id
          ? -1
          : a.id < b.id
            ? 1
            : 0
        : a.createdAt > b.createdAt
          ? -1
          : 1,
    );
  const selected = ordered.slice(0, limit),
    last = selected.at(-1);
  return {
    rows: selected,
    nextCursor:
      ordered.length > limit && last
        ? JSON.stringify({ createdAt: last.createdAt, id: last.id })
        : null,
  };
}
export function cancelledBuying(
  s: State,
  a: Actor,
  raw: unknown,
): HistoryPage<World["buying"][number]> {
  return page(
    s.reservations.filter((r) => r.buyerId === a.id && r.quantity === 0),
    raw,
  );
}
export function contributionHistory(
  s: State,
  a: Actor,
  raw: unknown,
): HistoryPage<World["contributionHistory"][number]> {
  const reservations = new Map(s.reservations.map((r) => [r.id, r]));
  const names = new Map(s.people.map((p) => [p.userId, p.name]));
  const selected = page(
    s.contributions.filter((c) => {
      const r = reservations.get(c.reservationId);
      return r && (c.userId === a.id || r.buyerId === a.id);
    }),
    raw,
  );
  return {
    ...selected,
    rows: selected.rows.map((c) => {
      const r = reservations.get(c.reservationId)!;
      return {
        contribution: { ...c },
        sourceState: sourceState(s, r),
        title: r.titleSnapshot,
        purchaser: r.buyerId === a.id,
        contributorName: names.get(c.userId) ?? "Former member",
        purchaserName: names.get(r.buyerId) ?? "Former member",
      };
    }),
  };
}
