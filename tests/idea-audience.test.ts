import { describe, expect, it } from "vitest";
import { command, giftView, stamp } from "../src/server/domain";
import {
  discussionAudience,
  noteVisible,
} from "../src/server/discussion-access";
import { itemVisible } from "../src/server/domain-access";

import {
  emptyState,
  type Item,
  type List,
  type FriendEntry,
} from "../src/shared/model";
function fixture(mode: "surprise" | "transparent" = "surprise") {
  const s = emptyState();
  const actors = ["Denny", "Kyle", "Melanie", "Other"].map((name) => ({
    id: `account-${name}`,
    name,
    email: `${name}@example.test`,
  }));
  const people = actors.map((a) => ({
    ...stamp(),
    userId: a.id as string | undefined,
    name: a.name,
    guardians: [] as string[],
    admin: false,
  }));
  s.people.push(...people);
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[1].id,
    memberIds: actors.map((a) => a.id),
  };
  s.groups.push(group);
  const list = command(s, actors[0], "lists.create", {
    name: "Wishes",
    ownerIds: [people[0].id],
    groupIds: [group.id],
    mode,
  }) as List;
  const created = command(s, actors[0], "items.create", {
    title: "Bike",
    listId: list.id,
  }) as Item;
  const item = s.items.find((i) => i.id === created.id)!;
  const idea = (visibility: "hidden" | "visible" | "private") => {
    const created = command(s, actors[1], "items.create", {
      title: `Gift idea ${s.items.length}`,
      recipientIds: [people[0].id],
      groupIds: visibility === "private" ? [] : [group.id],
      visibility,
    }) as Item;
    return s.items.find((i) => i.id === created.id)!;
  };
  const post = (
    target: Item,
    who = actors[1],
    body = "A note",
    mentions: Array<{ userId: string; start: number; end: number }> = [],
  ) => {
    command(s, who, "comments.create", {
      itemId: target.id,
      body,
      mentions,
      audienceToken: discussionAudience(s, who, target.id).token,
    });
    return s.comments.at(-1)!;
  };
  const visibility = (target: Item, value: "hidden" | "visible" | "private") =>
    command(s, actors[1], "items.update", {
      ...target,
      id: target.id,
      revision: target.revision,
      visibility: value,
      groupIds: value === "private" ? [] : [group.id],
    });
  return { s, actors, people, group, list, item, idea, post, visibility };
}

