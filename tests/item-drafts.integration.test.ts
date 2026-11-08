import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { wishlistFixture } from "./wishlist-fixture";
import { command, idempotent } from "../src/server/domain";
import { itemVisible } from "../src/server/domain-access";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("persisted drafts", () => {
  let db: typeof import("../src/server/db");
  const f = wishlistFixture();
  beforeAll(async () => {
    if (!/little_hint_test(?:\?|$)/.test(url!))
      throw new Error("Separate little_hint_test database required.");
    process.env.DATABASE_URL = url;
    db = await import("../src/server/db");
    await db.migrate();
    await db.pool.query("DELETE FROM app_record");
    await db.transact((s) => Object.assign(s, f.s));
  });
  afterAll(async () => {
    await db?.pool.end();
  });
  it("persists draft privacy and publishes once under concurrent replay", async () => {
    const draft: any = await db.transact((s) =>
      command(s, f.john, "items.create", {
        title: "Database draft",
        listId: f.list.id,
        publicationState: "draft",
      }),
    );
    const saved = await db.readState();
    expect(itemVisible(saved, f.reader, saved.items[0])).toBe(false);
    expect(itemVisible(saved, f.john, saved.items[0])).toBe(true);
    const payload = { ...draft, archived: false };
    await Promise.all(
      [1, 2].map(() =>
        db.transact((s) =>
          idempotent(
            s,
            f.john,
            "draft-publish-integration",
            "items.publish",
            payload,
          ),
        ),
      ),
    );
    const published = await db.readState();
    expect(published.items).toHaveLength(1);
    expect(published.items[0].publicationState).toBe("published");
    expect(itemVisible(published, f.reader, published.items[0])).toBe(true);
  });
});
