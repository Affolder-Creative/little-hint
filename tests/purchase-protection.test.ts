import { describe, expect, it } from "vitest";
import { commandWithAudience as command } from "./discussion-command";
import { draw, fixture } from "./privacy-fixture";
import { archiveDueLists, giftView } from "../src/server/domain";
import { protection } from "../src/server/purchase-protection";
import type { Actor, Item, Reservation } from "../src/shared/model";

function setup(purchased = 1) {
  const f = fixture();
  const [owner, buyer] = f.actors;
  const reserve = (item = f.item, actor = buyer, count = purchased) => {
    const created = command(f.state, actor, "reservations.create", {
      itemId: item.id,
      quantity: 2,
      ordinary: true,
    }) as Reservation;
    const reservation = f.state.reservations.find((r) => r.id === created.id)!;
    if (count)
      command(f.state, actor, "reservations.update", {
        ...reservation,
        purchased: count,
      });
    return reservation;
  };
  const reservation = reserve();
  const run = (
    action: string,
    row: { id: string; revision: number } = f.item,
    extra = {},
    actor: Actor = owner,
  ) => command(f.state, actor, action, { ...row, ...extra });
  return { ...f, owner, buyer, reserve, reservation, run };
}

describe("purchased gift protection", () => {
  it.each([1, 2])(
    "blocks individual removal after %i purchased units",
    (count) => {
      const f = setup(count);
      const original = structuredClone(f.item);
      expect(() =>
        f.run("items.archive", f.item, { archived: true }),
      ).toThrow();
      expect(() => f.run("items.trash")).toThrow();
      expect(() => f.run("items.update", f.item, { archived: true })).toThrow();
      expect(f.item).toEqual(original);
      expect(f.reservation.purchased).toBe(count);
    },
  );

  it("allows reservations without purchases to be archived and removed", () => {
    const f = setup(0);
    f.run("items.archive", f.item, { archived: true });
    f.run("items.trash");
    expect(f.item.archived).toBe(true);
    expect(f.item.deletedAt).toBeTruthy();
  });

  it("keeps protection until every buyer's purchased quantity is zero", () => {
    const f = setup();
    const second = f.reserve(f.item, f.actors[2]);
    f.run("reservations.update", f.reservation, { purchased: 0 }, f.buyer);
    expect(() => f.run("items.trash")).toThrow();
    f.run("reservations.update", second, { purchased: 0 }, f.actors[2]);
    f.run("items.trash");
    expect(f.item.deletedAt).toBeTruthy();
  });

  it("protects existing Trash contents but allows restoration", () => {
    const f = setup();
    f.item.deletedAt = "2026-01-01T00:00:00.000Z";
    expect(() => f.run("items.purge")).toThrow();
    f.run("items.restore");
    expect(f.item.deletedAt).toBeUndefined();
    f.item.archived = true;
    f.run("items.archive", f.item, { archived: false });
    expect(f.item.archived).toBe(false);
  });

  it("allows collection archiving and restoration but prevents destructive cleanup", () => {
    const f = setup();
    const list = f.state.lists.find((l) => l.id === f.item.listId)!;
    f.run("lists.update", list, { archived: true });
    expect(giftView(f.state, f.owner, f.item).archived).toBe(true);
    expect(() => f.run("lists.trash", list)).toThrow();
    f.run("lists.update", list, { archived: false });
    expect(giftView(f.state, f.owner, f.item).archived).toBe(false);
    list.archiveAfter = "2020-01-01";
    archiveDueLists(f.state);
    expect(list.archived).toBe(true);
    expect(f.reservation.purchased).toBe(1);
    list.deletedAt = "2026-01-01T00:00:00.000Z";
    expect(() => f.run("lists.purge", list)).toThrow();
  });

  it("protects a product and its group without blocking unrelated product removal", () => {
    const f = setup(0);
    const group = command(f.state, f.owner, "items.create", {
      kind: "group",
      listId: f.item.listId,
      title: "A complete set",
      products: [
        { title: "Purchased product", quantity: 2 },
        { title: "Other product" },
      ],
    }) as Item;
    const parent = f.state.items.find((i) => i.id === group.id)!;
    const [purchased, other] = f.state.items.filter(
      (i) => i.parentItemId === parent.id,
    );
    f.reserve(purchased, f.buyer, 1);
    expect(() => f.run("items.archive", parent, { archived: true })).toThrow();
    expect(() => f.run("items.trash", parent)).toThrow();
    expect(() =>
      f.run("items.update", parent, { products: [other] }),
    ).toThrow();
    expect(purchased.deletedAt).toBeUndefined();
    f.run("items.trash", other);
    expect(other.deletedAt).toBeTruthy();
  });

  it("cannot hide a purchased item by wrapping it in an archived group", () => {
    const f = setup();
    expect(() =>
      f.run("items.update", f.item, {
        kind: "group",
        archived: true,
        products: [{ ...f.item }, { title: "Another product" }],
      }),
    ).toThrow();
    expect(f.item.parentItemId).toBeUndefined();
  });

  it("hides the reason from surprise recipients and exposes it when purchases are visible", () => {
    const f = setup();
    const hidden = protection(f.state, f.owner, "items", f.item.id);
    expect(hidden.canArchive).toBe(false);
    expect(hidden.canTrash).toBe(false);
    expect(hidden.message).toBeUndefined();
    expect(giftView(f.state, f.owner, f.item).purchased).toBeUndefined();
    f.state.lists.find((l) => l.id === f.item.listId)!.mode = "transparent";
    expect(protection(f.state, f.owner, "items", f.item.id).message).toMatch(
      /purchased/i,
    );
  });

  it("does not explain secret-exchange purchases even on transparent lists", () => {
    const f = fixture();
    const { giver, giverId, exchange } = draw(f);
    const created = command(f.state, giver, "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
      exchangeId: exchange.id,
      giverId,
    }) as Reservation;
    const r = f.state.reservations.find((r) => r.id === created.id)!;
    command(f.state, giver, "reservations.update", { ...r, purchased: 1 });
    // Historical records must retain exchange secrecy regardless of list mode.
    f.state.lists.find((l) => l.id === f.item.listId)!.mode = "transparent";
    const recipient = protection(f.state, f.actors[0], "items", f.item.id);
    expect(recipient.canTrash).toBe(false);
    expect(recipient.message).toBeUndefined();
  });

  it("does not implicitly exempt app admins or allow client override flags", () => {
    const f = setup();
    f.state.people.find((p) => p.userId === f.owner.id)!.admin = true;
    expect(() =>
      f.run("items.trash", f.item, { override: true, force: true }),
    ).toThrow();
    expect(() => f.run("items.archive", f.item, { archived: true })).toThrow();
    expect(f.item.deletedAt).toBeUndefined();
  });

  it("protects a creator's own purchased gift idea", () => {
    const f = setup(0);
    const created = command(f.state, f.buyer, "items.create", {
      title: "My private gift idea",
      recipientIds: f.item.recipientIds,
      visibility: "private",
      quantity: 2,
    }) as Item;
    const idea = f.state.items.find((i) => i.id === created.id)!;
    f.reserve(idea, f.buyer, 1);
    expect(() => f.run("items.trash", idea, {}, f.buyer)).toThrow(/purchased/i);
    expect(protection(f.state, f.buyer, "items", idea.id).message).toMatch(
      /purchased/i,
    );
  });
});

it("keeps lifecycle permissions independent of hidden purchases for non-editors", () => {
  const f = setup(0);
  const before = giftView(f.state, f.actors[3], f.item).lifecycle;
  f.run("reservations.update", f.reservation, { purchased: 1 }, f.buyer);
  expect(giftView(f.state, f.actors[3], f.item).lifecycle).toEqual(before);
  expect(before).toEqual({
    canArchive: false,
    canTrash: false,
    canPurge: false,
    overrideOperations: [],
  });
});
it("explains purchased legacy Trash only to authorized purchase viewers", () => {
  const f = setup();
  f.state.lists.find((l) => l.id === f.item.listId)!.mode = "transparent";
  f.item.deletedAt = "2026-01-01T00:00:00.000Z";
  expect(protection(f.state, f.owner, "items", f.item.id).message).toContain(
    "purchased",
  );
  f.state.lists.find((l) => l.id === f.item.listId)!.mode = "surprise";
  expect(
    protection(f.state, f.owner, "items", f.item.id).message,
  ).toBeUndefined();
});
