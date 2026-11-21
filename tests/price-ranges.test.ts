import { expect, it } from "vitest";
import {
  parsePriceInput,
  normalizePriceInput,
  priceBounds,
  priceTotal,
  priceEstimateCents,
  formatPrice,
  priceInputValue,
} from "../src/shared/price";
import { ordered } from "../src/shared/organization";
import { giftEstimate } from "../src/shared/spending-guidance";
it.each([
  "0",
  "25",
  "25.5",
  "25.50",
  "00025.50",
  "0-25",
  "25-50",
  "25.50-50.75",
  "999999.99-1000000",
])("accepts %s", (input) => expect(parsePriceInput(input).ok).toBe(true));
it.each([
  ".50",
  "25.",
  "25-",
  "-1",
  "25.555",
  "25-25",
  "50-25",
  "0-0",
  "25,50",
  "about 500",
  "400+",
  "1e3",
  "1,00",
  "1 000",
  "1-2-3",
  "1000000.01",
  "0-1000000.01",
])("rejects %s", (input) => expect(parsePriceInput(input).ok).toBe(false));
it("normalizes recognized pasted USD without guessing", () => {
  expect(normalizePriceInput(" $1,000.00 – $1,500.00 ")).toBe(
    "1000.00-1500.00",
  );
  expect(normalizePriceInput("400 - 700")).toBe("400-700");
  expect(normalizePriceInput("$25.50")).toBe("25.50");
  expect(normalizePriceInput("25,50")).toBe("25,50");
  expect(parsePriceInput("1.01-1.03")).toEqual({
    ok: true,
    value: { priceCents: 101, priceMaxCents: 103 },
  });
  expect(parsePriceInput(" ")).toEqual({
    ok: true,
    value: { priceCents: null, priceMaxCents: null },
  });
});
it("formats ranges and computes upper estimates without changing the price", () => {
  const price = { priceCents: 40000, priceMaxCents: 70000 };
  expect(priceInputValue(price)).toBe("400-700");
  expect(formatPrice(price)).toBe("$400–$700");
  expect(priceBounds({ priceCents: 0 })).toEqual({ minCents: 0, maxCents: 0 });
  expect(priceEstimateCents(price)).toBe(70000);
  expect(priceTotal(price, 2)).toEqual({
    priceCents: 80000,
    priceMaxCents: 140000,
  });
  expect(giftEstimate(40000, 2, 0, undefined, 70000)).toMatchObject({
    cents: 140000,
    usesRangeMaximum: true,
  });
  expect(giftEstimate(40000, 2, 0, 90000, 70000)).toMatchObject({
    cents: 90000,
    usesRangeMaximum: false,
  });
});
it("sorts using directional endpoints with missing prices last", () => {
  const rows = [
    { id: "a", priceCents: 100, priceMaxCents: 900 },
    { id: "b", priceCents: 300 },
    { id: "c", priceCents: null },
  ].map((v) => ({ ...v, createdAt: "2026-01-01", revision: 0 }));
  expect(ordered(rows, "price-asc").map((v) => v.id)).toEqual(["a", "b", "c"]);
  expect(ordered(rows, "price-desc").map((v) => v.id)).toEqual(["a", "b", "c"]);
});
