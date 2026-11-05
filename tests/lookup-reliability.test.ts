import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyState } from "../src/shared/model";
const mocks = vi.hoisted(() => ({
  state: {} as ReturnType<typeof emptyState>,
}));
vi.mock("../src/server/db", () => ({
  transact: async (fn: any) => fn(mocks.state),
}));
vi.mock("../src/server/brightdata", () => ({
  ImportPending: class extends Error {},
  BrightDataFailure: class extends Error {
    constructor(
      public stage: string,
      message: string,
      public status?: number,
      public diagnostic?: any,
    ) {
      super(message);
    }
  },
}));
import { BrightDataFailure, ImportPending } from "../src/server/brightdata";
import { retryableUnlock } from "../src/server/import-retry";
import {
  recordLookupDiagnostic,
  unlockerDiagnostic,
  recoveryApiFailure,
  recoveryDiagnostic,
} from "../src/server/lookup-diagnostics";
import { importView } from "../src/shared/imports";
const cfg = {
  SCRAPING_PROVIDER: "brightdata",
  BRIGHTDATA_API_KEY: "secret",
  BRIGHTDATA_UNLOCKER_ZONE: "shops",
};
const transient = () => {
  const d = unlockerDiagnostic(
    502,
    { error_code: "target_40020" },
    new Headers(),
  );
  return new BrightDataFailure(d.stage, d.reason, d.status, d);
};
beforeEach(() => {
  vi.useFakeTimers();
  mocks.state = emptyState();
  mocks.state.imports.push({
    id: "job",
    userId: "owner",
    url: "https://etsy.com/listing/123",
    status: "running",
    createdAt: new Date().toISOString(),
    revision: 1,
  });
});
afterEach(() => vi.useRealTimers());
it("classifies safe codes from envelopes and both header formats without exposing text", () => {
  for (const [body, headers] of [
    [
      {
        error_code: "target_40020",
        error_message: "secret https://private.test",
      },
      new Headers(),
    ],
    [{ headers: { "X-Brd-Err-Code": "target_40020" } }, new Headers()],
    [
      {},
      new Headers({ "proxy-status": 'brd; details="target_40020: secret"' }),
    ],
  ] as const)
    expect(unlockerDiagnostic(502, body, headers)).toEqual({
      stage: "brightdata-unlocker",
      status: 502,
      code: "target_40020",
      reason: "Destination connection timed out",
      retryable: true,
    });
});
it.each(["client_10100", "policy_20070", "unknown_secret", undefined])(
  "does not retry unclassified or restricted 502: %s",
  (code) => {
    expect(
      unlockerDiagnostic(502, { error_code: code }, new Headers()).retryable,
    ).toBe(false);
  },
);
it("resumes a persisted retry after 20 seconds and dispatches at most twice", async () => {
  const run = vi
    .fn()
    .mockRejectedValueOnce(transient())
    .mockResolvedValue("html");
  await expect(retryableUnlock("job", cfg, run)).rejects.toBeInstanceOf(
    ImportPending,
  );
  mocks.state = structuredClone(mocks.state); // Simulate reloading persisted state after restart.
  await expect(retryableUnlock("job", cfg, run)).rejects.toBeInstanceOf(
    ImportPending,
  );
  expect(run).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(20000);
  expect(await retryableUnlock("job", cfg, run)).toBe("html");
  await expect(retryableUnlock("job", cfg, run)).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(2);
});
it("stops after a second transient failure", async () => {
  const run = vi.fn().mockRejectedValue(transient());
  await expect(retryableUnlock("job", cfg, run)).rejects.toBeInstanceOf(
    ImportPending,
  );
  vi.advanceTimersByTime(20000);
  await expect(retryableUnlock("job", cfg, run)).rejects.toBeInstanceOf(
    BrightDataFailure,
  );
  await expect(retryableUnlock("job", cfg, run)).rejects.toBeInstanceOf(
    BrightDataFailure,
  );
  expect(run).toHaveBeenCalledTimes(2);
});
it.each(["published", "discarded"] as const)(
  "does not dispatch after draft is %s",
  async (state) => {
    const run = vi.fn().mockRejectedValue(transient());
    await expect(retryableUnlock("job", cfg, run)).rejects.toBeInstanceOf(
      ImportPending,
    );
    mocks.state.imports[0].draft = {
      state,
      fields: {},
      touched: [],
      revision: 1,
    };
    vi.advanceTimersByTime(20000);
    await expect(retryableUnlock("job", cfg, run)).rejects.toThrow(
      "no longer active",
    );
    expect(run).toHaveBeenCalledTimes(1);
  },
);
it("stops retries when configuration changes or allowance is exhausted", async () => {
  const run = vi
    .fn()
    .mockRejectedValueOnce(transient())
    .mockRejectedValue(new Error("Daily limit reached"));
  await expect(retryableUnlock("job", cfg, run)).rejects.toBeInstanceOf(
    ImportPending,
  );
  vi.advanceTimersByTime(20000);
  await expect(
    retryableUnlock("job", { ...cfg, BRIGHTDATA_UNLOCKER_ZONE: "other" }, run),
  ).rejects.toThrow("configuration changed");
  expect(run).toHaveBeenCalledTimes(1);
  await expect(retryableUnlock("job", cfg, run)).rejects.toThrow(
    "allowance exhausted",
  );
  await expect(retryableUnlock("job", cfg, run)).rejects.toThrow(
    "allowance exhausted",
  );
  expect(run).toHaveBeenCalledTimes(2);
});
it("does not duplicate an in-flight request on redelivery", async () => {
  let resolve!: (value: string) => void;
  const run = vi.fn(
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
  );
  const first = retryableUnlock("job", cfg, run);
  await Promise.resolve();
  await expect(retryableUnlock("job", cfg, run)).rejects.toThrow("uncertain");
  resolve("html");
  expect(await first).toBe("html");
  expect(run).toHaveBeenCalledTimes(1);
});
it("does not retry uncertain requests or optional photo improvement failures", async () => {
  const run = vi.fn().mockRejectedValue(new TypeError("network secret"));
  await expect(retryableUnlock("job", cfg, run)).rejects.toThrow("uncertain");
  await expect(retryableUnlock("job", cfg, run)).rejects.toThrow("uncertain");
  expect(run).toHaveBeenCalledTimes(1);
  delete mocks.state.imports[0].unlockerRetry;
  run.mockRejectedValue(transient());
  await expect(retryableUnlock("job", cfg, run, false)).rejects.toBeInstanceOf(
    BrightDataFailure,
  );
  expect(mocks.state.imports[0]).toMatchObject({
    unlockerRetry: { status: "finished" },
  });
});
it("bounds diagnostics and hides execution details from shoppers", () => {
  const job = mocks.state.imports[0];
  job.diagnostic = { stage: "brightdata", reason: "Legacy provider failure" };
  recordLookupDiagnostic(job, { stage: "ai-web", reason: "Recovery skipped" });
  expect(job.diagnostics).toEqual([
    { stage: "brightdata", reason: "Legacy provider failure" },
    { stage: "ai-web", reason: "Recovery skipped" },
  ]);
  for (let i = 0; i < 12; i++)
    recordLookupDiagnostic(job, {
      stage: "ai-web",
      reason: "AI request rejected",
    });
  expect(job.diagnostics).toHaveLength(8);
  job.unlockerRetry = {
    attempts: 1,
    status: "dispatched",
    configuration: "secret",
  };
  expect(importView(job)).not.toHaveProperty("diagnostics");
  expect(importView(job)).not.toHaveProperty("diagnostic");
  expect(importView(job)).not.toHaveProperty("unlockerRetry");
});
it.each([
  [401, "invalid_api_key", "AI credentials rejected"],
  [429, "insufficient_quota", "AI quota exhausted"],
  [429, "rate_limit_exceeded", "AI rate or quota limit"],
  [400, "unsupported_parameter", "AI request rejected"],
  [503, "secret", "AI service unavailable"],
])("reports AI HTTP %s safely", async (status, code, reason) => {
  const error = await recoveryApiFailure(
    Response.json(
      { error: { code, message: "secret https://private.test" } },
      { status: Number(status) },
    ),
  );
  const d = recoveryDiagnostic(error, "ai-web", 10);
  expect(d).toMatchObject({
    status: Number(status),
    reason,
    stage: "ai-web",
    elapsedMs: 10,
  });
  expect(JSON.stringify(d)).not.toContain("secret");
});
it.each([
  "Incomplete recovery",
  "Unverified identity",
  "Unsupported extraction",
  "Missing source",
  "Product name mismatch",
])("retains a distinct evidence failure for %s", (message) => {
  expect(recoveryDiagnostic(new Error(message), "ai-web", 1).reason).not.toBe(
    "AI recovery failed unexpectedly",
  );
});
