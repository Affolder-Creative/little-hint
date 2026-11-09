import type { State, PriceCheck } from "../shared/model";
export function priceReport(s: State, now = Date.now()) {
  const last = s.usage
    .filter((u) => u.key.startsWith("price-run:"))
    .sort((a, b) => b.count - a.count)[0];
  const day = last?.key.slice("price-run:".length);
  const summarize = (jobs: PriceCheck[]) => ({
    total: jobs.length,
    successful: jobs.filter((j) => j.status === "complete").length,
    waiting: jobs.filter(
      (j) => j.status === "pending" || j.status === "running",
    ).length,
    failed: jobs.filter(
      (j) =>
        j.status === "failed" && (!j.outcome || j.outcome === "provider-error"),
    ).length,
    unverifiable: jobs.filter(
      (j) => j.status === "failed" && j.outcome === "unverifiable",
    ).length,
    deferred: jobs.filter(
      (j) => j.status === "failed" && j.outcome === "deferred",
    ).length,
    skipped: jobs.filter(
      (j) => j.status === "failed" && j.outcome === "skipped",
    ).length,
  });
  const recent = s.priceChecks.filter(
    (j) => Date.parse(j.createdAt) > now - 7 * 86400000,
  );
  return {
    latest: day
      ? { day, ...summarize(s.priceChecks.filter((j) => j.day === day)) }
      : null,
    history: summarize(recent),
    failures: recent
      .filter((j) => j.status === "failed")
      .map((j) => ({
        id: j.id,
        createdAt: j.createdAt,
        status: j.status,
        error:
          j.outcome === "skipped"
            ? "Check skipped after an item change."
            : j.outcome === "deferred"
              ? "Check deferred by the provider allowance."
              : j.outcome === "unverifiable"
                ? "Price not verifiable; saved price retained."
                : "Price lookup failed; saved price retained.",
        diagnostics: j.diagnostics?.length
          ? j.diagnostics
          : [
              {
                stage: "legacy",
                reason: "Reason unavailable for this older check.",
              },
            ],
      })),
  };
}
