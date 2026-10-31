import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { emptyState, type State } from "../src/shared/model";
const mock = vi.hoisted(() => ({
  state: {} as State,
  spend: vi.fn(),
  request: vi.fn(),
}));
vi.mock("undici", () => ({ Agent: class {}, fetch: mock.request }));
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
import {
  applyShopifyVariant,
  paidProductPreview,
  importProduct,
} from "../src/server/imports";
import {
  config,
  automaticallyImportProductPhotos,
} from "../src/server/settings";
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
  mock.request.mockReset();
  vi.mocked(config).mockResolvedValue({
    SCRAPING_PROVIDER: "brightdata",
    BRIGHTDATA_API_KEY: "key",
    BRIGHTDATA_UNLOCKER_ZONE: "shops",
  } as Awaited<ReturnType<typeof config>>);
  vi.mocked(automaticallyImportProductPhotos).mockResolvedValue(false);
  vi.stubEnv("PRODUCT_IMPORT_CACHE_ENABLED", "false");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("imports an Amazon iOS short link through the full async pipeline", async () => {
  const short = "https://a.co/d/09A4Qhm9";
  const destination =
    "https://www.amazon.com/dp/B0DHHK1291?ref=cm_sw_r_cso_cp_apin_dp&ref_=share&social_share=app";
  mock.state.imports[0].url = short;
  mock.request.mockResolvedValue(
    new Response(null, { status: 301, headers: { location: destination } }),
  );
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ snapshot_id: "snapshot" }))
    .mockResolvedValueOnce(Response.json({ status: "ready" }))
    .mockResolvedValueOnce(
      Response.json([
        {
          title: "Product from the shared link",
          asin: "B0DHHK1291",
          final_price: 25,
          currency: "USD",
        },
      ]),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    importProduct(short, "owner", false, "job"),
  ).rejects.toBeInstanceOf(ImportPending);
  expect(await importProduct(short, "owner", false, "job")).toMatchObject({
    title: "Product from the shared link",
    priceCents: 2500,
  });
  expect(
    mock.request.mock.calls.every(([requested]) => requested === short),
  ).toBe(true);
  expect(mock.spend).toHaveBeenCalledTimes(1);
});
it.each([
  "https://www.amazon.com/dp/B012345678",
  "https://www.bestbuy.com/product/lg-tv/JJ8VPZKKFW/sku/6673142",
  "https://www.walmart.com/ip/Nintendo-Switch-2-System/15949610846",
  "https://www.target.com/p/slippers/-/A-1010085867?preselect=95250268",
])("uses the dedicated scraper first for %s", async (link) => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ snapshot_id: "retailer" }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    importProduct(link, "owner", false, "job"),
  ).rejects.toBeInstanceOf(ImportPending);
  expect(mock.request).not.toHaveBeenCalled();
  expect(fetch.mock.calls[0][0]).toContain("/datasets/v3/trigger");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    input: [
      {
        url: link,
        ...(link.includes("amazon.com") ? { all_variations: false } : {}),
      },
    ],
    limit_per_input: 1,
  });
  expect(mock.spend).toHaveBeenCalledTimes(1);
});
it("imports the selected Target option and resumes the same collection", async () => {
  const link =
    "https://www.target.com/p/slippers/-/A-1010085867?preselect=95250268";
  mock.request.mockResolvedValue(
    new Response(
      '<script type="application/ld+json">{"@type":"Product","name":"Parent product","sku":"1010085867","offers":{"price":30,"priceCurrency":"USD"}}</script>',
    ),
  );
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ snapshot_id: "target" }))
    .mockResolvedValueOnce(Response.json({ status: "ready" }))
    .mockResolvedValueOnce(
      Response.json([
        {
          title: "Taupe 11",
          tcin_id: "95250268",
          final_price: 30,
          currency: "USD",
        },
      ]),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    importProduct(link, "owner", false, "job"),
  ).rejects.toBeInstanceOf(ImportPending);
  expect(JSON.parse(fetch.mock.calls[0][1].body).input).toEqual([
    { url: link },
  ]);
  expect(await importProduct(link, "owner", false, "job")).toMatchObject({
    title: "Taupe 11",
    priceCents: 3000,
  });
  expect(mock.request).not.toHaveBeenCalled();
  expect(mock.spend).toHaveBeenCalledTimes(1);
});
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
it("retains a safe submission reason for HTTP 400 and allows a corrected retry", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          code: "validation_error",
          line: "secret input",
          errors: [["url", "Invalid URL: secret input"]],
        },
        { status: 400 },
      ),
    ),
  );
  await expect(brightRetailer(url, "key", "job")).rejects.toMatchObject({
    stage: "brightdata-submit",
    status: 400,
    message: "Bright Data HTTP 400: Invalid request fields: url",
  });
  expect(mock.state.imports[0].providerState).toBeUndefined();
});
it("checks the collection before timing out without another paid submission", async () => {
  mock.state.imports[0].providerState = {
    snapshotId: "snapshot",
    submittedAt: new Date(0).toISOString(),
    deadline: new Date(0).toISOString(),
  };
  const fetch = vi.fn().mockResolvedValue(Response.json({ status: "running" }));
  vi.stubGlobal("fetch", fetch);
  await expect(brightRetailer(url, "key", "job")).rejects.toThrow(
    "still running",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mock.spend).not.toHaveBeenCalled();
});
it("downloads a ready collection even when its final poll is past the deadline", async () => {
  mock.state.imports[0].providerState = {
    snapshotId: "snapshot",
    submittedAt: new Date(0).toISOString(),
    deadline: new Date(0).toISOString(),
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ status: "ready" }))
    .mockResolvedValueOnce(
      Response.json([
        {
          title: "Nintendo Switch 2 System",
          product_name: "Nintendo Switch 2 System",
          product_id: "15949610846",
          final_price: 499,
          currency: "USD",
        },
      ]),
    );
  vi.stubGlobal("fetch", fetch);
  expect(
    await brightRetailer(
      "https://www.walmart.com/ip/Nintendo-Switch-2-System/15949610846",
      "key",
      "job",
    ),
  ).toMatchObject({ title: "Nintendo Switch 2 System", priceCents: 49900 });
  expect(mock.spend).not.toHaveBeenCalled();
});
it("keeps polling a collection that takes more than three minutes", async () => {
  mock.state.imports[0].providerState = {
    snapshotId: "snapshot",
    submittedAt: new Date(Date.now() - 300000).toISOString(),
    deadline: new Date(Date.now() + 300000).toISOString(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ status: "running" })),
  );
  await expect(brightRetailer(url, "key", "job")).rejects.toBeInstanceOf(
    ImportPending,
  );
  expect(mock.spend).not.toHaveBeenCalled();
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
