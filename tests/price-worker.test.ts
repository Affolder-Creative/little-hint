import { command } from "../src/server/domain";
import { processPrice } from "../src/server/price-worker";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { State } from "../src/shared/model";
const mock = vi.hoisted(() => ({
  state: null as State | null,
  lookup: vi.fn(),
}));
vi.mock("../src/server/db", () => ({
  readState: async () => mock.state,
  transact: async (fn: any) => {
    const next = structuredClone(mock.state);
    const result = await fn(next);
    mock.state = next;
    return result;
  },
  pool: { query: vi.fn() },
}));
vi.mock("../src/server/price-products", () => ({ lookupPrice: mock.lookup }));
import { wishlistFixture } from "./wishlist-fixture";
import { schedulePrices, priceCommand } from "../src/server/prices";
import { spend } from "../src/server/settings";
beforeEach(() => {
  vi.stubEnv("PRICE_CHECK_ENABLED", "true");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("TZ", "UTC");
  vi.stubEnv("SCRAPING_PROVIDER", "auto");
  vi.stubEnv("PAID_DAILY_LIMIT", "50");
  mock.lookup.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  const f = wishlistFixture(),
    i = f.add();
  i.url = "https://shop.example/p";
  i.priceCents = 10000;
  i.pricing!.baseline = 10000;
  i.pricing!.checkedAt = new Date().toISOString();
  priceCommand(f.s, f.reader, "prices.watch", { id: i.id, enabled: true });
  schedulePrices(f.s, new Date("2026-11-03T12:00:00Z"));
  mock.state = f.s;
  return { f, i, id: f.s.priceChecks[0].id };
}
it("publishes once, preserves original, records history and alerts once", async () => {
  const { id, i } = fixture();
  mock.lookup.mockResolvedValue({
    priceCents: 9000,
    identity: "same",
    source: "direct",
  });
  await processPrice(id);
  await processPrice(id);
  expect(mock.lookup).toHaveBeenCalledTimes(1);
  const saved = mock.state!.items.find((x) => x.id === i.id)!;
  expect(saved.priceCents).toBe(9000);
  expect(saved.pricing!.baseline).toBe(10000);
  expect(mock.state!.priceChanges).toHaveLength(1);
  expect(
    mock.state!.notices.filter((n) => n.event === "price-drop"),
  ).toHaveLength(1);
});
it("does not overwrite an intervening edit", async () => {
  const { id, i } = fixture();
  mock.lookup.mockImplementation(async () => {
    mock.state!.items.find((x) => x.id === i.id)!.revision++;
    return { priceCents: 8000, identity: "same", source: "direct" };
  });
  await processPrice(id);
  expect(mock.state!.items[0].priceCents).toBe(10000);
  expect(mock.state!.priceChanges).toHaveLength(0);
});
it("retains price and check timestamp after failure", async () => {
  const { id, i } = fixture();
  const before = i.pricing!.checkedAt;
  mock.lookup.mockRejectedValue(new Error("blocked"));
  await processPrice(id);
  expect(mock.state!.items[0].priceCents).toBe(10000);
  expect(mock.state!.items[0].pricing!.checkedAt).toBe(before);
  expect(
    mock.state!.notices.filter((n) => n.event === "price-drop"),
  ).toHaveLength(0);
});
it("marks exhausted allowance deferred without clearing the price", async () => {
  const { id } = fixture();
  mock.lookup.mockRejectedValue(new Error("allowance exhausted"));
  await processPrice(id);
  expect(mock.state!.items[0].pricing!.status).toBe("deferred");
});
it("reserves price and provider limits together", async () => {
  fixture();
  vi.stubEnv("PRICE_CHECK_PAID_DAILY_LIMIT", "1");
  await spend("brightdata", true);
  await expect(spend("brightdata", true)).rejects.toThrow(/allowance/);
  expect(
    mock.state!.usage.find((u) => u.key.endsWith(":brightdata"))!.count,
  ).toBe(1);
});
it("respects provider-wide limits before price allowances", async () => {
  fixture();
  vi.stubEnv("PAID_DAILY_LIMIT", "0");
  await expect(spend("brightdata", true)).rejects.toThrow(/daily limit/);
  expect(mock.state!.usage.some((u) => u.key.startsWith("price-paid:"))).toBe(
    false,
  );
});

it("does not call a provider for a queued item whose price was removed", async () => {
  const { id, i } = fixture();
  mock.state!.items.find((item) => item.id === i.id)!.priceCents = null;
  await processPrice(id);
  expect(mock.lookup).not.toHaveBeenCalled();
  expect(mock.state!.items[0].priceCents).toBeNull();
  expect(mock.state!.priceChanges).toHaveLength(0);
});
it("discards an in-flight result when the price is removed", async () => {
  const { id, i } = fixture();
  mock.lookup.mockImplementation(async () => {
    mock.state!.items.find((item) => item.id === i.id)!.priceCents = null;
    return { priceCents: 8000, identity: "same", source: "direct" };
  });
  await processPrice(id);
  expect(mock.state!.items[0].priceCents).toBeNull();
  expect(mock.state!.priceChanges).toHaveLength(0);
  expect(
    mock.state!.notices.filter((notice) => notice.event === "price-drop"),
  ).toHaveLength(0);
});

function multipleOffers() {
  const { f, i } = fixture();
  i.shoppingOffers = [
    {
      id: "primary",
      url: i.url,
      label: "Primary",
      priceCents: 10000,
      pricing: { ...i.pricing!, status: "verified" },
    },
    {
      id: "other",
      url: "https://other.example/p",
      label: "Other",
      priceCents: null,
      pricing: {
        baseline: null,
        baselineLabel: "when added",
        generation: "other",
      },
    },
  ];
  i.primaryOfferId = "primary";
  f.s.priceChecks = [];
  f.s.usage = [];
  schedulePrices(f.s, new Date("2026-11-03T12:00:00Z"));
  mock.state = f.s;
  return { f, i, jobs: f.s.priceChecks };
}
it("checks unknown alternative prices and alerts once after all shops settle", async () => {
  const { i, jobs } = multipleOffers();
  expect(jobs).toHaveLength(2);
  mock.lookup.mockImplementation(async (url) => ({
    priceCents: url.includes("other") ? 7000 : 9000,
    identity: url,
    source: "direct",
  }));
  await processPrice(jobs[0].id);
  expect(
    mock.state!.notices.filter((n) => n.event === "price-drop"),
  ).toHaveLength(0);
  expect(mock.state!.items[0].priceCents).toBe(10000);
  await processPrice(jobs[1].id);
  expect(mock.state!.items[0].priceCents).toBe(7000);
  expect(mock.state!.priceChanges.map((c) => c.offerId).sort()).toEqual([
    "other",
    "primary",
  ]);
  expect(
    mock.state!.notices.filter((n) => n.event === "price-drop"),
  ).toHaveLength(1);
  expect(mock.state!.items[0].id).toBe(i.id);
});
it("settles a product when one shop fails and excludes its previous price", async () => {
  const { jobs } = multipleOffers();
  mock.state!.items[0].shoppingOffers![0].priceCents = 6000;
  mock.lookup.mockImplementation(async (url) => {
    if (!url.includes("other")) throw new Error("Out of stock");
    return { priceCents: 8000, identity: url, source: "direct" };
  });
  await processPrice(jobs[1].id);
  await processPrice(jobs[0].id);
  expect(mock.state!.items[0].priceCents).toBe(8000);
  expect(mock.state!.items[0].shoppingOffers![0].priceCents).toBe(6000);
  expect(mock.state!.items[0].shoppingOffers![0].pricing!.status).toBe(
    "unavailable",
  );
});
it("does not accept a removed or replaced offer during a check", async () => {
  const { jobs } = multipleOffers();
  mock.lookup.mockImplementation(async () => {
    mock.state!.items[0].shoppingOffers![1].pricing!.generation = "replaced";
    return { priceCents: 1000, identity: "different", source: "direct" };
  });
  await processPrice(jobs[1].id);
  expect(mock.state!.items[0].shoppingOffers![1].priceCents).toBeNull();
  expect(mock.state!.priceChanges).toHaveLength(0);
});

it("invalidates stale editors after a partial result while concurrent sibling checks finish", async () => {
  const { f, i, jobs } = multipleOffers();
  const editorSnapshot = structuredClone(i);
  let release!: () => void;
  let started!: () => void;
  const pendingLookup = new Promise<void>((resolve) => {
    release = resolve;
  });
  const startedLookup = new Promise<void>((resolve) => {
    started = resolve;
  });
  mock.lookup.mockImplementation(async (url) => {
    if (url.includes("other")) {
      started();
      await pendingLookup;
    }
    return {
      priceCents: url.includes("other") ? 7000 : 9000,
      identity: url,
      source: "direct",
    };
  });
  const pending = processPrice(jobs[1].id);
  await startedLookup;
  await processPrice(jobs[0].id);
  expect(mock.state!.items[0].revision).toBeGreaterThan(
    editorSnapshot.revision,
  );
  expect(() =>
    command(mock.state!, f.john, "items.update", {
      ...editorSnapshot,
      title: "Renamed",
    }),
  ).toThrow();
  release();
  await pending;
  expect(mock.state!.items[0].priceCents).toBe(7000);
  expect(
    mock.state!.priceChecks.every((job) => job.status === "complete"),
  ).toBe(true);
  expect(
    mock.state!.notices.filter((n) => n.event === "price-drop"),
  ).toHaveLength(1);
});
