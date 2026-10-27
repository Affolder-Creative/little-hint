import { expect, it, vi, afterEach } from "vitest";
import { z } from "zod";
const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("../src/server/db", () => ({ pool: mocks }));
import {
  cachedImport,
  importCacheKey,
  productCacheUrl,
} from "../src/server/import-cache";
import { productImportCacheEnabled } from "../src/server/deployment";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("preserves markets, paths and variants while dropping known tracking only", () => {
  expect(
    productCacheUrl(
      "https://amazon.com/dp/B000123456?th=1&utm_source=email#details",
    ),
  ).toBe("https://amazon.com/dp/B000123456?th=1");
  expect(productCacheUrl("https://amazon.ca/dp/B000123456?th=1")).not.toBe(
    productCacheUrl("https://amazon.com/dp/B000123456?th=1"),
  );
  expect(productCacheUrl("https://shop.example/item?variant=one")).not.toBe(
    productCacheUrl("https://shop.example/item?variant=two"),
  );
  for (const url of [
    "https://shop.example/item?token=x",
    "https://shop.example/item?unknown=x",
    "https://shop.example/item?ref=product-123",
    "https://shop.example/item?tag=variant-123",
    "https://user:pass@shop.example/item",
    "https://shop.example/reset/link",
    "file:///tmp/file",
  ])
    expect(productCacheUrl(url)).toBeUndefined();
});

it("hashes configuration and stage rather than storing credentials in keys", () => {
  const key = importCacheKey("metadata", ["product", "secret"]);
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(key).not.toBe(importCacheKey("enrichment", ["product", "secret"]));
  expect(key).not.toBe(importCacheKey("metadata", ["product", "changed"]));
});

it("treats cache outages and invalid stored data as misses, not import failures", async () => {
  vi.stubEnv("PRODUCT_IMPORT_CACHE_ENABLED", "true");
  mocks.query
    .mockRejectedValueOnce(new Error("cache read failed"))
    .mockResolvedValueOnce({ rows: [{ data: { unexpected: true } }] });
  mocks.connect.mockRejectedValue(new Error("cache write failed"));
  const compute = vi.fn(async () => ({ value: { title: "Product" } }));
  const schema = z.object({ title: z.string() });
  expect(await cachedImport("a", schema, compute)).toEqual({
    title: "Product",
  });
  expect(await cachedImport("a", schema, compute)).toEqual({
    title: "Product",
  });
  expect(compute).toHaveBeenCalledTimes(2);
});

it("validates the operational bypass setting", () => {
  expect(productImportCacheEnabled({} as NodeJS.ProcessEnv)).toBe(true);
  expect(
    productImportCacheEnabled({ PRODUCT_IMPORT_CACHE_ENABLED: "false" }),
  ).toBe(false);
  expect(() =>
    productImportCacheEnabled({ PRODUCT_IMPORT_CACHE_ENABLED: "yes" }),
  ).toThrow();
});
