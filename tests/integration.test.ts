import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { emptyState } from "../src/shared/model";
import {
  stamp,
  idempotent,
  command,
  archiveDueLists,
  world,
  activateAccount,
} from "../src/server/domain";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL transaction integrity", () => {
  let storage: typeof import("../src/server/db");
  let groupId: string, listId: string, itemId: string;
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
    await storage.pool.query("DELETE FROM product_import_cache");
    await storage.transact((s) => {
      const people = [a, b, c].map((a) => ({
        ...stamp(),
        name: a.name,
        userId: a.id,
        guardians: [],
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
      listId = l.id;
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
  it("reserves the final discovery allowance exactly once across concurrent workers and retries", async () => {
    const { createDiscovery, startDiscovery, discoveryIdempotent, quotaKeys } =
      await import("../src/server/gift-discovery");
    const { discoveryConfig } = await import("./gift-discovery-fixture");
    const cfg = { ...discoveryConfig, monthlyLimit: 1 };
    const input = {
      personId: (await storage.readState()).people.find(
        (p) => p.userId === a.id,
      )!.id,
      categoryIds: ["coffee"],
      interests: "",
      likes: "",
      avoid: "",
      maxPriceCents: 5000,
    };
    const requests = await Promise.all(
      [b, b, c].map((actor) =>
        storage.transact((s) =>
          discoveryIdempotent(
            s,
            actor,
            "discovery_concurrent_01",
            "create",
            input,
            () => createDiscovery(s, actor, cfg, input),
          ),
        ),
      ),
    );
    expect(requests.filter((r) => "replayed" in r)).toHaveLength(1);
    const jobs = (await storage.readState()).giftDiscoveryJobs;
    expect(jobs).toHaveLength(2);
    const outcomes = await Promise.allSettled(
      [...jobs, jobs[0]].map((j) =>
        storage.transact((s) =>
          startDiscovery(s, j.userId === b.id ? b : c, cfg, j.id),
        ),
      ),
    );
    expect(
      outcomes.filter((r) => r.status === "fulfilled" && r.value),
    ).toHaveLength(1);
    const state = await storage.readState();
    expect(
      state.usage.find((u) => u.key === quotaKeys(b.id).month)?.count,
    ).toBe(1);
    expect(
      state.giftDiscoveryJobs.filter((j) => j.status === "running"),
    ).toHaveLength(1);
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
  it("persists one concurrent guideline change without redrawing assignments", async () => {
    const exchange = (await storage.readState()).exchanges.find(
      (e) => e.status === "drawn",
    )!;
    const originalAssignments = structuredClone(exchange.assignments);
    const results = await Promise.allSettled(
      [5000, 7500].map((amount, index) =>
        storage.transact((s) =>
          idempotent(
            s,
            a,
            `guideline_concurrent_${index}`,
            "exchanges.guideline",
            {
              id: exchange.id,
              revision: exchange.revision,
              spendingGuidelineCents: amount,
            },
          ),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const persisted = (await storage.readState()).exchanges.find(
      (e) => e.id === exchange.id,
    )!;
    expect([5000, 7500]).toContain(persisted.spendingGuidelineCents);
    expect(persisted.revision).toBe(exchange.revision + 1);
    expect(persisted.assignments).toEqual(originalAssignments);
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
        listId,
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
  it("persists household links atomically and rejects concurrent stale membership edits", async () => {
    const household = (await storage.transact((s) =>
      command(s, a, "households.create", { groupId, name: "The Smiths" }),
    )) as { id: string; revision: number };
    const state = await storage.readState();
    const person = state.people.find((p) => p.userId === b.id)!;
    const input = {
      groupId,
      personId: person.id,
      revision: person.revision,
      householdIds: [household.id],
    };
    const results = await Promise.allSettled([
      storage.transact((s) => command(s, b, "households.memberships", input)),
      storage.transact((s) => command(s, b, "households.memberships", input)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await storage.readState()).householdMemberships.filter(
        (m) => m.householdId === household.id,
      ),
    ).toHaveLength(1);
    await expect(
      storage.transact((s) => {
        command(s, a, "households.delete", household);
        throw new Error("Abort deletion");
      }),
    ).rejects.toThrow("Abort deletion");
    expect(
      (await storage.readState()).householdMemberships.filter(
        (m) => m.householdId === household.id,
      ),
    ).toHaveLength(1);
    await storage.transact((s) =>
      command(s, a, "households.delete", household),
    );
    const after = await storage.readState();
    expect(after.households.some((h) => h.id === household.id)).toBe(false);
    expect(
      after.householdMemberships.some((m) => m.householdId === household.id),
    ).toBe(false);
  });
  it("commits followed-item notifications atomically and deduplicates replayed actions", async () => {
    // Create a dedicated list so earlier tests' sharing changes do not affect this case.
    const person = (await storage.readState()).people.find(
      (p) => p.userId === a.id,
    )!;
    const fresh = (await storage.transact((s) =>
      command(s, a, "lists.create", {
        name: "Notification integrity",
        ownerIds: [person.id],
        groupIds: [groupId],
        mode: "surprise",
      }),
    )) as { id: string };
    await storage.transact((s) => {
      const group = s.groups.find((g) => g.id === groupId)!;
      group.memberIds = [...new Set([...group.memberIds, b.id])];
      command(s, b, "follows.update", {
        target: "list",
        targetId: fresh.id,
        following: true,
      });
    });
    const body = {
      listId: fresh.id,
      title: "Atomic wish",
      priority: "most-wanted",
    };
    const first = (await storage.transact((s) =>
      idempotent(s, a, "notification_integrity_0001", "items.create", body),
    )) as { id: string };
    const replay = (await storage.transact((s) =>
      idempotent(s, a, "notification_integrity_0001", "items.create", body),
    )) as { id: string };
    expect(replay).toMatchObject({ ok: true, replayed: true });
    expect(
      (await storage.readState()).notices.filter(
        (n) => n.itemId === first.id && n.userId === b.id,
      ),
    ).toHaveLength(1);
    await expect(
      storage.transact((s) => {
        command(s, a, "items.create", {
          listId: fresh.id,
          title: "Rolled back wish",
        });
        throw new Error("Abort notification");
      }),
    ).rejects.toThrow("Abort notification");
    const after = await storage.readState();
    expect(after.items.some((i) => i.title === "Rolled back wish")).toBe(false);
    const notices = after.notices.filter((n) => n.listId === fresh.id);
    expect(notices).toHaveLength(1);
    expect(notices[0].prioritySnapshot).toBe("most-wanted");
    const batches = after.notificationBatches.filter(
      (b) => b.listId === fresh.id,
    );
    expect(batches).toHaveLength(1);
    expect(batches[0].noticeIds).toEqual([notices[0].id]);
    expect(notices[0].batchId).toBe(batches[0].id);
    await storage.transact((s) => {
      const batch = s.notificationBatches.find((b) => b.id === batches[0].id)!;
      batch.deliveries.email = { status: "sent", attempts: 1 };
      batch.deliveries.sms = {
        status: "failed",
        attempts: 1,
        nextAttemptAt: "2026-10-27T12:16:00.000Z",
      };
    });
    expect(
      (await storage.readState()).notificationBatches.find(
        (b) => b.id === batches[0].id,
      )?.deliveries,
    ).toMatchObject({
      email: { status: "sent" },
      sms: { status: "failed", attempts: 1 },
    });
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
  it("serializes simultaneous standalone invitations and rejects cancellation after activation", async () => {
    const friend = {
      id: "integration-friend",
      name: "Friend",
      email: "friend@example.test",
    };
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        storage.transact((s) =>
          command(s, a, "invitations.create", { email: friend.email }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    let s = await storage.readState();
    const invitation = s.invitations.find((i) => i.email === friend.email)!;
    expect(
      s.notices.filter((n) => n.invitationId === invitation.id),
    ).toHaveLength(1);
    await storage.transact((s) => activateAccount(s, friend));
    await expect(
      storage.transact((s) =>
        command(s, a, "invitations.revoke", { id: invitation.id }),
      ),
    ).rejects.toThrow("no longer pending");
    s = await storage.readState();
    expect(s.invitations.find((i) => i.id === invitation.id)?.acceptedBy).toBe(
      friend.id,
    );
    expect(world(s, friend).groups).toEqual([]);
    expect(world(s, friend).me.admin).toBe(false);
  });
  it("reads import jobs by owner and keeps refresh compatible with old jobs", async () => {
    const job = (await storage.transact((s) =>
      command(s, a, "imports.create", {
        url: "https://example.com/product",
        forceRefresh: true,
      }),
    )) as { id: string };
    expect(await storage.readImport(job.id, a.id)).toMatchObject({
      forceRefresh: true,
      status: "pending",
    });
    expect(await storage.readImport(job.id, b.id)).toBeUndefined();
    expect(await storage.readImport("missing", a.id)).toBeUndefined();
    const legacy = (await storage.transact((s) =>
      command(s, a, "imports.create", { url: "https://example.com/legacy" }),
    )) as { id: string };
    expect(await storage.readImport(legacy.id, a.id)).toMatchObject({
      forceRefresh: false,
    });
  });
  it("observes settings changed by another database client without a cache TTL", async () => {
    const oldKey = process.env.SETTINGS_ENCRYPTION_KEY;
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64",
    );
    const other = new Pool({ connectionString: url });
    try {
      const settings = await import("../src/server/settings");
      await settings.saveSetting("SCRAPING_PROVIDER", "none");
      expect((await settings.config()).SCRAPING_PROVIDER).toBe("none");
      await other.query(
        "UPDATE app_record SET data = jsonb_set(data, '{encrypted}', to_jsonb($1::text)) WHERE kind='settings' AND data->>'key'='SCRAPING_PROVIDER'",
        [settings.encrypt("auto")],
      );
      expect((await settings.config()).SCRAPING_PROVIDER).toBe("auto");
      await other.query(
        "DELETE FROM app_record WHERE kind='settings' AND data->>'key'='SCRAPING_PROVIDER'",
      );
      expect(
        (await storage.readSettings()).some(
          (s) => s.key === "SCRAPING_PROVIDER",
        ),
      ).toBe(false);
    } finally {
      await other.end();
      if (oldKey === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
      else process.env.SETTINGS_ENCRYPTION_KEY = oldKey;
    }
  });
  it("persists disposable cache entries, expires them and enforces storage bounds", async () => {
    const { cachedImport, importCacheLimit, pruneImportCache } =
      await import("../src/server/import-cache");
    const { z } = await import("zod");
    const schema = z.object({ title: z.string() });
    let calls = 0;
    const compute = async () => ({ value: { title: `Product ${++calls}` } });
    expect(await cachedImport("integration-cache", schema, compute)).toEqual({
      title: "Product 1",
    });
    expect(await cachedImport("integration-cache", schema, compute)).toEqual({
      title: "Product 1",
    });
    expect(
      await cachedImport("integration-cache", schema, compute, true),
    ).toEqual({ title: "Product 2" });
    await storage.pool.query(
      "UPDATE product_import_cache SET expires_at = now() - interval '1 second'",
    );
    expect(await cachedImport("integration-cache", schema, compute)).toEqual({
      title: "Product 3",
    });
    await storage.pool.query(
      "INSERT INTO product_import_cache SELECT 'bulk-' || n, '{}'::jsonb, now() - interval '1 hour', now() + interval '1 hour' FROM generate_series(1, 1010) n",
    );
    await pruneImportCache();
    const { rows } = await storage.pool.query(
      "SELECT count(*)::int AS count FROM product_import_cache",
    );
    expect(rows[0].count).toBe(importCacheLimit);
    await expect(
      storage.pool.query(
        "INSERT INTO product_import_cache VALUES ('oversized', to_jsonb($1::text), now(), now())",
        ["x".repeat(65537)],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const state = await storage.readState();
    expect(JSON.stringify(state)).not.toContain("integration-cache");
    await storage.pool.query("DELETE FROM product_import_cache");
    // Additive migration is safe to rerun after populating the database.
    await storage.migrate();
  });
  it("persists priorities, private sort settings, and recovery with concurrent revision checks", async () => {
    const result = await storage.transact((s) => {
      const list = command(s, a, "lists.create", {
        name: "Organization integration",
        ownerIds: [s.people.find((p) => p.userId === a.id)!.id],
        groupIds: [groupId],
        mode: "surprise",
      }) as { id: string; revision: number };
      const first = command(s, a, "items.create", {
        title: "First management gift",
        listId: list.id,
        quantity: 1,
        priority: "most-wanted",
      }) as { id: string };
      const second = command(s, a, "items.create", {
        title: "Second management gift",
        listId: list.id,
        quantity: 1,
      }) as { id: string };
      command(s, b, "organization.update", {
        scope: `items:list:${list.id}`,
        revision: 0,
        sort: "priority",
      });
      return { list, first, second };
    });
    const { list, first, second } = result;
    const outcomes = await Promise.allSettled(
      [
        [first.id, second.id],
        [second.id, first.id],
      ].map((order) =>
        storage.transact((s) =>
          command(s, a, "lists.reorder", { ...list, order }),
        ),
      ),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
    const roundtrip = await storage.readState();
    expect(roundtrip.items.find((i) => i.id === first.id)?.priority).toBe(
      "most-wanted",
    );
    expect(world(roundtrip, a).organization).toEqual([]);
    expect(world(roundtrip, b).organization).toEqual(
      expect.arrayContaining([expect.objectContaining({ sort: "priority" })]),
    );
    await storage.transact((s) =>
      command(
        s,
        a,
        "lists.trash",
        s.lists.find((l) => l.id === list.id),
      ),
    );
    expect(
      world(await storage.readState(), b).items.some((i) => i.id === first.id),
    ).toBe(false);
    await storage.transact((s) =>
      command(
        s,
        a,
        "lists.restore",
        s.lists.find((l) => l.id === list.id),
      ),
    );
    expect(
      world(await storage.readState(), b).items.some((i) => i.id === first.id),
    ).toBe(true);
    await storage.transact((s) => {
      const row = s.lists.find((l) => l.id === list.id)!;
      command(s, a, "lists.trash", row);
      command(s, a, "lists.purge", row);
    });
    const after = await storage.readState();
    expect(after.lists.some((l) => l.id === list.id)).toBe(false);
    expect(after.items.some((i) => i.listId === list.id)).toBe(false);
  });
  it("commits a confirmed discovery batch once and rolls back all items on a failed transaction", async () => {
    const {
      createDiscovery,
      prepareDiscoveryReview,
      saveDiscoveryReview,
      discoveryIdempotent,
    } = await import("../src/server/gift-discovery");
    const {
      discoveryFixture,
      discoveryConfig: cfg,
      candidate,
      selection,
    } = await import("./gift-discovery-fixture");
    const f = discoveryFixture(),
      actor = f.actors[1];
    const setup = await storage.transact((s) => {
      s.people.push(...f.state.people);
      s.groups.push(...f.state.groups);
      s.lists.push(...f.state.lists);
      s.items.push(...f.state.items);
      const job = createDiscovery(s, actor, cfg, f.input);
      job.status = "complete";
      job.candidates = [candidate(7), candidate(8)];
      prepareDiscoveryReview(
        s,
        actor,
        cfg,
        job.id,
        job.candidates.map((c) => selection(c)),
      );
      return { id: job.id, reviewId: job.review!.id };
    });
    const count = (await storage.readState()).items.length;
    await expect(
      storage.transact((s) => {
        saveDiscoveryReview(s, actor, cfg, setup.id, {
          reviewId: setup.reviewId,
        });
        throw new Error("Abort gift batch");
      }),
    ).rejects.toThrow("Abort gift batch");
    expect((await storage.readState()).items).toHaveLength(count);
    const results = await Promise.all(
      [1, 2].map(() =>
        storage.transact((s) =>
          discoveryIdempotent(
            s,
            actor,
            "discovery_batch_retry_01",
            "save",
            setup,
            () =>
              saveDiscoveryReview(s, actor, cfg, setup.id, {
                reviewId: setup.reviewId,
              }),
          ),
        ),
      ),
    );
    expect(results.filter((r) => "replayed" in r)).toHaveLength(1);
    expect((await storage.readState()).items).toHaveLength(count + 2);
  });
});
