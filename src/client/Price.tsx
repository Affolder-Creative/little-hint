import { formatPrice, isPriceRange } from "../shared/price";
import { bestShoppingOffer, shoppingOffers } from "../shared/shopping-offers";
import { InfoHelp } from "./InfoHelp";
import { useState } from "react";
import type { GiftView } from "../shared/model";
import { dollars } from "./api";
import { useApp } from "./context";
import { formatDateTime } from "./copy";
export function Price({
  gift,
  compact = false,
}: {
  gift: GiftView;
  compact?: boolean;
}) {
  if (gift.kind === "group")
    return (
      <div className="item-price">
        <small>
          {gift.priceCents === null
            ? "Some products have no listed price"
            : `Estimated set total: ${formatPrice(gift)}`}
        </small>
      </div>
    );
  const ranged = isPriceRange(gift);
  const best = bestShoppingOffer(gift);
  const p = gift.pricing,
    changed =
      !ranged &&
      gift.priceCents !== null &&
      p?.baseline != null &&
      p.baseline !== gift.priceCents;
  const stale =
    !!p?.checkedAt &&
    (p.status !== "verified" ||
      Date.now() - Date.parse(p.checkedAt) > 48 * 3600000);
  return (
    <div className={compact ? "item-price compact" : "item-price"}>
      <span
        className={compact ? undefined : "detail-price"}
        aria-label={ranged ? formatPrice(gift).replace("–", " to ") : undefined}
      >
        {formatPrice(gift)}
      </span>
      {!compact &&
        !ranged &&
        best &&
        !p?.paused &&
        !stale &&
        p?.status === "verified" &&
        !!p.checkedAt &&
        gift.priceCents === best.priceCents &&
        shoppingOffers(gift).length > 1 && (
          <small>Lowest checked price · {best.label}</small>
        )}
      {changed && (
        <small>
          {dollars(p.baseline)} {p.baselineLabel}
          {!compact && gift.priceCents != null && (
            <>
              {" "}
              · {gift.priceCents < p.baseline! ? "Down" : "Up"}{" "}
              {dollars(Math.abs(gift.priceCents - p.baseline!))}
            </>
          )}
        </small>
      )}
      {!compact && ranged && <small>Price range</small>}
      {!compact && !ranged && gift.priceCents !== null && (
        <>
          {p?.paused ? (
            <small>Manual price · Automatic checks paused</small>
          ) : p?.checkedAt ? (
            <small>
              {stale ? "Last verified price" : "Price checked"} ·{" "}
              {formatDateTime(p.checkedAt)}
            </small>
          ) : (
            <small>
              {p?.status
                ? "Price could not be verified"
                : "Price not yet checked"}
            </small>
          )}
          {p?.status === "unavailable" && (
            <small>
              We couldn't verify a new price. Check the shop before buying.
            </small>
          )}
        </>
      )}
    </div>
  );
}
export function PriceControls({ gift }: { gift: GiftView }) {
  const { world, mutate } = useApp();
  const ranged = isPriceRange(gift);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (
    gift.kind === "group" ||
    gift.publicationState === "draft" ||
    gift.priceCents === null ||
    !gift.url ||
    gift.archived ||
    !world.priceChecksEnabled
  )
    return null;
  async function change(path: string, enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      await mutate(path, { id: gift.id, enabled });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="price-controls">
      {(ranged || gift.priceSource === "custom") && (
        <p className="muted">
          Automatic price checks are paused. Choose Use shop prices in the
          editor to resume.
        </p>
      )}
      {(!ranged || gift.priceWatching) && (
        <div className="price-watch">
          <label className="check">
            <input
              type="checkbox"
              checked={gift.priceWatching ?? false}
              disabled={busy || (!!gift.pricing?.paused && !gift.priceWatching)}
              onChange={(e) => change("prices/watch", e.target.checked)}
            />
            {shoppingOffers(gift).length > 1
              ? "Notify me when the best price drops"
              : "Notify me of price drops"}
          </label>
          <InfoHelp title="Price-drop notifications">
            Alerts for drops of at least 5% and $1 appear in Notifications.
            Enable Price drops in notification settings for delivery to your
            devices.
          </InfoHelp>
        </div>
      )}
      {gift.canEdit && !ranged && gift.priceSource !== "custom" && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => change("prices/tracking", !!gift.pricing?.paused)}
        >
          {gift.pricing?.paused
            ? "Resume automatic price checks"
            : "Pause automatic price checks"}
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
