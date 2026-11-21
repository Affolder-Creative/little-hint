/** Listed USD prices use integer cents; a missing maximum denotes an exact price. */
export interface PriceValue {
  priceCents: number | null;
  priceMaxCents?: number | null;
}
export const MAX_PRICE_CENTS = 100000000;
export function isPriceRange(value: PriceValue) {
  return value.priceCents != null && value.priceMaxCents != null;
}
export function priceBounds(value: PriceValue) {
  return {
    minCents: value.priceCents,
    maxCents:
      value.priceCents == null
        ? null
        : (value.priceMaxCents ?? value.priceCents),
  };
}
export function priceEstimateCents(value: PriceValue) {
  return priceBounds(value).maxCents;
}
export function priceTotal(value: PriceValue, quantity: number): PriceValue {
  return {
    priceCents: value.priceCents == null ? null : value.priceCents * quantity,
    priceMaxCents: isPriceRange(value) ? value.priceMaxCents! * quantity : null,
  };
}
const amount = "(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\\.[0-9]{1,2})?";
const pasted = new RegExp(
  `^\\s*\\$?\\s*(${amount})\\s*(?:[-–—]\\s*\\$?\\s*(${amount})\\s*)?$`,
);
/** Only normalize a complete recognized USD expression, never strip arbitrary characters. */
export function normalizePriceInput(raw: string) {
  const match = pasted.exec(raw);
  return match
    ? match[1].replaceAll(",", "") +
        (match[2] === undefined ? "" : "-" + match[2].replaceAll(",", ""))
    : raw.trim();
}
export type PriceParseResult =
  { ok: true; value: PriceValue } | { ok: false; error: string };
export function parsePriceInput(raw: string): PriceParseResult {
  const input = normalizePriceInput(raw);
  if (!input)
    return { ok: true, value: { priceCents: null, priceMaxCents: null } };
  if (!/^[0-9]+(?:\.[0-9]{1,2})?(?:-[0-9]+(?:\.[0-9]{1,2})?)?$/.test(input))
    return {
      ok: false,
      error:
        "Enter a price or range, such as 25 or 25-50, with up to two decimal places.",
    };
  const values = input.split("-").map((part) => {
    const [whole, fraction = ""] = part.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  });
  if (
    values.some(
      (value) => !Number.isSafeInteger(value) || value > MAX_PRICE_CENTS,
    )
  )
    return {
      ok: false,
      error: "Each price must be between $0 and $1,000,000.",
    };
  if (values.length === 2 && values[1] <= values[0])
    return {
      ok: false,
      error: "The second price must be higher than the first.",
    };
  return {
    ok: true,
    value: { priceCents: values[0], priceMaxCents: values[1] ?? null },
  };
}
export function priceInputValue(value: PriceValue) {
  if (value.priceCents == null) return "";
  return (
    String(value.priceCents / 100) +
    (isPriceRange(value) ? "-" + String(value.priceMaxCents! / 100) : "")
  );
}
export function formatPrice(value: PriceValue) {
  if (value.priceCents == null) return "Price not added";
  const usd = (cents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: cents % 100 ? 2 : 0,
    }).format(cents / 100);
  return (
    usd(value.priceCents) +
    (isPriceRange(value) ? "–" + usd(value.priceMaxCents!) : "")
  );
}
