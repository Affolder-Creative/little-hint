import { performance } from "node:perf_hooks";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { stamp, world } from "../src/server/domain";
import { itemPage } from "../src/server/collections";
for (const count of [1000, 10000]) {
  const { state, actors } = stagingFixtures();
  const actor = actors[1];
  const template = state.items.find((i) =>
    world(state, actor).items.some((v) => v.id === i.id && !v.isRecipient),
  )!;
  state.items = Array.from({ length: count }, (_, n) => ({
    ...template,
    ...stamp(),
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
    title: `Synthetic gift ${n}`,
    description: "Synthetic description. ".repeat(50),
  }));
  state.comments = [];
  state.reservations = [];
  state.contributions = [];
  for (let n = 0; n < 5; n++)
    await itemPage(state, actor, { scope: "home" }, async () => {});
  const samples: number[] = [];
  for (let n = 0; n < 40; n++) {
    const started = performance.now();
    await itemPage(state, actor, { scope: "home" }, async () => {});
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const page = await itemPage(state, actor, { scope: "home" }, async () => {});

  console.log(
    JSON.stringify({
      items: count,
      pageRows: page.rows.length,
      pageBytes: Buffer.byteLength(JSON.stringify(page)),
      shellBytes: Buffer.byteLength(
        JSON.stringify(world(state, actor, true, true)),
      ),
      legacyBytes: Buffer.byteLength(JSON.stringify(world(state, actor, true))),
      p50Ms: Math.round(samples[19] * 100) / 100,
      p95Ms: Math.round(samples[37] * 100) / 100,
    }),
  );
}
