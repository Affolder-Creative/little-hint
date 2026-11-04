import type { GiftView, World } from "./model";
export const PAGE_SIZE = 24;
export interface Page<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}
export interface ItemPage extends Page<GiftView> {
  tags: string[];
  people: string[];
  showAvailability: boolean;
  canManage: boolean;
  collectionTotal: number;
}
export interface BuyingPage extends Page<World["buying"][number]> {
  counts: { all: number; purchased: number; needsBuying: number };
}
export type PagedWorld = World & {
  paged: true;
  items: [];
  buying: [];
  watches: [];
};
export function pageRows<T>(rows: T[], requested: number): Page<T> {
  const page = Math.max(
    1,
    Math.min(requested, Math.max(1, Math.ceil(rows.length / PAGE_SIZE))),
  );
  return {
    rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pageSize: PAGE_SIZE,
    total: rows.length,
  };
}
