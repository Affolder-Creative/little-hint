import { describe, it, expect } from "vitest";
import {
  emptyState,
  type Group,
  type Item,
  type List,
} from "../src/shared/model";
import { stamp, command, world, giftView } from "../src/server/domain";
import {
  canEdit,
  itemVisible,
  administersGroup,
} from "../src/server/domain-access";
import { trash } from "../src/server/management";
import { accountExport } from "../src/server/account-export";
function fixture() {
  const s = emptyState();
  const actors = [
    "Owner",
    "Author",
    "Recipient",
    "Family admin",
    "App admin",
    "Member",
  ].map((name) => ({
    id: stamp().id,
    name,
    email: `${name.replaceAll(" ", "")}@example.test`,
  }));
  s.people = actors.map((a, n) => ({
    ...stamp(),
    name: a.name,
    userId: a.id,
    guardians: [],
    admin: n === 4,
  }));
  const group: Group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
    adminIds: [actors[3].id],
  };
  s.groups.push(group);
  const list = command(s, actors[1], "lists.create", {
    name: "Wishes",
    ownerIds: [s.people[1].id],
    groupIds: [group.id],
    mode: "surprise",
  }) as List;
  const ideaView = command(s, actors[1], "items.create", {
    title: "Gift",
    recipientIds: [s.people[2].id],
    groupIds: [group.id],
    visibility: "hidden",
    quantity: 3,
    priceCents: 2500,
  }) as Item;
  const idea = s.items.find((i) => i.id === ideaView.id)!;
  const wishView = command(s, actors[1], "items.create", {
    title: "Wish",
    listId: list.id,
  }) as Item;
  const wish = s.items.find((i) => i.id === wishView.id)!;
  return { s, actors, group, list, idea, wish };
}
function edit(f: ReturnType<typeof fixture>, n: number, patch = {}) {
  return command(f.s, f.actors[n], "items.update", {
    id: f.idea.id,
    revision: f.idea.revision,
    title: "Updated",
    ...patch,
  });
}
describe("administrative content authority", () => {
  it("edits accessible ideas without changing authorship, quantity, price or private defaults", () => {
    for (const n of [0, 3, 4]) {
      const f = fixture();
      f.idea.spendingAllocations = [
        { recipientId: f.s.people[2].id, share: 1, listId: null },
      ];
      const before = structuredClone(f.idea);
      edit(f, n);
      expect(f.idea.title).toBe("Updated");
      for (const key of [
        "creatorId",
        "groupIds",
        "recipientIds",
        "quantity",
        "priceCents",
        "spendingAllocations",
      ] as const)
        expect(f.idea[key]).toEqual(before[key]);
      expect(f.idea.lastEditorId).toBe(f.actors[n].id);
      expect(
        giftView(f.s, f.actors[n], f.idea).spendingAllocations,
      ).toBeUndefined();
    }
  });
  it("denies ordinary members and rejects protected fields even for admins", () => {
    const f = fixture();
    expect(() => edit(f, 5)).toThrow();
    for (const patch of [
      { groupIds: [] },
      { recipientIds: [] },
      { visibility: "visible" },
      { spendingAllocations: [] },
      { excludedUserIds: [] },
    ])
      expect(() => edit(f, 3, patch)).toThrow();
  });
  it("does not grant private, excluded, recipient-surprise or archive access", () => {
    for (const n of [3, 4]) {
      const f = fixture();
      f.idea.visibility = "private";
      expect(canEdit(f.s, f.actors[n], f.idea)).toBe(false);
      f.idea.visibility = "hidden";
      f.idea.excludedUserIds = [f.actors[n].id];
      expect(canEdit(f.s, f.actors[n], f.idea)).toBe(false);
      f.idea.excludedUserIds = [];
      f.idea.recipientIds = [f.s.people[n].id];
      expect(itemVisible(f.s, f.actors[n], f.idea)).toBe(false);
      f.idea.recipientIds = [f.s.people[2].id];
      f.idea.archived = true;
      f.s.preferences.push({
        ...stamp(),
        userId: f.actors[1].id,
        hideArchivedItems: true,
      } as any);
      expect(itemVisible(f.s, f.actors[n], f.idea)).toBe(false);
      expect(canEdit(f.s, f.actors[n], f.idea)).toBe(false);
    }
  });
  it("protects drafts and personal exports while permitting published wish editing", () => {
    const f = fixture();
    f.wish.publicationState = "draft";
    f.wish.draftOwnerId = f.actors[1].id;
    for (const n of [3, 4]) {
      expect(canEdit(f.s, f.actors[n], f.wish)).toBe(false);
      expect(JSON.stringify(accountExport(f.s, f.actors[n]))).not.toContain(
        f.wish.title,
      );
    }
    f.wish.publicationState = "published";
    expect(canEdit(f.s, f.actors[3], f.wish)).toBe(true);
  });
  it("requires ordinary content access even for app admins administering other groups", () => {
    const f = fixture();
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[4].id);
    expect(administersGroup(f.s, f.actors[4], f.group)).toBe(true);
    expect(canEdit(f.s, f.actors[4], f.idea)).toBe(false);
    expect(world(f.s, f.actors[4]).items).toEqual([]);
  });
  it("revokes family authority on demotion or departure and permits overlapping audiences", () => {
    const f = fixture();
    f.idea.groupIds.push(stamp().id);
    expect(canEdit(f.s, f.actors[3], f.idea)).toBe(true);
    edit(f, 3);
    expect(f.idea.groupIds).toHaveLength(2);
    f.group.adminIds = [];
    expect(canEdit(f.s, f.actors[3], f.idea)).toBe(false);
    f.group.adminIds = [f.actors[3].id];
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[3].id);
    expect(canEdit(f.s, f.actors[3], f.idea)).toBe(false);
  });
  it("allows family trash and restore but reserves elevated purge for app admins", () => {
    const f = fixture();
    command(f.s, f.actors[3], "items.trash", {
      id: f.idea.id,
      revision: f.idea.revision,
    });
    expect(
      trash(f.s, f.actors[3]).find((e) => e.id === f.idea.id)?.canPurge,
    ).toBe(false);
    expect(() =>
      command(f.s, f.actors[3], "items.purge", {
        id: f.idea.id,
        revision: f.idea.revision,
      }),
    ).toThrow();
    command(f.s, f.actors[3], "items.restore", {
      id: f.idea.id,
      revision: f.idea.revision,
    });
    expect(itemVisible(f.s, f.actors[3], f.idea)).toBe(true);
    command(f.s, f.actors[3], "items.trash", {
      id: f.idea.id,
      revision: f.idea.revision,
    });
    command(f.s, f.actors[4], "items.purge", {
      id: f.idea.id,
      revision: f.idea.revision,
    });
    expect(f.s.items.some((i) => i.id === f.idea.id)).toBe(false);
  });
  it("preserves private drafts when an app admin purges their containing list", () => {
    const f = fixture();
    f.wish.publicationState = "draft";
    f.wish.draftOwnerId = f.actors[1].id;
    command(f.s, f.actors[4], "lists.trash", {
      id: f.list.id,
      revision: f.list.revision,
    });
    command(f.s, f.actors[4], "lists.purge", {
      id: f.list.id,
      revision: f.list.revision,
    });
    expect(
      f.s.recoveredDrafts.find((d) => d.sourceId === f.wish.id)?.userId,
    ).toBe(f.actors[1].id);
  });
  it("lets an admin maintain their own draft and recovers it after authority ends", () => {
    const f = fixture();
    const draft = command(f.s, f.actors[3], "items.create", {
      listId: f.list.id,
      title: "Admin draft",
      publicationState: "draft",
    }) as Item;
    const stored = f.s.items.find((i) => i.id === draft.id)!;
    expect(canEdit(f.s, f.actors[3], stored)).toBe(true);
    expect(canEdit(f.s, f.actors[4], stored)).toBe(false);
    f.group.adminIds = [];
    command(f.s, f.actors[1], "items.organize", {
      id: f.wish.id,
      revision: f.wish.revision,
      priority: null,
    });
    expect(
      f.s.recoveredDrafts.some(
        (d) => d.sourceId === stored.id && d.userId === f.actors[3].id,
      ),
    ).toBe(true);
  });
  it("protects sharing and primary ownership", () => {
    const f = fixture();
    expect(() =>
      command(f.s, f.actors[3], "lists.update", { ...f.list, groupIds: [] }),
    ).toThrow();
    expect(() =>
      command(f.s, f.actors[3], "groups.transfer", {
        groupId: f.group.id,
        userId: f.actors[5].id,
        email: f.actors[5].email,
      }),
    ).toThrow();
    expect(() =>
      command(f.s, f.actors[4], "groups.remove", {
        groupId: f.group.id,
        userId: f.actors[0].id,
      }),
    ).toThrow();
  });
});
