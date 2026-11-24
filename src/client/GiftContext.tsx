import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { GiftView } from "../shared/model";
import { useApp } from "./context";
import { InfoHelp } from "./InfoHelp";
import { RevealPolicy } from "./ListFeatures";
import { dateHasElapsed } from "../shared/list-dates";
import { ideaAllocationChoices } from "../shared/spending";
import { shoppingLink } from "./shopping-context";
import "./gift-context.css";

export function giftPrivacy(gift: GiftView) {
  if (!gift.listId) {
    if (gift.visibility === "private")
      return {
        label: "Only me",
        icon: LockKeyhole,
        description:
          "Only you can see this idea, including reservations and purchases.",
      };
    if (gift.visibility === "visible")
      return {
        label: "Visible to recipient",
        icon: Eye,
        description:
          "Recipients can see this idea and participate in its current discussion. Who reserves or buys it stays hidden from them. Earlier protected notes stay private.",
      };
    return {
      label: "Surprise",
      icon: EyeOff,
      description:
        "Shared with selected family groups. Recipients cannot see this idea or its gift plans. Additional sharing exceptions still apply.",
    };
  }
  return gift.mode === "transparent"
    ? {
        label: "See the plans",
        icon: Eye,
        description:
          "Recipients can see this wish and ordinary gift plans. Secret exchange protections and earlier private notes still apply.",
      }
    : {
        label: "Surprise",
        icon: EyeOff,
        description:
          "Recipients can see this wish. Reservations, purchases, and gift discussion stay hidden, except for any scheduled gift summary.",
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
  const revealed =
    list?.mode === "surprise" &&
    dateHasElapsed(list.revealAfter, list.timeZone);
  const label = revealed ? "Gift summary available" : privacy.label;
  const Icon = revealed ? Eye : privacy.icon;
  const draft = gift.publicationState === "draft";
  const allocations =
    !gift.listId && world.spendingEnabled
      ? ideaAllocationChoices(gift).filter((a) => a.listId)
      : [];
  return (
    <div className={`gift-context${card ? " gift-context-card" : ""}`}>
      <div className="gift-context-line">
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
            "Not on a wish list"
          )}
        </span>
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
            <p>{privacy.description}</p>
            {list && <RevealPolicy list={list} />}
          </InfoHelp>
        )}
      </div>
      {allocations.length > 0 && (
        <div className="gift-spending-context">
          {allocations.map((allocation) => {
            const assigned = world.lists.find(
              (l) => l.id === allocation.listId,
            );
            const name = assigned?.name ?? allocation.listName;
            return name ? (
              <p key={allocation.recipientId}>
                Your spending list
                {gift.recipientIds.length > 1
                  ? ` for ${gift.recipientNames[gift.recipientIds.indexOf(allocation.recipientId)]}`
                  : ""}
                : {name}
              </p>
            ) : null;
          })}
        </div>
      )}
      {!draft && !card && (
        <p className="gift-privacy-description">{privacy.description}</p>
      )}
    </div>
  );
}