describe("joint ideas and audience exceptions", () => {
  it("clears a connected friend's old context when changing recipients", () => {
    const f = fixture();
    const friend = command(f.s, f.actors[1], "friends.create", {
      name: "Dad",
    }) as FriendEntry;
    friend.connectedAt = new Date().toISOString();
    friend.personId = f.people[0].id;
    const i = f.idea("hidden");
    i.friendEntryId = friend.id;
    command(f.s, f.actors[1], "items.update", {
      ...i,
      recipientIds: [f.people[2].id],
      friendEntryId: undefined,
    });
    expect(i.friendEntryId).toBeUndefined();
    command(f.s, f.actors[1], "items.update", {
      ...i,
      title: "Still editable",
    });
    expect(i.title).toBe("Still editable");
  });
  it("validates the new friend's audience when changing recipients", () => {
    const f = fixture();
    const friend = command(f.s, f.actors[1], "friends.create", {
      name: "New friend",
    }) as FriendEntry;
    const i = f.idea("hidden");
    expect(() =>
      command(f.s, f.actors[1], "items.update", {
        ...i,
        recipientIds: [friend.personId],
      }),
    ).toThrow("Choose groups this friend");
    command(f.s, f.actors[1], "items.update", {
      ...i,
      recipientIds: [friend.personId],
      visibility: "private",
      groupIds: [],
    });
    expect(i.friendEntryId).toBe(friend.id);
  });

  it("clears an incompatible spending destination while adding a recipient", () => {
    const f = fixture();
    const i = f.idea("hidden");
    i.spendingListId = f.list.id;
    command(f.s, f.actors[1], "items.update", {
      ...i,
      spendingListId: null,
      recipientIds: [f.people[0].id, f.people[2].id],
    });
    expect(i.recipientIds).toHaveLength(2);
    expect(i.spendingListId).toBeNull();
  });
  it("publishes joint import drafts with retained exclusions after membership loss", () => {
    const f = fixture();
    const j = {
      ...stamp(),
      userId: f.actors[1].id,
      url: "https://example.test/tv",
      status: "complete" as const,
      draft: {
        kind: "idea" as const,
        recipientId: f.people[0].id,
        recipientIds: [f.people[0].id, f.people[2].id],
        visibility: "restricted" as const,
        groupIds: [f.group.id],
        excludedUserIds: [f.actors[3].id],
        revision: 1,
        state: "active" as const,
        fields: {},
        touched: [],
      },
    };
    f.s.imports.push(j);
    command(f.s, f.actors[1], "imports.update", {
      id: j.id,
      revision: j.draft.revision,
      recipientId: j.draft.recipientId,
    });
    expect(j.draft.recipientIds).toHaveLength(2);
    f.group.memberIds.pop();
    const i = command(f.s, f.actors[1], "items.create", {
      title: "Joint TV",
      url: j.url,
      recipientIds: j.draft.recipientIds,
      visibility: "restricted",
      groupIds: j.draft.groupIds,
      excludedUserIds: j.draft.excludedUserIds,
      importId: j.id,
      importDraftRevision: j.draft.revision,
    }) as Item;
    expect(i.recipientIds).toHaveLength(2);
    expect(j.draft.state).toBe("published");
  });
  it("hides from all recipients and excludes across overlapping groups", () => {
    const f = fixture();
    const i = f.idea("hidden");
    const group = { ...f.group, ...stamp() };
    f.s.groups.push(group);
    command(f.s, f.actors[1], "items.update", {
      ...i,
      recipientIds: [f.people[0].id, f.people[2].id],
      visibility: "restricted",
      groupIds: [f.group.id, group.id],
      excludedUserIds: [f.actors[3].id],
    });
    for (const index of [0, 2, 3])
      expect(itemVisible(f.s, f.actors[index], i)).toBe(false);
    expect(itemVisible(f.s, f.actors[1], i)).toBe(true);
    expect(giftView(f.s, f.actors[1], i).recipientNames).toEqual([
      "Denny",
      "Melanie",
    ]);
  });
  it("keeps protected notes hidden after removing an exception", () => {
    const f = fixture();
    const i = f.idea("hidden");
    command(f.s, f.actors[1], "items.update", {
      ...i,
      visibility: "restricted",
      excludedUserIds: [f.actors[2].id],
    });
    const token = discussionAudience(f.s, f.actors[1], i.id).token;
    const old = f.post(i);
    command(f.s, f.actors[1], "items.update", {
      ...i,
      visibility: "hidden",
      excludedUserIds: [],
    });
    expect(itemVisible(f.s, f.actors[2], i)).toBe(true);
    expect(noteVisible(f.s, f.actors[2], i, undefined, old)).toBe(false);
    expect(() =>
      command(f.s, f.actors[1], "comments.create", {
        itemId: i.id,
        body: "Stale",
        audienceToken: token,
      }),
    ).toThrow("audience changed");
    const fresh = f.post(i);
    expect(noteVisible(f.s, f.actors[2], i, undefined, fresh)).toBe(true);
  });
  it("retains omitted exceptions and preserves them after membership loss", () => {
    const f = fixture();
    const i = f.idea("hidden");
    command(f.s, f.actors[1], "items.update", {
      ...i,
      visibility: "restricted",
      excludedUserIds: [f.actors[2].id],
    });
    const { excludedUserIds, ...update } = i;
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[2].id);
    command(f.s, f.actors[1], "items.update", {
      ...update,
      title: "New title",
    });
    f.group.memberIds.push(f.actors[2].id);
    expect(itemVisible(f.s, f.actors[2], i)).toBe(false);
    expect(giftView(f.s, f.actors[3], i).excludedUserIds).toBeUndefined();
  });
  it("locks recipients after a reservation even after cancellation", () => {
    const f = fixture();
    const i = f.idea("hidden");
    const r = command(f.s, f.actors[3], "reservations.create", {
      itemId: i.id,
      quantity: 1,
      ordinary: true,
    }) as { id: string };
    expect(giftView(f.s, f.actors[1], i).canEditRecipients).toBe(false);
    const reservation = f.s.reservations.find((v) => v.id === r.id)!;
    command(f.s, f.actors[3], "reservations.update", {
      id: r.id,
      revision: reservation.revision,
      quantity: 0,
      purchased: 0,
    });
    expect(() =>
      command(f.s, f.actors[1], "items.update", {
        ...i,
        recipientIds: [f.people[0].id, f.people[2].id],
      }),
    ).toThrow("Recipients can no longer");
  });
  it("releases unpurchased plans when a buyer is excluded", () => {
    const f = fixture();
    const i = f.idea("hidden");
    command(f.s, f.actors[3], "reservations.create", {
      itemId: i.id,
      quantity: 1,
      ordinary: true,
    });
    command(f.s, f.actors[1], "items.update", {
      ...i,
      visibility: "restricted",
      excludedUserIds: [f.actors[3].id],
    });
    expect(f.s.reservations[0].quantity).toBe(0);
    expect(f.s.reservations[0].former).toBe(true);
  });
  it("rejects an exclusion outside selected groups and empty restricted publication", () => {
    const f = fixture();
    f.group.memberIds.pop();
    expect(() =>
      command(f.s, f.actors[1], "items.create", {
        title: "TV",
        recipientIds: [f.people[0].id],
        visibility: "restricted",
        groupIds: [f.group.id],
        excludedUserIds: [f.actors[3].id],
      }),
    ).toThrow("Choose people");
    expect(() =>
      command(f.s, f.actors[1], "items.create", {
        title: "TV",
        recipientIds: [f.people[0].id],
        visibility: "restricted",
        groupIds: [f.group.id],
      }),
    ).toThrow("at least one person");
  });
});
