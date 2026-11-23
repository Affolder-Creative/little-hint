import { expect, it } from "vitest";
import { sortBuying } from "../src/shared/buying-sort";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world } from "../src/server/domain";
const { state, actors } = stagingFixtures();
const base = actors.flatMap((a) => world(state, a).buying)[0];
const rows = [
  ["a", "Book 10", 2000, null],
  ["b", "Book 2", 1000, 3000],
  ["c", "Apple", null, null],
  ["d", "Free", 0, null],
].map(([id, title, price, max], index) => ({
  ...base,
  id: String(id),
  titleSnapshot: String(title),
  createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  item:
    price === null
      ? undefined
      : {
          ...world(state, actors[0]).items[0],
          priceCents: Number(price),
          priceMaxCents: max === null ? null : Number(max),
        },
}));
it("sorts reservation dates and natural names", () => {
  expect(sortBuying(rows, "newest").map((r) => r.id)).toEqual([
    "d",
    "c",
    "b",
    "a",
  ]);
  expect(sortBuying(rows, "oldest").map((r) => r.id)).toEqual([
    "a",
    "b",
    "c",
    "d",
  ]);
  expect(sortBuying(rows, "name-asc").map((r) => r.id)).toEqual([
    "c",
    "b",
    "a",
    "d",
  ]);
  expect(sortBuying(rows, "name-desc").map((r) => r.id)).toEqual([
    "d",
    "a",
    "b",
    "c",
  ]);
});
it("uses range bounds and keeps inaccessible prices last", () => {
  expect(sortBuying(rows, "price-asc").map((r) => r.id)).toEqual([
    "d",
    "b",
    "a",
    "c",
  ]);
  expect(sortBuying(rows, "price-desc").map((r) => r.id)).toEqual([
    "b",
    "a",
    "d",
    "c",
  ]);
});
