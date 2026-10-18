import { describe, it, expect } from "vitest";
import {
  parseProduct,
  publicAddress,
  validateUrl,
  tagsFor,
} from "../src/server/imports";
import { canonicalUrl } from "../src/server/domain";
describe("product imports", () => {
  it.each([
    "amazon.com",
    "walmart.com",
    "target.com",
    "bestbuy.com",
    "etsy.com",
  ])("extracts structured metadata from %s fixtures", (host) => {
    const p = parseProduct(
      `<script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "Product", name: "Ceramic coffee brewer", description: "<b>Make</b> a lovely cup of coffee.", image: "/product.jpg", offers: { price: "49.95", priceCurrency: "USD" } }] })}</script>`,
      `https://${host}/product`,
    );
    expect(p.title).toBe("Ceramic coffee brewer");
    expect(p.description).toBe("Make a lovely cup of coffee.");
    expect(p.priceCents).toBe(4995);
    expect(p.remoteImage).toBe(`https://${host}/product.jpg`);
    expect(p.tags!.length).toBeGreaterThanOrEqual(3);
  });
  it("falls back to Open Graph and never invents a price", () => {
    const p = parseProduct(
      '<meta property="og:title" content="A wool blanket"><meta property="og:image" content="/blanket.png">',
      "https://example.com/blanket",
    );
    expect(p.title).toBe("A wool blanket");
    expect(p.priceCents).toBeNull();
  });
  it("does not silently convert other currencies", () => {
    const p = parseProduct(
      '<script type="application/ld+json">{"@type":"Product","name":"Journal","offers":{"price":20,"priceCurrency":"EUR"}}</script>',
      "https://example.com",
    );
    expect(p.priceCents).toBeNull();
  });
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "0.0.0.0",
  ])("blocks nonpublic address %s", (address) =>
    expect(publicAddress(address)).toBe(false),
  );
  it.each([
    "http://127.0.0.1",
    "http://[::1]",
    "http://user:password@example.com",
    "file:///etc/passwd",
    "https://localhost",
    "http://192.168.1.1",
    "https://example.com:444",
  ])(
    "rejects unsafe URL %s",
    async (url) => await expect(validateUrl(url)).rejects.toThrow(),
  );
  it("recognizes product-equivalent Amazon URLs", () =>
    expect(
      canonicalUrl("https://www.amazon.com/title/dp/B012345678?tag=abc"),
    ).toBe(canonicalUrl("https://amazon.com/gp/product/B012345678?ref=123")));
});

it("extracts Amazon product selectors without AI", () => {
  const p = parseProduct(
    '<title>Shop</title><span id="productTitle">Ceramic coffee mug</span><div id="feature-bullets"><li><span class="a-list-item">A handmade cup</span></li></div><img id="landingImage" data-old-hires="https://images.example.com/mug.jpg"><div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$24.95</span></span></div>',
    "https://www.amazon.com/dp/B012345678",
  );
  expect(p.title).toBe("Ceramic coffee mug");
  expect(p.priceCents).toBe(2495);
  expect(p.remoteImage).toContain("mug.jpg");
});
it("rejects retailer verification pages instead of importing their page title", () => {
  expect(() =>
    parseProduct(
      '<title>Amazon Robot Check</title><form action="/errors/validateCaptcha"></form>',
      "https://amazon.com/dp/B012345678",
    ),
  ).toThrow("verification");
});
it("normalizes the structured Amazon provider response without inventing unavailable prices", async () => {
  const { parseAmazonResponse, boundedBody } =
    await import("../src/server/imports");
  expect(
    parseAmazonResponse(
      {
        title: "Coffee mug",
        currency: "USD",
        price: 24.95,
        images: ["https://example.com/image.jpg"],
      },
      "https://amazon.com/dp/B012345678",
    ).priceCents,
  ).toBe(2495);
  expect(
    parseAmazonResponse(
      { title: "Coffee mug", currency: "EUR", price: 24.95 },
      "https://amazon.com/dp/B012345678",
    ).priceCents,
  ).toBeNull();
  await expect(boundedBody(new Response("123456"), 5)).rejects.toThrow(
    "too large",
  );
});
