import { describe, it, expect, vi, afterEach } from "vitest";
import {
  emptyState,
  type Item,
  type List,
  type Reservation,
  type Contribution,
} from "../src/shared/model";
import { stamp, command, giftView, noticeAllowed } from "../src/server/domain";
import {
  activityAllowed,
  inbox,
  mentionCandidates,
} from "../src/server/activity";

function fixture() {
  const s = emptyState();
  const actors = ["Recipient", "Buyer", "Helper", "Other"].map((name) => ({
    id: stamp().id,
    name,
    email: `${name}@example.test`,
  }));
  const people = actors.map((a) => ({
    ...stamp(),
    userId: a.id,
    name: a.name,
    guardians: [] as string[],
    admin: false,
  }));
  s.people.push(...people);
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  };
  s.groups.push(group);
  const list = command(s, actors[0], "lists.create", {
    name: "Wishes",
    ownerIds: [people[0].id],
    groupIds: [group.id],
    mode: "surprise",
  }) as List;
  const item = command(s, actors[0], "items.create", {
    title: "Secret bicycle",
    listId: list.id,
  }) as Item;
  return { s, actors, people, group, list, item };
}
afterEach(() => vi.useRealTimers());
describe("notification inbox and audiences", () => {
  it("delivers followed additions once for overlapping follows, never to unrelated users or the actor", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const f = fixture();
    for (const [target, targetId] of [
      ["person", f.people[0].id],
      ["list", f.list.id],
    ])
      command(f.s, f.actors[1], "follows.update", {
        target,
        targetId,
        following: true,
      });
    command(f.s, f.actors[0], "follows.update", {
      target: "person",
      targetId: f.people[0].id,
      following: true,
    });
    const next = command(f.s, f.actors[0], "items.create", {
      title: "New wish",
      listId: f.list.id,
    }) as Item;
    expect(f.s.notices.filter((n) => n.itemId === next.id)).toHaveLength(1);
    expect(inbox(f.s, f.actors[1]).entries[0].context).toBe("New wish");
    expect(inbox(f.s, f.actors[0]).unreadCount).toBe(0);
    expect(inbox(f.s, f.actors[2]).unreadCount).toBe(0);
    expect(
      Date.parse(f.s.notices[0].pushDueAt!) -
        Date.parse(f.s.notices[0].createdAt),
    ).toBe(900000);
    command(f.s, f.actors[0], "items.create", {
      title: "Another wish",
      listId: f.list.id,
    });
    expect(f.s.notices[1].pushDueAt).toBe(f.s.notices[0].pushDueAt);
  });
  it("does not grant access through a follow or expose restricted counts after membership changes", () => {
    const f = fixture();
    command(f.s, f.actors[1], "follows.update", {
      target: "list",
      targetId: f.list.id,
      following: true,
    });
    command(f.s, f.actors[0], "items.create", {
      title: "New wish",
      listId: f.list.id,
    });
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[1].id);
    expect(inbox(f.s, f.actors[1])).toMatchObject({
      entries: [],
      unreadCount: 0,
    });
    expect(() =>
      command(f.s, f.actors[1], "follows.update", {
        target: "list",
        targetId: f.list.id,
        following: true,
      }),
    ).toThrow("not available");
    expect(() =>
      command(f.s, f.actors[1], "follows.update", {
        target: "list",
        targetId: f.list.id,
        following: false,
      }),
    ).not.toThrow();
  });
  it("keeps read state independent from delivery and protects other accounts and newer events", () => {
    const f = fixture();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    command(f.s, f.actors[1], "follows.update", {
      target: "list",
      targetId: f.list.id,
      following: true,
    });
    command(f.s, f.actors[0], "items.create", {
      title: "First",
      listId: f.list.id,
    });
    const first = f.s.notices[0];
    first.status = "sent";
    expect(inbox(f.s, f.actors[1]).unreadCount).toBe(1);
    command(f.s, f.actors[2], "notifications.read", {
      ids: [first.id],
      read: true,
    });
    expect(first.readAt).toBeUndefined();
    vi.setSystemTime(new Date("2026-10-24T12:00:01Z"));
    command(f.s, f.actors[0], "items.create", {
      title: "Second",
      listId: f.list.id,
    });
    command(f.s, f.actors[1], "notifications.read", {
      through: first.createdAt,
      read: true,
    });
    expect(inbox(f.s, f.actors[1]).unreadCount).toBe(1);
    command(f.s, f.actors[1], "notifications.read", {
      ids: [first.id],
      read: false,
    });
    expect(inbox(f.s, f.actors[1]).unreadCount).toBe(2);
    first.inbox = undefined;
    expect(inbox(f.s, f.actors[1]).unreadCount).toBe(1);
  });
  it("paginates equal timestamps without duplicating or skipping notifications", () => {
    const f = fixture();
    vi.useFakeTimers();
    command(f.s, f.actors[1], "follows.update", {
      target: "list",
      targetId: f.list.id,
      following: true,
    });
    for (let n = 0; n < 35; n++)
      command(f.s, f.actors[0], "items.create", {
        title: `Gift ${n}`,
        listId: f.list.id,
      });
    const one = inbox(f.s, f.actors[1]);
    const two = inbox(f.s, f.actors[1], { cursor: one.nextCursor });
    expect(one.entries).toHaveLength(30);
    expect(two.entries).toHaveLength(5);
    expect(
      new Set([...one.entries, ...two.entries].map((n) => n.id)).size,
    ).toBe(35);
  });
  it("sends discussion updates only to participants/watchers and mentions only once", () => {
    const f = fixture();
    command(f.s, f.actors[2], "watches.update", {
      itemId: f.item.id,
      watching: true,
    });
    command(f.s, f.actors[1], "comments.create", {
      itemId: f.item.id,
      body: "@Helper check the size",
      mentions: [{ userId: f.actors[2].id, start: 0, end: 7 }],
    });
    expect(f.s.notices).toHaveLength(1);
    expect(f.s.notices[0].event).toBe("mention");
    command(f.s, f.actors[2], "watches.update", {
      itemId: f.item.id,
      watching: false,
    });
    command(f.s, f.actors[3], "comments.create", {
      itemId: f.item.id,
      body: "Another note",
    });
    expect(inbox(f.s, f.actors[2]).entries).toHaveLength(1);
    expect(inbox(f.s, f.actors[1]).entries[0].event).toBe("discussion");
    expect(inbox(f.s, f.actors[0]).entries).toHaveLength(0);
  });
  it("excludes recipients and their managers from suggestions and rejects forged mentions", () => {
    const f = fixture();
    f.people[0].guardians = [f.actors[3].id];
    expect(
      mentionCandidates(f.s, f.actors[1], f.item.id).map((p) => p.userId),
    ).toEqual([f.actors[2].id]);
    expect(() =>
      command(f.s, f.actors[1], "comments.create", {
        itemId: f.item.id,
        body: "@Recipient",
        mentions: [{ userId: f.actors[0].id, start: 0, end: 10 }],
      }),
    ).toThrow("can no longer read");
    expect(() =>
      command(f.s, f.actors[1], "comments.create", {
        itemId: f.item.id,
        body: "@NotHelper",
        mentions: [{ userId: f.actors[2].id, start: 0, end: 10 }],
      }),
    ).toThrow("mention changed");
    expect(f.s.comments).toHaveLength(0);
  });
  it("keeps exchange mentions inside the giver's existing audience, even after management changes", () => {
    const f = fixture();
    const result = command(f.s, f.actors[1], "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
    }) as { id: string };
    const r = f.s.reservations.find((r) => r.id === result.id)!;
    r.exchangeId = stamp().id;
    r.giverId = f.people[1].id;
    f.people[1].guardians = [f.actors[2].id];
    expect(
      mentionCandidates(f.s, f.actors[1], f.item.id).map((p) => p.userId),
    ).toEqual([f.actors[2].id]);
    command(f.s, f.actors[1], "comments.create", {
      itemId: f.item.id,
      body: "@Helper",
      mentions: [{ userId: f.actors[2].id, start: 0, end: 7 }],
    });
    const notice = f.s.notices.find((n) => n.event === "mention")!;
    expect(activityAllowed(f.s, notice)).toBe(true);
    expect(giftView(f.s, f.actors[3], f.item).comments).toEqual([]);
    f.people[1].guardians = [];
    expect(noticeAllowed(f.s, notice)).toBe(false);
    expect(inbox(f.s, f.actors[2]).unreadCount).toBe(0);
  });
  it("notifies the affected cost-sharing party and all participants when a goal is reached", () => {
    const f = fixture();
    const result = command(f.s, f.actors[1], "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
    }) as { id: string };
    const r = f.s.reservations.find((r) => r.id === result.id)!;
    command(f.s, f.actors[1], "reservations.update", {
      id: r.id,
      revision: r.revision,
      quantity: 1,
      purchased: 0,
      poolTargetCents: 1000,
    });
    const c = command(f.s, f.actors[2], "contributions.create", {
      reservationId: r.id,
      amountCents: 1000,
    }) as Contribution;
    expect(
      f.s.notices
        .filter((n) => n.action === "funded")
        .map((n) => n.userId)
        .sort(),
    ).toEqual([f.actors[1].id, f.actors[2].id].sort());
    expect(
      f.s.notices.filter((n) => n.action === "pledged").map((n) => n.userId),
    ).toEqual([f.actors[1].id]);
    command(f.s, f.actors[2], "contributions.update", {
      id: c.id,
      revision: c.revision,
      status: "sent",
    });
    expect(
      f.s.notices.filter((n) => n.action === "sent").map((n) => n.userId),
    ).toEqual([f.actors[1].id]);
    command(f.s, f.actors[1], "contributions.update", {
      id: c.id,
      revision: c.revision,
      status: "received",
    });
    expect(
      f.s.notices.filter((n) => n.action === "received").map((n) => n.userId),
    ).toEqual([f.actors[2].id]);
    command(f.s, f.actors[1], "reservations.update", {
      id: r.id,
      revision: r.revision,
      quantity: 0,
      purchased: 0,
    });
    expect(
      f.s.notices
        .filter((n) => n.action === "pool-cancelled")
        .map((n) => n.userId),
    ).toEqual([f.actors[2].id]);
    expect(inbox(f.s, f.actors[0]).unreadCount).toBe(0);
  });
  it("keeps shared ownership invitations accessible before accepting the otherwise private list", () => {
    const f = fixture();
    const list = command(f.s, f.actors[1], "lists.create", {
      name: "Together",
      ownerIds: [f.people[1].id, f.people[2].id],
      groupIds: [],
      mode: "surprise",
    }) as List;
    const n = f.s.notices.find((n) => n.listId === list.id)!;
    expect(activityAllowed(f.s, n)).toBe(true);
    expect(
      inbox(f.s, f.actors[2]).entries.find((entry) => entry.id === n.id)?.href,
    ).toBe("/lists");
    command(f.s, f.actors[2], "lists.accept", { id: list.id });
    expect(activityAllowed(f.s, n)).toBe(false);
  });
});

