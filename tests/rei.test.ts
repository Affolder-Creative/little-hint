import { describe, expect, it } from "vitest";
import { parseProduct } from "../src/server/imports";
import { reiProductId } from "../src/server/rei";
const url =
  "https://www.rei.com/product/C10172/conscious-step-socks-that-protect-river-otters";
const variant = (sku: string, size: string, price = "15.95") => ({
  "@type": "Product",
  sku,
  size,
  color: "Green",
  image: ["/media/otters.jpg"],
  offers: [{ price, priceCurrency: "USD" }],
});
const group = {
  "@type": "ProductGroup",
  productGroupId: "C10172",
  name: "Socks That Protect River Otters",
  brand: { name: "Conscious Step" },
  description: "Socks that protect river otters.",
  image: ["/media/product/C10172"],
  hasVariant: [variant("C101720001", "S"), variant("C101720002", "M")],
};
const html = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
describe("REI imports", () => {
  it("imports the supplied ProductGroup without choosing a size", () => {
    expect(parseProduct(html(group), url)).toMatchObject({
      title: "Conscious Step Socks That Protect River Otters",
      priceCents: 1595,
      description: group.description,
      remoteImage: "https://www.rei.com/media/product/C10172",
    });
  });
  it("selects an exact SKU and its image", () => {
    expect(parseProduct(html(group), `${url}?sku=C101720002`)).toMatchObject({
      title: "Conscious Step Socks That Protect River Otters - Green - M",
      priceCents: 1595,
      remoteImage: "https://www.rei.com/media/otters.jpg",
    });
  });
  it.each(["sku=unknown", "sku=C101720002&size=S", "color=Red"])(
    "does not substitute a variant for %s",
    (query) => {
      expect(parseProduct(html(group), `${url}?${query}`)).toMatchObject({
        priceCents: null,
        remoteImage: undefined,
      });
    },
  );
  it("leaves differing variant prices blank", () => {
    expect(
      parseProduct(
        html({
          ...group,
          hasVariant: [variant("a", "S"), variant("b", "M", "19.95")],
        }),
        url,
      ).priceCents,
    ).toBeNull();
  });
  it("accepts matching size and color", () => {
    expect(
      parseProduct(html(group), `${url}?size=S&color=green`).title,
    ).toContain("Green - S");
  });
  it("reads the embedded model and featured product image", () => {
    const model = {
      pageData: {
        product: {
          styleId: "C10172",
          title: group.name,
          brand: group.brand,
          description: group.description,
          skus: [
            {
              skuId: "C101720001",
              size: { name: "S" },
              color: { displayLabel: "Green", code: "992" },
              price: { price: { value: 15.95 } },
            },
          ],
          computedImages: [
            { type: "Swatch Image", featured: true, uri: "/media/swatch.jpg" },
            { type: "Product Image", featured: true, uri: "/media/otters.jpg" },
          ],
        },
      },
    };
    expect(
      parseProduct(
        `<script id="modelData" type="application/json">${JSON.stringify(model)}</script>`,
        url,
      ),
    ).toMatchObject({
      title: "Conscious Step Socks That Protect River Otters",
      priceCents: 1595,
      remoteImage: "https://www.rei.com/media/otters.jpg",
    });
  });
  it("ignores malformed and unrelated structured data", () => {
    expect(
      parseProduct(
        '<script id="modelData">broken</script>' +
          html({ ...group, productGroupId: "999" }),
        url,
      ).title,
    ).toBe("");
  });
  it("limits routing to REI product pages", () => {
    expect(reiProductId(url)).toBe("C10172");
    expect(reiProductId("https://rei.com/product/123/item")).toBe("123");
    expect(
      reiProductId(url.replace("rei.com", "rei.com.evil.test")),
    ).toBeUndefined();
    expect(reiProductId("https://www.rei.com/c/socks")).toBeUndefined();
  });
});
it("uses REI product HTML when embedded metadata is absent", () => {
  expect(
    parseProduct(
      '<h1 id="product-page-title">Conscious Step Socks</h1><section id="product-primary-description">Otter socks</section><div id="apparel-media-image-container"><img alt="Product Image of color Green" src="/media/socks.jpg"></div>',
      url,
    ),
  ).toMatchObject({
    title: "Conscious Step Socks",
    description: "Otter socks",
    priceCents: null,
    remoteImage: "https://www.rei.com/media/socks.jpg",
  });
});
it("does not import unrelated Product recommendations", () => {
  expect(
    parseProduct(
      html({ "@type": "Product", sku: "other", name: "Other socks" }),
      url,
    ).title,
  ).toBe("");
});
it("does not import non-USD variant prices", () => {
  expect(
    parseProduct(
      html({
        ...group,
        hasVariant: [
          {
            ...variant("one", "S"),
            offers: [{ price: "15.95", priceCurrency: "EUR" }],
          },
        ],
      }),
      url,
    ).priceCents,
  ).toBeNull();
});
