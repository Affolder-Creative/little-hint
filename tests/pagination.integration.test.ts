import { afterAll, beforeAll, expect, it } from "vitest";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { stamp, world, giftView } from "../src/server/domain";

const enabled = !!process.env.TEST_DATABASE_URL;
let storage: typeof import("../src/server/db");
let itemPage: typeof import("../src/server/collections").itemPage;
const fixture = stagingFixtures();
beforeAll(async () => {
  if (!enabled) return;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  storage = await import("../src/server/db");
  ({ itemPage } = await import("../src/server/collections"));
  if (new URL(process.env.DATABASE_URL!).pathname !== "/little_hint_test")
    throw new Error("Requires isolated little_hint_test database");
  await storage.migrate();
  await storage.pool.query("DELETE FROM app_record");
  const template = fixture.state.items.find((i) =>
    world(fixture.state, fixture.actors[1]).items.some(
      (v) => v.id === i.id && !v.isRecipient,
    ),
  )!;
  fixture.state.items = Array.from({ length: 49 }, (_, n) => ({
    ...template,
    ...stamp(),
    title: `Integration gift ${n}`,
    description: "Full detail content",
  }));
  fixture.state.reservations = [];
  fixture.state.comments = [];
  for (const [kind, rows] of Object.entries(fixture.state))
    for (const row of rows)
      await storage.pool.query(
        "INSERT INTO app_record(id,kind,data) VALUES($1,$2,$3)",
        [row.id, kind, JSON.stringify(row)],
      );
});
afterAll(async () => {
  if (enabled) await storage.pool.end();
});
it.skipIf(!enabled)(
  "reads metadata and hydrates only the selected page from PostgreSQL",
  async () => {
    const state = await storage.readCollectionState();
    expect(state.items).toHaveLength(49);
    expect(state.items.every((i) => i.description === undefined)).toBe(true);
    const page = await itemPage(state, fixture.actors[1], { page: 2 });
    expect(page.rows).toHaveLength(24);
    expect(page.total).toBe(49);
    expect(
      state.items.filter((i) => i.description === "Full detail content"),
    ).toHaveLength(24);
    expect(page.rows.every((i) => !i.description && !i.comments)).toBe(true);
  },
);
it.skipIf(!enabled)(
  "preserves shell authorization and legacy item visibility",
  async () => {
    const state = await storage.readCollectionState(),
      actor = fixture.actors[1];
    const shell = world(state, actor, true, true),
      legacy = world(fixture.state, actor, true);
    expect(
      shell.people.slice().sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(legacy.people.slice().sort((a, b) => a.id.localeCompare(b.id)));
    expect(shell.notificationCount).toBe(legacy.notificationCount);
    expect(shell.items).toEqual([]);
    expect(shell.buying).toEqual([]);
    const page = await itemPage(state, actor, {});
    expect(page.rows.map((i) => i.id)).toEqual(
      legacy.items
        .slice()
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        )
        .slice(0, 24)
        .map((i) => i.id),
    );
  },
);
