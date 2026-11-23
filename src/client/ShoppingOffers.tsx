import { ProductPrice } from "./ProductPrice";
import {
  parsePriceInput,
  priceInputValue,
  formatPrice,
  isPriceRange,
} from "../shared/price";
import { useId } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { GiftView, Item, ShoppingOffer } from "../shared/model";
import {
  bestShoppingOffer,
  automaticPriceOffer,
  inferredPriceSource,
  freshOffer,
  shoppingOffers,
  shopLabel,
} from "../shared/shopping-offers";
import { Field } from "./components";
import { dollars } from "./api";
import { formatDateTime } from "./copy";
import "./shopping-offers.css";

export type ProductInput = Pick<
  Item,
  "title" | "url" | "description" | "image" | "priceCents" | "quantity" | "tags"
> & { price?: string; priceMaxCents?: number | null } & Partial<
    Pick<
      Item,
      "id" | "revision" | "images" | "shoppingOffers" | "primaryOfferId"
    >
  > & { priceSource?: "shops" | "custom" };
export const newProduct = (): ProductInput => ({
  title: "",
  priceSource: "shops",
  url: "",
  description: "",
  image: "",
  priceCents: null,
  quantity: 1,
  tags: [],
});
export function offerInputs(
  item: Pick<Item, "url" | "priceCents"> & {
    priceMaxCents?: number | null;
  } & Partial<
      Pick<
        Item,
        | "id"
        | "shoppingOffers"
        | "primaryOfferId"
        | "purchaseOffers"
        | "pricing"
      >
    >,
): ShoppingOffer[] {
  return shoppingOffers({
    ...item,
    priceCents: isPriceRange(item) ? null : item.priceCents,
    id: item.id ?? "new",
  });
}

