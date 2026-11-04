import { grantProductImages } from "./image-store";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useApp } from "./context";
import { useNavigationState } from "./NavigationScroll";
import { PAGE_SIZE } from "../shared/pagination";
import "./pagination.css";
export function useDebounced(value: string) {
  const [debounced, set] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => set(value), 250);
    return () => clearTimeout(t);
  }, [value]);
  return debounced;
}
export function useCollection<T>(path: string, enabled = true) {
  const { world } = useApp();
  return useQuery({
    queryKey: ["collection", world.me.id, path],
    queryFn: async ({ signal }) => {
      const result = await api<T>(path, undefined, { signal });
      grantProductImages(world.me.id, result);
      return result;
    },
    placeholderData: (previous, query) => {
      const old = new URL(String(query?.queryKey[2] ?? ""), "https://local");
      const next = new URL(path, "https://local");
      return query?.queryKey[1] === world.me.id &&
        old.pathname === next.pathname &&
        ["scope", "id", "tab"].every(
          (k) => old.searchParams.get(k) === next.searchParams.get(k),
        )
        ? previous
        : undefined;
    },
    enabled: !!world.paged && enabled,
    refetchInterval: 20000,
    retry: false,
  });
}
export function useCollectionPage(signature: string) {
  const [saved, setSaved] = useNavigationState<string>("collectionPage", "");
  const [key, number] = saved.split("\n");
  const page = key === signature ? Math.max(1, Number(number) || 1) : 1;
  useEffect(() => {
    if (key !== signature) setSaved(`${signature}\n1`);
  }, [signature, key]);
  const target = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const setPage = (next: number) => {
    pending.current = true;
    setSaved(`${signature}\n${next}`);
  };
  const ready = (loading: boolean) => {
    if (!loading && pending.current) {
      pending.current = false;
      target.current?.scrollIntoView({ block: "start" });
      target.current?.focus({ preventScroll: true });
    }
  };
  useEffect(() => {
    if (pending.current && target.current) ready(false);
  });
  const clamp = (effective: number) => setSaved(`${signature}\n${effective}`);
  return { page, setPage, target, ready, clamp };
}
export function Pagination({
  page,
  total,
  change,
  busy = false,
  position,
}: {
  page: number;
  total: number;
  change: (page: number) => void;
  busy?: boolean;
  position: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <nav
      className="collection-pagination"
      aria-label={`Results pages ${position}`}
    >
      <span role={position === "above" ? "status" : undefined}>
        {total
          ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`
          : "0 results"}
      </span>
      {pages > 1 && (
        <div>
          <button
            className="button secondary"
            disabled={busy || page <= 1}
            onClick={() => change(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            className="button secondary"
            disabled={busy || page >= pages}
            onClick={() => change(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </nav>
  );
}
export function CollectionStatus({
  query,
}: {
  query: { isPending: boolean; error: Error | null; refetch: () => unknown };
}) {
  if (query.error)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <button className="button secondary" onClick={() => query.refetch()}>
          Retry
        </button>
      </div>
    );
  if (query.isPending) return <p role="status">Loading items…</p>;
  return null;
}
