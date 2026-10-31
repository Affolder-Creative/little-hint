import { describe, it, expect } from "vitest";
import {
  retailerDataset,
  normalizeRetailer,
  brightDataFailureReason,
} from "../src/server/brightdata";
import { importView } from "../src/shared/imports";
import { selectedScrapingProvider } from "../src/shared/scraping-providers";
import { stamp, command, world } from "../src/server/domain";
import { emptyState, type ImportJob } from "../src/shared/model";
describe("retailer imports", () => {
  it("classifies provider rejections without retaining echoed input or credentials", () => {
    const reason = brightDataFailureReason(
      400,
      JSON.stringify({
        code: "validation_error",
        line: "https://private.test/item?token=secret",
        errors: [
          ["url", "Invalid URL with secret"],
          ["unknown-secret", "bad"],
        ],
      }),
    );
    expect(reason).toBe("Bright Data HTTP 400: Invalid request fields: url");
    expect(
      brightDataFailureReason(400, "Account is not active: secret-account"),
    ).toContain("Account or service inactive");
    expect(brightDataFailureReason(400, "API key secret-key is invalid")).toBe(
      "Bright Data HTTP 400: API credentials rejected",
    );
    expect(
      brightDataFailureReason(400, "some unrecognized response with secrets"),
    ).not.toContain("secrets");
  });
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
      retailerDataset(
        "https://www.bestbuy.com/product/lg-tv/JJ8VPZKKFW/sku/6673142",
      ),
    ).toBeTruthy();
    expect(
      retailerDataset("https://www.bestbuy.com/site/not-a-product.page"),
    ).toBeUndefined();
    expect(
      retailerDataset("https://amazon.com.evil.test/dp/B012345678"),
    ).toBeUndefined();
    expect(retailerDataset("https://amazon.com/s?k=shoes")).toBeUndefined();
  });
  it("matches the selected Target variant instead of rejecting it against the parent", () => {
    const url =
      "https://www.target.com/p/men-s-monte-collapsible-heel-loafers-goodfellow-co-taupe/-/A-1010085867?preselect=95250268#lnk=sametab";
    const row = {
      title: "Men's Monte Collapsible Heel Loafers - Goodfellow & Co Taupe 11",
      tcin_id: "95250268",
      product_id: "95250268",
      final_price: 30,
      currency: "USD",
    };
    expect(normalizeRetailer(row, url)).toMatchObject({
      title: row.title,
      priceCents: 3000,
    });
    expect(() =>
      normalizeRetailer({ ...row, tcin_id: "1010085867" }, url),
    ).toThrow("selected option");
    expect(() =>
      normalizeRetailer({ ...row, tcin_id: "95250269" }, url),
    ).toThrow("selected option");
  });
  it("validates the SKU in modern Best Buy product URLs", () => {
    const url = "https://www.bestbuy.com/product/lg-tv/JJ8VPZKKFW/sku/6673142";
    expect(
      normalizeRetailer({ title: "LG TV", sku: "6673142" }, url).title,
    ).toBe("LG TV");
    expect(() =>
      normalizeRetailer({ title: "LG TV", sku: "12345" }, url),
    ).toThrow("does not match");
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
