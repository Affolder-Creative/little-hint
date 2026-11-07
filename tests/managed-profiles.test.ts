import { describe, expect, it, afterEach, vi } from "vitest";
import { stagingFixtures } from "../src/server/staging-fixtures";
import {
  command,
  giftView,
  world,
  signupAllowed,
  activateAccount,
  stamp,
} from "../src/server/domain";
import { peopleForGroup } from "../src/shared/group-events";
import { itemVisible, personVisible } from "../src/server/domain-access";
import { encrypt } from "../src/server/settings";
import type {
  Person,
  List,
  Item,
  Reservation,
  GroupInviteRequest,
} from "../src/shared/model";
afterEach(() => vi.unstubAllEnvs());
function setup(shared = true) {
  const f = stagingFixtures();
  const guardian = f.actors[0],
    shopper = f.actors[1],
    group = f.state.groups[0];
  const child = command(f.state, guardian, "people.create", {
    name: "Robin Child",
    managedGroupIds: shared ? [group.id] : [],
  }) as Person;
  const list = command(f.state, guardian, "lists.create", {
    name: "Robin's wishes",
    ownerIds: [child.id],
    groupIds: shared ? [group.id] : [],
    mode: "surprise",
  }) as List;
  const gift = command(f.state, guardian, "items.create", {
    listId: list.id,
    title: "Bicycle",
    quantity: 2,
  }) as Item;
  const item = f.state.items.find((i) => i.id === gift.id)!;
  return { ...f, guardian, shopper, group, child, list, item };
}
describe("managed profiles", () => {
  it("starts private and only selected groups can discover or enroll the profile", () => {
    const f = setup(false);
    expect(personVisible(f.state, f.shopper, f.child)).toBe(false);
    expect(peopleForGroup(f.state.people, f.group)).not.toContain(f.child);
    command(f.state, f.guardian, "people.update", {
      id: f.child.id,
      revision: f.child.revision,
      name: f.child.name,
      managedGroupIds: [f.group.id],
    });
    expect(personVisible(f.state, f.shopper, f.child)).toBe(true);
    expect(peopleForGroup(f.state.people, f.group)).toContain(f.child);
    expect(itemVisible(f.state, f.shopper, f.item)).toBe(false);
    expect(() =>
      command(f.state, f.actors[4], "people.update", {
        id: f.child.id,
        revision: f.child.revision,
        name: "Changed",
      }),
    ).toThrow();
  });
  it("creates an event list for a selected managed recipient", () => {
    const f = setup();
    const event = command(f.state, f.guardian, "group-events.create", {
      groupId: f.group.id,
      name: "Birthday",
      participantIds: [f.child.id],
      mode: "surprise",
    }) as { id: string };
    const list = f.state.lists.find((l) => l.groupEventId === event.id)!;
    expect(list.ownerIds).toEqual([f.child.id]);
    expect(list.groupIds).toEqual([f.group.id]);
    command(f.state, f.guardian, "items.create", {
      listId: list.id,
      title: "Book",
    });
    expect(world(f.state, f.shopper).lists.some((l) => l.id === list.id)).toBe(
      true,
    );
    command(f.state, f.guardian, "people.update", {
      id: f.child.id,
      revision: f.child.revision,
      name: f.child.name,
      managedGroupIds: [],
    });
    expect(list.archived).toBe(true);
  });
  it("lets guardians buy wishes without exposing another giver's details", () => {
    const f = setup();
    command(f.state, f.shopper, "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
    });
    command(f.state, f.shopper, "comments.create", {
      itemId: f.item.id,
      body: "Private plan",
    });
    const before = giftView(f.state, f.guardian, f.item);
    expect(before.canShop).toBe(true);
    expect(before.available).toBe(1);
    expect(before.reservations).toEqual([]);
    expect(before.comments).toBeUndefined();
    const r = command(f.state, f.guardian, "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
    }) as Reservation;
    const stored = f.state.reservations.find((v) => v.id === r.id)!;
    command(f.state, f.guardian, "reservations.update", {
      ...stored,
      purchased: 1,
    });
    expect(giftView(f.state, f.guardian, f.item).reservations).toHaveLength(1);
    expect(giftView(f.state, f.guardian, f.item).purchased).toBe(1);
  });
  it("keeps guardian-created ideas private and removes discovery through trashed ideas", () => {
    const f = setup(false);
    const result = command(f.state, f.guardian, "items.create", {
      title: "Helmet",
      recipientIds: [f.child.id],
    }) as Item;
    const idea = f.state.items.find((i) => i.id === result.id)!;
    expect(itemVisible(f.state, f.shopper, idea)).toBe(false);
    idea.groupIds = [f.group.id];
    idea.visibility = "hidden";
    expect(personVisible(f.state, f.shopper, f.child)).toBe(true);
    idea.deletedAt = new Date().toISOString();
    expect(personVisible(f.state, f.shopper, f.child)).toBe(false);
  });
  it("takeover invites signup, preserves list identity and leaves one account profile", () => {
    const f = setup();
    const incoming = f.actors[4];
    command(f.state, f.guardian, "people.link", {
      id: f.child.id,
      email: incoming.email,
    });
    expect(signupAllowed(f.state, incoming.email)).toBe(true);
    const link = f.state.links.find(
      (l) => l.kind === "profile" && l.targetId === f.child.id,
    )!;
    command(f.state, incoming, "links.accept", { id: link.id });
    const primary = f.state.people.find((p) => p.userId === incoming.id)!;
    expect(f.state.people.filter((p) => p.userId === incoming.id)).toHaveLength(
      1,
    );
    expect(f.list.ownerIds).toEqual([primary.id]);
    expect(f.item.recipientIds).toEqual([primary.id]);
    expect(f.child.guardians).toEqual([]);
    expect(f.child.mergedIntoId).toBe(primary.id);
    expect(f.group.memberIds).not.toContain(incoming.id);
    expect(giftView(f.state, incoming, f.item).available).toBeUndefined();
  });
  it("keeps independent signup grants when cancelling or replacing a takeover", () => {
    const f = setup();
    const email = "incoming@example.test";
    const ordinary = command(f.state, f.guardian, "invitations.create", {
      email,
    }) as { id: string };
    command(f.state, f.guardian, "people.link", { id: f.child.id, email });
    const first = f.state.links.at(-1)!;
    command(f.state, f.guardian, "people.link", { id: f.child.id, email });
    const second = f.state.links.at(-1)!;
    expect(first.consumed).toBe(true);
    expect(first.invitationId).not.toBe(second.invitationId);
    expect(world(f.state, f.guardian).profileTakeovers).toHaveLength(1);
    expect(world(f.state, f.guardian).profileTakeovers?.[0].status).toBe(
      "pending",
    );
    command(f.state, f.guardian, "people.cancel-link", { id: second.id });
    expect(signupAllowed(f.state, email)).toBe(true);
    expect(
      f.state.invitations.find((i) => i.id === ordinary.id)?.revoked,
    ).not.toBe(true);
  });
  it("cancelled takeover cannot be accepted", () => {
    const f = setup();
    command(f.state, f.guardian, "people.link", {
      id: f.child.id,
      email: f.actors[4].email,
    });
    const link = f.state.links.find(
      (l) => l.kind === "profile" && l.targetId === f.child.id,
    )!;
    command(f.state, f.guardian, "people.cancel-link", { id: link.id });
    expect(() =>
      command(f.state, f.actors[4], "links.accept", { id: link.id }),
    ).toThrow();
  });
  it("requires owner approval by default; enabling member invitations is independent", () => {
    const f = setup();
    expect(() =>
      command(f.state, f.shopper, "groups.invite", {
        groupId: f.group.id,
        email: "new@example.test",
      }),
    ).toThrow();
    const request = command(f.state, f.shopper, "groups.request-invitation", {
      groupId: f.group.id,
      email: "new@example.test",
    }) as GroupInviteRequest;
    expect(signupAllowed(f.state, request.email)).toBe(false);
    command(f.state, f.guardian, "groups.respond-invitation", {
      id: request.id,
      decision: "approve",
    });
    expect(signupAllowed(f.state, request.email)).toBe(true);
    vi.stubEnv(
      "SETTINGS_ENCRYPTION_KEY",
      Buffer.alloc(32, 1).toString("base64"),
    );
    f.state.settings.push({
      ...stamp(),
      key: "FAMILY_GROUP_INVITATIONS",
      encrypted: encrypt("members"),
    });
    expect(() =>
      command(f.state, f.shopper, "groups.invite", {
        groupId: f.group.id,
        email: "another@example.test",
      }),
    ).not.toThrow();
  });
  it("marks only explicitly requested new activations for name setup", () => {
    const f = setup();
    const actor = {
      id: stamp().id,
      name: "new@example.test",
      email: "new@example.test",
    };
    f.state.invitations.push({
      ...stamp(),
      email: actor.email,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(activateAccount(f.state, actor, false, true).nameSetupRequired).toBe(
      true,
    );
    expect(
      activateAccount(f.state, f.guardian, false, true).nameSetupRequired,
    ).toBe(false);
  });
});
