import assert from "node:assert/strict";
import { stagingFixtures } from "../src/server/staging-fixtures.ts";
import { world as makeWorld } from "../src/server/domain.ts";
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
const { state, actors } = stagingFixtures();
const world = makeWorld(state, actors[0]);
world.me.admin = true;
world.imageDelivery = { cacheEnabled: true, prefetchEnabled: true };
world.items = [0, 1, 2].map((n) => ({ ...world.items[0], id: `photo-${n}` }));
world.items.slice(0, 3).forEach((i, n) => {
  i.image = `/api/v1/media/test-${n}`;
  i.title = `Photo test ${n}`;
});
world.giftPreferences = [];
const image = await sharp({
  create: { width: 480, height: 320, channels: 3, background: "#aa4d37" },
})
  .webp()
  .toBuffer();
const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: "block" });
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
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(`https://ui.test/lists/${world.items[0].listId}`);
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".gift-card img")].length === 3 &&
      [...document.querySelectorAll(".gift-card img")].every(
        (i) => i.naturalWidth > 0,
      ),
  );
  await page.waitForTimeout(1200);
  assert.equal(cards, 3, "visible thumbnails load");
  assert.equal(full, 2, "automatic batch downloads exactly two detail photos");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("img", { name: "Photo test 0", exact: true }),
    })
    .click();
  await page.waitForFunction(
    () => document.querySelector(".gift-detail img")?.naturalWidth > 0,
  );
  assert.equal(
    full,
    2,
    "opening a prefetched item reuses its downloaded image",
  );
  for (const [name, width, height] of [
    ["desktop", 1280, 900],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("https://ui.test/settings?section=admin");
    await page
      .getByLabel("Cache product photos on devices", { exact: true })
      .waitFor();
    await page.screenshot({
      path: `.local/image-review/admin-${name}.png`,
      fullPage: true,
    });
    await page.goto(`https://ui.test/gift/${world.items[0].id}`);
    await page.waitForFunction(
      () => document.querySelector(".gift-photo img")?.naturalWidth > 0,
    );
    await page.screenshot({
      path: `.local/image-review/gift-${name}.png`,
      fullPage: true,
    });
  }
} finally {
  await browser.close();
}
console.log("Desktop/mobile Administration and decoded gift photos rendered.");
