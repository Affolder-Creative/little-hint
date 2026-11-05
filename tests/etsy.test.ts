import { describe, expect, it } from "vitest";
import { etsyListingId, normalizeEtsyProduct } from "../src/server/etsy";
import { normalizeRetailer, retailerDataset } from "../src/server/brightdata";

const url =
  "https://www.etsy.com/listing/1154909286/custom-handwriting-necklace-actual-your";
const row = {
  product_id: "1154909286",
  url,
  title: "Custom Handwriting Necklace",
  description: "An engraved handwriting pendant.",
  final_price: 39.9,
  currency: "USD",
  images: ["https://i.etsystatic.com/example/necklace.jpg"],
};

describe("Etsy listings", () => {
  it.each([
    url,
    "https://etsy.com/listing/1154909286",
    "https://www.etsy.com/uk/listing/1154909286/necklace?ref=share",
    "https://www.etsy.com/de-en/listing/1154909286/necklace/",
  ])("routes the listing, preserving its identity: %s", (link) => {
    expect(etsyListingId(link)).toBe(row.product_id);
    expect(retailerDataset(link)).toBe("gd_ltppk0jdv1jqz25mz");
    expect(retailerDataset(link, "price")).toBeUndefined();
  });

  it.each([
    "https://etsy.com.evil.test/listing/1154909286/necklace",
    "https://shop.etsy.com/listing/1154909286/necklace",
    "https://www.etsy.com/shop/PHERJEWELRY",
    "https://www.etsy.com/search?q=necklace",
    "https://www.etsy.com/listing/not-an-id/necklace",
    "https://www.etsy.com/listing/1154909286extra/necklace",
    "https://www.etsy.com/listing/1154909286/necklace/another-page",
    "https://user:pass@www.etsy.com/listing/1154909286",
    "https://www.etsy.com:8443/listing/1154909286",
    "ftp://www.etsy.com/listing/1154909286",
    "not a url",
  ])("does not accept unsupported listing URLs: %s", (link) => {
    expect(etsyListingId(link)).toBeUndefined();
  });

  it("normalizes verified listing fields and accepts an unambiguous USD price", () => {
    expect(normalizeRetailer(row, url)).toMatchObject({
      title: row.title,
      sourceTitle: row.title,
      description: row.description,
      priceCents: 3990,
      currency: "USD",
      remoteImage: row.images[0],
    });
    expect(
      normalizeRetailer({ ...row, product_id: 1154909286 }, url).title,
    ).toBe(row.title);
  });

  it.each([
    { product_id: "999999" },
    { product_id: undefined },
    { url: "https://etsy.com/listing/999999/different" },
    { url: "https://etsy.com.evil.test/listing/1154909286/necklace" },
    { url: "not a url" },
    { error: "secret-provider-message" },
    { error_code: "secret-provider-code" },
    { title: " " },
  ])(
    "rejects unusable or unverified results with a safe diagnostic: %j",
    (patch) => {
      expect(() => normalizeRetailer({ ...row, ...patch }, url)).toThrow(
        "Etsy product details or listing identity could not be verified",
      );
    },
  );

  it.each([
    { listing_has_variations: true },
    { variations: [{ type: "Color", values: ["Silver", "Gold"] }] },
    { variation: [{ type: "Color", name: "Silver" }] },
    { variant_attributes: [{ Color: "Silver" }] },
    { nai_variants: [{ type: "Color" }] },
  ])(
    "keeps a listing photo but omits an uncertain variant price: %j",
    (patch) => {
      const product = normalizeEtsyProduct({ ...row, ...patch }, url);
      expect(product).toMatchObject({
        title: row.title,
        priceCents: null,
        remoteImage: row.images[0],
      });
      expect(product.warnings).toHaveLength(1);
    },
  );

  it.each([
    "variation0=123",
    "variation1=456",
    "listing_inventory_id=987",
    "variant=blue",
    "sku=blue",
    "size=large",
    "color=gold",
  ])(
    "omits a photo and price that could represent the wrong selected option: %s",
    (query) => {
      const product = normalizeEtsyProduct(row, `${url}?${query}`);
      expect(product.priceCents).toBeNull();
      expect(product.remoteImage).toBeUndefined();
      expect(product.warnings).toHaveLength(1);
    },
  );

  it.each([
    { currency: "EUR" },
    { currency: undefined },
    { final_price: "39.90+" },
    { final_price: "39.90 - 59.90" },
    { final_price: -1 },
    { final_price: Infinity },
    { final_price: 1000001 },
    { price_range: "$39.90 - $59.90" },
    { final_price_high: 59.9 },
  ])(
    "leaves uncertain prices blank without losing the product: %j",
    (patch) => {
      expect(normalizeEtsyProduct({ ...row, ...patch }, url)).toMatchObject({
        title: row.title,
        priceCents: null,
      });
    },
  );

  it("reads documented description fallbacks and excludes unusable photo values", () => {
    expect(
      normalizeEtsyProduct(
        {
          ...row,
          description: undefined,
          item_details: [
            "<p>Sterling silver</p>",
            { unrecognized: true },
            "Made to order",
          ],
          images: ["data:image/png;base64,secret"],
          image_url: "",
        },
        url,
      ),
    ).toMatchObject({
      description: "Sterling silver\nMade to order",
      priceCents: 3990,
    });
    const product = normalizeEtsyProduct(
      {
        ...row,
        description: "",
        item_details_html: "<p>An engraved pendant</p><script>secret</script>",
        images: [],
      },
      url,
    );
    expect(product.description).toBe("An engraved pendant");
    expect(product.remoteImage).toBeUndefined();
  });
});