export function ShoppingLinks({ gift }: { gift: GiftView }) {
  const offers = shoppingOffers(gift),
    best = bestShoppingOffer(gift);
  if (!offers.length) return null;
  return (
    <section className="shopping-links" aria-label="Where to buy">
      <h2>Where to buy</h2>
      <ul>
        {offers.map((offer) => (
          <li key={offer.id}>
            <a
              className="shopping-offer-link"
              href={offer.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="shopping-offer-name">
                <span>{offer.label || shopLabel(offer.url)}</span>
                <ExternalLink size={15} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </span>
              <span className="shopping-offer-price">
                {dollars(offer.priceCents)}
                {offers.length > 1 && best?.id === offer.id && (
                  <small className="shopping-lowest">Lowest checked</small>
                )}
              </span>
              {offer.note && (
                <span className="shopping-offer-note">{offer.note}</span>
              )}
              {(offer.priceCents !== null ||
                offer.id === gift.primaryOfferId) && (
                <small className="shopping-offer-meta">
                  {offer.priceCents !== null && (
                    <>
                      {offer.pricing?.checkedAt
                        ? `${freshOffer(offer) ? "Checked" : "Last verified"} ${formatDateTime(offer.pricing.checkedAt)}`
                        : "Price not yet checked"}
                      {offer.id === gift.primaryOfferId ? " · " : ""}
                    </>
                  )}
                  {offer.id === gift.primaryOfferId ? "Primary link" : ""}
                </small>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function OfferEditor({
  offers,
  primaryId,
  onChange,
}: {
  offers: ShoppingOffer[];
  primaryId?: string;
  onChange: (offers: ShoppingOffer[], primaryId?: string) => void;
}) {
  const radioName = useId();
  const move = (index: number, offset: number) => {
    const next = [...offers];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next, primaryId ?? offers[0]?.id);
  };
  const update = (index: number, fields: Partial<ShoppingOffer>) =>
    onChange(
      offers.map((o, i) =>
        i === index
          ? {
              ...o,
              ...fields,
              ...((fields.priceCents !== undefined &&
                fields.priceCents !== o.priceCents) ||
              (fields.url !== undefined && fields.url !== o.url)
                ? { pricing: undefined }
                : {}),
            }
          : o,
      ),
      primaryId,
    );
  return (
    <section className="offer-editor" aria-label="Shopping links">
      <p className="muted">
        Add shops selling the same product, size, and color. Each shop keeps its
        own price.
      </p>
      {offers.map((offer, index) => (
        <div className="offer-editor-row" key={offer.id}>
          <Field label={`Shop ${index + 1} link`}>
            <input
              type="url"
              value={offer.url}
              maxLength={2048}
              required
              onChange={(e) => update(index, { url: e.target.value })}
              placeholder="https://shop.example/product"
            />
          </Field>
          <div className="form-row">
            <Field label="Shop name">
              <input
                value={offer.label}
                maxLength={100}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder={shopLabel(offer.url)}
              />
            </Field>
            <Field label="Shop price in USD">
              <input
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={offer.priceCents === null ? "" : offer.priceCents / 100}
                onChange={(e) =>
                  update(index, {
                    priceCents:
                      e.target.value === ""
                        ? null
                        : Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </Field>
          </div>
          <Field label="Shop note (optional)">
            <input
              value={offer.note ?? ""}
              maxLength={500}
              onChange={(e) => update(index, { note: e.target.value })}
              placeholder="For example, select black in medium"
            />
          </Field>
          <div className="offer-actions">
            <label className="check">
              <input
                type="radio"
                name={radioName}
                checked={offer.id === (primaryId ?? offers[0]?.id)}
                onChange={() => onChange(offers, offer.id)}
              />
              Primary link for product details
            </label>
            <button
              type="button"
              className="text-button"
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Move shop ${index + 1} up`}
            >
              <ArrowUp size={16} aria-hidden="true" />
              Move up
            </button>
            <button
              type="button"
              className="text-button"
              disabled={index === offers.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move shop ${index + 1} down`}
            >
              <ArrowDown size={16} aria-hidden="true" />
              Move down
            </button>
            <button
              type="button"
              className="text-button danger"
              onClick={() => {
                const next = offers.filter((o) => o.id !== offer.id);
                onChange(
                  next,
                  primaryId === offer.id ? next[0]?.id : primaryId,
                );
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
              Remove shop
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() => {
          const o: ShoppingOffer = {
            id: crypto.randomUUID(),
            url: "",
            label: "",
            priceCents: null,
          };
          onChange([...offers, o], primaryId ?? offers[0]?.id ?? o.id);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        Add shop link
      </button>
    </section>
  );
}

export function ProductsEditor({
  products,
  onChange,
  allowIncomplete = false,
}: {
  products: ProductInput[];
  allowIncomplete?: boolean;
  onChange: (products: ProductInput[]) => void;
}) {
  const multiple = products.length > 1;
  const update = (index: number, fields: Partial<ProductInput>) =>
    onChange(
      products.map((p, i) => {
        if (i !== index) return p;
        const next = { ...p, ...fields };
        if (next.priceSource === "shops") {
          const offer = automaticPriceOffer({ ...next, id: next.id ?? "new" });
          if (fields.shoppingOffers?.length === 0 && offerInputs(p).length > 0)
            next.priceSource = "custom";
          else {
            next.priceCents = offer?.priceCents ?? null;
            next.priceMaxCents = null;
            next.price = priceInputValue(next);
          }
        }
        return next;
      }),
    );
  return (
    <section
      className={`products-editor${multiple ? "" : " single-product"}`}
      aria-label={multiple ? "Products in this set" : "Product details"}
    >
      {multiple && (
        <>
          <h3>Products in this set</h3>
          <p className="muted">
            Each product can be reserved separately. Shop links within a product
            are places to buy that same product.
          </p>
        </>
      )}
      {products.map((product, index) => (
        <fieldset className="product-editor" key={product.id ?? index}>
          {multiple && <legend>Product {index + 1}</legend>}
          <Field label="Product name">
            <input
              required
              maxLength={160}
              value={product.title}
              onChange={(e) => update(index, { title: e.target.value })}
            />
          </Field>
          <div className="form-row">
            <ProductPrice
              source={
                product.priceSource ??
                inferredPriceSource({ ...product, id: product.id ?? "new" })
              }
              offers={offerInputs(product)}
              primaryId={product.primaryOfferId}
              onSource={(priceSource) => update(index, { priceSource })}
              allowIncomplete={allowIncomplete}
              value={product.price ?? priceInputValue(product)}
              onChange={(price) => {
                const parsed = parsePriceInput(price);
                update(index, {
                  price,
                  priceSource: "custom",
                  ...(parsed.ok
                    ? parsed.value
                    : { priceCents: null, priceMaxCents: null }),
                });
              }}
            />
            <Field label="Quantity wanted">
              <input
                type="number"
                min="1"
                max="999"
                required
                value={product.quantity}
                onChange={(e) =>
                  update(index, { quantity: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <Field label="Product note (optional)">
            <textarea
              value={product.description}
              maxLength={5000}
              onChange={(e) => update(index, { description: e.target.value })}
            />
          </Field>
          <OfferEditor
            offers={offerInputs(product)}
            primaryId={product.primaryOfferId}
            onChange={(offers, primaryId) =>
              update(index, {
                shoppingOffers: offers,
                primaryOfferId: primaryId,
                url:
                  offers.find((o) => o.id === primaryId)?.url ??
                  offers[0]?.url ??
                  "",
              })
            }
          />
          {multiple && (
            <div className="offer-actions">
              <button
                type="button"
                className="text-button"
                disabled={index === 0}
                aria-label={`Move product ${index + 1} up`}
                onClick={() => {
                  const next = [...products];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  onChange(next);
                }}
              >
                <ArrowUp size={16} />
                Move up
              </button>
              <button
                type="button"
                className="text-button"
                disabled={index === products.length - 1}
                aria-label={`Move product ${index + 1} down`}
                onClick={() => {
                  const next = [...products];
                  [next[index + 1], next[index]] = [
                    next[index],
                    next[index + 1],
                  ];
                  onChange(next);
                }}
              >
                <ArrowDown size={16} />
                Move down
              </button>
              <button
                type="button"
                className="text-button danger"
                onClick={() => onChange(products.filter((_, i) => i !== index))}
              >
                <Trash2 size={16} />
                Remove product
              </button>
            </div>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="text-button"
        onClick={() => onChange([...products, newProduct()])}
      >
        <Plus size={16} />
        Add another product
      </button>
    </section>
  );
}
export function GroupProducts({ gift }: { gift: GiftView }) {
  const location = useLocation();
  return (
    <section className="group-products">
      <h2>Products in this set</h2>
      <p className="muted">Choose a product to see its shops and gift plans.</p>
      <ul>
        {gift.products?.map((product) => (
          <li key={product.id}>
            <div>
              <Link to={`/gift/${product.id}${location.search}`}>
                {product.title}
              </Link>
              <small>
                {formatPrice(product)} · Quantity wanted: {product.quantity}
              </small>
              {product.available !== undefined && (
                <small>
                  {product.archived
                    ? "Archived"
                    : product.available > 0
                      ? `${product.available} available to reserve`
                      : "Taken care of"}
                </small>
              )}
            </div>
            <Link
              className="button secondary small"
              to={`/gift/${product.id}${location.search}`}
            >
              {!product.archived && product.canShop && product.available
                ? "Reserve gift"
                : "View product"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
