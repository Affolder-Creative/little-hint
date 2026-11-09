import assert from "node:assert/strict";
import { stagingFixtures } from "../src/server/staging-fixtures.ts";
import { world as makeWorld } from "../src/server/domain.ts";
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
const { state, actors } = stagingFixtures();
const world = makeWorld(state, actors[0]);
world.me.admin = true;
world.imageDelivery = { cacheEnabled: true, prefetchEnabled: false };
world.items = [0, 1, 2].map((n) => ({ ...world.items[0], id: `photo-${n}` }));
world.items.slice(0, 3).forEach((i, n) => {
  i.image = `/api/v1/media/test-${n}`;
  i.title = `Photo test ${n}`;
});
world.items[0].images = [
  world.items[0].image,
  "/api/v1/media/extra-1",
  "/api/v1/media/extra-2",
];
world.itemPhotoLimit = 5;
world.items[0].canEdit = true;
world.giftPreferences = [];
const image = await sharp({
  create: { width: 480, height: 320, channels: 3, background: "#aa4d37" },
})
  .webp()
  .toBuffer();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
const ctx = await browser.newContext({ serviceWorkers: "block" });
const requests = [];
let uploads = 0;
let cards = 0,
  full = 0;
const keys = [
  "AUTO_IMPORT_PRODUCT_PHOTOS",
  "FAMILY_GROUP_CREATION",
  "PRODUCT_IMAGE_CACHE_ENABLED",
  "PRODUCT_IMAGE_PREFETCH_ENABLED",
];
await ctx.route("https://ui.test/**", async (route) => {
  const u = new URL(route.request().url());
  requests.push(u.pathname + u.search);
  if (u.pathname === "/api/v1/media") {
    uploads++;
    if (uploads === 2)
      return route.fulfill({
        status: 500,
        json: { error: "Test upload failed" },
      });
    return route.fulfill({
      json: { url: `/api/v1/media/uploaded-${uploads}` },
    });
  }
  if (u.pathname.startsWith("/api/v1/media/")) {
    if (u.search) cards++;
    else full++;
    return route.fulfill({ contentType: "image/webp", body: image });
  }
  if (u.pathname === "/api/v1/world") return route.fulfill({ json: world });
  if (u.pathname === "/api/v1/admin/settings")
    return route.fulfill({
      json: keys.map((key) => ({
        key,
        value: key === "FAMILY_GROUP_CREATION" ? "everyone" : "true",
        source: "default",
        default: "true",
      })),
    });
  if (u.pathname === "/api/v1/admin/jobs")
    return route.fulfill({ json: { imports: [], notifications: [] } });
  if (u.pathname === "/api/v1/push")
    return route.fulfill({ json: { devices: [], available: false } });
  if (u.pathname.startsWith("/api/")) return route.fulfill({ json: [] });
  const file =
    u.pathname.startsWith("/assets/") || u.pathname.startsWith("/brand/")
      ? `dist/client${u.pathname}`
      : "dist/client/index.html";
  const type = file.endsWith(".js")
    ? "text/javascript"
    : file.endsWith(".css")
      ? "text/css"
      : file.endsWith(".svg")
        ? "image/svg+xml"
        : "text/html";
  return route.fulfill({ contentType: type, body: await readFile(file) });
});
await mkdir(".local/image-review", { recursive: true });
const page = await ctx.newPage();

page.on("pageerror", (e) => console.error("UI ERROR", e.message));
try {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`https://ui.test/gift/${world.items[1].id}`);
  await page.locator(".gift-detail img").waitFor();
  assert(
    !requests.some((url) => url.includes("ItemPhotoGallery")),
    "single-photo details do not request gallery JS or CSS",
  );
  await page.goto(`https://ui.test/lists/${world.items[0].listId}`);
  await page.locator(".gift-card").first().waitFor();
  assert(
    !requests.some((url) => url.includes("extra-")),
    "cards never request secondary photos",
  );
  await page.goto(`https://ui.test/gift/${world.items[0].id}`);
  await page.getByRole("button", { name: "Next photo", exact: true }).waitFor();
  assert(
    !requests.some((url) => url.includes("extra-")),
    "gallery initially loads only cover",
  );
  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".item-photo-slide img")?.naturalWidth > 0,
  );
  assert(requests.some((url) => url === "/api/v1/media/extra-1"));
  assert(!requests.some((url) => url.includes("extra-2")));
  await page
    .getByRole("button", { name: "Next photo", exact: true })
    .press("ArrowRight");
  await page.getByRole("status").filter({ hasText: "Photo 3 of 3" }).waitFor();
  for (const [name, width, height] of [
    ["desktop", 1280, 900],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".gift-detail img")].every(
        (img) => img.naturalWidth > 0,
      ),
    );
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `.local/image-review/gallery-${name}.png`,
      fullPage: false,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  const touch = await ctx.newCDPSession(page);
  await page.locator(".item-photo-slide").scrollIntoViewIfNeeded();
  const bounds = await page.locator(".item-photo-slide").boundingBox();
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: bounds.x + 60, y: bounds.y + 100 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: bounds.x + 170, y: bounds.y + 100 }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.getByRole("status").filter({ hasText: "Photo 2 of 3" }).waitFor();
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({ path: ".local/image-review/gallery-dark.png" });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  // Open the existing editor from its contextual actions.
  await page.getByLabel("Actions for Photo test 0", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit item", exact: true })
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Use photo 2 as cover").click();
  assert(
    await page
      .locator(".item-photo-preview")
      .nth(1)
      .getByText("Cover photo")
      .count(),
  );
  await page.getByLabel("Remove photo 3", { exact: true }).click();
  assert.equal(await page.locator(".item-photo-preview").count(), 2);
  const input = page.locator("input[type=file][multiple]");
  await input.setInputFiles({
    name: "photo.webp",
    mimeType: "image/webp",
    buffer: image,
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Photo uploaded." })
    .waitFor();
  assert.equal(await page.locator(".item-photo-preview").count(), 3);
  for (const [name, width, height] of [
    ["mobile", 390, 844],
    ["desktop", 1280, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".item-photo-previews").scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".gift-detail img")].every(
        (img) => img.naturalWidth > 0,
      ),
    );
    await page.waitForTimeout(150);
    await page.screenshot({
      path: `.local/image-review/gallery-editor-${name}.png`,
      fullPage: false,
    });
  }
  await input.setInputFiles([
    { name: "retry.webp", mimeType: "image/webp", buffer: image },
    { name: "success.webp", mimeType: "image/webp", buffer: image },
  ]);
  await page.getByRole("button", { name: "Retry failed uploads" }).waitFor();
  assert.equal(await page.locator(".item-photo-preview").count(), 4);
  await page.getByRole("button", { name: "Retry failed uploads" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Photo uploaded." })
    .waitFor();
  assert.equal(await page.locator(".item-photo-preview").count(), 5);
  assert(await input.isDisabled());
  const sw = await readFile("dist/client/sw.js", "utf8");
  const precache = JSON.parse(sw.match(/const FILES=(\[.*?\]);/)[1]);
  assert(
    !precache.some((url) => url.includes("ItemPhotoGallery")),
    "service worker does not precache gallery",
  );
} finally {
  await browser.close();
}
console.log(
  "Gallery loading, navigation, editor and responsive checks passed.",
);
