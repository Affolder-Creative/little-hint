import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useApp } from "./context";
import { GiftForm } from "./forms";
import { TrashButton } from "./Management";
import type { ItemPage } from "../shared/pagination";
import type { GiftView } from "../shared/model";
import { Action } from "./Action";

export function WishlistDrafts({ listId }: { listId?: string }) {
  const { world, open } = useApp();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["collection", "drafts", world.me.id, listId, page],
    queryFn: () =>
      api<ItemPage>(
        `items?publicationState=draft&scope=${listId ? "list" : "home"}&${listId ? `id=${listId}&` : ""}page=${page}&available=false`,
      ),
  });
  if (query.isPending) return <p role="status">Loading drafts…</p>;
  if (query.isError)
    return (
      <p role="alert">
        Could not load drafts.{" "}
        <button className="text-button" onClick={() => void query.refetch()}>
          Retry
        </button>
      </p>
    );
  if (!query.data.total) return null;
  return (
    <section className="import-drafts" aria-label="Saved wish-list drafts">
      <h2>Saved drafts</h2>
      <p>
        Not yet shared with your wish-list viewers. Guardians can access drafts
        for profiles they manage.
      </p>
      {query.data.rows.map((gift) => (
        <div className="draft-row" key={gift.id}>
          <div>
            <h3 className="draft-title">{gift.title}</h3>
            <p className="muted">
              {gift.archived ? "Archived draft" : "Draft"} ·{" "}
              {world.lists.find((l) => l.id === gift.listId)?.name}
            </p>
          </div>
          <div className="actions">
            <Action
              secondary
              onClick={async () => {
                const current = await api<GiftView>(`items/${gift.id}`);
                open("Edit draft", <GiftForm gift={current} />);
              }}
            >
              Edit draft
            </Action>
            <TrashButton kind="items" entry={gift} />
          </div>
        </div>
      ))}
      {query.data.total > query.data.pageSize && (
        <nav className="actions" aria-label="Draft pages">
          <button
            className="button secondary"
            disabled={query.data.page === 1}
            onClick={() => setPage(query.data.page - 1)}
          >
            Previous
          </button>
          <span>Page {query.data.page}</span>
          <button
            className="button secondary"
            disabled={query.data.page * query.data.pageSize >= query.data.total}
            onClick={() => setPage(query.data.page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
