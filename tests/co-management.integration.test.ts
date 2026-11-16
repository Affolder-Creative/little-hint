import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { command, world } from "../src/server/domain";
import { canEdit, itemVisible } from "../src/server/domain-access";
import { wishlistFixture } from "./wishlist-fixture";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("persisted wish-list co-management", () => {
  let db: typeof import("../src/server/db");
  let f: ReturnType<typeof wishlistFixture>;
  beforeAll(async () => {
    if (!/little_hint_test(?:\?|$)/.test(url!))
      throw new Error("Separate little_hint_test database required.");
    process.env.DATABASE_URL = url;
    db = await import("../src/server/db");
    await db.migrate();
  });
  beforeEach(async () => {
    f = wishlistFixture();
    f.list.groupIds = [];
    f.list.modeLocked = false;
    await db.pool.query("DELETE FROM app_record");
    await db.transact((s) => Object.assign(s, f.s));
  });
  afterAll(async () => {
    await db?.pool.end();
  });
  async function invite() {
    await db.transact((s) =>
      command(s, f.john, "co-management.request", {
        personId: f.people[0].id,
        helperId: f.reader.id,
      }),
    );
    return (await db.readState()).coManagement[0].id;
  }
  async function accept(id: string) {
    await db.transact((s) =>
      command(s, f.reader, "co-management.respond", { id, accept: true }),
    );
  }

  it("persists consent and privacy locks through lightweight collection reads", async () => {
    const id = await invite();
    expect(
      world(await db.readCollectionState(), f.reader).lists.some(
        (l) => l.id === f.list.id,
      ),
    ).toBe(false);
    await accept(id);
    await db.transact((s) =>
      command(s, f.reader, "items.create", {
        title: "Delegated wish",
        listId: f.list.id,
      }),
    );
    const state = await db.readCollectionState();
    expect(state.coManagement[0].status).toBe("active");
    expect(state.lists[0].modeLocked).toBe(true);
    expect(canEdit(state, f.reader, state.items[0])).toBe(true);
    expect(world(state, f.reader).lists.some((l) => l.id === f.list.id)).toBe(
      true,
    );
    expect(state.people[0].guardians).toEqual([]);
    expect(state.lists[0].ownerIds).toEqual([f.people[0].id]);
  });

  it("serializes simultaneous acceptance without duplicate grants", async () => {
    const id = await invite();
    const results = await Promise.allSettled([accept(id), accept(id)]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const state = await db.readState();
    expect(
      state.coManagement.filter((g) => g.status === "active"),
    ).toHaveLength(1);
    expect(state.lists[0].modeLocked).toBe(true);
  });

  it("retains private draft recovery after revocation without retaining list access", async () => {
    const id = await invite();
    await accept(id);
    await db.transact((s) =>
      command(s, f.reader, "items.create", {
        title: "Helper's unfinished wish",
        description: "Private unfinished details",
        priceCents: 1299,
        quantity: 3,
        tags: ["camping"],
        priority: "most-wanted",
        listId: f.list.id,
        publicationState: "draft",
      }),
    );
    let state = await db.readState();
    expect(itemVisible(state, f.john, state.items[0])).toBe(false);
    await db.transact((s) => command(s, f.john, "co-management.end", { id }));
    state = await db.readState();
    expect(state.coManagement[0].status).toBe("ended");
    expect(world(state, f.reader).lists.some((l) => l.id === f.list.id)).toBe(
      false,
    );
    expect(
      world(state, f.reader).coManagement?.recoveredDrafts.map((d) => d.title),
    ).toContain("Helper's unfinished wish");
    expect(world(state, f.john).coManagement?.recoveredDrafts).toEqual([]);
    expect(state.recoveredDrafts[0]).toMatchObject({
      priceCents: 1299,
      quantity: 3,
      tags: ["camping"],
      priority: "most-wanted",
    });
    expect(state.lists[0].modeLocked).toBe(true);
    await expect(
      db.transact((s) =>
        command(s, f.reader, "items.create", {
          title: "Stale form",
          listId: f.list.id,
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects an expired invitation after a database round trip", async () => {
    const id = await invite();
    await db.transact((s) => {
      s.coManagement[0].expiresAt = "2000-01-01T00:00:00.000Z";
    });
    await expect(accept(id)).rejects.toThrow();
    const state = await db.readCollectionState();
    expect(state.coManagement.some((g) => g.status === "active")).toBe(false);
    expect(world(state, f.reader).lists.some((l) => l.id === f.list.id)).toBe(
      false,
    );
  });
});
