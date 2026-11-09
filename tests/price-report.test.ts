import { expect, it } from "vitest";
import { emptyState, type PriceCheck } from "../src/shared/model";
import { priceReport } from "../src/server/price-report";
import { priceFailure } from "../src/server/price-diagnostics";
it("separates the latest run, historical failures and expected outcomes without private data", () => {
  const s = emptyState(),
    now = Date.parse("2026-11-09T12:00:00Z");
  s.usage.push({
    id: "run",
    revision: 1,
    createdAt: new Date(now).toISOString(),
    key: "price-run:2026-11-09",
    count: now,
  });
  for (const [n, day, status, outcome] of [
    [0, "2026-11-08", "failed", undefined],
    [1, "2026-11-09", "complete", undefined],
    [2, "2026-11-09", "failed", "deferred"],
    [3, "2026-11-09", "failed", "unverifiable"],
    [4, "2026-11-09", "failed", "skipped"],
  ] as const)
    s.priceChecks.push({
      id: String(n),
      revision: 1,
      createdAt: day + "T10:00:00Z",
      day,
      status,
      outcome,
      url: "https://secret.example/private",
      targets: [],
    } as PriceCheck);
  const r = priceReport(s, now);
  expect(r.latest).toMatchObject({
    total: 4,
    successful: 1,
    failed: 0,
    deferred: 1,
    unverifiable: 1,
    skipped: 1,
  });
  expect(r.history.failed).toBe(1);
  expect(JSON.stringify(r)).not.toContain("secret.example");
  expect(r.failures[0].diagnostics[0].reason).toContain("Reason unavailable");
});
it("does not expose arbitrary provider errors", () => {
  expect(
    JSON.stringify(
      priceFailure(new Error("secret https://private.test"), "direct"),
    ),
  ).not.toContain("private.test");
  expect(
    priceFailure(new Error("Check no longer eligible"), "guard").outcome,
  ).toBe("skipped");
  expect(
    priceFailure(new Error("Price cannot be verified"), "parser").outcome,
  ).toBe("unverifiable");
});
