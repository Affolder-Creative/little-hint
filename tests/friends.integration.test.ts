import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { command, stamp, activateAccount, world } from "../src/server/domain";
import type { FriendEntry, Invitation, Item } from "../src/shared/model";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("friend connection transactions", () => {
  let storage: typeof import("../src/server/db");
  const giver = {
    id: "friend-test-giver",
    name: "Giver",
    email: "giver@example.test",
  };
  const receiver = {
    id: "friend-test-receiver",
    name: "Taylor",
    email: "taylor@example.test",
  };
  beforeAll(async () => {
    if (!/little_hint_test(?:\?|$)/.test(url!))
      throw new Error("Use an isolated little_hint_test database.");
    process.env.DATABASE_URL = url;
    storage = await import("../src/server/db");
    await storage.migrate();
    await storage.pool.query("DELETE FROM app_record");
    await storage.transact((s) => {
      s.people.push({
        ...stamp(),
        name: giver.name,
        userId: giver.id,
        guardians: [],
      });
    });
  });
  afterAll(async () => {
    await storage?.pool.end();
  });

  it("rolls back recipient remapping and acceptance when the transaction fails", async () => {
    const { entry, invitation, item } = await storage.transact((s) => {
      const entry = command(s, giver, "friends.create", {
        name: "Taylor",
      }) as FriendEntry;
      const item = command(s, giver, "items.create", {
        title: "Surprise book",
        recipientIds: [entry.personId],
        friendEntryId: entry.id,
      }) as Item;
      const invitation = command(s, giver, "friends.invite", {
        id: entry.id,
        email: receiver.email,
      }) as Invitation;
      activateAccount(s, receiver);
      return { entry, invitation, item };
    });
    await expect(
      storage.transact((s) => {
        command(s, receiver, "invitations.accept", { id: invitation.id });
        throw new Error("rollback probe");
      }),
    ).rejects.toThrow("rollback probe");
    const before = await storage.readState();
    expect(
      before.friendEntries.find((f) => f.id === entry.id)?.connectedAt,
    ).toBeUndefined();
    expect(before.items.find((i) => i.id === item.id)?.recipientIds).toEqual([
      entry.personId,
    ]);
    expect(
      before.invitations.find((i) => i.id === invitation.id)?.acceptedBy,
    ).toBeUndefined();

    const results = await Promise.allSettled(
      [0, 1].map(() =>
        storage.transact((s) =>
          command(s, receiver, "invitations.accept", { id: invitation.id }),
        ),
      ),
    );
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const after = await storage.readState();
    const canonical = after.people.find((p) => p.userId === receiver.id)!;
    expect(after.items.find((i) => i.id === item.id)?.recipientIds).toEqual([
      canonical.id,
    ]);
    expect(after.friendEntries.find((f) => f.id === entry.id)?.personId).toBe(
      canonical.id,
    );
    expect(after.people.filter((p) => p.userId === receiver.id)).toHaveLength(
      1,
    );
    expect(world(after, receiver).items).toEqual([]);
    expect(world(after, giver).items.map((i) => i.id)).toContain(item.id);
  });
});
