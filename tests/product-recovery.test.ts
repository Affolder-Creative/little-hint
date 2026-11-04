import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { emptyState } from "../src/shared/model";
const mocks = vi.hoisted(() => ({
  state: {} as ReturnType<typeof emptyState>,
  cfg: {} as Record<string, string>,
  fetch: vi.fn(),
  safeFetch: vi.fn(),
}));
vi.mock("../src/server/db", () => ({
  transact: async (fn: any) => fn(mocks.state),
}));
vi.mock("../src/server/settings", () => ({ config: async () => mocks.cfg }));
vi.mock("../src/server/domain", () => ({
  stamp: () => ({
    id: crypto.randomUUID(),
    revision: 0,
    createdAt: new Date().toISOString(),
  }),
}));
vi.mock("../src/server/imports", () => ({
  safeFetch: mocks.safeFetch,
  validateUrl: async () => {},
  parseProduct: () => ({}),
}));
import {
  recoverProduct,
  exactProductUrl,
  pageEvidence,
  manufacturerEvidence,
} from "../src/server/product-recovery";
const url = "https://shop.example/products/mug?color=blue";
const current = {
  title: "Mug",
  description: "Existing description",
  priceCents: 2500,
};
const args = () => ({
  url,
  current: {},
  photos: false,
  jobId: "job",
  deadline: Date.now() + 60000,
});
function response(overrides = {}, source = url) {
  return Response.json({
    status: "completed",
    usage: { input_tokens: 30, output_tokens: 20 },
    output: [
      {
        type: "web_search_call",
        action: { type: "search", sources: [{ url: source }] },
      },
      {
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              title: "Mug",
              description: "Blue ceramic",
              image: "",
              source: url,
              evidence: "Mug Blue ceramic",
              ...overrides,
            }),
          },
        ],
      },
    ],
  });
}
beforeEach(() => {
  vi.stubEnv("PRODUCT_IMPORT_CACHE_ENABLED", "false");
  mocks.state = emptyState();
  mocks.state.imports.push({
    id: "job",
    userId: "owner",
    url,
    status: "running",
    revision: 0,
    createdAt: new Date().toISOString(),
  });
  mocks.cfg = {
    AI_ENABLED: "true",
    AI_PRODUCT_RECOVERY_ENABLED: "true",
    OPENAI_API_KEY: "test",
    PAID_DAILY_LIMIT: "50",
    AI_PRODUCT_RECOVERY_DAILY_LIMIT: "10",
  };
  mocks.fetch.mockReset().mockImplementation(async () => response());
  mocks.safeFetch.mockReset().mockRejectedValue(new Error("Blocked"));
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("recovers exact cited product text, preserving price and recording attribution", async () => {
  const result = await recoverProduct({
    ...args(),
    current: { priceCents: 2500 },
  });
  expect(result).toMatchObject({
    title: "Mug",
    description: "Blue ceramic",
    priceCents: 2500,
    productSources: [{ url, fields: ["title", "description"], method: "web" }],
  });
  expect(mocks.state.usage.find((u) => u.key.endsWith(":openai"))?.count).toBe(
    1,
  );
});
it("uses retrieved evidence before search", async () => {
  await recoverProduct({ ...args(), html: "<main>Mug Blue ceramic</main>" });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).tools).toBeUndefined();
});
it.each(["AI_ENABLED", "AI_PRODUCT_RECOVERY_ENABLED"])(
  "honors %s",
  async (key) => {
    mocks.cfg[key] = "false";
    expect(await recoverProduct(args())).toEqual({});
    expect(mocks.fetch).not.toHaveBeenCalled();
  },
);
it.each(["PAID_DAILY_LIMIT", "AI_PRODUCT_RECOVERY_DAILY_LIMIT"])(
  "honors %s atomically",
  async (key) => {
    mocks.cfg[key] = "0";
    await recoverProduct(args());
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.state.usage).toEqual([]);
  },
);
it("does not recover descriptions or prices alone", async () => {
  expect(
    await recoverProduct({ ...args(), current: { title: "Mug" } }),
  ).toEqual({ title: "Mug" });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("does not overwrite existing details when a photo is missing", async () => {
  expect(
    await recoverProduct({ ...args(), current, photos: true }),
  ).toMatchObject(current);
});
it("rejects an unsupported photo even when the model supplies a URL", async () => {
  mocks.fetch.mockImplementation(async () =>
    response({ image: "https://shop.example/photo.jpg" }),
  );
  expect(
    (await recoverProduct({ ...args(), photos: true })).remoteImage,
  ).toBeUndefined();
});
it("redelivery reuses completed recovery", async () => {
  await recoverProduct(args());
  await recoverProduct(args());
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it("redelivery never resends an uncertain request", async () => {
  mocks.fetch.mockRejectedValue(new Error("timeout"));
  await recoverProduct(args());
  await recoverProduct(args());
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it.each([
  { title: "Different product" },
  { source: "https://shop.example/products/other" },
  { source: "https://shop.example/products/mug?color=red" },
  { evidence: "" },
  { title: "" },
  { source: "javascript:alert(1)" },
])("rejects unsupported output %j", async (invalid) => {
  mocks.fetch.mockImplementation(async () => response(invalid));
  expect((await recoverProduct(args())).title).toBeUndefined();
});
it("requires actual tool sources", async () => {
  mocks.fetch.mockImplementation(async () =>
    response({}, "https://unrelated.example"),
  );
  expect((await recoverProduct(args())).title).toBeUndefined();
});
it("does not dispatch after deadline", async () => {
  await recoverProduct({ ...args(), deadline: Date.now() - 1 });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("ignores discarded drafts", async () => {
  mocks.state.imports[0].draft = {
    state: "discarded",
    revision: 0,
    fields: {},
    touched: [],
  };
  await recoverProduct(args());
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("keeps variants separate and removes tracking only", () => {
  expect(exactProductUrl(url, url + "&utm_source=test")).toBe(true);
  expect(exactProductUrl(url, url.replace("blue", "red"))).toBe(false);
});
it("keeps script instructions out of visible evidence", () => {
  expect(
    pageEvidence("<script>steal secrets</script><main>Mug</main>", url).text,
  ).not.toContain("steal");
});
it("requires retailer-backed manufacturer identity", () => {
  expect(
    manufacturerEvidence(
      '<script type="application/ld+json">{"@type":"Product","brand":{"name":"Acme","url":"https://acme.example"},"mpn":"M1"}</script>',
    ),
  ).toEqual({ domain: "acme.example", identifiers: ["Acme", "M1"] });
  expect(
    manufacturerEvidence(
      '<script type="application/ld+json">{"@type":"Product","brand":"Acme"}</script>',
    ),
  ).toBeUndefined();
});

it("preserves the provider failure when AI recovery also fails", async () => {
  mocks.state.imports[0].diagnostic = {
    stage: "brightdata",
    reason: "brightdata-unlocker: Unlocker HTTP 403",
  };
  mocks.fetch.mockResolvedValue(new Response("unavailable", { status: 503 }));
  await recoverProduct(args());
  expect(mocks.state.imports[0].diagnostic).toMatchObject({
    stage: "brightdata",
    reason:
      "brightdata-unlocker: Unlocker HTTP 403; Recovery unavailable or evidence insufficient",
  });
});
