import { expect, it } from "vitest";
import { wishlistFixture } from "./wishlist-fixture";
import {
  bestShoppingOffer,
  shoppingUrl,
  freshOffer,
} from "../src/shared/shopping-offers";
import {
  migrateShoppingOffers,
  reconcileShoppingOffers,
} from "../src/server/shopping-offers";
it("migrates primary and discovered offers without inventing check times or identity", () => {
  const i = wishlistFixture().add();
  i.url = "https://first.example/p";
  i.priceCents = 1000;
  i.purchaseOffers = [
    {
      url: "https://other.example/p",
      retailer: "Other",
      seller: "Other",
      priceCents: 900,
      currency: "USD",
      checkedAt: "2026-01-01T00:00:00Z",
      identity: "discovery-specific",
    },
  ];
  migrateShoppingOffers(i);
  expect(i.shoppingOffers).toHaveLength(2);
  expect(i.shoppingOffers![0].pricing?.checkedAt).toBeUndefined();
  expect(i.shoppingOffers![1].pricing?.identity).toBeUndefined();
  expect(i.purchaseOffers).toBeUndefined();
  expect(shoppingUrl(i)).toBe(i.url);
});
it("keeps independent histories and invalidates replaced URLs", () => {
  const i = wishlistFixture().add();
  i.url = "https://first.example/p";
  i.priceCents = 1000;
  migrateShoppingOffers(i);
  const old = structuredClone(i),
    generation = i.shoppingOffers![0].pricing!.generation;
  i.shoppingOffers![0].label = "Renamed shop";
  reconcileShoppingOffers(i, old);
  expect(i.shoppingOffers![0].pricing!.generation).toBe(generation);
  const before = structuredClone(i);
  i.shoppingOffers![0].url = "https://first.example/new";
  reconcileShoppingOffers(i, before);
  expect(i.url).toBe("https://first.example/new");
  expect(i.shoppingOffers![0].pricing!.generation).not.toBe(generation);
  expect(i.pricing!.generation).not.toBe(before.pricing!.generation);
});
it("selects only fresh verified prices, using primary for ties", () => {
  const i = wishlistFixture().add();
  i.url = "https://first.example/p";
  i.priceCents = 1000;
  migrateShoppingOffers(i);
  const a = i.shoppingOffers![0];
  a.pricing = {
    ...a.pricing!,
    status: "verified",
    checkedAt: new Date().toISOString(),
  };
  i.shoppingOffers!.unshift({
    ...a,
    id: "other",
    url: "https://other.example/p",
  });
  expect(bestShoppingOffer(i)?.id).toBe(a.id);
  a.pricing.checkedAt = "2020-01-01T00:00:00Z";
  expect(freshOffer(a)).toBe(false);
  expect(bestShoppingOffer(i)).toBeUndefined();
});
it("rejects duplicate URLs but preserves distinct variants", () => {
  const i = wishlistFixture().add();
  i.url = "https://first.example/p?size=M";
  i.priceCents = 1000;
  migrateShoppingOffers(i);
  i.shoppingOffers!.push({ ...i.shoppingOffers![0], id: "second" });
  expect(() => reconcileShoppingOffers(i)).toThrow(/unique/);
  i.shoppingOffers![1].url = "https://first.example/p?size=L";
  expect(() => reconcileShoppingOffers(i)).not.toThrow();
});

it("applies legacy scalar price edits only to primary and pauses the aggregate", () => {
  const i = wishlistFixture().add();
  i.url = "https://first.example/p";
  i.priceCents = 1000;
  migrateShoppingOffers(i);
  const primary = i.shoppingOffers![0];
  primary.pricing = {
    ...primary.pricing!,
    status: "verified",
    checkedAt: new Date().toISOString(),
  };
  i.shoppingOffers!.push({
    ...structuredClone(primary),
    id: "other",
    url: "https://other.example/p",
    priceCents: 900,
  });
  const before = structuredClone(i);
  i.priceCents = 700;
  reconcileShoppingOffers(i, before);
  expect(i.shoppingOffers![0].priceCents).toBe(700);
  expect(i.shoppingOffers![1].priceCents).toBe(900);
  expect(i.shoppingOffers![0].pricing?.checkedAt).toBeUndefined();
  expect(i.pricing?.paused).toBe(true);
  expect(i.pricing?.checkedAt).toBeUndefined();
});
it("accepts a scalar primary-link replacement or removal without losing other shops", () => {
  const i = wishlistFixture().add();
  i.url = "https://first.example/p";
  i.priceCents = 1000;
  migrateShoppingOffers(i);
  const before = structuredClone(i);
  i.url = "https://first.example/new";
  reconcileShoppingOffers(i, before);
  expect(i.shoppingOffers![0].url).toBe(i.url);
  expect(i.shoppingOffers![0].pricing!.generation).not.toBe(
    before.shoppingOffers![0].pricing!.generation,
  );
  i.shoppingOffers!.push({
    ...structuredClone(i.shoppingOffers![0]),
    id: "other",
    url: "https://other.example/p",
  });
  const previous = structuredClone(i);
  i.url = "";
  reconcileShoppingOffers(i, previous);
  expect(i.shoppingOffers!.map((o) => o.id)).toEqual(["other"]);
  expect(i.primaryOfferId).toBe("other");
  expect(i.url).toBe("https://other.example/p");
});
it("never accepts a client's invented price verification", () => {
  const i = wishlistFixture().add();
  i.url = "https://first.example/p";
  i.priceCents = 1000;
  migrateShoppingOffers(i);
  const previous = structuredClone(i);
  i.shoppingOffers![0].pricing = {
    generation: "attacker",
    baseline: 100000,
    baselineLabel: "when added",
    status: "verified",
    checkedAt: new Date().toISOString(),
  };
  reconcileShoppingOffers(i, previous);
  expect(i.shoppingOffers![0].pricing).toEqual(
    previous.shoppingOffers![0].pricing,
  );
  expect(bestShoppingOffer(i)).toBeUndefined();
});

it("initializes new product estimates from a saved shop price but respects explicit clearing", () => {
  const i = wishlistFixture().add();
  i.priceCents = null;
  i.shoppingOffers = [
    {
      id: "primary",
      url: "https://shop.example/p",
      label: "Shop",
      priceCents: 1500,
    },
  ];
  i.primaryOfferId = "primary";
  reconcileShoppingOffers(i);
  expect(i.priceCents).toBe(1500);
  const before = structuredClone(i);
  i.priceCents = null;
  reconcileShoppingOffers(i, before);
  expect(i.priceCents).toBeNull();
  expect(i.shoppingOffers[0].priceCents).toBeNull();
  expect(i.pricing!.paused).toBe(true);
});
