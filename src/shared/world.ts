import type { World } from "./model";
/** Reuse the already-authorized gift projection rather than transferring it twice. */
export function hydrateWorld(world: World): World {
  if (!world.compact) return world;
  const items = new Map(world.items.map((item) => [item.id, item]));
  return {
    ...world,
    buying: world.buying.map((row) => ({
      ...row,
      item: items.get(row.itemId),
    })),
  };
}
export interface HistoryPage<T> {
  rows: T[];
  nextCursor: string | null;
}
