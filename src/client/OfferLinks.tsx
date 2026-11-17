import { ExternalLink } from "lucide-react";
import { dollars } from "./api";
import type { GiftCandidate } from "../shared/gift-discovery";
import { formatDateTime } from "./copy";
export function OfferLinks({
  candidate,
}: {
  candidate: Pick<GiftCandidate, "offers">;
}) {
  return (
    <ul className="discovery-offers">
      {candidate.offers.map((offer) => (
        <li key={offer.url}>
          <a href={offer.url} target="_blank" rel="noopener noreferrer">
            {offer.retailer} · {dollars(offer.priceCents)}{" "}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
          <small>Checked {formatDateTime(offer.checkedAt)}</small>
        </li>
      ))}
    </ul>
  );
}
