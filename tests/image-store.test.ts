import { expect, it } from "vitest";
import { imageCacheKey, retainedImages } from "../src/client/image-store";
it("separates accounts, replacements and image sizes", () => {
  const keys = [
    imageCacheKey("a", "/1"),
    imageCacheKey("b", "/1"),
    imageCacheKey("a", "/2"),
    imageCacheKey("a", "/1?size=card"),
  ];
  expect(new Set(keys).size).toBe(4);
});
it("evicts old entries and bounds count and total bytes by recency", () => {
  const now = Date.now();
  const entry = (n: number, size = 1) => ({
    key: String(n),
    account: "a",
    url: `/${n}`,
    size,
    used: now - n,
  });
  expect(
    retainedImages(
      Array.from({ length: 210 }, (_, n) => entry(n)),
      now,
    ),
  ).toHaveLength(200);
  expect(
    retainedImages(
      [entry(1, 30 * 1024 * 1024), entry(2, 30 * 1024 * 1024)],
      now,
    ).map((e) => e.key),
  ).toEqual(["1"]);
  expect(
    retainedImages([{ ...entry(0), used: now - 31 * 86400000 }], now),
  ).toEqual([]);
});
