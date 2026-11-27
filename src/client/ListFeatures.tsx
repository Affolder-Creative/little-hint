import { InfoHelp } from "./InfoHelp";
import { dateHasElapsed, giftSummaryOpeningDate } from "../shared/list-dates";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { GiftSummary, List } from "../shared/model";
import { api } from "./api";
import { useApp } from "./context";

export function RevealPolicy({
  list,
  own = false,
  compact = false,
  includeSchedule = true,
}: {
  own?: boolean;
  compact?: boolean;
  includeSchedule?: boolean;
  list: Pick<List, "revealAfter" | "timeZone" | "revealExchangeGivers"> & {
    mode?: List["mode"];
  };
}) {
  const revealed = dateHasElapsed(list.revealAfter, list.timeZone);
  const audience = own ? "You" : "List owners";
  const date = list.revealAfter ? giftSummaryOpeningDate(list.revealAfter) : "";
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: list.timeZone ?? "UTC",
    timeZoneName: "longGeneric",
  })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;
  const summary = !date
    ? "No gift summary is scheduled."
    : revealed
      ? `${audience} can now view the gift summary.`
      : `Gift summary opens ${date}, ${zone}.`;
  const details = (
    <div className="text-stack">
      {includeSchedule && <p>{summary}</p>}
      {!includeSchedule && date && !revealed && <p>Times use {zone}.</p>}
      {date && (
        <p>
          {audience} {revealed ? "can see" : "will see"} purchased gifts,
          buyers, and contributors.
        </p>
      )}
      <p>
        {date && list.revealExchangeGivers
          ? "Secret exchange gifts and giver names are included."
          : "Secret exchange gifts and giver names stay hidden."}
      </p>
      <p>Contribution amounts and private notes stay private.</p>
    </div>
  );
  return compact ? (
    <div className="reservation-privacy">
      <span>{summary}</span>
      <InfoHelp title="Gift summary privacy">{details}</InfoHelp>
    </div>
  ) : (
    details
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
        See which gifts were bought, buyers, and contributors. Contribution
        amounts and private notes stay hidden.
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
          No purchased gifts to show yet. Reservations and contributions that
          have not been sent are not included.
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
