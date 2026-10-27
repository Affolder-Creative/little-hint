import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { emptyState } from "../src/shared/model";
const mocks = vi.hoisted(() => ({
  enabled: false,
  state: {} as ReturnType<typeof emptyState>,
  request: vi.fn(),
  cfg: {} as Record<string, string>,
  cache: new Map<string, { data: unknown; expires: Date; checked: Date }>(),
}));
vi.mock("undici", () => ({ Agent: class {}, fetch: mocks.request }));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
vi.mock("../src/server/settings", () => ({
  automaticallyImportProductPhotos: vi.fn(async () => mocks.enabled),
  config: vi.fn(async () => mocks.cfg),
  spend: vi.fn(),
}));
vi.mock("../src/server/db", () => {
  const query = vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.startsWith("SELECT data FROM product_import_cache")) {
      const row = mocks.cache.get(params[0]);
      return {
        rows:
          row && row.expires.getTime() > Date.now()
            ? [{ data: structuredClone(row.data) }]
            : [],
      };
    }
    if (sql.startsWith("INSERT INTO product_import_cache")) {
      const prior = mocks.cache.get(params[0]);
      if (!prior || prior.checked <= params[2])
        mocks.cache.set(params[0], {
          data: JSON.parse(params[1]),
          checked: params[2],
          expires: params[3],
        });
    }
    return { rows: [] };
  });
  return {
    pool: { query, connect: async () => ({ query, release() {} }) },
    transact: vi.fn(async (fn) => fn(mocks.state)),
  };
});
import { importProduct, saveImage } from "../src/server/imports";
let dir: string;
let png: Buffer;
const page =
  '<script type="application/ld+json">{"@type":"Product","name":"Coffee mug","description":"A mug","image":"https://example.com/photo.png","offers":{"price":"25","priceCurrency":"USD"}}</script>';
