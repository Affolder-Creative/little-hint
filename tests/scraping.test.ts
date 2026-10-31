import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyState, type State } from "../src/shared/model";
const mocks = vi.hoisted(() => ({ direct: vi.fn(), state: {} as State }));
vi.mock("undici", () => ({ Agent: class {}, fetch: mocks.direct }));
vi.mock("../src/server/settings", () => ({
  config: vi.fn(),
  spend: vi.fn(),
  automaticallyImportProductPhotos: vi.fn(async () => false),
}));
vi.mock("../src/server/db", () => ({
  transact: vi.fn(async (run) => run(mocks.state)),
}));
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));
import { config, spend } from "../src/server/settings";
import { importProduct, paidProductPreview } from "../src/server/imports";
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
  mocks.direct.mockReset();
  mocks.state = emptyState();
  vi.mocked(config).mockResolvedValue(
    keys as Awaited<ReturnType<typeof config>>,
  );
  vi.mocked(spend).mockResolvedValue(new Date().toISOString());
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
  it.each(scrapingProviders.filter((p) => p.id !== "brightdata"))(
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
  it("enables rendering only for Fish, using its default rendering wait", () => {
    const fish = scrapingRequest("scrapingfish", "fish", target);
    expect(fish.url.origin + fish.url.pathname).toBe(
      "https://api.scrapingfish.com/api/v1/",
    );
    expect(fish.url.searchParams.get("render_js")).toBe("true");
    expect(fish.url.searchParams.has("render_js_timeout_ms")).toBe(false);
    expect(fish.url.searchParams.has("extract_rules")).toBe(false);
    expect(
      scrapingRequest("scrapingbee", "bee", target).url.searchParams.get(
        "render_js",
      ),
    ).toBe("false");
    expect(
      scrapingRequest("scrapedo", "do", target).url.searchParams.has(
        "render_js",
      ),
    ).toBe(false);
    expect(
      scrapingRequest("scrapingdog", "dog", target).url.searchParams.get(
        "dynamic",
      ),
    ).toBe("false");
  });
});

