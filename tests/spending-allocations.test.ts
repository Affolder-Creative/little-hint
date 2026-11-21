import { describe, it, expect } from "vitest";
import { command, stamp, giftView } from "../src/server/domain";
import { emptyState, type Item, type List } from "../src/shared/model";
import {
  spendingHistory,
  spendingAssignmentPreview,
} from "../src/server/spending";
import { recordAllocations, scopedCents } from "../src/shared/spending";
function setup() {
  const s = emptyState();
  const actors = ["Giver", "Denny", "Melanie"].map((name) => ({
    id: stamp().id,
    name,
    email: name + "@example.test",
  }));
  s.people = actors.map((a) => ({
    ...stamp(),
    userId: a.id,
    name: a.name,
    guardians: [],
  }));
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  };
  s.groups.push(group);
  const run = (action: string, body: unknown) =>
    command(s, actors[0], action, body);
  run("spending.settings", { enabled: true, summaries: true });
  const lists = actors.slice(1).map(
    (a, i) =>
      command(s, a, "lists.create", {
        name: a.name + " Christmas",
        ownerIds: [s.people[i + 1].id],
        groupIds: [group.id],
        mode: "surprise",
      }) as List,
  );
  const ids = s.people.slice(1).map((p) => p.id);
  const allocations: Array<{
    recipientId: string;
    share: number;
    listId?: string;
  }> = ids.map((recipientId, i) => ({
    recipientId,
    share: i ? 2 : 3,
    listId: lists[i].id,
  }));
  const purchase = (amountCents = 10000) => {
    const result = run("spending.purchase", {
      title: "Joint gift",
      recipientIds: ids,
      allocations,
      amountCents,
      date: "2026-11-19",
    }) as { id: string };
    return s.spendingRecords.find((r) => r.id === result.id)!;
  };
  const history = (filter = {}) =>
    spendingHistory(s, actors[0], filter).summary;
  return { s, actors, run, lists, ids, allocations, purchase, history };
}
describe("recipient spending allocations", () => {
  it("counts one purchase with separate list shares and intersected filters", () => {
    const f = setup();
    f.purchase();
    expect(f.history().spent).toBe(10000);
    expect(f.history({ list: f.lists[0].id }).spent).toBe(6000);
    expect(f.history({ list: f.lists[1].id }).spent).toBe(4000);
    expect(f.history({ list: f.lists[0].id, person: f.ids[1] }).spent).toBe(0);
  });
  it("counts a common event once and preserves exact cents", () => {
    const f = setup();
    const event = stamp().id;
    f.s.groupEvents.push({
      ...stamp(),
      id: event,
      name: "Christmas",
      groupId: f.s.groups[0].id,
      participantIds: f.ids,
      mode: "surprise",
      archived: false,
      description: "",
      timeZone: "UTC",
      revealExchangeGivers: false,
    });
    f.lists.forEach((l) => {
      f.s.lists.find((v) => v.id === l.id)!.groupEventId = event;
    });
    const r = f.purchase(10001);
    expect(f.history({ event }).spent).toBe(10001);
    expect(
      f.ids.reduce((sum, person) => sum + scopedCents(r, { person })!, 0),
    ).toBe(10001);
  });
  it("inherits private defaults into plans and purchases only for the creator", () => {
    const f = setup();
    const result = f.run("items.create", {
      title: "Joint idea",
      recipientIds: f.ids,
      spendingAllocations: f.allocations,
      priceCents: 10000,
      visibility: "hidden",
      groupIds: [f.s.groups[0].id],
    }) as Item;
    const item = f.s.items.find((i) => i.id === result.id)!;
    expect(giftView(f.s, f.actors[1], item)).not.toHaveProperty(
      "spendingAllocations",
    );
    const reservation = f.run("reservations.create", {
      itemId: item.id,
      quantity: 1,
    }) as { id: string };
    const plan = f.s.spendingRecords.find(
      (r) => r.reservationId === reservation.id,
    )!;
    expect(plan.splits).toEqual([3, 2]);
    expect(f.history({ list: f.lists[0].id }).planned).toBe(6000);
    f.run("spending.purchase", {
      reservationId: reservation.id,
      planRevision: plan.revision,
      title: item.title,
      recipientIds: f.ids,
      amountCents: 9000,
      date: "2026-11-19",
    });
    expect(f.history({ list: f.lists[0].id }).spent).toBe(5400);
  });
  it("updates refunds with purchase list and split edits", () => {
    const f = setup();
    const r = f.purchase();
    f.run("spending.refund", {
      id: r.id,
      revision: r.revision,
      amountCents: 2000,
      date: "2026-11-19",
    });
    expect(f.history({ list: f.lists[0].id }).spent).toBe(4800);
    f.run("spending.record", {
      ...r,
      allocations: f.allocations.map((v) => ({ ...v, share: 1 })),
      splits: [1, 1],
    });
    expect(f.history({ list: f.lists[0].id }).spent).toBe(4000);
  });
  it("rejects unrelated lists and invalid shares atomically", () => {
    const f = setup();
    const before = JSON.stringify(f.s);
    for (const allocations of [
      f.allocations.map((v) => ({ ...v, share: 0 })),
      f.allocations.map((v) => ({ ...v, listId: f.lists[0].id })),
    ]) {
      expect(() =>
        f.run("spending.purchase", {
          title: "Bad",
          recipientIds: f.ids,
          allocations,
          amountCents: 100,
          date: null,
        }),
      ).toThrow();
      expect(JSON.stringify(f.s)).toBe(before);
    }
  });
  it("keeps unassigned shares in overall totals and preserves unknown amounts", () => {
    const f = setup();
    f.allocations[1].listId = undefined;
    f.purchase();
    expect(f.history().spent).toBe(10000);
    expect(f.history({ list: f.lists[0].id }).spent).toBe(6000);
    expect(f.history({ list: f.lists[1].id }).spent).toBe(0);
  });
  it("previews assignments without changing existing shares", () => {
    const f = setup();
    const result = f.run("items.create", {
      title: "Idea",
      recipientIds: f.ids,
      visibility: "private",
      priceCents: 10000,
    }) as Item;
    const item = f.s.items.find((i) => i.id === result.id)!;
    f.run("reservations.create", { itemId: item.id, quantity: 1 });
    const preview = spendingAssignmentPreview(f.s, f.actors[0], {
      item: item.id,
      allocations: f.allocations,
    });
    f.run("items.update", {
      ...item,
      spendingAllocations: f.allocations,
      spendingAssignmentToken: preview.token,
    });
    expect(f.history({ list: f.lists[0].id }).planned).toBe(5000);
    expect(
      recordAllocations(f.s.spendingRecords[0]).map((v) => v.share),
    ).toEqual([1, 1]);
  });
  it("fills only missing recipient assignments after a revision-bound review", () => {
    const f = setup();
    const saved = f.run("items.create", {
      title: "Partial",
      recipientIds: f.ids,
      visibility: "private",
      priceCents: 10000,
      spendingAllocations: f.allocations.map((v, i) => ({
        ...v,
        listId: i ? undefined : v.listId,
      })),
    }) as Item;
    const item = f.s.items.find((i) => i.id === saved.id)!;
    f.run("reservations.create", { itemId: item.id, quantity: 1 });
    const plan = f.s.spendingRecords[0];
    const preview = spendingAssignmentPreview(f.s, f.actors[0], {
      item: item.id,
      allocations: f.allocations,
    });
    expect(preview.records).toHaveLength(1);
    f.run("items.update", {
      ...item,
      spendingAllocations: f.allocations,
      spendingAssignmentToken: preview.token,
    });
    expect(plan.allocations?.map((v) => v.listId)).toEqual(
      f.lists.map((l) => l.id),
    );
    expect(f.history({ list: f.lists[0].id }).planned).toBe(6000);
    expect(f.history({ list: f.lists[1].id }).planned).toBe(4000);
  });
  it("allows amount edits after a selected list disappears", () => {
    const f = setup(),
      r = f.purchase();
    f.s.lists = [];
    f.run("spending.record", {
      ...r,
      amountCents: 9000,
      allocations: f.allocations,
    });
    expect(
      f.history({ list: f.lists[0]?.id ?? f.allocations[0].listId }).spent,
    ).toBe(5400);
  });
  it("preserves manual event-only purchases with unassigned recipient lists", () => {
    const f = setup();
    const event = stamp().id;
    f.s.groupEvents.push({
      ...stamp(),
      id: event,
      name: "Christmas",
      groupId: f.s.groups[0].id,
      participantIds: f.ids,
      mode: "surprise",
      archived: false,
      description: "",
      timeZone: "UTC",
      revealExchangeGivers: false,
    });
    f.run("spending.purchase", {
      title: "Manual",
      recipientIds: f.ids,
      amountCents: 10000,
      date: null,
      eventId: event,
      allocations: f.allocations.map((v) => ({ ...v, listId: null })),
    });
    expect(f.history({ event }).spent).toBe(10000);
  });
  it("keeps unknown amounts unknown and supports a zero recipient share", () => {
    const f = setup();
    f.run("spending.purchase", {
      title: "Unknown",
      recipientIds: f.ids,
      amountCents: null,
      date: null,
      allocations: f.allocations,
    });
    expect(f.history({ list: f.lists[0].id }).missingActual).toBe(1);
    f.allocations[1].share = 0;
    const r = f.purchase(10001);
    expect(scopedCents(r, { list: f.lists[0].id })).toBe(10001);
    expect(scopedCents(r, { list: f.lists[1].id })).toBe(0);
  });
  it("retains list shares when recipient profiles merge", () => {
    const f = setup(),
      r = f.purchase();
    r.allocations = r.allocations!.map((v) => ({
      ...v,
      recipientId: f.ids[0],
    }));
    r.recipientIds = [f.ids[0]];
    r.splits = [5];
    expect(scopedCents(r, { person: f.ids[0] })).toBe(10000);
    expect(scopedCents(r, { list: f.lists[0].id })).toBe(6000);
    expect(scopedCents(r, { list: f.lists[1].id })).toBe(4000);
  });
});

