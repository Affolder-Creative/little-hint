import { expect, it } from "vitest";
import { command, giftView } from "../src/server/domain";
import { itemPage } from "../src/server/collections";
import { itemVisible } from "../src/server/domain-access";
import { wishlistFixture } from "./wishlist-fixture";
import type { GiftView, Item } from "../src/shared/model";

function fixture() {
  const f = wishlistFixture();
  const group = command(f.s, f.john, "items.create", {
    kind: "group",
    title: "Silverware",
    listId: f.list.id,
    products: [
      { title: "Forks", priceCents: 3200 },
      { title: "Spoons", priceCents: 2400 },
    ],
  }) as GiftView;
  const parent = f.s.items.find((i) => i.id === group.id)!;
  return {
    ...f,
    parent,
    products: f.s.items.filter((i) => i.parentItemId === group.id),
  };
}
it("creates independent products, one browse entry and private recipient availability", async () => {
  const f = fixture();
  expect(f.products).toHaveLength(2);
  const reserve = (item: Item, actor = f.reader) =>
    command(f.s, actor, "reservations.create", {
      itemId: item.id,
      quantity: 1,
      ordinary: true,
    });
  reserve(f.products[0]);
  reserve(f.products[1], f.sarah);
  expect(() => reserve(f.products[0], f.sarah)).toThrow(/already reserved/);
  expect(() => reserve(f.parent)).toThrow();
  const giver = giftView(f.s, f.reader, f.parent);
  expect(giver.available).toBe(0);
  expect(giver.priceCents).toBe(5600);
  const recipient = giftView(f.s, f.john, f.parent);
  expect(recipient.available).toBeUndefined();
  expect(
    recipient.products?.every(
      (p) => p.reservations === undefined && p.available === undefined,
    ),
  ).toBe(true);
  const page = await itemPage(
    f.s,
    f.reader,
    { scope: "list", id: f.list.id, available: "false", search: "Spoons" },
    async () => {},
  );
  expect(page.rows.map((i) => i.id)).toEqual([f.parent.id]);
  expect(
    page.rows[0].products?.every((p) => p.reservations === undefined),
  ).toBe(true);
});
it("wraps an existing item without changing its commitments or subscriptions", () => {
  const f = wishlistFixture();
  const original = f.add();
  f.list.itemOrder = [original.id];
  const reservation = command(f.s, f.reader, "reservations.create", {
    itemId: original.id,
    quantity: 1,
    ordinary: true,
  }) as { id: string };
  const parent = command(f.s, f.john, "items.update", {
    ...original,
    kind: "group",
    title: "A set",
    products: [{ ...original }, { title: "Another product" }],
  }) as GiftView;
  expect(parent.id).not.toBe(original.id);
  expect(original.parentItemId).toBe(parent.id);
  expect(f.s.reservations.find((r) => r.id === reservation.id)?.itemId).toBe(
    original.id,
  );
  expect(f.list.itemOrder).toEqual([parent.id]);
  expect(giftView(f.s, f.reader, original).parentTitle).toBe("A set");
});
it("inherits group archive and Trash, and removes children when permanently deleted", () => {
  const f = fixture();
  command(f.s, f.john, "items.archive", {
    id: f.parent.id,
    revision: f.parent.revision,
    archived: true,
  });
  expect(giftView(f.s, f.reader, f.products[0]).archived).toBe(true);
  command(f.s, f.john, "items.trash", {
    id: f.parent.id,
    revision: f.parent.revision,
  });
  expect(itemVisible(f.s, f.reader, f.products[0])).toBe(false);
  command(f.s, f.john, "items.restore", {
    id: f.parent.id,
    revision: f.parent.revision,
  });
  expect(itemVisible(f.s, f.reader, f.products[0])).toBe(true);
  command(f.s, f.john, "items.trash", {
    id: f.parent.id,
    revision: f.parent.revision,
  });
  command(f.s, f.john, "items.purge", {
    id: f.parent.id,
    revision: f.parent.revision,
  });
  expect(f.s.items).toHaveLength(0);
});
it("publishes grouped drafts together and retains removed product history", () => {
  const f = wishlistFixture();
  const draft = command(f.s, f.john, "items.create", {
    kind: "group",
    title: "Draft set",
    listId: f.list.id,
    publicationState: "draft",
    products: [{ title: "A" }, { title: "B" }],
  }) as GiftView;
  expect(
    itemVisible(
      f.s,
      f.reader,
      f.s.items.find((i) => i.parentItemId === draft.id)!,
    ),
  ).toBe(false);
  const published = command(f.s, f.john, "items.publish", {
    ...draft,
    visibility: "private",
    groupIds: [],
    archived: false,
  }) as GiftView;
  expect(
    published.products?.every((p) => p.publicationState === "published"),
  ).toBe(true);
  const original = f.s.items.find((i) => i.id === published.products![0].id)!;
  command(f.s, f.reader, "reservations.create", {
    itemId: original.id,
    quantity: 1,
    ordinary: true,
  });
  command(f.s, f.john, "items.update", {
    ...published,
    visibility: "private",
    groupIds: [],
    archived: false,
    products: [published.products![1]],
  });
  expect(original.deletedAt).toBeTruthy();
  expect(f.s.reservations.some((r) => r.itemId === original.id)).toBe(true);
});
it("rejects empty groups and membership injection", () => {
  const f = fixture();
  expect(() =>
    command(f.s, f.john, "items.create", {
      title: "Empty",
      kind: "group",
      listId: f.list.id,
    }),
  ).toThrow(/at least one product/);
  const unrelated = f.add();
  expect(() =>
    command(f.s, f.john, "items.update", {
      ...f.parent,
      products: [unrelated],
    }),
  ).toThrow(/not found in this group/);
});
it("locks an idea group's recipients after any child gift plan", () => {
  const f = wishlistFixture();
  const group = command(f.s, f.john, "items.create", {
    kind: "group",
    title: "Idea set",
    recipientIds: [f.people[2].id],
    visibility: "hidden",
    groupIds: [f.group.id],
    products: [{ title: "Forks" }],
  }) as GiftView;
  command(f.s, f.reader, "reservations.create", {
    itemId: group.products![0].id,
    quantity: 1,
    ordinary: true,
  });
  const saved = f.s.items.find((i) => i.id === group.id)!;
  expect(() =>
    command(f.s, f.john, "items.update", {
      ...saved,
      recipientIds: [f.people[1].id],
    }),
  ).toThrow(/no longer be changed/);
});
it("preserves a whole grouped draft when co-management access ends", () => {
  const f = wishlistFixture();
  const person = f.people[0];
  f.s.coManagement.push({
    id: crypto.randomUUID(),
    revision: 1,
    createdAt: new Date().toISOString(),
    personId: person.id,
    ownerId: f.john.id,
    helperId: f.reader.id,
    requestedBy: f.john.id,
    expiresAt: new Date().toISOString(),
    status: "active",
  });
  const draft = command(f.s, f.reader, "items.create", {
    kind: "group",
    title: "Draft set",
    listId: f.list.id,
    publicationState: "draft",
    products: [{ title: "A" }, { title: "B" }],
  }) as GiftView;
  f.s.coManagement[0].status = "ended";
  command(f.s, f.john, "items.create", {
    title: "Trigger reconciliation",
    listId: f.list.id,
  });
  const recovered = f.s.recoveredDrafts.find((d) => d.sourceId === draft.id);
  expect(recovered?.products?.map((p) => p.title)).toEqual(["A", "B"]);
  expect(f.s.recoveredDrafts).toHaveLength(1);
  expect(f.s.items.some((i) => i.parentItemId === draft.id)).toBe(false);
});
it("does not offer a set when every product is individually archived", async () => {
  const f = fixture();
  for (const product of f.products) product.archived = true;
  expect(giftView(f.s, f.reader, f.parent).available).toBe(0);
  const page = await itemPage(
    f.s,
    f.reader,
    { scope: "list", id: f.list.id },
    async () => {},
  );
  expect(page.rows).toHaveLength(0);
});
it("lets an audience admin maintain products without acquiring their private context", () => {
  const f = fixture();
  f.s.groups.find((group) => group.id === f.group.id)!.adminIds = [f.reader.id];
  const owner = f.parent.creatorId;
  command(f.s, f.reader, "items.update", {
    id: f.parent.id,
    revision: f.parent.revision,
    kind: "group",
    products: [
      { ...f.products[0], title: "Updated forks" },
      { ...f.products[1] },
      { title: "Knives" },
    ],
  });
  expect(
    f.s.items.filter((i) => i.parentItemId === f.parent.id).map((i) => i.title),
  ).toEqual(["Updated forks", "Spoons", "Knives"]);
  expect(
    f.s.items
      .filter((i) => i.parentItemId === f.parent.id)
      .every((i) => i.creatorId === owner),
  ).toBe(true);
  expect(() =>
    command(f.s, f.reader, "items.update", {
      id: f.parent.id,
      revision: f.parent.revision,
      recipientIds: [],
    }),
  ).toThrow(/private settings/);
  const single = f.add();
  expect(() =>
    command(f.s, f.reader, "items.update", {
      id: single.id,
      revision: single.revision,
      kind: "group",
      products: [single],
    }),
  ).toThrow(/grouping/);
  f.group.memberIds = f.group.memberIds.filter((id) => id !== f.reader.id);
  expect(itemVisible(f.s, f.reader, f.products[0])).toBe(false);
});
