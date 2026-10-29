import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { State } from "../src/shared/model";
const mocks = vi.hoisted(() => ({
  state: {} as State,
  mode: "both",
  configReads: 0,
  disableBeforeDispatch: false,
  clearOverridesBeforeDispatch: false,
  check: vi.fn(),
  image: vi.fn(),
  photos: false,
  fetchImage: vi.fn(),
}));
vi.mock("../src/server/db", () => ({
  readState: async () => structuredClone(mocks.state),
  transact: async (run: (s: State) => unknown) => {
    const next = structuredClone(mocks.state);
    const result = await run(next);
    mocks.state = next;
    return result;
  },
}));
vi.mock("../src/server/settings", () => ({
  config: async () => {
    mocks.configReads++;
    if (mocks.clearOverridesBeforeDispatch && mocks.configReads === 3)
      vi.stubEnv("GIFT_DISCOVERY_USER_OVERRIDES", "");
    if (mocks.disableBeforeDispatch && mocks.configReads === 3)
      mocks.mode = "off";
    return {
      OPENAI_API_KEY: "fake",
      GIFT_DISCOVERY_MODEL: "gpt-6-luna",
      GIFT_DISCOVERY_MODE: mocks.mode,
    };
  },
  discoveryConfiguration: () => ({
    mode: mocks.mode,
    available: mocks.mode !== "off",
    weeklyLimit: 3,
    monthlyLimit: 100,
    model: "gpt-6-luna",
  }),
  discoveryConfigForState: () => ({
    mode: mocks.mode,
    available: mocks.mode !== "off",
    weeklyLimit: 3,
    monthlyLimit: 100,
    model: "gpt-6-luna",
  }),
  automaticallyImportProductPhotos: async () => mocks.photos,
}));
vi.mock("../src/server/gift-products", () => ({
  checkGiftProduct: mocks.check,
  checkEditorial: vi.fn(),
  compatibleOffer: (a: any, b: any) => a.identity === b.identity,
  giftShops: { "oxo.com": { name: "OXO" } },
  giftReviewDomains: ["seriouseats.com"],
}));
vi.mock("../src/server/import-cache", () => ({
  productCacheUrl: (url: string) => url,
}));
vi.mock("../src/server/imports", () => ({
  safeFetch: mocks.fetchImage,
  saveImage: mocks.image,
}));
import { processDiscovery } from "../src/server/gift-discovery-worker";
import {
  createDiscovery,
  discoveryAllowance,
  discoveryMonthlyUsage,
  addDiscoveryUsage,
  quotaKeys,
  prepareDiscoveryReview,
} from "../src/server/gift-discovery";
import {
  discoveryFixture,
  discoveryConfig as cfg,
  candidate,
  selection,
} from "./gift-discovery-fixture";
let f: ReturnType<typeof discoveryFixture>,
  id: string,
  product: ReturnType<typeof candidate>;
const response = (products: unknown[] = [proposal()]) =>
  new Response(
    JSON.stringify({
      status: "completed",
      usage: { input_tokens: 1000, output_tokens: 300 },
      output: [
        {
          type: "web_search_call",
          action: { sources: [{ url: product.offers[0].url }] },
        },
        {
          type: "message",
          content: [
            { type: "output_text", text: JSON.stringify({ products }) },
          ],
        },
      ],
    }),
  );
