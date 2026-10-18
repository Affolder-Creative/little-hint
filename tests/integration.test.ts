import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { emptyState } from "../src/shared/model";
import {
  stamp,
  idempotent,
  command,
  archiveDueLists,
  world,
} from "../src/server/domain";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL transaction integrity", () => {
  let storage: typeof import("../src/server/db");
  let groupId: string, itemId: string;
  const a = {
      id: "integration-recipient",
      email: "recipient@example.test",
      name: "Recipient",
    },
    b = {
      id: "integration-buyer1",
      email: "buyer1@example.test",
      name: "Buyer One",
    },
    c = {
      id: "integration-buyer2",
      email: "buyer2@example.test",
      name: "Buyer Two",
    };
  beforeAll(async () => {
    if (!/little_hint_test(?:\?|$)/.test(url!))
      throw new Error(
        "Integration tests require a separate little_hint_test database.",
      );
    process.env.DATABASE_URL = url;
    storage = await import("../src/server/db");
    await storage.migrate();
    await storage.pool.query("DELETE FROM app_record");
    await storage.transact((s) => {
      const people = [a, b, c].map((a) => ({
        ...stamp(),
        name: a.name,
        userId: a.id,
        guardians: [],
        household: "",
      }));
      s.people.push(...people);
      const g = {
        ...stamp(),
        name: "Test family",
        ownerId: a.id,
        memberIds: [a.id, b.id, c.id],
      };
      s.groups.push(g);
      groupId = g.id;
      const l = command(s, a, "lists.create", {
        name: "Test list",
        ownerIds: [people[0].id],
        groupIds: [g.id],
        mode: "surprise",
      }) as any;
      const i = command(s, a, "items.create", {
        title: "One gift",
        listId: l.id,
        quantity: 1,
      }) as any;
      itemId = i.id;
    });
  });
  afterAll(async () => {
    await storage?.pool.end();
  });
  it("allows exactly one simultaneous reservation for the final unit", async () => {
    const results = await Promise.allSettled([
      storage.transact((s) =>
        idempotent(s, b, "parallel_buyer_0001", "reservations.create", {
          itemId,
          quantity: 1,
        }),
      ),
      storage.transact((s) =>
        idempotent(s, c, "parallel_buyer_0002", "reservations.create", {
          itemId,
          quantity: 1,
        }),
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const s = await storage.readState();
    expect(s.reservations.reduce((n, r) => n + r.quantity, 0)).toBe(1);
  });
  it("rolls back partial domain changes when a transaction fails", async () => {
    const count = (await storage.readState()).groups.length;
    await expect(
      storage.transact((s) => {
        s.groups.push({
          ...stamp(),
          name: "Must roll back",
          ownerId: a.id,
          memberIds: [a.id],
        });
        throw new Error("failure");
      }),
    ).rejects.toThrow();
    expect((await storage.readState()).groups).toHaveLength(count);
  });
  it("allows only one concurrent exchange draw", async () => {
    const exchange = await storage.transact((s) => {
      for (const actor of [b, c])
        command(s, actor, "lists.create", {
          name: "Exchange wishes",
          ownerIds: [s.people.find((p) => p.userId === actor.id)!.id],
          groupIds: [groupId],
          mode: "surprise",
        });
      const created = command(s, a, "exchanges.create", {
        name: "Annual exchange",
        groupId,
        participantIds: s.people.map((p) => p.id),
        count: 1,
        excludeHousehold: false,
      }) as any;
      return s.exchanges.find((e) => e.id === created.id)!;
    });
    const results = await Promise.allSettled(
      ["draw_concurrent_01", "draw_concurrent_02"].map((key) =>
        storage.transact((s) =>
          idempotent(s, a, key, "exchanges.draw", {
            id: exchange.id,
            revision: exchange.revision,
          }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await storage.readState()).exchanges.find((e) => e.id === exchange.id)!
        .assignments,
    ).toHaveLength(3);
  });
  it("reconciles a reservation racing with removal of its last access path", async () => {
    const gift = (await storage.transact((s) =>
      command(s, a, "items.create", {
        title: "Membership race",
        listId: s.lists.find((l) =>
          l.ownerIds.includes(s.people.find((p) => p.userId === a.id)!.id),
        )!.id,
      }),
    )) as any;
    await Promise.allSettled([
      storage.transact((s) =>
        command(s, c, "reservations.create", { itemId: gift.id, quantity: 1 }),
      ),
      storage.transact((s) =>
        command(s, a, "groups.remove", { groupId, userId: c.id }),
      ),
    ]);
    expect(
      (await storage.readState()).reservations
        .filter((r) => r.itemId === gift.id)
        .reduce((n, r) => n + r.quantity, 0),
    ).toBe(0);
  });
  it("commits a retried mutation only once across concurrent requests", async () => {
    const gift = (await storage.transact((s) =>
      command(s, a, "items.create", {
        title: "Retry race",
        listId: s.lists[0].id,
        quantity: 2,
      }),
    )) as any;
    const results = await Promise.all(
      [1, 2].map(() =>
        storage.transact((s) =>
          idempotent(s, b, "same_request_00001", "reservations.create", {
            itemId: gift.id,
            quantity: 1,
          }),
        ),
      ),
    );
    expect(results).toContainEqual({ ok: true, replayed: true });
    expect(
      (await storage.readState()).reservations.filter(
        (r) => r.itemId === gift.id,
      ),
    ).toHaveLength(1);
  });
  it("enforces an elapsed archive while the worker races a reservation, then restores it", async () => {
    const created = await storage.transact((s) => {
      const list = command(s, a, "lists.create", {
        name: "Scheduled archive",
        ownerIds: [s.people.find((p) => p.userId === a.id)!.id],
        groupIds: [groupId],
        mode: "surprise",
        timeZone: "UTC",
      }) as any;
      const gift = command(s, a, "items.create", {
        title: "Archive race",
        listId: list.id,
      }) as any;
      command(s, a, "lists.update", { ...list, archiveAfter: "2000-01-01" });
      return { listId: list.id, itemId: gift.id };
    });
    const results = await Promise.allSettled([
      storage.transact((s) => archiveDueLists(s)),
      storage.transact((s) =>
        command(s, b, "reservations.create", {
          itemId: created.itemId,
          quantity: 1,
        }),
      ),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    await storage.transact((s) => {
      const list = s.lists.find((l) => l.id === created.listId)!;
      expect(list.archived).toBe(true);
      command(s, a, "lists.update", { ...list, archived: false });
    });
    const restored = world(await storage.readState(), a).lists.find(
      (l) => l.id === created.listId,
    )!;
    expect(restored.archived).toBe(false);
    expect(restored.archiveAfter).toBeNull();
  });
  it("persists event lists atomically, deduplicates retries, and rejects simultaneous stale edits", async () => {
    const setup = await storage.transact((s) => {
      const group = command(s, a, "groups.create", {
        name: "Event test family",
      }) as any;
      group.memberIds.push(b.id, c.id);
      return {
        groupId: group.id,
        participantIds: s.people
          .filter((p) => [a.id, b.id].includes(p.userId!))
          .map((p) => p.id),
      };
    });
    const payload = { ...setup, name: "Christmas", mode: "surprise" };
    const create = () =>
      storage.transact((s) =>
        idempotent(
          s,
          a,
          "create_event_retry_01",
          "group-events.create",
          payload,
        ),
      );
    await Promise.all([create(), create()]);
    let state = await storage.readState();
    const event = state.groupEvents.find(
      (event) => event.groupId === setup.groupId,
    )!;
    expect(event).toBeDefined();
    const listIds = state.lists
      .filter((list) => list.groupEventId === event.id)
      .map((list) => list.id);
    expect(listIds).toHaveLength(2);
    const updates = await Promise.allSettled(
      ["First edit", "Second edit"].map((name) =>
        storage.transact((s) =>
          command(s, a, "group-events.update", { ...event, name }),
        ),
      ),
    );
    expect(
      updates.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    state = await storage.readState();
    expect(
      state.lists
        .filter((list) => list.groupEventId === event.id)
        .every(
          (list) =>
            list.name ===
            state.groupEvents.find((e) => e.id === event.id)!.name,
        ),
    ).toBe(true);
    await expect(
      storage.transact((s) => {
        const current = s.groupEvents.find((e) => e.id === event.id)!;
        command(s, a, "group-events.update", {
          ...current,
          participantIds: [],
        });
        throw new Error("Abort event edit");
      }),
    ).rejects.toThrow("Abort event edit");
    state = await storage.readState();
    expect(
      state.lists
        .filter((list) => listIds.includes(list.id))
        .every((list) => !list.archived),
    ).toBe(true);
    await storage.transact((s) => {
      const current = s.groupEvents.find((e) => e.id === event.id)!;
      command(s, a, "group-events.update", { ...current, archived: true });
    });
    expect(
      (await storage.readState()).lists
        .filter((list) => listIds.includes(list.id))
        .every((list) => list.archived),
    ).toBe(true);
  });
  it("persists a failed job across worker restart and completes its retry", async () => {
    const { PgBoss } = await import("pg-boss");
    const name = `retry-proof-${Date.now()}`;
    const first = new PgBoss(url!);
    const second = new PgBoss(url!);
    try {
      await first.start();
      await first.createQueue(name, { retryLimit: 2, retryDelay: 0 });
      const id = await first.send(name, { noticeId: "durable-notice" });
      const [attempt] = await first.fetch(name, { includeMetadata: true });
      expect(attempt.id).toBe(id);
      await first.fail(name, attempt, { message: "Temporary provider outage" });
      await first.stop();
      await second.start();
      const [retry] = await second.fetch<{ noticeId: string }>(name, {
        includeMetadata: true,
      });
      expect(retry.id).toBe(id);
      expect(retry.retryCount).toBe(1);
      expect(retry.data.noticeId).toBe("durable-notice");
      await second.complete(name, retry);
      expect((await second.findJobs(name, { id: id! }))[0].state).toBe(
        "completed",
      );
    } finally {
      await first.stop();
      await second.deleteQueue(name).catch(() => {});
      await second.stop();
    }
  }, 20000);
});