describe("private note maintenance", () => {
  it("allows author edits, rejects stale edits and limits administrators to visible-note deletion", () => {
    const f = fixture();
    command(f.s, f.actors[1], "comments.create", {
      itemId: f.item.id,
      body: "Original",
    });
    const c = f.s.comments[0];
    f.people[2].admin = true;
    expect(giftView(f.s, f.actors[2], f.item).comments![0]).toMatchObject({
      canEdit: false,
      canDelete: true,
    });
    expect(() =>
      command(f.s, f.actors[2], "comments.update", {
        id: c.id,
        revision: c.revision,
        body: "Forged",
      }),
    ).toThrow();
    command(f.s, f.actors[1], "comments.update", {
      id: c.id,
      revision: c.revision,
      body: "Updated",
    });
    expect(c.editedAt).toBeTruthy();
    expect(() =>
      command(f.s, f.actors[1], "comments.update", {
        id: c.id,
        revision: 1,
        body: "Stale",
      }),
    ).toThrow();
    f.people[0].admin = true;
    expect(() =>
      command(f.s, f.actors[0], "comments.delete", {
        id: c.id,
        revision: c.revision,
      }),
    ).toThrow();
    f.list.archived = true;
    expect(() =>
      command(f.s, f.actors[1], "comments.update", {
        id: c.id,
        revision: c.revision,
        body: "Archived edit",
      }),
    ).toThrow();
    command(f.s, f.actors[2], "comments.delete", {
      id: c.id,
      revision: c.revision,
    });
    expect(f.s.comments).toHaveLength(0);
  });
  it("notifies only added mentions and invalidates removed mentions", () => {
    const f = fixture();
    command(f.s, f.actors[1], "comments.create", {
      itemId: f.item.id,
      body: "Original",
    });
    const c = f.s.comments[0];
    const mentions = [{ userId: f.actors[2].id, start: 0, end: 7 }];
    command(f.s, f.actors[1], "comments.update", {
      id: c.id,
      revision: c.revision,
      body: "@Helper hi",
      mentions,
    });
    const count = f.s.notices.length;
    command(f.s, f.actors[1], "comments.update", {
      id: c.id,
      revision: c.revision,
      body: "@Helper hello",
      mentions,
    });
    expect(f.s.notices).toHaveLength(count);
    command(f.s, f.actors[1], "comments.update", {
      id: c.id,
      revision: c.revision,
      body: "hello",
    });
    expect(inbox(f.s, f.actors[2]).entries).toHaveLength(0);
  });
  it("retains the original restricted audience after the reservation changes", () => {
    const f = fixture();
    command(f.s, f.actors[1], "comments.create", {
      itemId: f.item.id,
      body: "Restricted",
    });
    const c = f.s.comments[0];
    c.giverId = f.people[1].id;
    f.people[2].admin = true;
    expect(() =>
      command(f.s, f.actors[2], "comments.delete", {
        id: c.id,
        revision: c.revision,
      }),
    ).toThrow();
    expect(() =>
      command(f.s, f.actors[1], "comments.update", {
        id: c.id,
        revision: c.revision,
        body: "@Helper hi",
        mentions: [{ userId: f.actors[2].id, start: 0, end: 7 }],
      }),
    ).toThrow();
    expect(mentionCandidates(f.s, f.actors[1], f.item.id, "", c.id)).toEqual(
      [],
    );
  });
});

