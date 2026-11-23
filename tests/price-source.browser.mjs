import assert from "node:assert/strict";
import { stagingFixtures } from "../src/server/staging-fixtures.ts";
import { world as makeWorld } from "../src/server/domain.ts";
import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const { state, actors } = stagingFixtures();
const world = makeWorld(state, actors[0]);
world.giftPreferences = [];
world.priceChecksEnabled = true;
const gift = {
  ...world.items[0],
  title: "Patagonia jacket",
  canEdit: true,
  url: "https://patagonia.example/jacket",
  priceCents: 19900,
  pricing: {
    baseline: 22900,
    baselineLabel: "when added",
    generation: "product",
    checkedAt: new Date().toISOString(),
    status: "verified",
  },
  primaryOfferId: "patagonia",
  shoppingOffers: [
    {
      id: "patagonia",
      url: "https://patagonia.example/jacket",
      label: "Patagonia",
      priceCents: 22900,
    },
    {
      id: "rei",
      url: "https://rei.example/jacket",
      label: "REI",
      priceCents: 19900,
      pricing: {
        baseline: 22900,
        baselineLabel: "when added",
        generation: "product",
        checkedAt: new Date().toISOString(),
        status: "verified",
      },
    },
  ].map((o) => ({
    ...o,
    pricing: {
      baseline: o.priceCents,
      baselineLabel: "when added",
      generation: o.id,
      status: "verified",
      checkedAt: new Date().toISOString(),
    },
  })),
};
gift.priceSource = "shops";
gift.priceCents = null;
gift.shoppingOffers = [
  { id: "patagonia", url: gift.url, label: "Patagonia", priceCents: null },
];
world.items = [gift];
let submitted;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
});
try {
  const ctx = await browser.newContext({ serviceWorkers: "block" });
  await ctx.route("https://ui.test/**", async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === "/api/v1/world") return route.fulfill({ json: world });
    if (u.pathname === "/api/v1/items/update") {
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: { ...gift, ...submitted } });
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
  await mkdir(".local/shopping-ui", { recursive: true });
  for (const [width, theme] of [
    [320, "light"],
    [390, "dark"],
    [768, "light"],
    [1280, "dark"],
  ]) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`https://ui.test/gift/${gift.id}`);
    await page.evaluate(
      (t) => (document.documentElement.dataset.theme = t),
      theme,
    );
    await page.getByRole("button", { name: "Edit item", exact: true }).click();
    const shopPrice = page.getByLabel("Shop price in USD", { exact: true });
    await shopPrice.pressSequentially("109");
    await expect(page.locator(".product-price-value")).toContainText("$109");
    await page
      .getByRole("button", { name: "Set a custom price or range" })
      .click();
    await page.getByLabel("Price in USD", { exact: true }).fill("25-");
    await page
      .getByRole("button", { name: "Use shop prices", exact: true })
      .click();
    await expect(page.locator(".product-price-value")).toContainText("$109");
    await page.locator(".product-price-editor").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.local/shopping-ui/price-editor-${width}-${theme}.png`,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    assert.equal(submitted.priceCents, 10900);
    assert.equal(submitted.priceSource, "shops");
    assert.equal(submitted.shoppingOffers[0].priceCents, 10900);
    await page.close();
  }
  console.log(
    "Price source UI passed: full typed value, custom override, incomplete range recovery, responsive themes.",
  );
} finally {
  await browser.close();
}
