import { describe, it, expect } from "vitest";
import { retailerDataset, normalizeRetailer } from "../src/server/brightdata";
import { importView } from "../src/shared/imports";
import { selectedScrapingProvider } from "../src/shared/scraping-providers";
import { stamp, command, world } from "../src/server/domain";
import { emptyState, type ImportJob } from "../src/shared/model";
describe("retailer imports", () => {
  it("routes product URLs, not lookalike domains or category pages", () => {
    expect(
      retailerDataset("https://www.amazon.com/dp/B012345678"),
    ).toBeTruthy();
    expect(retailerDataset("https://www.walmart.com/ip/name/123")).toBeTruthy();
    expect(
      retailerDataset("https://www.target.com/p/name/-/A-123"),
    ).toBeTruthy();
    expect(
      retailerDataset("https://www.bestbuy.com/site/name/123.p"),
    ).toBeTruthy();
    expect(
      retailerDataset("https://amazon.com.evil.test/dp/B012345678"),
    ).toBeUndefined();
    expect(retailerDataset("https://amazon.com/s?k=shoes")).toBeUndefined();
  });
  it("rejects wrong Amazon identities and uncertain prices", () => {
    const url = "https://amazon.com/dp/B012345678";
    expect(() =>
      normalizeRetailer({ title: "Item", asin: "B999999999" }, url),
    ).toThrow();
    expect(
      normalizeRetailer(
        { title: "Item", final_price: 20, currency: "EUR" },
        url,
      ).priceCents,
    ).toBeNull();
    expect(
      normalizeRetailer(
        {
          title: "Item",
          final_price: 20,
          final_price_high: 30,
          currency: "USD",
        },
        url,
      ).priceCents,
    ).toBeNull();
    expect(
      normalizeRetailer(
        { title: "Item", final_price: 20, currency: "USD" },
        url,
      ).priceCents,
    ).toBe(2000);
  });
  it("requires the Unlocker zone and removes private execution fields", () => {
    expect(
      selectedScrapingProvider({
        SCRAPING_PROVIDER: "brightdata",
        BRIGHTDATA_API_KEY: "key",
      }),
    ).toBeUndefined();
    expect(
      selectedScrapingProvider({
        SCRAPING_PROVIDER: "brightdata",
        BRIGHTDATA_API_KEY: "key",
        BRIGHTDATA_UNLOCKER_ZONE: "shops",
      }),
    ).toBe("brightdata");
    expect(
      importView({
        providerState: { snapshotId: "secret" },
        diagnostic: { reason: "private" },
        id: "id",
      } as ImportJob),
    ).toEqual({ id: "id" });
  });
  it("keeps drafts private, enforces revisions and publishes once", () => {
    const s = emptyState(),
      a = { id: "owner", name: "Owner", email: "owner@example.test" },
      b = { id: "other", name: "Other", email: "other@example.test" };
    const person = { ...stamp(), name: a.name, userId: a.id, guardians: [] };
    s.people.push(person);
    const list = command(s, a, "lists.create", {
      name: "Wishes",
      ownerIds: [person.id],
      groupIds: [],
      mode: "surprise",
    }) as any;
    const j = command(s, a, "imports.create", {
      url: "https://example.com/item",
      draft: {
        listId: list.id,
        fields: { title: "My item" },
        touched: ["title"],
      },
    }) as ImportJob;
    expect(world(s, b).imports).toEqual([]);
    expect(() => command(s, b, "imports/discard", { id: j.id })).toThrow();
    expect(() =>
      command(s, a, "imports.update", {
        id: j.id,
        revision: 0,
        fields: { title: "Lost edit" },
      }),
    ).toThrow();
    command(s, a, "imports.update", {
      id: j.id,
      revision: 1,
      fields: { title: "Edited item" },
      touched: ["title"],
    });
    const payload = {
      title: "Edited item",
      url: j.url,
      listId: list.id,
      importId: j.id,
      quantity: 1,
      tags: [],
      allowDuplicate: true,
    };
    command(s, a, "items.create", payload);
    expect(s.imports[0].draft?.state).toBe("published");
    expect(() => command(s, a, "items.create", payload)).toThrow();
    expect(s.items).toHaveLength(1);
  });
});
