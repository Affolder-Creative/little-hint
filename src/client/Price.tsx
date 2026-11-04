import { useState } from "react";
import type { GiftView } from "../shared/model";
import { dollars } from "./api";
import { useApp } from "./context";
export function Price({
  gift,
  compact = false,
}: {
  gift: GiftView;
  compact?: boolean;
}) {
  const p = gift.pricing,
    changed = p?.baseline != null && p.baseline !== gift.priceCents;
  const stale =
    !!p?.checkedAt &&
    (p.status !== "verified" ||
      Date.now() - Date.parse(p.checkedAt) > 48 * 3600000);
  return (
    <div className={compact ? "item-price compact" : "item-price"}>
      <span className={compact ? undefined : "detail-price"}>
        {dollars(gift.priceCents)}
      </span>
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
      {!compact && (
        <>
          {p?.paused ? (
            <small>Manual price · Automatic checks paused</small>
          ) : p?.checkedAt ? (
            <small>
              {stale ? "Last verified price" : "Price checked"} ·{" "}
              {new Date(p.checkedAt).toLocaleString()}
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!gift.url || gift.archived || !world.priceChecksEnabled) return null;
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
      <label className="check">
        <input
          type="checkbox"
          checked={gift.priceWatching ?? false}
          disabled={busy || (!!gift.pricing?.paused && !gift.priceWatching)}
          onChange={(e) => change("prices/watch", e.target.checked)}
        />
        Notify me of price drops
      </label>
      <p className="muted">
        Alerts for drops of at least 5% and $1 appear in Notifications. Enable
        Price drops in notification settings for delivery to your devices.
      </p>
      {gift.canEdit && (
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
