import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../src/server/settings", () => ({ config: vi.fn(), spend: vi.fn() }));
vi.mock("../src/server/db", () => ({ transact: vi.fn() }));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
import { spend } from "../src/server/settings";
import { paidProductPreview } from "../src/server/imports";
import { scrapingRequest } from "../src/server/scraping";
import {
  scrapingProviders,
  selectedScrapingProvider,
} from "../src/shared/scraping-providers";
const target = "https://example.com/product?a=1&b=two words";
const keys = Object.fromEntries(
  scrapingProviders.map((p) => [p.key, "test-key"]),
);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(spend).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("provider selection", () => {
  it("prefers Fish, retains Bee-only installations, and never falls through an explicit choice", () => {
    expect(selectedScrapingProvider(keys)).toBe("scrapingfish");
    expect(selectedScrapingProvider({ SCRAPINGBEE_API_KEY: "bee" })).toBe(
      "scrapingbee",
    );
    expect(
      selectedScrapingProvider({ ...keys, SCRAPING_PROVIDER: "none" }),
    ).toBeUndefined();
    expect(
      selectedScrapingProvider({
        SCRAPINGBEE_API_KEY: "bee",
        SCRAPING_PROVIDER: "scrapingfish",
      }),
    ).toBeUndefined();
    expect(
      selectedScrapingProvider({ ...keys, SCRAPING_PROVIDER: "scrapedo" }),
    ).toBe("scrapedo");
    expect(
      selectedScrapingProvider({ ...keys, SCRAPING_PROVIDER: "unknown" }),
    ).toBeUndefined();
  });
  it.each(scrapingProviders)(
    "encodes $name requests and uses the documented credentials",
    (provider) => {
      const r = scrapingRequest(provider.id, "private-key", target);
      expect(r.url.searchParams.get("url")).toBe(target);
      expect(r.url.protocol).toBe("https:");
      if (provider.id === "scrapingbee")
        expect(r.headers.Authorization).toBe("Bearer private-key");
      else
        expect(
          r.url.searchParams.get(
            provider.id === "scrapedo" ? "token" : "api_key",
          ),
        ).toBe("private-key");
    },
  );
  it("retains the Bee Amazon product endpoint only for supported Amazon URLs", () => {
    const r = scrapingRequest(
      "scrapingbee",
      "bee",
      "https://www.amazon.com/dp/B012345678?tag=gift",
    );
    expect(r.amazon).toBe(true);
    expect(r.url.pathname).toBe("/api/v1/amazon/product");
    expect(r.url.searchParams.get("query")).toBe("B012345678");
    expect(
      scrapingRequest(
        "scrapingfish",
        "fish",
        "https://www.amazon.com/dp/B012345678",
      ).amazon,
    ).toBe(false);
    expect(
      scrapingRequest(
        "scrapingbee",
        "bee",
        "https://amazon.com.evil.test/dp/B012345678",
      ).amazon,
    ).toBe(false);
  });
});

describe("single paid preview attempt", () => {
  it.each(scrapingProviders)("parses HTML from $name", async (p) => {
    const fetcher = vi.fn(
      async (_url: unknown, _options: unknown) =>
        new Response(
          '<meta property="og:title" content="A book"><meta property="og:image" content="/book.png">',
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    const result = await paidProductPreview(
      target,
      { description: "Direct description", priceCents: 2300 },
      { ...keys, SCRAPING_PROVIDER: p.id },
    );
    expect(result.title).toBe("A book");
    expect(result.remoteImage).toBe("https://example.com/book.png");
    expect(result.description).toBe("Direct description");
    expect(result.priceCents).toBe(2300);
    expect(spend).toHaveBeenCalledExactlyOnceWith(p.id);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });
  it("does not spend when direct metadata is complete or paid imports are disabled", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const complete = {
      title: "Book",
      remoteImage: "https://example.com/book.jpg",
    };
    expect(await paidProductPreview(target, complete, keys)).toEqual(complete);
    await paidProductPreview(
      target,
      {},
      { ...keys, SCRAPING_PROVIDER: "none" },
    );
    await paidProductPreview(target, {}, {});
    expect(fetcher).not.toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();
  });
  it.each(["http", "network", "oversize", "captcha"])(
    "preserves direct metadata after %s failure, without another provider",
    async (failure) => {
      const fetcher = vi.fn(async () => {
        if (failure === "network")
          throw new Error("Provider timeout with private-key");
        if (failure === "http")
          return new Response("private-key", { status: 429 });
        if (failure === "oversize") return new Response("x".repeat(2_000_001));
        return new Response("<title>Access denied</title>");
      });
      vi.stubGlobal("fetch", fetcher);
      const partial = { title: "Direct title", priceCents: 1234 };
      expect(await paidProductPreview(target, partial, keys)).toEqual(partial);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(spend).toHaveBeenCalledTimes(1);
    },
  );
  it("honors daily caps and URL validation before a paid request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await paidProductPreview("http://127.0.0.1/secret", {}, keys);
    expect(spend).not.toHaveBeenCalled();
    vi.mocked(spend).mockRejectedValue(new Error("Daily limit reached"));
    expect(await paidProductPreview(target, {}, keys)).toEqual({});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
