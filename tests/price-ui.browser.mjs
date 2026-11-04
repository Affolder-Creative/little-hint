import assert from "node:assert/strict";
import { stagingFixtures } from "../src/server/staging-fixtures.ts";
import { world as makeWorld } from "../src/server/domain.ts";
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const { state, actors } = stagingFixtures();
const world = makeWorld(state, actors[0]);
world.giftPreferences = [];
world.priceChecksEnabled = true;
const gift = world.items[0];
gift.priceCents = 3999;
gift.url = "https://shop.example/product";
gift.pricing = {
  baseline: 4999,
  baselineLabel: "when added",
  generation: "test",
  checkedAt: new Date().toISOString(),
  status: "verified",
};
gift.canEdit = true;
gift.priceWatching = false;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("https://ui.test/**", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/api/v1/world") return route.fulfill({ json: world });
    if (u.pathname === "/api/v1/prices/watch") {
      gift.priceWatching = JSON.parse(route.request().postData()).enabled;
      return route.fulfill({ json: { ok: true } });
    }
    if (u.pathname === "/api/v1/prices/tracking") {
      gift.pricing.paused = !JSON.parse(route.request().postData()).enabled;
      return route.fulfill({ json: { ok: true } });
    }
    if (u.pathname.startsWith("/api/")) return route.fulfill({ json: [] });
    const file =
      u.pathname.startsWith("/assets/") || u.pathname.startsWith("/brand/")
        ? `dist/client${u.pathname}`
        : "dist/client/index.html";
    return route.fulfill({
      contentType: file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".svg")
            ? "image/svg+xml"
            : "text/html",
      body: await readFile(file),
    });
  });
  await mkdir(".local/price-ui", { recursive: true });
  for (const [width, theme] of [
    [390, "light"],
    [1280, "light"],
    [390, "dark"],
    [1280, "dark"],
  ]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`https://ui.test/gift/${gift.id}`);
    await page.getByText("$49.99 when added", { exact: false }).waitFor();
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    assert.equal(await page.locator(".detail-price").innerText(), "$39.99");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `.local/price-ui/${width}-${theme}.png`,
      fullPage: true,
    });
    if (width === 390 && theme === "light") {
      await page.getByLabel("Notify me of price drops").click();
      await expect(page.getByLabel("Notify me of price drops")).toBeChecked();
      await page
        .getByRole("button", { name: "Pause automatic price checks" })
        .click();
      await page
        .getByRole("button", { name: "Resume automatic price checks" })
        .waitFor();
      await page
        .getByRole("button", { name: "Resume automatic price checks" })
        .click();
    }
    await page.close();
  }
  console.log(
    "Price UI passed: mobile/desktop, light/dark, subscription and pause/resume.",
  );
} finally {
  await browser.close();
}
