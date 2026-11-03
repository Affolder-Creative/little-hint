import { performance } from "node:perf_hooks";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { stamp, world } from "../src/server/domain";
import { cancelledBuying } from "../src/server/buying-history";
// Synthetic, in-memory data only. No database, filesystem, retailer, or paid API calls.
const { state, actors } = stagingFixtures();
const actor = actors[1];
const template = state.items.find((i) =>
  state.lists
    .find((l) => l.id === i.listId)
    ?.ownerIds.includes(
      state.people.find((p) => p.userId === actors[0].id)!.id,
    ),
)!;
state.items = Array.from({ length: 1000 }, (_, n) => ({
  ...template,
  ...stamp(),
  title: `Synthetic gift ${n}`,
  description: "Synthetic product description. ".repeat(20),
}));
state.comments = [];
state.contributions = [];
state.reservations = [];
state.imports = [];
for (let i = 0; i < 1000; i++) {
  state.imports.push({
    ...stamp(),
    userId: actor.id,
    url: "https://example.test/product",
    status: "complete",
    result: {
      title: `Imported gift ${i}`,
      description: "Synthetic import metadata. ".repeat(30),
    },
  });
  state.reservations.push({
    ...stamp(),
    buyerId: actor.id,
    itemId: state.items[i].id,
    quantity: i < 50 ? 1 : 0,
    purchased: 0,
    former: false,
    titleSnapshot: state.items[i].title,
  });
}
function measure(fn: () => unknown) {
  for (let i = 0; i < 5; i++) fn();
  const samples: number[] = [];
  let result: unknown;
  for (let i = 0; i < 40; i++) {
    const start = performance.now();
    result = fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    p50Ms: Number(samples[19].toFixed(2)),
    p95Ms: Number(samples[37].toFixed(2)),
    bytes: Buffer.byteLength(JSON.stringify(result)),
  };
}
const legacy = measure(() => world(state, actor));
const compact = measure(() => world(state, actor, true));
const history = measure(() => cancelledBuying(state, actor, {}));
console.log(
  JSON.stringify(
    {
      fixture: {
        gifts: 1000,
        historicalImports: 1000,
        cancelledReservations: 950,
        activeReservations: 50,
      },
      legacy,
      compact,
      history,
      savedPercent: Number(
        (100 * (1 - compact.bytes / legacy.bytes)).toFixed(1),
      ),
    },
    null,
    2,
  ),
);