describe("single paid preview attempt", () => {
  it("does not pay solely for a missing image when photos are OFF", async () => {
    const fetcher = vi.fn(
      async () => new Response('<meta property="og:title" content="Book">'),
    );
    vi.stubGlobal("fetch", fetcher);
    const partial = { title: "Direct title" };
    expect(await paidProductPreview(target, partial, keys, false)).toEqual(
      partial,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();
    await paidProductPreview(target, {}, keys, false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledTimes(1);
    await paidProductPreview(target, partial, keys, true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(scrapingProviders.filter((p) => p.id !== "brightdata"))(
    "parses HTML from $name",
    async (p) => {
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
    },
  );
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
  it.each(["http", "network", "timeout", "oversize", "captcha"])(
    "preserves direct metadata after %s failure, without another provider",
    async (failure) => {
      const fetcher = vi.fn(async () => {
        if (failure === "timeout")
          throw new DOMException("Provider timed out", "TimeoutError");
        if (failure === "network")
          throw new Error("Provider timeout with private-key");
        if (failure === "http")
          return new Response("private-key", { status: 429 });
        if (failure === "oversize") return new Response("x".repeat(2_000_001));
        return new Response("<title>Access denied</title>");
      });
      vi.stubGlobal("fetch", fetcher);
      const partial = { title: "Direct title", priceCents: 1234 };
      expect(await paidProductPreview(target, partial, keys, true)).toEqual(
        partial,
      );
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

describe("full import fallback flow", () => {
  const productHtml =
    '<script type="application/ld+json">{"@type":"Product","name":"Coffee mug","description":"A ceramic mug","image":"/mug.png","offers":{"price":"25","priceCurrency":"USD"}}</script>';

  it("keeps successful direct imports free even with Fish configured", async () => {
    mocks.direct.mockResolvedValue(new Response(productHtml));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await importProduct(target, "owner")).toMatchObject({
      title: "Coffee mug",
      description: "A ceramic mug",
      priceCents: 2500,
    });
    expect(mocks.direct).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(spend).not.toHaveBeenCalled();
  });

  it("parses Fish HTML after a failed direct fetch without downloading disabled photos", async () => {
    mocks.direct.mockRejectedValue(new Error("Shop unavailable"));
    const fetcher = vi.fn(async () => new Response(productHtml));
    vi.stubGlobal("fetch", fetcher);
    const result = await importProduct(target, "owner");
    expect(result).toMatchObject({
      title: "Coffee mug",
      description: "A ceramic mug",
      priceCents: 2500,
    });
    expect(result).not.toHaveProperty("image");
    expect(result).not.toHaveProperty("remoteImage");
    expect(mocks.direct).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledExactlyOnceWith("scrapingfish");
  });

  it("retains the manual-entry error when direct fetching and Fish both fail", async () => {
    mocks.direct.mockRejectedValue(new Error("Shop unavailable"));
    const fetcher = vi.fn(async () => {
      throw new DOMException("Provider timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(importProduct(target, "owner")).rejects.toThrow(
      "You can still add the gift manually.",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(spend).toHaveBeenCalledExactlyOnceWith("scrapingfish");
  });
});

describe("product-detail AI accounting", () => {
  it.each(["valid", "invalid content", "missing usage", "request failure"])(
    "records returned tokens before content parsing: %s",
    async (outcome) => {
      vi.mocked(config).mockResolvedValue({
        OPENAI_API_KEY: "test-key",
        OPENAI_MODEL: "gpt-6-luna",
        SCRAPING_PROVIDER: "auto",
      } as Awaited<ReturnType<typeof config>>);
      vi.mocked(spend).mockResolvedValue("2026-10-31T23:59:59.000Z");
      mocks.direct.mockResolvedValue(
        new Response("<title>Retailer title</title>"),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          if (outcome === "request failure") throw new Error("Timeout");
          return new Response(
            JSON.stringify({
              ...(outcome === "missing usage"
                ? {}
                : { usage: { input_tokens: 80, output_tokens: 20 } }),
              output: [
                {
                  content: [
                    {
                      type: "output_text",
                      text:
                        outcome === "invalid content"
                          ? "invalid"
                          : JSON.stringify({
                              title: "Clean title",
                              description: "Plain description",
                              tags: ["Home", "Gift", "Kitchen"],
                            }),
                    },
                  ],
                },
              ],
            }),
          );
        }),
      );
      const result = await importProduct(target, "owner");
      expect(result.title).toBe(
        ["invalid content", "request failure"].includes(outcome)
          ? "Retailer title"
          : "Clean title",
      );
      expect(spend).toHaveBeenCalledExactlyOnceWith("openai");
      if (["missing usage", "request failure"].includes(outcome))
        expect(mocks.state.usage).toHaveLength(0);
      else {
        expect(
          mocks.state.usage.find(
            (u) => u.key === "imports:metrics:2026-10:gpt-6-luna:input",
          )?.count,
        ).toBe(80);
        expect(
          mocks.state.usage.find((u) => u.key.endsWith(":reported"))?.count,
        ).toBe(1);
      }
    },
  );
});

it("manual mode blocks direct extraction and paid calls before lookup", async () => {
  vi.mocked(config).mockResolvedValue({
    SCRAPING_PROVIDER: "none",
    OPENAI_API_KEY: "test",
    ...keys,
  } as Awaited<ReturnType<typeof config>>);
  const external = vi.fn();
  vi.stubGlobal("fetch", external);
  await expect(importProduct(target, "user")).rejects.toThrow(
    "Automatic shop lookups are off",
  );
  expect(mocks.direct).not.toHaveBeenCalled();
  expect(external).not.toHaveBeenCalled();
  expect(spend).not.toHaveBeenCalled();
});
