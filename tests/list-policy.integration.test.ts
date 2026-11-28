import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fixture } from "./privacy-fixture";
import { command } from "../src/server/domain";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("persisted activity policy", () => {
  let db: typeof import("../src/server/db");
  let f: ReturnType<typeof fixture>;
  beforeAll(async () => {
    if (!/little_hint_test(?:\?|$)/.test(url!))
      throw new Error("Use an isolated little_hint_test database.");
    process.env.DATABASE_URL = url;
    db = await import("../src/server/db");
    await db.migrate();
  });
  beforeEach(async () => {
    f = fixture();
    await db.pool.query("DELETE FROM app_record");
    await db.transact((s) => Object.assign(s, f.state));
  });
  afterAll(async () => {
    await db?.pool.end();
  });

  it.each([true, false])(
    "serializes a first reservation racing a mode edit (reservation first: %s)",
    async (reservationFirst) => {
      const reserve = () =>
        db.transact((s) =>
          command(s, f.actors[1], "reservations.create", {
            itemId: f.item.id,
            quantity: 1,
            expectedListMode: "surprise",
          }),
        );
      const change = () =>
        db.transact((s) =>
          command(s, f.actors[0], "lists.update", {
            ...f.lists[0],
            mode: "transparent",
          }),
        );
      const results = await Promise.allSettled(
        reservationFirst ? [reserve(), change()] : [change(), reserve()],
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const state = await db.readState();
      const list = state.lists.find((l) => l.id === f.lists[0].id)!;
      if (state.reservations.length) {
        expect(list).toMatchObject({ mode: "surprise", modeLocked: true });
        await db.transact((s) => {
          s.reservations = [];
        });
        expect(
          (await db.readCollectionState()).lists.find((l) => l.id === list.id)
            ?.modeLocked,
        ).toBe(true);
      } else {
        expect(list).toMatchObject({ mode: "transparent", modeLocked: false });
        expect(
          (
            results.find(
              (r) => r.status === "rejected",
            ) as PromiseRejectedResult
          ).reason.message,
        ).toContain("Gifting settings changed.");
      }
    },
  );

  it("migrates old locks and events once while preserving unlocked private lists and icons", async () => {
    const legacy = structuredClone(f.state);
    legacy.lists[0].modeLocked = true;
    legacy.lists[0].iconKey = "wrench";
    legacy.lists[1].groupIds = [];
    const event = command(legacy, f.actors[0], "group-events.create", {
      groupId: f.group.id,
      name: "Legacy event",
      participantIds: [f.state.people[2].id],
      mode: "surprise",
    }) as { id: string };
    for (const list of legacy.lists) delete list.revealPolicyLocked;
    for (const event of legacy.groupEvents) {
      delete event.modeLocked;
      delete event.revealPolicyLocked;
    }
    for (const kind of ["lists", "groupEvents"] as const) {
      await db.pool.query("DELETE FROM app_record WHERE kind=$1", [kind]);
      for (const data of legacy[kind])
        await db.pool.query(
          "INSERT INTO app_record(id,kind,data) VALUES($1,$2,$3)",
          [data.id, kind, JSON.stringify(data)],
        );
    }
    await db.pool.query("DELETE FROM schema_migration WHERE version=20");
    await db.migrate();
    const state = await db.readState();
    expect(state.lists.find((l) => l.id === f.lists[0].id)).toMatchObject({
      modeLocked: true,
      revealPolicyLocked: true,
      iconKey: "wrench",
    });
    expect(state.lists.find((l) => l.id === f.lists[1].id)).toMatchObject({
      modeLocked: false,
      revealPolicyLocked: false,
    });
    expect(state.groupEvents.find((e) => e.id === event.id)).toMatchObject({
      modeLocked: true,
      revealPolicyLocked: true,
    });
    expect(
      state.lists
        .filter((l) => l.groupEventId === event.id)
        .every((l) => l.modeLocked),
    ).toBe(true);
    await db.migrate();
    expect(await db.readState()).toEqual(state);
  });
});
