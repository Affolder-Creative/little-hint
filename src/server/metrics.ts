import { randomUUID } from "node:crypto";
import type { State } from "../shared/model";
export const latencyBoundsMs = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000];
export function histogram() {
  let count = 0,
    sumMs = 0,
    maxMs = 0;
  const buckets = latencyBoundsMs.map(() => 0);
  return {
    observe(ms: number) {
      if (!Number.isFinite(ms) || ms < 0) return;
      count++;
      sumMs += ms;
      maxMs = Math.max(maxMs, ms);
      latencyBoundsMs.forEach((bound, i) => {
        if (ms <= bound) buckets[i]++;
      });
    },
    snapshot: () => ({
      count,
      sumMs,
      maxMs,
      buckets: latencyBoundsMs.map((leMs, i) => ({ leMs, count: buckets[i] })),
    }),
  };
}
export const databaseMetrics = {
  startedAt: Date.now(),
  transactions: histogram(),
  lockWait: histogram(),
};
export function requestMetrics() {
  const startedAt = new Date().toISOString();
  const routes = new Map<
    string,
    { latency: ReturnType<typeof histogram>; errors: number }
  >();
  return {
    observe(
      method: string,
      route: string | undefined,
      status: number,
      ms: number,
    ) {
      // Only registered templates, never request URLs, IDs, query strings, or account labels.
      let key = `${method} ${route ?? "unmatched"}`;
      if (!routes.has(key) && routes.size >= 200) key = "other";
      let entry = routes.get(key);
      if (!entry) {
        entry = { latency: histogram(), errors: 0 };
        routes.set(key, entry);
      }
      entry.latency.observe(ms);
      if (status >= 500) entry.errors++;
    },
    snapshot: () => ({
      startedAt,
      routes: [...routes].map(([route, value]) => ({
        route,
        errors: value.errors,
        ...value.latency.snapshot(),
      })),
    }),
  };
}
export function queueMetrics(s: State, now = Date.now()) {
  const summarize = (rows: { createdAt: string }[]) => ({
    pending: rows.length,
    oldestAgeSeconds: rows.length
      ? rows.reduce(
          (age, r) =>
            Math.max(
              age,
              Number.isFinite(Date.parse(r.createdAt))
                ? (now - Date.parse(r.createdAt)) / 1000
                : 0,
            ),
          0,
        )
      : 0,
  });
  return {
    imports: summarize(
      s.imports.filter(
        (j) =>
          (!j.draft || j.draft.state === "active") &&
          ["pending", "running"].includes(j.status),
      ),
    ),
    discovery: summarize(
      s.giftDiscoveryJobs.filter((j) =>
        ["pending", "running", "reviewing"].includes(j.status),
      ),
    ),
    notifications: summarize(
      s.notices.filter((n) => !n.batchId && n.status === "pending"),
    ),
    wishlistBatches: summarize(
      s.notificationBatches.filter((n) => n.status === "pending"),
    ),
  };
}
// Reuse bounded numeric usage records to expose worker timings without a new record format.
export function recordWorkerMetrics(s: State, now = Date.now()) {
  const values: Record<string, number> = {
    startedAt: databaseMetrics.startedAt,
    sampledAt: now,
  };
  for (const name of ["transactions", "lockWait"] as const) {
    const sample = databaseMetrics[name].snapshot();
    for (const field of ["count", "sumMs", "maxMs"] as const)
      values[`${name}.${field}`] = sample[field];
    sample.buckets.forEach((b) => {
      values[`${name}.le${b.leMs}`] = b.count;
    });
  }
  for (const [name, count] of Object.entries(values)) {
    const key = `worker-metrics.${name}`;
    const row = s.usage.find((r) => r.key === key);
    if (row) {
      row.count = count;
      row.revision++;
    } else
      s.usage.push({
        id: randomUUID(),
        revision: 1,
        createdAt: new Date(now).toISOString(),
        key,
        count,
      });
  }
}
export function workerMetrics(s: State) {
  return Object.fromEntries(
    s.usage
      .filter((r) => r.key.startsWith("worker-metrics."))
      .map((r) => [r.key.slice(15), r.count]),
  );
}
