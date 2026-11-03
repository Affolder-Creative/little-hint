import { useInfiniteQuery } from "@tanstack/react-query";
import type { World } from "../shared/model";
import type { HistoryPage } from "../shared/world";
import { api } from "./api";
import { useApp } from "./context";
type Rows = {
  cancelled: World["buying"][number];
  contributions: World["contributionHistory"][number];
};
export function useBuyingHistory<K extends keyof Rows>(
  kind: K,
  enabled = true,
) {
  const { world } = useApp();
  return useInfiniteQuery({
    queryKey: ["buying-history", world.me.id, kind],
    queryFn: ({ pageParam, signal }) =>
      api<HistoryPage<Rows[K]>>(
        `buying/${kind}?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        undefined,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled,
    refetchInterval: 20000,
  });
}