function proposal() {
  return {
    title: product.title,
    reason: product.reason,
    categoryIds: product.categoryIds,
    offers: product.offers.map((o) => o.url),
    review: null,
  };
}
beforeEach(() => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("GIFT_DISCOVERY_USER_OVERRIDES", "");
  vi.clearAllMocks();
  mocks.mode = "both";
  mocks.configReads = 0;
  mocks.disableBeforeDispatch = false;
  mocks.clearOverridesBeforeDispatch = false;
  mocks.photos = false;
  f = discoveryFixture();
  mocks.state = f.state;
  product = candidate();
  id = createDiscovery(mocks.state, f.actors[1], cfg, f.input).id;
  mocks.check.mockImplementation(async () => ({
    title: product.title,
    description: product.description,
    imageUrl: "https://www.oxo.com/image.jpg",
    brand: "OXO",
    offer: product.offers[0],
    evidence: product.evidence,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response()),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("honors account-ID exceptions in the worker, including failures and duplicate delivery", async () => {
  vi.stubEnv(
    "GIFT_DISCOVERY_USER_OVERRIDES",
    JSON.stringify({
      [f.actors[1].id]: { weeklyLimit: "unlimited", bypassMonthlyLimit: true },
    }),
  );
  addDiscoveryUsage(mocks.state, quotaKeys(f.actors[1].id).month, 100);
  vi.mocked(fetch).mockRejectedValue(new Error("ambiguous network failure"));
  await processDiscovery(id);
  await processDiscovery(id);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mocks.state.giftDiscoveryJobs[0]).toMatchObject({
    status: "failed",
    monthlyQuotaExempt: true,
  });
  expect(discoveryMonthlyUsage(mocks.state)).toEqual({
    searches: 101,
    exemptSearches: 1,
    quotaSearches: 100,
  });
});
it("refunds the reserved exemption after policy changes before dispatch", async () => {
  vi.stubEnv(
    "GIFT_DISCOVERY_USER_OVERRIDES",
    JSON.stringify({
      [f.actors[1].id]: { weeklyLimit: "unlimited", bypassMonthlyLimit: true },
    }),
  );
  mocks.disableBeforeDispatch = true;
  mocks.clearOverridesBeforeDispatch = true;
  await processDiscovery(id);
  expect(fetch).not.toHaveBeenCalled();
  expect(discoveryMonthlyUsage(mocks.state)).toEqual({
    searches: 0,
    exemptSearches: 0,
    quotaSearches: 0,
  });
  expect(
    discoveryAllowance(mocks.state, f.actors[1], cfg).weeklyRemaining,
  ).toBe(3);
});
it("dispatches one bounded request without identity, records usage, and never replays a finished job", async () => {
  await processDiscovery(id);
  await processDiscovery(id);
  expect(fetch).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(payload).toMatchObject({
    max_output_tokens: 4000,
    max_tool_calls: 2,
    store: false,
    reasoning: { effort: "low" },
    tool_choice: "required",
  });
  expect(JSON.parse(payload.input)).toEqual({
    categoryIds: ["coffee"],
    interests: "Pour-over",
    likes: "Ceramics",
    avoid: "Already has a grinder",
    maxPriceCents: 5000,
    currency: "USD",
  });
  expect(payload.input).not.toContain(f.people[0].id);
  expect(mocks.state.giftDiscoveryJobs[0].status).toBe("complete");
  expect(mocks.state.giftDiscoveryJobs[0].candidates).toHaveLength(1);
  expect(
    discoveryAllowance(mocks.state, f.actors[1], cfg).weeklyRemaining,
  ).toBe(2);
  expect(
    mocks.state.usage.find((u) => u.key.endsWith(":reported"))?.count,
  ).toBe(1);
  expect(mocks.fetchImage).not.toHaveBeenCalled();
});
it("does not automatically retry provider failures or malformed output", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("ambiguous network failure"));
  await processDiscovery(id);
  await processDiscovery(id);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mocks.state.giftDiscoveryJobs[0].status).toBe("failed");
  expect(
    discoveryAllowance(mocks.state, f.actors[1], cfg).weeklyRemaining,
  ).toBe(2);
});
it("refunds a known pre-dispatch rejection", async () => {
  mocks.disableBeforeDispatch = true;
  await processDiscovery(id);
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.state.giftDiscoveryJobs[0].status).toBe("cancelled");
  expect(
    discoveryAllowance(mocks.state, f.actors[1], cfg).weeklyRemaining,
  ).toBe(3);
});
it("discards an in-flight result after global disable and makes no product calls", async () => {
  vi.mocked(fetch).mockImplementation(async () => {
    mocks.mode = "off";
    return response();
  });
  await processDiscovery(id);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mocks.check).not.toHaveBeenCalled();
  expect(mocks.state.giftDiscoveryJobs[0]).toMatchObject({
    status: "cancelled",
    candidates: [],
  });
  expect(
    discoveryAllowance(mocks.state, f.actors[1], cfg).weeklyRemaining,
  ).toBe(2);
});
it("rejects source-less, over-budget and weak-evidence suggestions", async () => {
  vi.mocked(fetch).mockResolvedValue(
    response([
      { ...proposal(), offers: ["https://www.oxo.com/invented"] },
      proposal(),
    ]),
  );
  mocks.check.mockResolvedValue({
    title: product.title,
    description: "",
    imageUrl: "",
    offer: { ...product.offers[0], priceCents: 5100 },
    evidence: [],
  });
  await processDiscovery(id);
  expect(mocks.check).toHaveBeenCalledTimes(1);
  expect(mocks.state.giftDiscoveryJobs[0].candidates).toEqual([]);
});
it("refreshes a changed price for confirmation without AI, then rejects a lost rating", async () => {
  const job = mocks.state.giftDiscoveryJobs[0];
  job.status = "complete";
  job.candidates = [product];
  product.offers[0].checkedAt = new Date(Date.now() - 16 * 60000).toISOString();
  prepareDiscoveryReview(mocks.state, f.actors[1], cfg, id, [
    selection(product),
  ]);
  mocks.check.mockResolvedValue({
    title: product.title,
    description: "",
    imageUrl: "",
    offer: {
      ...product.offers[0],
      priceCents: 3500,
      checkedAt: new Date().toISOString(),
    },
    evidence: product.evidence,
  });
  await processDiscovery(id);
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.state.giftDiscoveryJobs[0].review).toBeDefined();
  expect(
    mocks.state.giftDiscoveryJobs[0].candidates[0].offers[0].priceCents,
  ).toBe(3500);
  mocks.state.giftDiscoveryJobs[0].candidates[0].offers[0].checkedAt =
    product.offers[0].checkedAt;
  prepareDiscoveryReview(mocks.state, f.actors[1], cfg, id, [
    selection(product),
  ]);
  mocks.check.mockResolvedValue({
    offer: { ...product.offers[0], checkedAt: new Date().toISOString() },
    evidence: [],
  });
  await processDiscovery(id);
  expect(mocks.state.giftDiscoveryJobs[0].review).toBeUndefined();
  expect(mocks.state.giftDiscoveryJobs[0].candidates[0].offers).toEqual([]);
});

it("keeps missing provider usage unreported instead of recording zero tokens as reported", async () => {
  const original = await response().json();
  delete original.usage;
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(original)));
  await processDiscovery(id);
  expect(
    mocks.state.usage.find((u) => u.key.endsWith(":reported"))?.count ?? 0,
  ).toBe(0);
  expect(discoveryMonthlyUsage(mocks.state).searches).toBe(1);
});