it("saves published idea details after allocation key order and display metadata change", () => {
  const f = setup();
  const saved = f.run("items.create", {
    title: "Editable idea",
    description: "Before",
    recipientIds: f.ids,
    visibility: "private",
    spendingAllocations: f.allocations,
  }) as Item;
  const item = f.s.items.find((i) => i.id === saved.id)!;
  item.spendingAllocations = item.spendingAllocations!.map(
    (v) => Object.fromEntries(Object.entries(v).reverse()) as typeof v,
  );
  f.s.lists[0].name = "Renamed list";
  const assignments = structuredClone(item.spendingAllocations);
  f.run("items.update", {
    ...item,
    description: "After",
    spendingListId: null,
  });
  expect(item.description).toBe("After");
  expect(item.spendingAllocations).toEqual(assignments);
});

it("preserves legacy defaults during unchanged allocation resubmission", () => {
  const f = setup();
  const saved = f.run("items.create", {
    title: "Legacy idea",
    recipientIds: [f.ids[0]],
    visibility: "private",
    spendingListId: f.lists[0].id,
  }) as Item;
  const item = f.s.items.find((i) => i.id === saved.id)!;
  f.run("items.update", {
    ...item,
    description: "Updated",
    spendingListId: null,
    spendingAllocations: [
      { recipientId: f.ids[0], share: 1, listId: f.lists[0].id },
    ],
  });
  expect(item.spendingListId).toBe(f.lists[0].id);
  expect(item.spendingAllocations).toBeUndefined();
});
