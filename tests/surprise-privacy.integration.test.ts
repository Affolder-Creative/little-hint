import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { fixture, connect, draw } from "./privacy-fixture";
import { command } from "../src/server/domain";
import { spendingView } from "../src/server/spending";
import { kinds, type Item } from "../src/shared/model";
import { privacyPreflight } from "../src/server/privacy-review";
import { stamp } from "../src/server/domain";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("persisted surprise privacy", () => {
  let storage: typeof import("../src/server/db");
  beforeAll(async () => {
    if (!/little_hint_test(?:\?|$)/.test(url!))
      throw new Error("Use isolated little_hint_test database");
    process.env.DATABASE_URL = url;
    storage = await import("../src/server/db");
    await storage.migrate();
    await storage.migrate();
    await storage.pool.query("DELETE FROM app_record");
  });
  afterAll(async () => {
    await storage?.pool.end();
  });
  it("serializes privacy changes with purchase writes and preserves financial records", async () => {
    const f = fixture();
    connect(f, 1, 2, f.state.people[0].id);
    const idea = command(f.state, f.actors[1], "items.create", {
      title: "Private source",
      recipientIds: [f.state.people[0].id],
      visibility: "hidden",
      groupIds: [f.group.id],
      priceCents: 2000,
    }) as Item;
    const reservation = command(f.state, f.actors[1], "reservations.create", {
      itemId: idea.id,
      quantity: 1,
    }) as { id: string };
    await storage.transact((s) => Object.assign(s, f.state));
    await Promise.all([
      storage.transact((s) => {
        const item = s.items.find((i) => i.id === idea.id)!;
        command(s, f.actors[1], "items.update", {
          ...item,
          visibility: "private",
          groupIds: [],
        });
      }),
      storage.transact((s) => {
        command(s, f.actors[1], "spending.purchase", {
          reservationId: reservation.id,
          planRevision: s.spendingRecords.find(
            (r) => r.reservationId === reservation.id && r.kind === "plan",
          )!.revision,
          title: idea.title,
          recipientIds: idea.recipientIds,
          quantity: 1,
          amountCents: 1900,
          date: "2026-11-05",
        });
      }),
    ]);
    const state = await storage.readState();
    expect(spendingView(state, f.actors[2]).records).toEqual([]);
    expect(
      spendingView(state, f.actors[1]).records.find(
        (r) => r.kind === "purchase",
      )?.amountCents,
    ).toBe(1900);
    await expect(
      storage.transact((s) => {
        s.items[0].title = "rollback";
        throw new Error("rollback test");
      }),
    ).rejects.toThrow("rollback test");
    expect((await storage.readState()).items[0].title).not.toBe("rollback");
  });
  it("upgrades retained schema-4 records without deleting data and rejects newer schemas", async () => {
    const f = fixture();
    const { giver } = draw(f);
    command(f.state, giver, "spending.settings", {
      enabled: true,
      summaries: true,
    });
    const created = command(f.state, giver, "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
      ordinary: true,
    }) as { id: string };
    delete f.state.reservations.find((r) => r.id === created.id)!.ordinary;
    const note = {
      ...stamp(),
      itemId: f.item.id,
      authorId: giver.id,
      body: "Retain original note text",
      mentions: [],
    };
    f.state.comments.push(note);
    await storage.pool.query("DELETE FROM app_record");
    await storage.pool.query("DELETE FROM schema_migration WHERE version > 4");
    for (const kind of kinds)
      for (const record of f.state[kind]) {
        await storage.pool.query(
          "INSERT INTO app_record(id, kind, data) VALUES($1,$2,$3)",
          [record.id, kind, JSON.stringify(record)],
        );
      }
    await storage.migrate();
    await storage.migrate();
    const before = await storage.readState();
    expect(before.comments[0]).toEqual(note);
    expect(before.spendingRecords).toEqual(f.state.spendingRecords);
    expect(privacyPreflight(before)).toMatchObject({
      reservationsNeedingOwnerReview: 1,
      notesNeedingAuthorReview: 1,
    });
    expect(await storage.readState()).toEqual(before);
    await storage.transact(() => undefined);
    const after = await storage.readState();
    expect(after.comments[0]).toMatchObject({
      id: note.id,
      body: note.body,
      privacyReview: true,
    });
    expect(after.spendingRecords[0].amountCents).toBe(
      f.state.spendingRecords[0].amountCents,
    );
    await storage.pool.query(
      "INSERT INTO schema_migration(version) VALUES(999)",
    );
    try {
      await expect(storage.migrate()).rejects.toThrow("newer");
    } finally {
      await storage.pool.query(
        "DELETE FROM schema_migration WHERE version = 999",
      );
    }
  });
});
