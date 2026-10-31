import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { emptyState, type State } from "../src/shared/model";
const mock = vi.hoisted(() => ({ state: {} as State, spend: vi.fn() }));
vi.mock("../src/server/db", () => ({
  transact: async (fn: any) => fn(mock.state),
}));
vi.mock("../src/server/settings", () => ({
  spend: mock.spend,
  config: vi.fn(),
  automaticallyImportProductPhotos: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));
import { brightRetailer, ImportPending } from "../src/server/brightdata";
import { applyShopifyVariant, paidProductPreview } from "../src/server/imports";
const url = "https://amazon.com/dp/B012345678";
beforeEach(() => {
  mock.state = emptyState();
  mock.state.imports.push({
    id: "job",
    userId: "owner",
    url,
    status: "pending",
    revision: 1,
    createdAt: new Date().toISOString(),
  });
  mock.spend.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it("persists and resumes one paid collection across worker invocations", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ snapshot_id: "snapshot" }))
    .mockResolvedValueOnce(Response.json({ status: "running" }))
    .mockResolvedValueOnce(Response.json({ status: "ready" }))
    .mockResolvedValueOnce(
      Response.json([
        {
          title: "Headphones",
          asin: "B012345678",
          final_price: 25,
          currency: "USD",
        },
      ]),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(brightRetailer(url, "key", "job")).rejects.toBeInstanceOf(
    ImportPending,
  );
  expect(mock.state.imports[0].providerState?.snapshotId).toBe("snapshot");
  await expect(brightRetailer(url, "key", "job")).rejects.toBeInstanceOf(
    ImportPending,
  );
  expect((await brightRetailer(url, "key", "job")).title).toBe("Headphones");
  expect(mock.spend).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(
    1,
  );
});
it("does not resubmit an uncertain dispatch", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValue(new TypeError("Network disconnected"));
  vi.stubGlobal("fetch", fetch);
  await expect(brightRetailer(url, "key", "job")).rejects.toThrow();
  await expect(brightRetailer(url, "key", "job")).rejects.toThrow("uncertain");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("allows a corrected configuration after a definitive rejection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("denied", { status: 401 })),
  );
  await expect(brightRetailer(url, "key", "job")).rejects.toThrow("401");
  expect(mock.state.imports[0].providerState).toBeUndefined();
});
it("honors the deadline without another provider request", async () => {
  mock.state.imports[0].providerState = {
    snapshotId: "snapshot",
    submittedAt: new Date(0).toISOString(),
    deadline: new Date(0).toISOString(),
  };
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(brightRetailer(url, "key", "job")).rejects.toThrow("timed out");
  expect(fetch).not.toHaveBeenCalled();
});
it("uses Scraping Fish's resolved Amazon URL", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response('<span id="productTitle">A real product</span>', {
        headers: { "Resolved-Url": url },
      }),
    ),
  );
  const result = await paidProductPreview(
    "https://a.co/d/test",
    {},
    { SCRAPING_PROVIDER: "scrapingfish", SCRAPINGFISH_API_KEY: "key" },
  );
  expect(result.title).toBe("A real product");
});
it("matches Shopify variants without substituting a retired selection", () => {
  const product = {
    title: "Sunglasses",
    variants: [
      {
        id: 123,
        title: "Tortoise",
        price: 16000,
        featured_image: { src: "https://example.com/tortoise.jpg" },
      },
    ],
  };
  const base = {
    title: "Sunglasses",
    remoteImage: "https://example.com/default.jpg",
    priceCents: 999,
  };
  const html = '<meta property="product:price:currency" content="USD">';
  expect(
    applyShopifyVariant(
      base,
      product,
      "https://shop.test/products/glasses?variant=123",
      html,
    ).priceCents,
  ).toBe(16000);
  const missing = applyShopifyVariant(
    base,
    product,
    "https://shop.test/products/glasses?variant=456",
    html,
  );
  expect(missing.priceCents).toBeNull();
  expect(missing.remoteImage).toBeUndefined();
  expect(missing.warnings).toHaveLength(1);
});
