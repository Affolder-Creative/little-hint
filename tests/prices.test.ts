import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { priceConfig, priceDay } from "../src/server/price-config";
import { parsePrice } from "../src/server/price-products";
import {
  meaningfulDrop,
  schedulePrices,
  priceCommand,
  priceAlertAllowed,
} from "../src/server/prices";
import { wishlistFixture } from "./wishlist-fixture";
import { giftView } from "../src/server/domain";
beforeEach(() => {
  vi.stubEnv("PRICE_CHECK_ENABLED", "true");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("TZ", "America/New_York");
});
afterEach(() => vi.unstubAllEnvs());
it("validates shared TZ, time, staging isolation and preview", () => {
  expect(() => priceConfig({ TZ: "not/a/zone" })).toThrow(/TZ/);
  expect(() => priceConfig({ PRICE_CHECK_TIME: "25:00" })).toThrow(/HH:mm/);
  expect(
    priceConfig({ APP_ENV: "staging", PRICE_CHECK_ENABLED: "true" }).enabled,
  ).toBe(false);
  expect(
    priceConfig({ APP_ENV: "staging", STAGING_PRICE_CHECK_ENABLED: "true" })
      .daily,
  ).toBe(0);
  expect(
    priceConfig({ APP_ENV: "preview", PRICE_CHECK_ENABLED: "true" }).enabled,
  ).toBe(false);
  expect(priceConfig({}).zone).toBe("UTC");
});
it("starts at the local time across DST and catches up later that day", () => {
  const cfg = { ...priceConfig(), time: "02:30" };
  expect(priceDay(new Date("2026-03-08T06:59:00Z"), cfg).due).toBe(false);
  expect(priceDay(new Date("2026-03-08T07:00:00Z"), cfg).due).toBe(true);
  expect(
    priceDay(new Date("2026-11-01T06:30:00Z"), { ...cfg, time: "01:30" }).due,
  ).toBe(true);
});
it("deduplicates URLs, runs once per local day, and excludes archives", () => {
  const f = wishlistFixture();
  const a = f.add(),
    b = f.add(),
    c = f.add();
  a.url = b.url = "https://shop.example/product";
  c.url = "https://shop.example/archived";
  c.archived = true;
  a.priceCents = b.priceCents = c.priceCents = 2500;
  const now = new Date("2026-11-03T15:00:00Z");
  schedulePrices(f.s, now);
  schedulePrices(f.s, now);
  expect(f.s.priceChecks).toHaveLength(1);
  expect(f.s.priceChecks[0].targets).toHaveLength(2);
  expect(a.pricing?.baseline).toBe(null); // Original saved baseline remains intact.
});
it("keeps subscriptions private and permits owners without revealing buying plans", () => {
  const f = wishlistFixture(),
    i = f.add();
  i.url = "https://shop.example/product";
  i.priceCents = 2500;
  priceCommand(f.s, f.john, "prices.watch", { id: i.id, enabled: true });
  expect(priceAlertAllowed(f.s, f.john.id, i.id)).toBe(true);
  expect(giftView(f.s, f.reader, i).priceWatching).toBe(false);
  expect(giftView(f.s, f.john, i).priceWatching).toBe(true);
  f.group.memberIds = [];
  expect(priceAlertAllowed(f.s, f.reader.id, i.id)).toBe(false);
  priceCommand(f.s, f.john, "prices.tracking", { id: i.id, enabled: false });
  expect(priceAlertAllowed(f.s, f.john.id, i.id)).toBe(false);
});
it("requires both percentage and absolute thresholds", () => {
  expect(meaningfulDrop(10000, 9500)).toBe(true);
  expect(meaningfulDrop(10000, 9501)).toBe(false);
  expect(meaningfulDrop(1000, 950)).toBe(false);
  expect(meaningfulDrop(1000, 900)).toBe(true);
  expect(meaningfulDrop(null, 900)).toBe(false);
});
const html = (patch = {}) =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", sku: "blue", offers: { "@type": "Offer", price: "25.00", priceCurrency: "USD", availability: "InStock" }, ...patch })}</script>`;
it("accepts an exact USD offer and rejects ambiguous or conditional offers", () => {
  expect(
    parsePrice(html(), "https://shop.example/p?variant=blue").priceCents,
  ).toBe(2500);
  expect(() =>
    parsePrice(html(), "https://shop.example/p?variant=red"),
  ).toThrow();
  for (const offers of [
    { "@type": "AggregateOffer", lowPrice: 20 },
    { price: "20", priceCurrency: "EUR", availability: "InStock" },
    { price: "20", priceCurrency: "USD", availability: "OutOfStock" },
    {
      price: "20",
      priceCurrency: "USD",
      availability: "InStock",
      eligibleCustomerType: "Member",
    },
  ])
    expect(() =>
      parsePrice(html({ offers }), "https://shop.example/p"),
    ).toThrow();
  expect(() => parsePrice(html() + html(), "https://shop.example/p")).toThrow();
});

it("excludes missing prices from scheduling, subscriptions, and resume", () => {
  const f = wishlistFixture(),
    item = f.add();
  item.url = "https://shop.example/product";
  item.priceCents = null;
  schedulePrices(f.s, new Date("2026-11-05T15:00:00Z"));
  expect(f.s.priceChecks).toHaveLength(0);
  expect(() =>
    priceCommand(f.s, f.john, "prices.watch", { id: item.id, enabled: true }),
  ).toThrow(/unavailable/);
  expect(() =>
    priceCommand(f.s, f.john, "prices.tracking", {
      id: item.id,
      enabled: true,
    }),
  ).toThrow(/Add a price/);
  expect(f.s.priceWatches).toHaveLength(0);
  // An explicitly free item still has a known price.
  item.priceCents = 0;
  schedulePrices(f.s, new Date("2026-11-06T15:00:00Z"));
  expect(f.s.priceChecks).toHaveLength(1);
});
