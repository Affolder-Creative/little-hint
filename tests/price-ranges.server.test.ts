import { shoppingOffers } from "../src/shared/shopping-offers";
import { afterEach, expect, it, vi } from "vitest";
import { command, giftView } from "../src/server/domain";
import {
  priceCommand,
  priceEligible,
  schedulePrices,
} from "../src/server/prices";
import { wishlistFixture } from "./wishlist-fixture";
import type { Item } from "../src/shared/model";

afterEach(() => vi.unstubAllEnvs());
function fixture() {
  const f = wishlistFixture();
  const i = command(f.s, f.john, "items.create", {
    title: "TV",
    listId: f.list.id,
    priceCents: 40000,
    priceMaxCents: 70000,
    url: "https://shop.example/tv",
    shoppingOffers: [
      { id: "shop", url: "https://shop.example/tv", priceCents: 55000 },
    ],
  }) as Item;
  return { ...f, i: f.s.items.find((x) => x.id === i.id)! };
}
it("stores ranges independently of exact shopping offers and retains upper-only edit history", () => {
  const f = fixture();
  expect(giftView(f.s, f.reader, f.i)).toMatchObject({
    priceCents: 40000,
    priceMaxCents: 70000,
  });
  expect(f.i.pricing?.paused).toBe(true);
  command(f.s, f.john, "items.update", { ...f.i, priceMaxCents: 80000 });
  expect(f.i.shoppingOffers?.[0].priceCents).toBe(55000);
  expect(f.s.priceChanges.at(-1)).toMatchObject({
    from: 40000,
    to: 40000,
    fromMaxCents: 70000,
    toMaxCents: 80000,
  });
  command(f.s, f.john, "items.update", {
    ...f.i,
    priceCents: 60000,
    priceMaxCents: null,
  });
  expect(f.i.shoppingOffers?.[0].priceCents).toBe(55000);
  expect(f.i.pricing?.paused).toBe(true);
});
it("validates numeric pairs and preserves ranges only for unchanged older-client prices", () => {
  const f = fixture();
  const { priceMaxCents: ignored, ...older } = f.i;
  command(f.s, f.john, "items.update", { ...older, title: "TV idea" });
  expect(f.i.priceMaxCents).toBe(70000);
  expect(() =>
    command(f.s, f.john, "items.update", {
      ...older,
      revision: f.i.revision,
      priceCents: 50000,
    }),
  ).toThrow(/Refresh/);
  for (const patch of [
    { priceCents: null, priceMaxCents: 70000 },
    { priceCents: 40000, priceMaxCents: 40000 },
    { priceCents: 40000, priceMaxCents: 39999 },
    { priceCents: 40000, priceMaxCents: 100000001 },
    { priceCents: 40000, priceMaxCents: 70000.5 },
  ])
    expect(() =>
      command(f.s, f.john, "items.update", { ...f.i, ...patch }),
    ).toThrow();
  command(f.s, f.john, "items.update", {
    ...f.i,
    priceCents: null,
    priceMaxCents: null,
  });
  expect(f.i.priceCents).toBeNull();
});
it("keeps ranged drafts paused after publication and supports independent ranged group products", () => {
  const f = fixture();
  const draft = command(f.s, f.john, "items.create", {
    title: "TV draft",
    listId: f.list.id,
    publicationState: "draft",
    priceCents: 0,
    priceMaxCents: 70000,
  }) as Item;
  const published = command(f.s, f.john, "items.publish", { ...draft }) as Item;
  expect(published.priceMaxCents).toBe(70000);
  expect(published.pricing?.paused).toBe(true);
  const group = command(f.s, f.john, "items.create", {
    title: "Living room",
    kind: "group",
    listId: f.list.id,
    products: [
      { title: "TVs", priceCents: 40000, priceMaxCents: 70000, quantity: 2 },
      { title: "Stand", priceCents: 10000 },
    ],
  }) as Item;
  const view = giftView(
    f.s,
    f.reader,
    f.s.items.find((i) => i.id === group.id)!,
  );
  expect(view).toMatchObject({ priceCents: 90000, priceMaxCents: 150000 });
});
it("excludes ranges from checks and subscriptions while preserving unsubscribe and explicit exact-price resume", () => {
  vi.stubEnv("PRICE_CHECK_ENABLED", "true");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("TZ", "UTC");
  const f = fixture();
  expect(priceEligible(f.s, f.i)).toBe(false);
  schedulePrices(f.s, new Date("2026-11-21T12:00:00Z"));
  expect(f.s.priceChecks).toHaveLength(0);
  expect(() =>
    priceCommand(f.s, f.reader, "prices.watch", { id: f.i.id, enabled: true }),
  ).toThrow();
  expect(() =>
    priceCommand(f.s, f.john, "prices.tracking", { id: f.i.id, enabled: true }),
  ).toThrow(/exact price/);
  expect(() =>
    priceCommand(f.s, f.reader, "prices.watch", { id: f.i.id, enabled: false }),
  ).not.toThrow();
  command(f.s, f.john, "items.update", { ...f.i, priceMaxCents: null });
  expect(priceEligible(f.s, f.i)).toBe(false);
  priceCommand(f.s, f.john, "prices.tracking", { id: f.i.id, enabled: true });
  expect(priceEligible(f.s, f.i)).toBe(true);
});

it("never turns a ranged lower endpoint into a legacy implicit shop offer", () => {
  const f = wishlistFixture();
  const i = command(f.s, f.john, "items.create", {
    title: "TV without explicit offers",
    listId: f.list.id,
    priceCents: 40000,
    priceMaxCents: 70000,
    url: "https://shop.example/tv",
  }) as Item;
  expect(shoppingOffers(i)[0].priceCents).toBeNull();
  expect(i.pricing?.paused).toBe(true);
});
it("keeps range-to-exact link changes paused and preserves independent shop prices", () => {
  const f = fixture();
  command(f.s, f.john, "items.update", {
    ...f.i,
    url: "https://shop.example/new-tv",
    priceCents: 60000,
    priceMaxCents: null,
  });
  expect(f.i.pricing?.paused).toBe(true);
  expect(f.i.shoppingOffers?.[0]).toMatchObject({
    url: "https://shop.example/new-tv",
    priceCents: 55000,
  });
});

it("retains a legacy exact shop price through range and exact transitions", () => {
  const f = wishlistFixture();
  const i = f.add();
  i.url = "https://shop.example/tv";
  i.priceCents = 55000;
  command(f.s, f.john, "items.update", {
    ...i,
    priceCents: 40000,
    priceMaxCents: 70000,
  });
  expect(shoppingOffers(i)[0].priceCents).toBe(55000);
  command(f.s, f.john, "items.update", {
    ...i,
    priceCents: 60000,
    priceMaxCents: null,
  });
  expect(shoppingOffers(i)[0].priceCents).toBe(55000);
});
