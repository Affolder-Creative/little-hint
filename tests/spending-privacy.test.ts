import { describe, it, expect } from "vitest";
import { fixture, connect } from "./privacy-fixture";
import { command, giftView } from "../src/server/domain";
import { spendingView, spendingHistory } from "../src/server/spending";
import type { Item } from "../src/shared/model";

describe("spending surprise boundaries", () => {
  it("revokes a partner's existing records when they become a recipient guardian", () => {
    const f = fixture();
    connect(f, 1, 2, f.state.people[0].id);
    command(f.state, f.actors[1], "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
    });
    expect(spendingView(f.state, f.actors[2]).records).toHaveLength(1);
    f.state.people[0].guardians.push(f.actors[2].id);
    expect(giftView(f.state, f.actors[2], f.item).reservations).toBeUndefined();
    expect(spendingView(f.state, f.actors[2]).records).toEqual([]);
    expect(
      spendingHistory(f.state, f.actors[2], { shared: "true" }).total,
    ).toBe(0);
    const r = f.state.spendingRecords[0];
    expect(() =>
      command(f.state, f.actors[1], "spending.share", {
        id: r.id,
        revision: r.revision,
        shared: true,
      }),
    ).toThrow();
    f.state.people[0].guardians = [];
    expect(spendingView(f.state, f.actors[2]).records).toEqual([]);
    expect(spendingView(f.state, f.actors[1]).records).toHaveLength(1);
  });
  it("revokes Only me plans and protects purchases, refunds and deleted sources", () => {
    const f = fixture();
    connect(f, 1, 2, f.state.people[0].id);
    const created = command(f.state, f.actors[1], "items.create", {
      title: "Private surprise",
      recipientIds: [f.state.people[0].id],
      visibility: "hidden",
      groupIds: [f.group.id],
      priceCents: 6000,
    }) as Item;
    const item = f.state.items.find((i) => i.id === created.id)!;
    const reservation = command(f.state, f.actors[1], "reservations.create", {
      itemId: item.id,
      quantity: 1,
    }) as { id: string };
    expect(spendingView(f.state, f.actors[2]).records).toHaveLength(1);
    command(f.state, f.actors[1], "items.update", {
      ...item,
      visibility: "private",
      groupIds: [],
    });
    const plan = f.state.spendingRecords.find((r) => r.kind === "plan")!;
    const purchase = command(f.state, f.actors[1], "spending.purchase", {
      reservationId: reservation.id,
      planRevision: plan.revision,
      title: item.title,
      recipientIds: item.recipientIds,
      quantity: 1,
      amountCents: 5500,
      date: "2026-11-05",
    }) as { id: string };
    const r = f.state.spendingRecords.find((r) => r.id === purchase.id)!;
    expect(
      spendingView(f.state, f.actors[1]).records.find((v) => v.id === r.id)
        ?.canShare,
    ).toBe(false);
    expect(() =>
      command(f.state, f.actors[1], "spending.share", {
        id: r.id,
        revision: r.revision,
        shared: true,
      }),
    ).toThrow();
    command(f.state, f.actors[1], "spending.refund", {
      id: r.id,
      revision: r.revision,
      amountCents: 500,
      date: "2026-11-05",
    });
    command(f.state, f.actors[1], "items.update", {
      ...item,
      visibility: "hidden",
      groupIds: [f.group.id],
    });
    expect(spendingView(f.state, f.actors[2]).records).toEqual([]);
    f.state.items = f.state.items.filter((i) => i.id !== item.id);
    f.state.reservations = [];
    expect(spendingView(f.state, f.actors[2]).records).toEqual([]);
    expect(
      spendingView(f.state, f.actors[1]).records.filter(
        (r) => r.kind === "purchase",
      )[0].amountCents,
    ).toBe(5500);
  });
});
