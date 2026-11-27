import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { GiftView } from "../shared/model";
import { useApp } from "./context";
import { InfoHelp } from "./InfoHelp";
import { RevealPolicy } from "./ListFeatures";
import { dateHasElapsed, giftSummaryOpeningDate } from "../shared/list-dates";
import { ideaAllocationChoices } from "../shared/spending";
import { shoppingLink } from "./shopping-context";
import "./gift-context.css";

export function giftPrivacy(gift: GiftView) {
  if (!gift.listId) {
    if (gift.visibility === "private")
      return {
        label: "Only me",
        icon: LockKeyhole,
        description: "Only you can see this idea and its gift plans.",
      };
    if (gift.visibility === "visible")
      return {
        label: "Visible to recipient",
        icon: Eye,
        description:
          "Recipients can see and discuss this idea. Reservations and purchases stay hidden.",
      };
    return {
      label: "Surprise",
      icon: EyeOff,
      description: "Shared with selected groups. Hidden from recipients.",
    };
  }
  return gift.mode === "transparent"
    ? {
        label: "See the plans",
        icon: Eye,
        description: "Recipients can see this wish and ordinary gift plans.",
      }
    : {
        label: "Surprise",
        icon: EyeOff,
        description:
          "Recipients can see this wish. Reservations, purchases, and discussion stay hidden.",
      };
}

export function GiftContext({
  gift,
  card = false,
}: {
  gift: GiftView;
  card?: boolean;
}) {
  const { world } = useApp();
  const location = useLocation();
  const list = world.lists.find((l) => l.id === gift.listId);
  const privacy = giftPrivacy(gift);
  const summaryAvailable =
    !!list && dateHasElapsed(list.revealAfter, list.timeZone);
  const revealed = list?.mode === "surprise" && summaryAvailable;
  const description = revealed
    ? "Recipients can now see purchased gifts, buyers, and contributors in the gift summary. Reservations and private discussion stay hidden."
    : privacy.description;
  const summary = list?.revealAfter
    ? summaryAvailable
      ? "The gift summary is available."
      : `Gift summary opens ${giftSummaryOpeningDate(list.revealAfter)}.`
    : "";
  const label = revealed ? "Gift summary available" : privacy.label;
  const Icon = revealed ? Eye : privacy.icon;
  const draft = gift.publicationState === "draft";
  const allocations = !gift.listId
    ? ideaAllocationChoices(gift).filter((a) => a.listId)
    : [];
  return (
    <div className={`gift-context${card ? " gift-context-card" : ""}`}>
      <div className="gift-context-line">
        {(gift.listId || allocations.length > 0) && (
          <span className="gift-source-list">
            {gift.listId ? (
              <>
                On{" "}
                {list ? (
                  <Link to={shoppingLink(`/lists/${list.id}`, location.search)}>
                    {list.name}
                  </Link>
                ) : (
                  "a wish list"
                )}
              </>
            ) : (
              allocations.map((allocation) => {
                const assigned = world.lists.find(
                  (l) => l.id === allocation.listId,
                );
                const name = assigned?.name ?? allocation.listName;
                return name ? (
                  <span
                    className="gift-planning-list"
                    key={allocation.recipientId}
                  >
                    For{" "}
                    {gift.recipientIds.length > 1
                      ? `${gift.recipientNames[gift.recipientIds.indexOf(allocation.recipientId)]}: `
                      : ""}
                    {assigned ? (
                      <Link
                        to={shoppingLink(
                          `/lists/${assigned.id}`,
                          location.search,
                        )}
                      >
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                  </span>
                ) : null;
              })
            )}
          </span>
        )}
        {draft ? (
          <span className="muted">Draft · Not yet published</span>
        ) : (
          <InfoHelp
            hover
            title={`Gift privacy: ${label} for ${gift.title}`}
            triggerLabel={
              <span className="gift-privacy-label">
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
              </span>
            }
          >
            <p>{description}</p>
            {summary && <p>{summary}</p>}
            {(list || gift.visibility === "visible") && (
              <details className="gift-privacy-more">
                <summary>Privacy details</summary>
                {list ? (
                  <RevealPolicy list={list} includeSchedule={false} />
                ) : (
                  <p>
                    {gift.visibility === "visible"
                      ? "Earlier protected notes stay private."
                      : ""}
                  </p>
                )}
              </details>
            )}
          </InfoHelp>
        )}
      </div>
      {!draft && !card && (
        <p className="gift-privacy-description">
          {description}
          {summary && !revealed ? ` ${summary}` : ""}
        </p>
      )}
    </div>
  );
}
