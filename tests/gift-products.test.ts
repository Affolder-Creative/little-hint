import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  validate: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("../src/server/imports", () => ({
  safeFetch: mocks.fetch,
  validateUrl: mocks.validate,
}));
vi.mock("../src/server/import-cache", () => ({
  cachedImport: mocks.cache,
  importCacheKey: (stage: string, inputs: unknown) =>
    JSON.stringify([stage, inputs]),
  productCacheUrl: (url: string) => url,
}));
import {
  checkEditorial,
  checkGiftProduct,
  compatibleOffer,
  parseGiftProduct,
  trustedGiftDomain,
} from "../src/server/gift-products";
const url = "https://www.oxo.com/brewer",
  title = "Ceramic coffee brewer";
const product = () => ({
  "@type": "Product",
  name: title,
  description: "<b>Ceramic</b> brewer",
  brand: { name: "OXO" },
  gtin: "1234567890123",
  offers: {
    "@type": "Offer",
    price: "24.99",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  aggregateRating: { ratingValue: 4.5, reviewCount: 30 },
});
const html = (value: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
afterEach(() => vi.resetAllMocks());
describe("verifiable gift products", () => {
  it.each([
    "Gift card",
    "Annual coffee subscription",
    "Digital download",
    "Museum membership",
  ])("rejects nonphysical or recurring gifts: %s", (name) => {
    expect(() =>
      parseGiftProduct(html({ ...product(), name }), url, name),
    ).toThrow("physical");
  });
  it("extracts public facts with exact USD price, identity, reviews and timestamp", () => {
    const p = parseGiftProduct(html(product()), url, title);
    expect(p).toMatchObject({
      title,
      description: "Ceramic brewer",
      offer: {
        currency: "USD",
        priceCents: 2499,
        identity: "gtin:1234567890123",
        retailer: "OXO",
      },
    });
    expect(p.evidence[0].label).toBe("4.5/5 from 30 customer reviews");
    expect(
      compatibleOffer(p.offer, { ...p.offer, url: "https://www.rei.com/same" }),
    ).toBe(true);
    expect(
      compatibleOffer(p.offer, { ...p.offer, identity: "gtin:1234567890124" }),
    ).toBe(false);
  });
  it.each([
    { priceCurrency: "CAD" },
    { price: "24.999" },
    { price: "0" },
    { availability: "OutOfStock" },
    { "@type": "AggregateOffer" },
    { priceSpecification: {} },
    { eligibleCustomerType: "Member" },
    { itemCondition: "UsedCondition" },
    { priceValidUntil: "2000-01-01" },
  ])("rejects ambiguous, conditional or unavailable offers: %j", (offer) => {
    const p = product();
    Object.assign(p.offers, offer);
    expect(() => parseGiftProduct(html(p), url, title)).toThrow();
  });
  it("rejects mismatched products, variants, multiple products and unverified marketplace sellers", () => {
    expect(() =>
      parseGiftProduct(html(product()), url, "Other brewer"),
    ).toThrow("identity");
    expect(() =>
      parseGiftProduct(html([product(), product()]), url, title),
    ).toThrow("exact product");
    expect(() =>
      parseGiftProduct(html({ ...product(), hasVariant: [] }), url, title),
    ).toThrow("variant");
    expect(() =>
      parseGiftProduct(html(product()), "https://www.amazon.com/brewer", title),
    ).toThrow("seller");
    const p = product();
    Object.assign(p.offers, { seller: { name: "Amazon" } });
    expect(
      parseGiftProduct(html(p), "https://www.amazon.com/brewer", title).offer
        .seller,
    ).toBe("Amazon");
  });
  it.each([
    { ratingValue: 3.9, reviewCount: 30 },
    { ratingValue: 4.5, reviewCount: 24 },
    { ratingValue: 4.5, ratingCount: 100 },
    { ratingValue: 4.5, reviewCount: 30, bestRating: 10 },
    { ratingValue: 4.5, reviewCount: 30, worstRating: 3 },
  ])("does not promote weak review evidence: %j", (rating) => {
    expect(
      parseGiftProduct(
        html({ ...product(), aggregateRating: rating }),
        url,
        title,
      ).evidence,
    ).toEqual([]);
  });
  it.each([
    "http://www.oxo.com/x",
    "https://oxo.com.evil.test/x",
    "https://www.oxo.com@localhost/x",
    "https://127.0.0.1/x",
    "https://www.oxo.com:8080/x",
    "https://evil.oxo.com/x",
  ])("rejects unsafe/untrusted sources: %s", (source) => {
    expect(() => trustedGiftDomain(source)).toThrow();
  });
  it("checks every redirect, uses SSRF validation, and refreshes a stale public cache", async () => {
    const guard = vi.fn(async () => {}),
      stale = parseGiftProduct(
        html(product()),
        url,
        title,
        new Date(Date.now() - 16 * 60000),
      );
    mocks.cache
      .mockImplementationOnce(async () => stale)
      .mockImplementationOnce(
        async (_key, _schema, compute) => (await compute()).value,
      );
    mocks.fetch.mockImplementation(async (_url, _limit, onUrl) => {
      await onUrl(url);
      await expect(onUrl("https://localhost/private")).rejects.toThrow();
      return { buffer: Buffer.from(html(product())), url, cacheable: true };
    });
    const checked = await checkGiftProduct(url, title, guard);
    expect(mocks.validate).toHaveBeenCalledWith(url);
    expect(mocks.cache.mock.calls[1][3]).toBe(true);
    expect(checked.offer.checkedAt).not.toBe(stale.offer.checkedAt);
    expect(guard).toHaveBeenCalledTimes(3);
  });
  it("requires an exact positive editorial excerpt in a product-identifying paragraph", async () => {
    const source = "https://www.seriouseats.com/coffee",
      quote = "Our favorite brewer for everyday coffee";
    mocks.fetch.mockResolvedValue({
      buffer: Buffer.from(`<p>${title}. ${quote}.</p>`),
      url: source,
    });
    expect(
      (await checkEditorial(source, quote, title, async () => {})).kind,
    ).toBe("editorial");
    await expect(
      checkEditorial(
        source,
        "We do not recommend this brewer",
        title,
        async () => {},
      ),
    ).rejects.toThrow();
    await expect(
      checkEditorial(source, quote, "Other product", async () => {}),
    ).rejects.toThrow("matched");
    await expect(
      checkEditorial(source, "best ".repeat(26), title, async () => {}),
    ).rejects.toThrow();
  });
});
