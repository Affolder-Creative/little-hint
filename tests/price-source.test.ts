import { expect, it } from "vitest";
import { wishlistFixture } from "./wishlist-fixture";
import {
  automaticPriceOffer,
  inferredPriceSource,
} from "../src/shared/shopping-offers";
import { reconcileShoppingOffers } from "../src/server/shopping-offers";
function fixture() {
  const i = wishlistFixture().add();
  i.shoppingOffers = [
    {
      id: "shop",
      url: "https://shop.example/p",
      label: "Shop",
      priceCents: 10900,
    },
  ];
  i.primaryOfferId = "shop";
  i.url = i.shoppingOffers[0].url;
  return i;
}
it("derives complete shop edits and treats zero as a price", () => {
  const i = fixture();
  i.priceSource = "shops";
  i.priceCents = 100;
  reconcileShoppingOffers(i, structuredClone(i));
  expect(i.priceCents).toBe(10900);
  i.shoppingOffers![0].priceCents = 0;
  reconcileShoppingOffers(i, structuredClone(i));
  expect(i.priceCents).toBe(0);
});
it("keeps custom values independent through shop edits and URL replacement", () => {
  const i = fixture();
  i.priceSource = "custom";
  i.priceCents = 100;
  const before = structuredClone(i);
  i.url = "https://shop.example/new";
  i.shoppingOffers![0].url = i.url;
  reconcileShoppingOffers(i, before);
  expect(i.priceCents).toBe(100);
  expect(i.shoppingOffers![0].priceCents).toBe(10900);
  expect(i.pricing?.paused).toBe(true);
});
it("preserves custom ranges and intentional unknowns", () => {
  for (const price of [null, 0, 100, 5000]) {
    const i = fixture();
    i.priceCents = price;
    expect(inferredPriceSource(i)).toBe("custom");
  }
  const i = fixture();
  i.priceCents = 10900;
  expect(inferredPriceSource(i)).toBe("shops");
  i.priceMaxCents = 12000;
  expect(inferredPriceSource(i)).toBe("custom");
});
it("prefers fresh verification then lowest saved price and primary on ties", () => {
  const i = fixture();
  i.shoppingOffers!.push({
    id: "fresh",
    url: "https://other.example/p",
    label: "Other",
    priceCents: 15000,
    pricing: {
      baseline: 15000,
      baselineLabel: "when added",
      generation: "g",
      checkedAt: new Date().toISOString(),
      status: "verified",
    },
  });
  expect(automaticPriceOffer(i)?.id).toBe("fresh");
  i.shoppingOffers![1].pricing!.checkedAt = "2020-01-01T00:00:00Z";
  expect(automaticPriceOffer(i)?.id).toBe("shop");
  i.shoppingOffers![1].priceCents = 10900;
  expect(automaticPriceOffer(i)?.id).toBe("shop");
});
it("retains last displayed amount when removing the final shop", () => {
  const i = fixture();
  i.priceSource = "shops";
  i.priceCents = 10900;
  const before = structuredClone(i);
  i.shoppingOffers = [];
  i.url = "";
  reconcileShoppingOffers(i, before);
  expect(i.priceSource).toBe("custom");
  expect(i.priceCents).toBe(10900);
});
it("keeps checks paused when changing a shop resets the price baseline", () => {
  const i = fixture();
  i.priceSource = "shops";
  i.pricing!.paused = true;
  const before = structuredClone(i);
  i.url = "https://shop.example/new";
  i.shoppingOffers![0].url = i.url;
  i.pricing = {
    baseline: 10900,
    baselineLabel: "when link changed",
    generation: "new",
  };
  reconcileShoppingOffers(i, before);
  expect(i.pricing.paused).toBe(true);
});
