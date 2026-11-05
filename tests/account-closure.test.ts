import { describe, it, expect } from "vitest";
import { emptyState, type Item } from "../src/shared/model";
import { stamp } from "../src/server/domain-common";
import {
  closurePlan,
  closeAccountData,
  requestHandoff,
  acceptHandoff,
} from "../src/server/account-closure-domain";
import {
  accountFingerprint,
  rejectClosedAccountReferences,
} from "../src/server/closed-accounts";

function fixture() {
  const s = emptyState();
  const a = {
    id: "closing-user",
    name: "Closing Person",
    email: "closing@example.test",
  };
  const b = {
    id: "remaining-user",
    name: "Remaining Person",
    email: "remaining@example.test",
  };
  const person = {
    ...stamp(),
    userId: a.id,
    name: a.name,
    guardians: [] as string[],
  };
  const other = {
    ...stamp(),
    userId: b.id,
    name: b.name,
    guardians: [] as string[],
  };
  s.people.push(person, other);
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: b.id,
    memberIds: [a.id, b.id],
  };
  s.groups.push(group);
  const list = {
    ...stamp(),
    name: "Private wishes",
    description: "Private detail",
    ownerIds: [person.id],
    pendingOwnerIds: [],
    groupIds: [group.id],
    mode: "surprise" as const,
    modeLocked: true,
    archived: false,
  };
  s.lists.push(list);
  const item: Item = {
    ...stamp(),
    title: "Private wish",
    description: "private note",
    url: "",
    image: "",
    priceCents: null,
    currency: "USD" as const,
    quantity: 1,
    tags: [],
    listId: list.id,
    recipientIds: [person.id],
    creatorId: a.id,
    visibility: "visible" as const,
    groupIds: [group.id],
    archived: false,
  };
  s.items.push(item);
  return { s, a, b, person, other, group, list, item };
}
describe("account closure policy", () => {
  it("requires accepted administration, group ownership, and managed-profile handoffs", () => {
    const f = fixture();
    const { s, a, b, person, group } = f;
    Object.assign(person, { admin: true });
    group.ownerId = a.id;
    const child = { ...stamp(), name: "Child", guardians: [a.id] };
    s.people.push(child);
    expect(closurePlan(s, a).blockers.map((b) => b.kind)).toEqual([
      "admin",
      "group",
      "guardian",
    ]);
    requestHandoff(s, a, "admin", person.id, b.id);
    expect(closurePlan(s, a).blockers.some((b) => b.kind === "admin")).toBe(
      true,
    );
    expect(() => acceptHandoff(s, a, s.links[0].id)).toThrow();
    acceptHandoff(s, b, s.links[0].id);
    expect(closurePlan(s, a).blockers.some((b) => b.kind === "admin")).toBe(
      false,
    );
    requestHandoff(s, a, "guardian", child.id, b.id);
    acceptHandoff(s, b, s.links.at(-1)!.id);
    expect(child.guardians).toEqual([b.id]);
    group.ownerId = b.id;
    expect(closurePlan(s, a).blockers).toEqual([]);
    closeAccountData(s, a);
    expect(s.people.find((p) => p.id === child.id)?.name).toBe("Child");
  });
  it("rejects stale or unauthorized handoffs and keeps the source responsible until acceptance", () => {
    const { s, a, b, person, group } = fixture();
    expect(() => requestHandoff(s, a, "admin", person.id, b.id)).toThrow();
    const child = { ...stamp(), name: "Child", guardians: [a.id] };
    s.people.push(child);
    requestHandoff(s, a, "guardian", child.id, b.id);
    group.memberIds = [a.id];
    expect(() => acceptHandoff(s, b, s.links[0].id)).toThrow();
    expect(child.guardians).toEqual([a.id]);
  });
  it.each(["pledged", "sent"] as const)(
    "blocks %s contributions without cancelling them",
    (status) => {
      const { s, a, b, item } = fixture();
      const r = {
        ...stamp(),
        itemId: item.id,
        buyerId: a.id,
        quantity: 1,
        purchased: 1,
        former: false,
        titleSnapshot: item.title,
      };
      s.reservations.push(r);
      s.contributions.push({
        ...stamp(),
        reservationId: r.id,
        userId: b.id,
        amountCents: 100,
        status,
      });
      const before = structuredClone(s);
      expect(() => closeAccountData(s, a)).toThrow(/Resolve/);
      expect(s).toEqual(before);
    },
  );
  it("does not expose another buyer's details in the preflight", () => {
    const { s, a, b, item } = fixture();
    s.reservations.push({
      ...stamp(),
      itemId: item.id,
      buyerId: b.id,
      quantity: 1,
      purchased: 0,
      former: false,
      titleSnapshot: "SECRET BUYING TITLE",
    });
    const blockers = closurePlan(s, a).blockers;
    expect(blockers.map((b) => b.kind)).toContain("shared-activity");
    expect(JSON.stringify(blockers)).not.toContain("SECRET BUYING TITLE");
    expect(JSON.stringify(blockers)).not.toContain(b.id);
  });
  it("preserves joint lists and anonymous settled history while removing private data", () => {
    const { s, a, b, person, other, list, item, group } = fixture();
    const joint = {
      ...list,
      ...stamp(),
      name: "Joint list",
      ownerIds: [person.id, other.id],
    };
    s.lists.push(joint);
    const jointItem = {
      ...item,
      ...stamp(),
      listId: joint.id,
      title: "Shared wish",
    };
    s.items.push(jointItem);
    const r = {
      ...stamp(),
      itemId: jointItem.id,
      buyerId: a.id,
      quantity: 1,
      purchased: 1,
      former: false,
      titleSnapshot: "Shared wish",
    };
    s.reservations.push(r);
    s.contributions.push({
      ...stamp(),
      reservationId: r.id,
      userId: a.id,
      amountCents: 200,
      status: "received",
    });
    s.comments.push({
      ...stamp(),
      itemId: jointItem.id,
      authorId: a.id,
      body: "Private conversation",
    });
    s.comments.push({
      ...stamp(),
      itemId: jointItem.id,
      authorId: b.id,
      body: "@Closing Person thanks",
      mentions: [{ userId: a.id, start: 0, end: 15 }],
    });
    s.preferences.push({
      ...stamp(),
      userId: a.id,
      email: true,
      telegram: false,
      sms: false,
      events: [],
      recipientUpdates: false,
      phone: "PRIVATE PHONE",
    });
    s.imports.push({
      ...stamp(),
      userId: a.id,
      url: "PRIVATE URL",
      status: "pending",
    });
    s.media.push({ ...stamp(), userId: a.id, file: "photo.webp" });
    jointItem.image = `/api/v1/media/${s.media[0].id}`;
    s.replays.push({
      ...stamp(),
      userId: b.id,
      key: "k",
      fingerprint: "f",
      result: { personId: person.id, name: a.name },
    });
    s.spendingRecords.push({
      ...stamp(),
      ownerId: b.id,
      title: "Shared purchase",
      recipientIds: [person.id],
      recipientNames: [a.name],
      listId: joint.id,
      listOwnerNames: [a.name, b.name],
      quantity: 1,
      amountCents: 100,
      date: "2026-11-01",
      planningYear: 2026,
      kind: "purchase",
      sharing: "private",
      splits: [1],
      history: [
        {
          actorId: b.id,
          at: new Date().toISOString(),
          description: "Updated recipients",
          changes: { recipientNames: { before: [a.name], after: [a.name] } },
        },
      ],
    });
    expect(closurePlan(s, a).blockers).toEqual([]);
    closeAccountData(s, a);
    expect(s.spendingRecords[0].listOwnerNames).toEqual([
      "Former member",
      b.name,
    ]);
    expect(s.lists.map((l) => l.id)).toEqual([joint.id]);
    expect(s.lists[0].ownerIds).toEqual([other.id]);
    expect(s.items.map((i) => i.id)).toEqual([jointItem.id]);
    expect(s.people.find((p) => p.id === person.id)).toMatchObject({
      name: "Former member",
      guardians: [],
    });
    expect(s.people.find((p) => p.id === person.id)?.userId).toBeUndefined();
    expect(s.groups.find((g) => g.id === group.id)?.memberIds).toEqual([b.id]);
    expect(s.reservations[0]).toMatchObject({ purchased: 1, former: true });
    expect(s.contributions[0]).toMatchObject({
      amountCents: 200,
      status: "received",
    });
    expect(s.comments[0].body).toBe("Comment removed");
    expect(s.comments[1].body).toBe("Former member thanks");
    expect(s.media[0].deletedAt).toBeTruthy();
    expect(s.items[0].image).toBe("");
    const serialized = JSON.stringify(s);
    for (const privateValue of [
      a.id,
      a.name,
      a.email,
      "Private wish",
      "Private conversation",
      "PRIVATE PHONE",
      "PRIVATE URL",
    ])
      expect(serialized).not.toContain(privateValue);
  });
  it("blocks active exchanges and allows archived history", () => {
    const { s, a, person, other, group } = fixture();
    s.exchanges.push({
      ...stamp(),
      name: "Exchange",
      groupId: group.id,
      organizerId: a.id,
      participantIds: [person.id, other.id],
      count: 1,
      excludeHousehold: false,
      exclusions: [],
      status: "drawn",
      assignments: [
        [person.id, other.id],
        [other.id, person.id],
      ],
    });
    expect(closurePlan(s, a).blockers.some((b) => b.kind === "exchange")).toBe(
      true,
    );
    s.exchanges[0].archived = true;
    closeAccountData(s, a);
    expect(s.exchanges[0].assignments).toHaveLength(2);
    expect(s.exchanges[0].organizerId).not.toBe(a.id);
  });
  it("rejects delayed account references including nested records and usage keys", () => {
    const hashes = new Set([accountFingerprint("closing-user")]);
    for (const value of [
      { userId: "closing-user" },
      { history: [{ actorId: "closing-user" }] },
      { key: "discovery:closing-user:week" },
      { rules: { "closing-user": ["x"] } },
    ])
      expect(() => rejectClosedAccountReferences(value, hashes)).toThrow(
        /closed/,
      );
    expect(() =>
      rejectClosedAccountReferences({ userId: "remaining-user" }, hashes),
    ).not.toThrow();
  });
  it("deletes buying history that belonged only to a private idea", () => {
    const { s, a, item } = fixture();
    delete item.listId;
    item.visibility = "private";
    item.title = "Private purchase";
    s.reservations.push({
      ...stamp(),
      itemId: item.id,
      buyerId: a.id,
      quantity: 1,
      purchased: 1,
      former: false,
      titleSnapshot: item.title,
    });
    closeAccountData(s, a);
    expect(s.reservations).toEqual([]);
    expect(JSON.stringify(s)).not.toContain("Private purchase");
  });
});
