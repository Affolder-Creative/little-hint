import { afterEach, expect, it, vi } from "vitest";
import { command, world } from "../src/server/domain";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { serviceStatuses } from "../src/server/service-status";
import { adminUsage } from "../src/server/usage";
afterEach(() => vi.unstubAllEnvs());
it("manual mode rejects creation/retries while preserving editable drafts", () => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("SCRAPING_PROVIDER", "none");
  const { state, actors } = stagingFixtures();
  const actor = actors[0];
  const list = world(state, actor).lists.find((l) => l.canEdit)!;
  expect(() =>
    command(state, actor, "imports.create", {
      url: "https://example.com/product",
      draft: { listId: list.id, fields: {}, touched: [] },
    }),
  ).toThrow("Automatic shop lookups are off");
  const id = "00000000-0000-4000-8000-000000000001";
  state.imports.push({
    id,
    revision: 1,
    createdAt: new Date().toISOString(),
    userId: actor.id,
    url: "https://example.com/product",
    status: "failed",
    draft: {
      listId: list.id,
      state: "active",
      revision: 1,
      fields: {},
      touched: [],
    },
  });
  expect(() => command(state, actor, "imports.retry", { id })).toThrow(
    "Automatic shop lookups are off",
  );
  command(state, actor, "imports.update", {
    id,
    revision: 1,
    fields: { title: "Manual title" },
    touched: ["title"],
  });
  expect(state.imports[0].draft?.fields.title).toBe("Manual title");
});
it("manual mode reports AI off even with credentials and keeps recorded charges", () => {
  const { state } = stagingFixtures();
  const cfg = {
    SCRAPING_PROVIDER: "none",
    OPENAI_API_KEY: "synthetic",
    PAID_DAILY_LIMIT: "50",
    GIFT_DISCOVERY_MODE: "off",
  };
  expect(
    serviceStatuses(cfg, false)
      .filter((s) => ["shops", "product-ai"].includes(s.id))
      .every((s) => s.status === "Off"),
  ).toBe(true);
  const now = new Date("2026-10-31T12:00:00Z");
  state.usage.push({
    id: "usage",
    revision: 1,
    createdAt: now.toISOString(),
    key: "2026-10-31:openai",
    count: 2,
  });
  expect(adminUsage(state, cfg, now).productDetails).toMatchObject({
    enabled: false,
    requests: 2,
  });
});
