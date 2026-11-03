import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, symlink, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  histogram,
  requestMetrics,
  queueMetrics,
  recordWorkerMetrics,
  workerMetrics,
} from "../src/server/metrics";
import { uploadStorage, cachedProbe } from "../src/server/storage-metrics";
import { emptyState } from "../src/shared/model";
import { stamp } from "../src/server/domain";
let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
it("aggregates bounded timings with correct cumulative buckets and no raw requests", () => {
  const h = histogram();
  for (const ms of [0, 5, 12, 6000, NaN, -1]) h.observe(ms);
  expect(h.snapshot()).toMatchObject({ count: 4, sumMs: 6017, maxMs: 6000 });
  expect(h.snapshot().buckets.find((b) => b.leMs === 10)?.count).toBe(2);
  const first = h.snapshot();
  h.observe(2);
  expect(first.count).toBe(4);
  const m = requestMetrics();
  for (let i = 0; i < 1000; i++)
    m.observe("GET", "/api/v1/imports/:id", i % 2 ? 200 : 500, 10);
  expect(m.snapshot().routes).toHaveLength(1);
  expect(m.snapshot().routes[0]).toMatchObject({ count: 1000, errors: 500 });
  for (let i = 0; i < 1000; i++) m.observe("GET", `/registered-${i}`, 200, 1);
  expect(m.snapshot().routes.length).toBeLessThanOrEqual(201);
});
it("measures queue age, ignores completed/discarded imports, and updates fixed worker records", () => {
  const s = emptyState(),
    now = Date.parse("2026-11-03T12:00:00Z");
  s.imports.push({
    ...stamp(),
    createdAt: new Date(now - 60000).toISOString(),
    userId: "private-user",
    url: "https://private.test",
    status: "pending",
  });
  s.imports.push({ ...s.imports[0], ...stamp(), status: "complete" });
  expect(queueMetrics(s, now).imports).toEqual({
    pending: 1,
    oldestAgeSeconds: 60,
  });
  expect(JSON.stringify(queueMetrics(s, now))).not.toMatch(/private/);
  recordWorkerMetrics(s, now);
  const count = s.usage.length;
  recordWorkerMetrics(s, now + 60000);
  expect(s.usage.length).toBe(count);
  expect(workerMetrics(s).sampledAt).toBe(now + 60000);
});
it("counts upload originals and thumbnails without following symlinks or traversing other directories", async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "hint-metrics-"));
  await writeFile(path.join(directory, "image.webp"), "12345");
  await writeFile(path.join(directory, "image.card.webp"), "12");
  await mkdir(path.join(directory, "nested"));
  await writeFile(path.join(directory, "nested", "ignored"), "123456");
  await symlink(
    path.join(directory, "image.webp"),
    path.join(directory, "link"),
  );
  expect(await uploadStorage(directory)).toEqual({ files: 2, bytes: 7 });
  expect(await uploadStorage(path.join(directory, "missing"))).toEqual({
    files: 0,
    bytes: 0,
  });
});
it("deduplicates concurrent storage probes, caches for a minute, and retries failed probes", async () => {
  let now = 0,
    calls = 0,
    resolve!: (v: number) => void;
  const read = cachedProbe(
    () => {
      calls++;
      return new Promise<number>((r) => {
        resolve = r;
      });
    },
    60000,
    () => now,
  );
  const a = read(),
    b = read();
  expect(calls).toBe(1);
  resolve(7);
  expect(await a).toBe(7);
  expect(await b).toBe(7);
  now = 59999;
  expect(await read()).toBe(7);
  expect(calls).toBe(1);
  now = 60000;
  const c = read();
  expect(calls).toBe(2);
  resolve(8);
  expect(await c).toBe(8);
  let attempts = 0;
  const fail = cachedProbe(async () => {
    if (++attempts === 1) throw new Error("offline");
    return 1;
  });
  await expect(fail()).rejects.toThrow("offline");
  expect(await fail()).toBe(1);
});