it("keeps idea drafts private and validates their destination and publication revision", () => {
  const f = fixture();
  const job = command(f.s, f.actors[1], "imports.create", {
    url: "https://example.com/gift",
    draft: {
      kind: "idea",
      recipientId: f.people[0].id,
      visibility: "hidden",
      groupIds: [f.group.id],
      fields: { title: "Manual title" },
      touched: ["title"],
    },
  }) as import("../src/shared/model").ImportJob;
  expect(job.draft).toMatchObject({
    kind: "idea",
    recipientId: f.people[0].id,
    visibility: "hidden",
  });
  expect(f.s.items).toHaveLength(1);
  f.s.notices.push({
    ...stamp(),
    userId: f.actors[1].id,
    event: "import",
    importId: job.id,
    inbox: true,
    status: "sent",
    attempts: 0,
    delivered: [],
  });
  expect(inbox(f.s, f.actors[1]).entries[0].href).toBe(
    `/people/${f.people[0].id}?tab=ideas&draft=${job.id}`,
  );
  const members = f.group.memberIds;
  f.group.memberIds = members.filter((id) => id !== f.actors[1].id);
  expect(inbox(f.s, f.actors[1]).entries[0].href).toBe(
    `/lists?draft=${job.id}`,
  );
  f.group.memberIds = members;
  expect(() =>
    command(f.s, f.actors[2], "imports.update", {
      id: job.id,
      revision: 1,
      fields: {},
    }),
  ).toThrow();
  command(f.s, f.actors[1], "imports.update", {
    id: job.id,
    revision: 1,
    fields: { title: "Edited" },
  });
  const payload = {
    title: "Edited",
    url: job.url,
    recipientIds: [f.people[0].id],
    importId: job.id,
  };
  expect(() =>
    command(f.s, f.actors[1], "items.create", {
      ...payload,
      importDraftRevision: 1,
    }),
  ).toThrow();
  command(f.s, f.actors[1], "items.create", {
    ...payload,
    importDraftRevision: 2,
  });
  expect(job.draft!.state).toBe("published");
});

it("shows an authenticated friend connection request only while it remains actionable", () => {
  const f = fixture();
  const entry = command(f.s, f.actors[0], "friends.create", {
    name: "Taylor",
  }) as { id: string };
  const invitation = command(f.s, f.actors[0], "friends.invite", {
    id: entry.id,
    email: f.actors[1].email,
  }) as { id: string };
  const notice = {
    ...stamp(),
    userId: f.actors[1].id,
    event: "invitation" as const,
    invitationId: invitation.id,
    inbox: true,
    status: "sent" as const,
    attempts: 0,
    delivered: [],
  };
  f.s.notices.push(notice);
  expect(activityAllowed(f.s, notice)).toBe(true);
  const stored = f.s.invitations.find((row) => row.id === invitation.id)!;
  stored.declined = true;
  expect(activityAllowed(f.s, notice)).toBe(false);
  delete stored.declined;
  f.s.friendEntries.find((row) => row.id === entry.id)!.archived = true;
  expect(activityAllowed(f.s, notice)).toBe(false);
});