beforeEach(async () => {
  mocks.enabled = false;
  mocks.cfg = {};
  mocks.cache.clear();
  vi.stubEnv("PRODUCT_IMPORT_CACHE_ENABLED", "true");
  mocks.state = emptyState();
  mocks.request.mockReset();
  dir = await mkdtemp(path.join(os.tmpdir(), "little-hint-photos-"));
  vi.stubEnv("UPLOAD_DIR", dir);
  png = await sharp({
    create: { width: 1600, height: 800, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  mocks.request.mockImplementation(
    async (url: string) =>
      new Response(url.endsWith("photo.png") ? new Uint8Array(png) : page, {
        headers: {
          "content-type": url.endsWith("photo.png") ? "image/png" : "text/html",
        },
      }),
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});
describe("photo import policy", () => {
  it("imports details with no image request, file, or media row when OFF", async () => {
    const result = await importProduct("https://example.com/product", "owner");
    expect(result).toMatchObject({ title: "Coffee mug", priceCents: 2500 });
    expect(result).not.toHaveProperty("image");
    expect(result).not.toHaveProperty("remoteImage");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.state.media).toHaveLength(0);
    expect(await readdir(dir)).toEqual([]);
  });
  it("reads the latest policy on each attempt and preserves compressed images", async () => {
    mocks.enabled = true;
    const result = await importProduct("https://example.com/product", "owner");
    expect(result.image).toMatch(/^\/api\/v1\/media\//);
    expect(mocks.request).toHaveBeenCalledTimes(2);
    expect(mocks.state.media).toHaveLength(1);
    const filename = path.join(dir, mocks.state.media[0].file);
    const before = await readFile(filename);
    expect(await sharp(before).metadata()).toMatchObject({
      format: "webp",
      width: 1200,
      height: 600,
    });
    mocks.enabled = false;
    expect(
      await importProduct("https://example.com/product", "owner"),
    ).not.toHaveProperty("image");
    expect(mocks.request).toHaveBeenCalledTimes(3);
    expect(await readFile(filename)).toEqual(before);
    expect(mocks.state.media).toHaveLength(1);
  });
  it("keeps the starting policy for an in-flight attempt", async () => {
    mocks.enabled = true;
    mocks.request.mockImplementationOnce(async () => {
      mocks.enabled = false;
      return new Response(page);
    });
    expect(
      await importProduct("https://example.com/product", "owner"),
    ).toHaveProperty("image");
  });
  it("still permits manual image storage when automatic imports are OFF", async () => {
    expect(await saveImage(png, "owner")).toMatch(/^\/api\/v1\/media\//);
    expect(mocks.state.media).toHaveLength(1);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});

describe("shared product metadata cache", () => {
  it("reuses metadata across accounts without sharing media ownership", async () => {
    mocks.enabled = true;
    const first = await importProduct("https://example.com/product", "alice");
    const second = await importProduct("https://example.com/product", "bob");
    expect(first.importedAt).toBe(second.importedAt);
    expect(first.image).not.toBe(second.image);
    expect(mocks.state.media.map((m) => m.userId)).toEqual(["alice", "bob"]);
    expect(
      mocks.request.mock.calls.filter(([url]) => url.endsWith("/product")),
    ).toHaveLength(1);
    const stored = JSON.stringify([...mocks.cache.values()]);
    expect(stored).not.toContain("alice");
    expect(stored).not.toContain("bob");
    expect(stored).not.toContain("/api/v1/media/");
  });
  it("coalesces concurrent metadata work but creates separate media", async () => {
    mocks.enabled = true;
    const results = await Promise.all([
      importProduct("https://example.com/product", "alice"),
      importProduct("https://example.com/product", "bob"),
    ]);
    expect(results[0].image).not.toBe(results[1].image);
    expect(
      mocks.request.mock.calls.filter(([url]) => url.endsWith("/product")),
    ).toHaveLength(1);
  });
  it("expires after six hours and bypasses stored data on refresh or disable", async () => {
    await importProduct("https://example.com/product", "alice");
    await importProduct("https://example.com/product", "bob");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    const entry = [...mocks.cache.values()][0];
    expect(entry.expires.getTime() - entry.checked.getTime()).toBe(6 * 3600000);
    entry.expires = new Date(0);
    await importProduct("https://example.com/product", "alice");
    await importProduct("https://example.com/product", "alice", true);
    expect(mocks.request).toHaveBeenCalledTimes(3);
    vi.stubEnv("PRODUCT_IMPORT_CACHE_ENABLED", "false");
    await importProduct("https://example.com/product", "alice");
    expect(mocks.request).toHaveBeenCalledTimes(4);
  });
  it("keeps variants separate and never shares unknown or sensitive query links", async () => {
    for (const variant of ["red", "blue"])
      await importProduct(
        `https://example.com/product?color=${variant}`,
        "alice",
      );
    expect(mocks.cache.size).toBe(2);
    for (let n = 0; n < 2; n++)
      await importProduct("https://example.com/product?token=private", "alice");
    expect(mocks.request).toHaveBeenCalledTimes(4);
    expect(mocks.cache.size).toBe(2);
  });
  it("does not share redirects to sensitive URLs", async () => {
    mocks.request.mockImplementation(async (url: string) =>
      url.endsWith("/product")
        ? new Response(null, {
            status: 302,
            headers: { location: "/product?token=private" },
          })
        : new Response(page),
    );
    await Promise.all([
      importProduct("https://example.com/product", "alice"),
      importProduct("https://example.com/product", "bob"),
    ]);
    expect(mocks.cache.size).toBe(0);
    expect(mocks.request).toHaveBeenCalledTimes(4);
  });
  it("does not retain signed image URLs", async () => {
    mocks.enabled = true;
    mocks.request.mockImplementation(
      async () =>
        new Response(page.replace("photo.png", "photo.png?signature=private")),
    );
    await importProduct("https://example.com/product", "alice");
    expect(mocks.cache.size).toBe(0);
  });
  it("does not cache failures and retries enrichment independently", async () => {
    mocks.cfg = {
      OPENAI_API_KEY: "synthetic-secret",
      OPENAI_MODEL: "test-model",
    };
    const ai = vi
      .fn()
      .mockResolvedValueOnce(new Response("no", { status: 503 }))
      .mockImplementation(async () =>
        Response.json({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    description: "A mug",
                    tags: ["Coffee", "Kitchen", "Mugs"],
                  }),
                },
              ],
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", ai);
    await importProduct("https://example.com/product", "alice");
    await importProduct("https://example.com/product", "bob");
    await importProduct("https://example.com/product", "alice");
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(ai).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([...mocks.cache])).not.toContain("synthetic-secret");
    mocks.cfg.OPENAI_MODEL = "new-model";
    await importProduct("https://example.com/product", "alice");
    expect(ai).toHaveBeenCalledTimes(3);
    await importProduct("https://example.com/product", "alice", true);
    expect(ai).toHaveBeenCalledTimes(4);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});

it("reuses successful paid previews after the direct retailer blocks access", async () => {
  mocks.cfg = {
    SCRAPING_PROVIDER: "scrapingbee",
    SCRAPINGBEE_API_KEY: "synthetic-provider-secret",
  };
  mocks.request.mockImplementation(
    async () => new Response("blocked", { status: 403 }),
  );
  const provider = vi.fn(async () => new Response(page));
  vi.stubGlobal("fetch", provider);
  const first = await importProduct("https://example.com/product", "alice");
  const second = await importProduct("https://example.com/product", "bob");
  expect(first.title).toBe("Coffee mug");
  expect(second.importedAt).toBe(first.importedAt);
  expect(provider).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(JSON.stringify([...mocks.cache])).not.toContain(
    "synthetic-provider-secret",
  );
});

it("does not cache a failed preview or overwrite successful data with a failed refresh", async () => {
  mocks.request.mockResolvedValueOnce(new Response("blocked", { status: 403 }));
  await expect(
    importProduct("https://example.com/product", "alice"),
  ).rejects.toThrow("blocked the preview");
  expect(mocks.cache.size).toBe(0);
  const first = await importProduct("https://example.com/product", "alice");
  mocks.request.mockResolvedValueOnce(new Response("blocked", { status: 403 }));
  await expect(
    importProduct("https://example.com/product", "alice", true),
  ).rejects.toThrow("blocked the preview");
  expect(
    (await importProduct("https://example.com/product", "bob")).importedAt,
  ).toBe(first.importedAt);
  expect(mocks.request).toHaveBeenCalledTimes(3);
});
