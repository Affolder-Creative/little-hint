import { describe, it, expect } from "vitest";
import {
  emptyState,
  type FriendEntry,
  type Invitation,
  type Item,
  type ImportJob,
} from "../src/shared/model";
import {
  command,
  idempotent,
  stamp,
  world,
  activateAccount,
  signupAllowed,
} from "../src/server/domain";
function fixture() {
  const s = emptyState();
  const actors = ["Kyle", "Sam", "Taylor", "Jo"].map((name, n) => ({
    id: `u${n}`,
    name,
    email: `${name.toLowerCase()}@example.test`,
  }));
  s.people.push(
    ...actors.map((a) => ({
      ...stamp(),
      name: a.name,
      userId: a.id,
      guardians: [],
    })),
  );
  const group = {
    ...stamp(),
    name: "Shoppers",
    ownerId: actors[0].id,
    memberIds: [actors[0].id, actors[1].id],
  };
  s.groups.push(group);
  const f = command(s, actors[0], "friends.create", {
    name: "Taylor",
  }) as FriendEntry;
  const share = () =>
    command(s, actors[0], "friends.update", {
      id: f.id,
      revision: f.revision,
      name: f.name,
      groupIds: [group.id],
      confirmSharing: true,
    });
  const idea = (actor = actors[0], visibility = "private") =>
    command(s, actor, "items.create", {
      title: "A book",
      recipientIds: [f.personId],
      visibility,
      groupIds: visibility === "private" ? [] : [group.id],
      friendEntryId: f.id,
    }) as Item;
  const invite = () =>
    command(s, actors[0], "friends.invite", {
      id: f.id,
      email: actors[2].email,
    }) as Invitation;
  return { s, actors, group, f, share, idea, invite };
}
describe("friend planning", () => {
  it.each(["ordinary", "friend"])(
    "reassigns a recovered draft from a friend to another %s",
    (destination) => {
      const f = fixture();
      const next =
        destination === "friend"
          ? (command(f.s, f.actors[0], "friends.create", {
              name: "Another friend",
            }) as FriendEntry)
          : undefined;
      const recipientId =
        next?.personId ??
        f.s.people.find((p) => p.userId === f.actors[1].id)!.id;
      const job: ImportJob = {
        ...stamp(),
        userId: f.actors[0].id,
        url: "https://example.test/book",
        status: "complete",
        draft: {
          kind: "idea",
          recipientId: f.f.personId,
          friendEntryId: f.f.id,
          visibility: "private",
          groupIds: [],
          revision: 1,
          state: "active",
          fields: { title: "A book" },
          touched: ["title"],
        },
      };
      f.s.imports.push(job);
      command(f.s, f.actors[0], "imports.update", {
        id: job.id,
        revision: 1,
        recipientId,
        visibility: "private",
        groupIds: [],
      });
      expect(job.draft?.recipientId).toBe(recipientId);
      expect(job.draft?.friendEntryId).toBe(next?.id);
      const item = command(f.s, f.actors[0], "items.create", {
        title: "A book",
        url: job.url,
        recipientIds: [recipientId],
        friendEntryId: job.draft?.friendEntryId,
        visibility: "private",
        groupIds: [],
        importId: job.id,
        importDraftRevision: job.draft?.revision,
      }) as Item;
      expect(item.recipientIds).toEqual([recipientId]);
      expect(item.friendEntryId).toBe(next?.id);
      expect(job.draft?.state).toBe("published");
    },
  );

  it("shows connection requests only to sender and invited email", () => {
    const f = fixture();
    f.share();
    const inv = f.invite();
    expect(world(f.s, f.actors[0]).invitations.map((i) => i.id)).toContain(
      inv.id,
    );
    expect(world(f.s, f.actors[2]).invitations.map((i) => i.id)).toContain(
      inv.id,
    );
    expect(world(f.s, f.actors[1]).invitations.map((i) => i.id)).not.toContain(
      inv.id,
    );
  });

  it("replays friend creation with a current destination", () => {
    const f = fixture(),
      key = "friend_creation_retry_001",
      body = { name: "Pat" };
    const first = idempotent(
      f.s,
      f.actors[0],
      key,
      "friends.create",
      body,
    ) as FriendEntry;
    const second = idempotent(
      f.s,
      f.actors[0],
      key,
      "friends.create",
      body,
    ) as FriendEntry;
    expect(second.id).toBe(first.id);
    expect(second.personId).toBe(first.personId);
    expect(f.s.friendEntries.filter((e) => e.name === "Pat")).toHaveLength(1);
  });

  it("records purchases and budgets before joining and preserves them through connection", () => {
    const f = fixture();
    const idea = f.idea();
    command(f.s, f.actors[0], "spending.settings", {
      enabled: true,
      summaries: true,
    });
    command(f.s, f.actors[0], "spending.purchase", {
      itemId: idea.id,
      itemRevision: idea.revision,
      title: "A book",
      recipientIds: [f.f.personId],
      amountCents: 2599,
      date: "2026-11-03",
      quantity: 1,
      keepPrivate: true,
    });
    command(f.s, f.actors[0], "spending.budget", {
      scope: `person:${f.f.personId}`,
      year: 2026,
      amountCents: 10000,
      shared: false,
    });
    const old = f.f.personId,
      inv = f.invite();
    command(f.s, f.actors[2], "invitations.accept", { id: inv.id });
    const purchase = f.s.spendingRecords.find((r) => r.kind === "purchase")!;
    expect(purchase.amountCents).toBe(2599);
    expect(purchase.recipientIds).toEqual([f.f.personId]);
    expect(f.s.reservations.find((r) => r.itemId === idea.id)?.purchased).toBe(
      1,
    );
    expect(f.s.spendingBudgets[0]).toMatchObject({
      scope: `person:${f.f.personId}`,
      originalScope: `person:${old}`,
      friendEntryId: f.f.id,
      amountCents: 10000,
    });
  });
  it("rejects mixed recipients and attaching friend scope to owned lists", () => {
    const f = fixture();
    f.share();
    expect(() =>
      command(f.s, f.actors[0], "items.create", {
        title: "Mixed",
        recipientIds: [f.s.people[1].id, f.f.personId],
        visibility: "visible",
        groupIds: [f.group.id],
      }),
    ).toThrow("one friend");
    const list = command(f.s, f.actors[0], "lists.create", {
      name: "Mine",
      ownerIds: [f.s.people[0].id],
      groupIds: [],
      mode: "surprise",
    }) as { id: string };
    expect(() =>
      command(f.s, f.actors[0], "items.create", {
        title: "Invalid",
        listId: list.id,
        friendEntryId: f.f.id,
      }),
    ).toThrow("separate");
  });

  it("creates a private recipient without granting profile control", () => {
    const { s, actors, f } = fixture();
    expect(world(s, actors[0]).people.some((p) => p.id === f.personId)).toBe(
      true,
    );
    expect(world(s, actors[1]).people.some((p) => p.id === f.personId)).toBe(
      false,
    );
    expect(() =>
      command(s, actors[0], "people.update", {
        id: f.personId,
        revision: 1,
        name: "oops",
      }),
    ).toThrow();
    expect(() =>
      command(s, actors[0], "lists.create", {
        name: "joint",
        ownerIds: [s.people[0].id, f.personId],
        groupIds: [],
        mode: "surprise",
      }),
    ).toThrow("connect an account");
  });
  it("shares only selected ideas, without giving collaborators management", () => {
    const f = fixture();
    f.share();
    const privateIdea = f.idea();
    const shared = f.idea(f.actors[1], "hidden");
    expect(world(f.s, f.actors[1]).items.map((i) => i.id)).not.toContain(
      privateIdea.id,
    );
    expect(world(f.s, f.actors[0]).items.map((i) => i.id)).toContain(shared.id);
    expect(() =>
      command(f.s, f.actors[1], "friends.invite", {
        id: f.f.id,
        email: "x@example.test",
      }),
    ).toThrow();
    expect(() => f.idea(f.actors[1], "visible")).toThrow("hidden");
  });
  it("removes group access and does not republish when restored", () => {
    const f = fixture();
    f.share();
    const i = f.idea(f.actors[1], "hidden");
    command(f.s, f.actors[0], "friends.update", {
      id: f.f.id,
      revision: f.f.revision,
      name: f.f.name,
      groupIds: [],
    });
    expect(world(f.s, f.actors[0]).items.map((i) => i.id)).not.toContain(i.id);
    expect(world(f.s, f.actors[1]).items.map((i) => i.id)).toContain(i.id);
    f.share();
    expect(world(f.s, f.actors[0]).items.map((i) => i.id)).not.toContain(i.id);
  });
  it("connects only on acceptance and keeps surprise ideas hidden", () => {
    const f = fixture();
    f.share();
    const item = f.idea(f.actors[1], "hidden");
    const inv = f.invite();
    activateAccount(f.s, f.actors[2]);
    expect(inv.acceptedBy).toBeUndefined();
    command(f.s, f.actors[2], "invitations.accept", { id: inv.id });
    expect(f.f.personId).toBe(
      f.s.people.find((p) => p.userId === f.actors[2].id)!.id,
    );
    expect(f.s.items.find((i) => i.id === item.id)?.friendEntryId).toBe(f.f.id);
    f.group.memberIds.push(f.actors[2].id);
    expect(world(f.s, f.actors[2]).items.map((i) => i.id)).not.toContain(
      item.id,
    );
    expect(f.s.people.some((p) => p.id === f.f.originalPersonId)).toBe(false);
    expect(world(f.s, f.actors[1]).personRedirects![f.f.originalPersonId]).toBe(
      f.f.personId,
    );
  });
  it("admits a new account without accepting the friend request", () => {
    const f = fixture();
    f.s.people = f.s.people.filter((p) => p.userId !== f.actors[2].id);
    const inv = f.invite();
    expect(signupAllowed(f.s, f.actors[2].email)).toBe(true);
    activateAccount(f.s, f.actors[2]);
    expect(inv.acceptedBy).toBeUndefined();
    expect(f.f.connectedAt).toBeUndefined();
  });
  it("declines, expires and revokes requests", () => {
    const f = fixture();
    const inv = f.invite();
    command(f.s, f.actors[2], "invitations.decline", { id: inv.id });
    expect(() =>
      command(f.s, f.actors[2], "invitations.accept", { id: inv.id }),
    ).toThrow();
    const expired = f.invite();
    expired.expiresAt = "2000-01-01";
    expect(() =>
      command(f.s, f.actors[2], "invitations.accept", { id: expired.id }),
    ).toThrow();
    const cancelled = f.invite();
    command(f.s, f.actors[0], "invitations.revoke", { id: cancelled.id });
    expect(() =>
      command(f.s, f.actors[2], "invitations.accept", { id: cancelled.id }),
    ).toThrow();
  });
  it("archives privately, preserves authors' ideas and cancels invitations", () => {
    const f = fixture();
    f.share();
    const item = f.idea(f.actors[1], "hidden");
    const inv = f.invite();
    command(f.s, f.actors[0], "friends.archive", {
      id: f.f.id,
      revision: f.f.revision,
      archived: true,
    });
    expect(inv.revoked).toBe(true);
    expect(world(f.s, f.actors[1]).items.map((i) => i.id)).toContain(item.id);
    expect(() => f.idea()).toThrow();
    command(f.s, f.actors[0], "friends.archive", {
      id: f.f.id,
      revision: f.f.revision,
      archived: false,
    });
    expect(f.f.groupIds).toEqual([]);
  });
  it("unifies accepted entries without pooling their ideas", () => {
    const f = fixture();
    const a = f.idea();
    const second = command(f.s, f.actors[1], "friends.create", {
      name: "Taylor",
    }) as FriendEntry;
    const b = command(f.s, f.actors[1], "items.create", {
      title: "Another book",
      recipientIds: [second.personId],
    }) as Item;
    const inv = f.invite();
    const inv2 = command(f.s, f.actors[1], "friends.invite", {
      id: second.id,
      email: f.actors[2].email,
    }) as Invitation;
    command(f.s, f.actors[2], "invitations.accept", { id: inv.id });
    command(f.s, f.actors[2], "invitations.accept", { id: inv2.id });
    expect(second.personId).toBe(f.f.personId);
    expect(world(f.s, f.actors[0]).items.map((i) => i.id)).toContain(a.id);
    expect(world(f.s, f.actors[0]).items.map((i) => i.id)).not.toContain(b.id);
  });
  it("rejects wrong account, self invitations, stale edits, and disclosure", () => {
    const f = fixture();
    expect(() =>
      command(f.s, f.actors[0], "friends.invite", {
        id: f.f.id,
        email: f.actors[0].email,
      }),
    ).toThrow();
    const inv = f.invite();
    expect(() =>
      command(f.s, f.actors[1], "invitations.accept", { id: inv.id }),
    ).toThrow();
    f.share();
    expect(() =>
      command(f.s, f.actors[0], "friends.update", {
        id: f.f.id,
        revision: 1,
        name: "Changed",
        groupIds: [],
      }),
    ).toThrow();
    expect(world(f.s, f.actors[1]).invitations).toEqual([]);
  });
});
