import { performance } from "node:perf_hooks";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  pool,
  migrate,
  readState,
  readImport,
  readSettings,
} from "../src/server/db";
import { stamp, world } from "../src/server/domain";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { kinds, type ImportJob } from "../src/shared/model";
import { saveImage, cardImage } from "../src/server/media";

// Explicitly opt into a disposable database; never read deployment data.
if (
  new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid").pathname !==
  "/little_hint_benchmark"
)
  throw new Error("Requires a separate, empty little_hint_benchmark database.");
const measurements: Record<string, unknown> = {};
async function measure(name: string, fn: () => Promise<unknown>) {
  for (let i = 0; i < 5; i++) await fn();
  const times: number[] = [];
  let value: unknown;
  for (let i = 0; i < 40; i++) {
    const start = performance.now();
    value = await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  measurements[name] = {
    p50_ms: Number(times[19].toFixed(2)),
    p95_ms: Number(times[37].toFixed(2)),
    response_bytes: Buffer.byteLength(JSON.stringify(value)),
  };
}
let directory: string | undefined;
let seeded = false;
try {
  await migrate();
  const count = await pool.query("SELECT count(*)::int AS n FROM app_record");
  if (count.rows[0].n) throw new Error("Benchmark requires an empty database.");
  const { actors, state } = stagingFixtures();
  const template = state.items[0];
  state.items = Array.from({ length: 1000 }, (_, n) => ({
    ...template,
    ...stamp(),
    title: `Synthetic gift ${n}`,
    description: "Synthetic product description. ".repeat(20),
  }));
  state.settings = Array.from({ length: 20 }, (_, n) => ({
    ...stamp(),
    key: `BENCHMARK_${n}`,
    encrypted: "synthetic-placeholder",
  }));
  const job: ImportJob = {
    ...stamp(),
    userId: actors[0].id,
    url: "https://example.test/product",
    status: "running",
  };
  state.imports.push(job);
  const records = kinds.flatMap((kind) =>
    state[kind].map((data) => ({ id: data.id, kind, data })),
  );
  await pool.query(
    "INSERT INTO app_record SELECT id, kind, data FROM jsonb_to_recordset($1::jsonb) AS r(id text, kind text, data jsonb)",
    [JSON.stringify(records)],
  );
  seeded = true;
  measurements.fixture = {
    gifts: state.items.length,
    records: records.length,
    samples: 40,
  };
  await measure("baseline_import_poll_full_world", async () =>
    world(await readState(), actors[0]),
  );
  await measure("targeted_import_poll", () => readImport(job.id, actors[0].id));
  await measure(
    "baseline_settings_read_full_state",
    async () => (await readState()).settings,
  );
  await measure("targeted_settings_read", readSettings);
  measurements.database_rows_per_read = {
    baseline: records.length,
    import: 1,
    settings: 20,
  };
  directory = await mkdtemp(path.join(os.tmpdir(), "hint-benchmark-"));
  process.env.UPLOAD_DIR = directory;
  const pixels = Buffer.from(
    Array.from(
      { length: 1200 * 800 * 3 },
      (_, i) => (i * 17 + Math.floor(i / 3611)) % 256,
    ),
  );
  const png = await sharp(pixels, {
    raw: { width: 1200, height: 800, channels: 3 },
  })
    .png()
    .toBuffer();
  await saveImage(png, actors[0].id);
  const filename = (await readdir(directory)).find(
    (f) => !f.includes(".card-"),
  )!;
  measurements.image_bytes = {
    full: (await readFile(path.join(directory, filename))).length,
    card: (await readFile(await cardImage(filename))).length,
  };
  console.log(JSON.stringify(measurements, null, 2));
} finally {
  if (seeded) await pool.query("DELETE FROM app_record");
  if (directory) await rm(directory, { recursive: true, force: true });
  await pool.end();
}
