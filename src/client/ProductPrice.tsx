import { PriceInput } from "./PriceInput";
import { formatPrice } from "../shared/price";
import type { ShoppingOffer } from "../shared/model";
import { automaticPriceOffer, shopLabel } from "../shared/shopping-offers";
export function ProductPrice({
  value,
  source,
  offers,
  primaryId,
  onChange,
  onSource,
  allowIncomplete = false,
}: {
  value: string;
  source: "shops" | "custom";
  offers: ShoppingOffer[];
  primaryId?: string;
  onChange: (value: string) => void;
  onSource: (source: "shops" | "custom") => void;
  allowIncomplete?: boolean;
}) {
  const selected = automaticPriceOffer({
    id: "editor",
    url: "",
    priceCents: null,
    shoppingOffers: offers,
    primaryOfferId: primaryId,
  });
  return (
    <div className="product-price-editor">
      {source === "shops" && selected ? (
        <>
          <p className="product-price-label">Price shown in lists and Buying</p>
          <p className="product-price-value">
            {formatPrice(selected)}{" "}
            <span className="muted">
              from {selected.label || shopLabel(selected.url)}
            </span>
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => onSource("custom")}
          >
            Set a custom price or range
          </button>
        </>
      ) : (
        <>
          <PriceInput
            value={value}
            onChange={onChange}
            allowIncomplete={allowIncomplete}
          />
          {selected && (
            <button
              type="button"
              className="text-button"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => onSource("shops")}
            >
              Use shop prices
            </button>
          )}
        </>
      )}
    </div>
  );
}
