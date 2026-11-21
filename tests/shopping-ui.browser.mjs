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
const products = ["Dinner forks", "Dinner knives", "Teaspoons"].map(
  (title, index) => ({
    ...gift,
    id: `piece-${index}`,
    title,
    shoppingOffers: undefined,
    primaryOfferId: undefined,
    parentItemId: "silverware",
    parentTitle: "Silverware set",
    priceCents: 3200,
    quantity: 1,
    available: index === 1 ? 0 : 1,
    canShop: true,
    isRecipient: false,
  }),
);
const group = {
  ...gift,
  id: "silverware",
  title: "Silverware set",
  kind: "group",
  products,
  url: "",
  shoppingOffers: [],
  priceCents: 9600,
  available: 2,
  canShop: false,
  isRecipient: false,
};
world.items = [gift, group];
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
      submitted = JSON.parse(route.request().postData());
      return route.fulfill({ json: { ...gift, ...submitted } });
    }
    if (u.pathname === "/api/v1/prices/watch") {
      gift.priceWatching = JSON.parse(route.request().postData()).enabled;
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
  await mkdir(".local/shopping-ui", { recursive: true });
  for (const [width, theme] of [
    [390, "light"],
    [768, "light"],
    [1280, "light"],
    [390, "dark"],
    [1280, "dark"],
  ]) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`https://ui.test/gift/${gift.id}`);
    await expect(
      page.getByRole("heading", { name: "Where to buy" }),
    ).toBeVisible();
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await expect(page.locator(".shopping-lowest")).toHaveText("Lowest checked");
    await expect(page.locator(".shopping-links a").nth(1)).toHaveAttribute(
      "href",
      "https://rei.example/jacket",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `.local/shopping-ui/offers-${width}-${theme}.png`,
      fullPage: true,
    });
    if (width === 390 && theme === "light") {
      await page.getByLabel("Notify me when the best price drops").click();
      await expect(
        page.getByLabel("Notify me when the best price drops"),
      ).toBeChecked();
      await page
        .getByRole("button", { name: "Edit item", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Add shop link", exact: true })
        .click();
      await page.getByLabel("Shop 3 link").fill("https://third.example/jacket");
      await page
        .getByLabel("Shop name", { exact: true })
        .nth(2)
        .fill("Third shop");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      assert.equal(submitted.shoppingOffers.length, 3);
      assert.equal(
        submitted.shoppingOffers[2].url,
        "https://third.example/jacket",
      );
      await page
        .getByRole("button", { name: "Edit item", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Add another product", exact: true })
        .click();
      await page.getByLabel("Set name").fill("Outdoor essentials");
      await page
        .getByLabel("Product name", { exact: true })
        .nth(1)
        .fill("Warm gloves");
      await page.screenshot({
        path: ".local/shopping-ui/group-editor-mobile.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      assert.equal(submitted.kind, "group");
      assert.equal(submitted.products[0].id, gift.id);
      assert.equal(submitted.products[1].title, "Warm gloves");
    }
    await page.goto("https://ui.test/gift/silverware");
    await expect(
      page.getByRole("heading", { name: "Products in this set" }),
    ).toBeVisible();
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    await expect(page.locator(".group-products li")).toHaveCount(3);
    await expect(
      page.locator(".group-products").getByText("Taken care of"),
    ).toBeVisible();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: `.local/shopping-ui/group-${width}-${theme}.png`,
      fullPage: true,
    });
    if (width === 390 && theme === "light") {
      await page
        .getByRole("button", { name: "Edit item", exact: true })
        .click();
      await expect(page.getByLabel("Set name")).toHaveValue("Silverware set");
      await page
        .getByRole("button", { name: "Add another product", exact: true })
        .click();
      await page
        .getByLabel("Product name", { exact: true })
        .nth(3)
        .fill("Serving spoon");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      assert.equal(submitted.kind, "group");
      assert.equal(submitted.products.length, 4);
      assert.equal(submitted.products[0].id, "piece-0");
      assert.equal(submitted.products[3].title, "Serving spoon");
    }
    await page.goto("https://ui.test/gift/piece-0");
    await expect(
      page.getByRole("heading", { name: "Dinner forks", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Part of", { exact: false })).toBeVisible();
    assert.deepEqual(errors, []);
    await page.close();
  }
  gift.adminDetailsOnly = true;
  const adminPage = await ctx.newPage();
  await adminPage.goto(`https://ui.test/gift/${gift.id}`);
  await adminPage
    .getByRole("button", { name: "Edit item", exact: true })
    .click();
  await expect(
    adminPage.getByRole("button", { name: "Add another product", exact: true }),
  ).toHaveCount(0);
  await adminPage
    .getByLabel("Shop name", { exact: true })
    .nth(1)
    .fill("REI outlet");
  await adminPage
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  assert.equal(submitted.shoppingOffers[1].label, "REI outlet");
  assert.equal(submitted.primaryOfferId, "patagonia");
  assert(!("visibility" in submitted));
  assert(!("recipientIds" in submitted));
  assert(!("groupIds" in submitted));
  await adminPage.close();
  console.log(
    "Shopping UI passed: offers, best-price subscription, edit payloads, grouped gifts, mobile/tablet/desktop, light/dark.",
  );
} finally {
  await browser.close();
}
