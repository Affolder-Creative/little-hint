import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { GiftSummary, List } from "../shared/model";
import { api } from "./api";
import { useApp } from "./context";

export function RevealPolicy({ list }: { list: List }) {
  return (
    <p className="privacy-note">
      {list.revealAfter
        ? `Purchased gifts and contributors can be viewed by the list owners after ${list.revealAfter} (${list.timeZone ?? "UTC"}). ${list.revealExchangeGivers ? "Purchased exchange gifts and giver names are included." : "Secret gift exchange identities stay hidden."}`
        : "No gift summary is scheduled. Secret gift exchange identities stay hidden."}{" "}
      Contribution amounts and private discussions stay private.
    </p>
  );
}

export function GiftSummaryPanel({ listId }: { listId: string }) {
  const { world } = useApp();
  const query = useQuery({
    queryKey: ["gift-summary", world.me.id, listId],
    queryFn: () => api<GiftSummary>(`lists/${listId}/gift-summary`),
    refetchInterval: 20000,
  });
  return (
    <section className="gift-summary" aria-label="Gift summary">
      <h2>People to thank</h2>
      <p>
        Purchased gifts and contributors, without amounts or private
        discussions.
      </p>
      {query.isPending && <p role="status">Loading gift summary…</p>}
      {query.error && (
        <p className="error" role="alert">
          Gift details could not be loaded.{" "}
          <button className="text-button" onClick={() => query.refetch()}>
            Try again
          </button>
        </p>
      )}
      {!query.error && query.data?.gifts.length === 0 && (
        <p className="notice">
          No completed gifts are available to show. Unpurchased reservations and
          pledges are excluded.
        </p>
      )}
      {!query.error &&
        query.data?.gifts.map((gift) => (
          <div className="summary-gift" key={gift.id}>
            <h3>
              <Link to={`/gift/${gift.itemId}`}>{gift.title}</Link>
            </h3>
            <p>
              {gift.buyerName} · {gift.purchased} purchased
              {gift.exchange ? " · secret gift exchange" : ""}
            </p>
            {gift.contributors.length > 0 && (
              <ul>
                {gift.contributors.map((person) => (
                  <li key={person.id}>
                    {person.name} ·{" "}
                    {person.status === "received"
                      ? "Contribution received"
                      : "Sent · Awaiting confirmation"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
    </section>
  );
}
