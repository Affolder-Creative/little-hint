import { closeAccountData } from "../src/server/account-closure-domain";
import { expect, it, vi } from "vitest";
vi.mock("../src/server/db", () => ({
  hydrateCollectionItems: vi.fn(async () => {}),
  readCollectionState: vi.fn(),
}));
import { wishlistFixture } from "./wishlist-fixture";
import { command, world, stamp, idempotent } from "../src/server/domain";
import { itemVisible, canShop } from "../src/server/domain-access";
import { accountExport } from "../src/server/account-export";
import { accountCsv } from "../src/server/account-csv";
import { itemPage } from "../src/server/collections";
import { managementCommand, trash } from "../src/server/management";
import { takeOverProfile } from "../src/server/profile-takeover";
import { priceEligible } from "../src/server/prices";
import type { Item } from "../src/shared/model";
const create = (f: ReturnType<typeof wishlistFixture>) =>
  command(f.s, f.john, "items.create", {
    title: "Unpublished telescope",
    listId: f.list.id,
    publicationState: "draft",
  }) as Item;
it("keeps ordinary users' drafts private from joint owners, exports, counts and Trash", async () => {
  const f = wishlistFixture();
  f.list.ownerIds.push(f.people[2].id);
  create(f);
  const i = f.s.items[0];
  expect(itemVisible(f.s, f.john, i)).toBe(true);
  expect(itemVisible(f.s, f.sarah, i)).toBe(false);
  expect(world(f.s, f.reader).items).toEqual([]);
  expect(accountExport(f.s, f.sarah).items).toEqual([]);
  expect(accountCsv(f.s, f.sarah, "wishes")).not.toContain(i.title);
  expect(
    (await itemPage(f.s, f.sarah, { scope: "list", id: f.list.id })).total,
  ).toBe(0);
  expect(
    (await itemPage(f.s, f.john, { publicationState: "draft" })).total,
  ).toBe(1);
  expect((await itemPage(f.s, f.john, {})).total).toBe(0);
  expect(() => managementCommand(f.s, f.sarah, "items.trash", i)).toThrow();
  managementCommand(f.s, f.john, "items.trash", i);
  expect(trash(f.s, f.sarah)).toEqual([]);
});
it("publishes once, preserves normal creation, rejects stale edits and unpublishing", () => {
  const f = wishlistFixture();
  f.follow("list", f.list.id);
  const i = create(f);
  expect(f.s.notices.filter((n) => n.event === "wishlist")).toHaveLength(0);
  expect(() =>
    command(f.s, f.john, "items.publish", { ...i, revision: 999 }),
  ).toThrow();
  const payload = { ...i, description: "Reviewed", archived: false };
  idempotent(f.s, f.john, "publish-draft-123456", "items.publish", payload);
  idempotent(f.s, f.john, "publish-draft-123456", "items.publish", payload);
  const saved = f.s.items[0];
  expect(saved.publicationState).toBe("published");
  expect(saved.description).toBe("Reviewed");
  expect(itemVisible(f.s, f.reader, saved)).toBe(true);
  expect(f.s.notices.filter((n) => n.event === "wishlist")).toHaveLength(1);
  command(f.s, f.john, "items.update", { ...saved, publicationState: "draft" });
  expect(saved.publicationState).toBe("published");
  expect(f.add().publicationState).toBe("published");
});
it("allows current guardians, blocks shopping and transfers draft ownership on takeover", () => {
  const f = wishlistFixture();
  const managed = {
    ...stamp(),
    name: "Child",
    guardians: [f.john.id, f.sarah.id],
  };
  f.s.people.push(managed);
  f.list.ownerIds = [managed.id];
  const i = create(f);
  expect(itemVisible(f.s, f.sarah, i)).toBe(true);
  expect(canShop(f.s, f.sarah, i)).toBe(false);
  expect(priceEligible(f.s, i)).toBe(false);
  managed.guardians = [f.sarah.id];
  expect(itemVisible(f.s, f.john, i)).toBe(false);
  takeOverProfile(f.s, f.reader, managed, "account");
  const saved = f.s.items[0];
  expect(saved.creatorId).toBe(f.john.id);
  expect(saved.draftOwnerId).toBe(f.reader.id);
  expect(itemVisible(f.s, f.reader, saved)).toBe(true);
  expect(itemVisible(f.s, f.john, saved)).toBe(false);
});
it("does not publish drafts in archived lists", () => {
  const f = wishlistFixture();
  const i = create(f);
  f.list.archived = true;
  expect(() => command(f.s, f.john, "items.publish", i)).toThrow();
  expect(f.s.items[0].publicationState).toBe("draft");
});
it("retires an import draft when saved privately without notifying followers", () => {
  const f = wishlistFixture();
  f.follow("list", f.list.id);
  const job: any = command(f.s, f.john, "imports.create", {
    url: "https://example.com/telescope",
    draft: {
      listId: f.list.id,
      fields: { title: "Import draft" },
      touched: ["title"],
    },
  });
  command(f.s, f.john, "items.create", {
    title: "Reviewed import",
    url: job.url,
    listId: f.list.id,
    publicationState: "draft",
    importId: job.id,
    importDraftRevision: job.draft.revision,
  });
  expect(f.s.imports[0].draft?.state).toBe("published");
  expect(f.s.items[0].title).toBe("Reviewed import");
  expect(itemVisible(f.s, f.reader, f.s.items[0])).toBe(false);
  expect(f.s.notices.filter((n) => n.event === "wishlist")).toEqual([]);
});
it("keeps legacy items visible and hidden drafts out of duplicate warnings", () => {
  const f = wishlistFixture();
  f.list.ownerIds.push(f.people[2].id);
  const draft = create(f);
  const other: any = command(f.s, f.sarah, "items.create", {
    title: draft.title,
    listId: f.list.id,
  });
  expect(other.duplicate).toBeUndefined();
  delete f.s.items[1].publicationState;
  expect(itemVisible(f.s, f.reader, f.s.items[1])).toBe(true);
});

it("account closure preserves other people's trashed drafts and removes orphaned joint-list drafts", () => {
  const f = wishlistFixture();
  f.list.ownerIds.push(f.people[2].id);
  create(f);
  const privateDraft = f.s.items[0];
  const other: any = command(f.s, f.sarah, "items.create", {
    title: "Other user's draft",
    listId: f.list.id,
    publicationState: "draft",
  });
  managementCommand(f.s, f.sarah, "items.trash", other);
  f.s.groups[0].ownerId = f.reader.id;
  closeAccountData(f.s, f.john, { keepSharedContent: true });
  expect(f.s.items.some((i) => i.id === privateDraft.id)).toBe(false);
  expect(f.s.items.some((i) => i.id === other.id)).toBe(true);
});
