import sharp from "sharp";
// Isolated browser tests: no database, accounts, retailer requests, or app server.
import { chromium, webkit } from "@playwright/test";
import { build } from "vite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
await build({
  configFile: false,
  logLevel: "error",
  build: {
    outDir: ".local/image-browser",
    lib: {
      entry: "src/client/image-store.ts",
      formats: ["es"],
      fileName: () => "store.js",
    },
    minify: false,
  },
});
const photo = await sharp({
  create: { width: 4, height: 4, channels: 3, background: "red" },
})
  .webp()
  .toBuffer();
const source = await readFile(".local/image-browser/store.js", "utf8");
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  const browser = await engine.launch();
  try {
    const context = await browser.newContext();
    let requests = 0;
    let access = true;
    await context.route("http://localhost:8923/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/media/access")
        return route.fulfill({ json: access ? ["photo"] : [] });
      if (path === "/store.js")
        return route.fulfill({ contentType: "text/javascript", body: source });
      if (path.startsWith("/api/")) {
        requests++;
        return route.fulfill({
          contentType: "image/webp",
          body: photo,
        });
      }
      return route.fulfill({
        contentType: "text/html",
        body: "<html><body>Image cache test</body></html>",
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    async function boot(
      target = page,
      owner = "alice",
      enabled = true,
      paged = false,
    ) {
      await target.goto("http://localhost:8923/");
      await target.evaluate(
        async ({ owner, enabled, paged }) => {
          window.store = await import("/store.js");
          window.fixture = {
            me: { id: owner },
            paged,
            items: paged ? [] : [{ image: "/api/v1/media/photo" }],
            imageDelivery: { cacheEnabled: enabled, prefetchEnabled: enabled },
          };
          window.store.configureProductImages(window.fixture);
        },
        { owner, enabled, paged },
      );
    }
    await boot();
    await page.evaluate(() =>
      Promise.all([
        store.loadProductImage("/api/v1/media/photo"),
        store.loadProductImage("/api/v1/media/photo"),
      ]),
    );
    assert.equal(requests, 1, "concurrent loads deduplicate");
    await page.waitForFunction(async () => {
      const database = await new Promise((resolve) => {
        const r = indexedDB.open("little-hint-product-images-v1");
        r.onsuccess = () => resolve(r.result);
      });
      const count = await new Promise((resolve) => {
        const r = database.transaction("images").objectStore("images").count();
        r.onsuccess = () => resolve(r.result);
      });
      database.close();
      return count === 1;
    });
    await page.evaluate(() => store.flushImageWrites());
    await boot();
    await page.evaluate(() => store.loadProductImage("/api/v1/media/photo"));
    assert.equal(
      requests,
      1,
      "reload reads persisted image without downloading",
    );
    await page.evaluate(() => {
      store.configureProductImages({ ...fixture, items: [] });
    });
    assert.equal(
      await page.evaluate(() =>
        store.loadProductImage("/api/v1/media/photo").then(
          () => false,
          () => true,
        ),
      ),
      true,
      "revoked images are inaccessible",
    );
    await boot(page, "bob");
    await page.evaluate(() => store.loadProductImage("/api/v1/media/photo"));
    assert.equal(
      requests,
      2,
      "another account cannot reuse the prior account cache",
    );
    const other = await context.newPage();
    await boot(other, "bob");
    await page.evaluate(() => store.clearProductImages());
    await other.waitForFunction(
      () =>
        !store.cachedProductImage("/api/v1/media/photo") &&
        !store.canPrefetchImages(),
      undefined,
      { polling: 50, timeout: 10000 },
    );
    await boot(page, "bob", false);
    assert.equal(
      await page.evaluate(() =>
        store.loadProductImage("/api/v1/media/photo").then(
          () => false,
          () => true,
        ),
      ),
      true,
      "disabled cache rejects managed reads",
    );
    await boot(page, "carol", true, true);
    assert.equal(
      await page.evaluate(() =>
        store.loadProductImage("/api/v1/media/photo").then(
          () => false,
          () => true,
        ),
      ),
      true,
      "paged shell alone grants no images",
    );
    await page.evaluate(() => {
      store.grantProductImages("carol", {
        rows: [{ image: "/api/v1/media/photo" }],
      });
      return store.loadProductImage("/api/v1/media/photo");
    });
    await page.evaluate(() => store.flushImageWrites());
    const beforeReload = requests;
    await boot(page, "carol", true, true);
    assert.equal(
      await page.evaluate(() =>
        store.loadProductImage("/api/v1/media/photo").then(
          () => false,
          () => true,
        ),
      ),
      true,
      "persisted bytes need a fresh response grant",
    );
    await page.evaluate(() => {
      store.grantProductImages("carol", { image: "/api/v1/media/photo" });
      return store.loadProductImage("/api/v1/media/photo");
    });
    assert.equal(requests, beforeReload, "fresh grant reuses persisted bytes");
    access = false;
    await page.evaluate(() => store.configureProductImages(fixture));
    await page.waitForFunction(
      () => !store.cachedProductImage("/api/v1/media/photo"),
    );
    assert.equal(
      await page.evaluate(() =>
        store.loadProductImage("/api/v1/media/photo").then(
          () => false,
          () => true,
        ),
      ),
      true,
      "access validation revokes old page grants",
    );
    console.log(
      `${name}: persistence, deduplication, revocation, account isolation, cross-tab cleanup, disabled policy passed`,
    );
  } finally {
    await browser.close();
  }
}
