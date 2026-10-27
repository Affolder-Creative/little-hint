import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
vi.mock("../src/server/db", () => ({ transact: vi.fn(async () => {}) }));
import { cardImage, saveImage } from "../src/server/media";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "hint-thumbnails-"));
  vi.stubEnv("UPLOAD_DIR", directory);
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("creates smaller card renditions and keeps the full image", async () => {
  // Deterministic textured pixels exercise realistic compression differences.
  const pixels = Buffer.from(
    Array.from(
      { length: 1200 * 800 * 3 },
      (_, i) => (i * 17 + Math.floor(i / 3611)) % 256,
    ),
  );
  const png = await sharp(pixels, {
    raw: { width: 1200, height: 800, channels: 3 },
  })
    .png()
    .toBuffer();
  await saveImage(png, "owner");
  const files = await readdir(directory);
  expect(files).toHaveLength(2);
  const original = path.join(
    directory,
    files.find((f) => !f.includes(".card-"))!,
  );
  const thumbnail = await cardImage(path.basename(original));
  expect(await sharp(thumbnail).metadata()).toMatchObject({
    width: 480,
    height: 320,
    format: "webp",
  });
  expect(await sharp(original).metadata()).toMatchObject({
    width: 1200,
    height: 800,
  });
  expect((await readFile(thumbnail)).length).toBeLessThan(
    (await readFile(original)).length,
  );
});

it("generates legacy thumbnails once for concurrent requests without enlarging", async () => {
  const original = await sharp({
    create: { width: 200, height: 100, channels: 3, background: "red" },
  })
    .webp()
    .toBuffer();
  await writeFile(path.join(directory, "legacy.webp"), original);
  const paths = await Promise.all(
    Array.from({ length: 8 }, () => cardImage("legacy.webp")),
  );
  expect(new Set(paths).size).toBe(1);
  expect(await sharp(paths[0]).metadata()).toMatchObject({
    width: 200,
    height: 100,
  });
  expect(await readdir(directory)).toHaveLength(2);
  expect(await readFile(path.join(directory, "legacy.webp"))).toEqual(original);
});

it("falls back to the original on generation failure without partial files", async () => {
  await writeFile(path.join(directory, "invalid.webp"), "invalid image");
  expect(await cardImage("invalid.webp")).toBe(
    path.join(directory, "invalid.webp"),
  );
  expect(await readdir(directory)).toEqual(["invalid.webp"]);
});
