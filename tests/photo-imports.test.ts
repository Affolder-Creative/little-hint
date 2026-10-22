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
}));
vi.mock("undici", () => ({ Agent: class {}, fetch: mocks.request }));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
vi.mock("../src/server/settings", () => ({
  automaticallyImportProductPhotos: vi.fn(async () => mocks.enabled),
  config: vi.fn(async () => ({})),
  spend: vi.fn(),
}));
vi.mock("../src/server/db", () => ({
  transact: vi.fn(async (fn) => fn(mocks.state)),
}));
import { importProduct, saveImage } from "../src/server/imports";
let dir: string;
let png: Buffer;
const page =
  '<script type="application/ld+json">{"@type":"Product","name":"Coffee mug","description":"A mug","image":"https://example.com/photo.png","offers":{"price":"25","priceCurrency":"USD"}}</script>';
beforeEach(async () => {
  mocks.enabled = false;
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
