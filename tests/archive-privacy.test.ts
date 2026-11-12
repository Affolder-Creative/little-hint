import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./privacy-fixture";
import {
  itemVisible,
  getItem,
  reconcileAccess,
} from "../src/server/domain-access";
import { command, world } from "../src/server/domain";
import { itemPage } from "../src/server/collections";
import { accountExport } from "../src/server/account-export";
import { encrypt, hideArchivedItemsForState } from "../src/server/settings";
import { stamp } from "../src/server/domain-common";
const key = "HIDE_ARCHIVED_ITEMS_FROM_OTHERS";
afterEach(() => vi.unstubAllEnvs());
describe("archive privacy", () => {
  it("defaults off and reads saved settings and environment overrides", () => {
    const f = fixture();
    vi.stubEnv(key, "");
    vi.stubEnv(
      "SETTINGS_ENCRYPTION_KEY",
      Buffer.alloc(32, 7).toString("base64"),
    );
    expect(hideArchivedItemsForState(f.state)).toBe(false);
    f.state.settings.push({ ...stamp(), key, encrypted: encrypt("true") });
    expect(hideArchivedItemsForState(f.state)).toBe(true);
    vi.stubEnv(key, "false");
    expect(hideArchivedItemsForState(f.state)).toBe(false);
  });
  it.each(["item", "list", "scheduled"])(
    "protects %s archives, owners and managers retain access",
    async (kind) => {
      const f = fixture();
      vi.stubEnv(key, "true");
      expect(itemVisible(f.state, f.actors[1], f.item)).toBe(true);
      if (kind === "item") f.item.archived = true;
      if (kind === "list") f.lists[0].archived = true;
      if (kind === "scheduled") f.lists[0].archiveAfter = "2000-01-01";
      f.state.people[2].admin = true;
      for (const actor of f.actors.slice(1)) {
        expect(itemVisible(f.state, actor, f.item)).toBe(false);
        expect(() => getItem(f.state, actor, f.item.id)).toThrow(
          "Item not found",
        );
        expect(world(f.state, actor).items).not.toContainEqual(
          expect.objectContaining({ id: f.item.id }),
        );
      }
      expect(itemVisible(f.state, f.actors[0], f.item)).toBe(true);
      f.state.people[0].guardians.push(f.actors[3].id);
      expect(itemVisible(f.state, f.actors[3], f.item)).toBe(true);
      f.lists[0].ownerIds.push(f.state.people[2].id);
      expect(itemVisible(f.state, f.actors[2], f.item)).toBe(true);
      const page = await itemPage(
        f.state,
        f.actors[1],
        { scope: "list", id: f.lists[0].id, status: "archived" },
        async () => {},
      );
      expect(page.rows).toEqual([]);
      expect(page.collectionTotal).toBe(0);
      expect(page.tags).toEqual([]);
      vi.stubEnv(key, "false");
      expect(itemVisible(f.state, f.actors[1], f.item)).toBe(true);
      vi.stubEnv(key, "true");
      f.item.archived = false;
      f.lists[0].archived = false;
      f.lists[0].archiveAfter = null;
      expect(itemVisible(f.state, f.actors[1], f.item)).toBe(true);
    },
  );
  it("hides shared ideas except from their creator and never publishes Only me ideas", () => {
    const f = fixture();
    const idea = {
      ...f.item,
      listId: undefined,
      creatorId: f.actors[1].id,
      groupIds: [f.group.id],
      visibility: "visible" as const,
      archived: true,
    };
    vi.stubEnv(key, "true");
    expect(itemVisible(f.state, f.actors[1], idea)).toBe(true);
    expect(itemVisible(f.state, f.actors[0], idea)).toBe(false);
    vi.stubEnv(key, "false");
    expect(itemVisible(f.state, f.actors[0], idea)).toBe(true);
    expect(
      itemVisible(f.state, f.actors[0], { ...idea, visibility: "private" }),
    ).toBe(false);
  });
  it("preserves commitments and history but still reconciles actual sharing loss", () => {
    const f = fixture();
    vi.stubEnv(key, "true");
    command(f.state, f.actors[1], "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
    });
    const r = f.state.reservations[0];
    f.state.contributions.push({
      ...stamp(),
      reservationId: r.id,
      userId: f.actors[2].id,
      amountCents: 100,
      status: "pledged",
    });
    f.item.archived = true;
    reconcileAccess(f.state);
    expect(r.quantity).toBe(1);
    expect(r.former).not.toBe(true);
    expect(f.state.contributions[0].status).toBe("pledged");
    expect(
      accountExport(f.state, f.actors[1]).reservations[0].titleSnapshot,
    ).toBe(f.item.title);
    const buying = world(f.state, f.actors[1]).buying[0];
    expect(buying.item).toBeUndefined();
    expect(buying.planActions?.canRecordPurchase).toBe(false);
    f.lists[0].groupIds = [];
    reconcileAccess(f.state);
    expect(r.quantity).toBe(0);
    expect(r.former).toBe(true);
    expect(f.state.contributions[0].status).toBe("cancelled");
  });
});

const setPrivacy = (
  f: ReturnType<typeof fixture>,
  user: number,
  hideArchivedItems: boolean,
) =>
  command(f.state, f.actors[user], "preferences.archive-privacy", {
    hideArchivedItems,
  });

describe("personal archive privacy", () => {
  it.each([false, true])(
    "combines personal choice with global=%s without forcing disclosure",
    (forced) => {
      const f = fixture();
      vi.stubEnv(key, String(forced));
      f.item.archived = true;
      expect(itemVisible(f.state, f.actors[1], f.item)).toBe(!forced);
      setPrivacy(f, 0, true);
      expect(itemVisible(f.state, f.actors[1], f.item)).toBe(false);
      expect(itemVisible(f.state, f.actors[0], f.item)).toBe(true);
      expect(world(f.state, f.actors[0]).archivePrivacyForced).toBe(forced);
      vi.stubEnv(key, "false");
      expect(itemVisible(f.state, f.actors[1], f.item)).toBe(false);
      setPrivacy(f, 0, false);
      expect(itemVisible(f.state, f.actors[1], f.item)).toBe(true);
    },
  );
  it("uses any current joint owner, independently of authors and viewers", () => {
    const f = fixture();
    vi.stubEnv(key, "false");
    f.item.archived = true;
    setPrivacy(f, 1, true);
    expect(itemVisible(f.state, f.actors[1], f.item)).toBe(true);
    f.lists[0].ownerIds.push(f.state.people[1].id);
    expect(itemVisible(f.state, f.actors[2], f.item)).toBe(false);
    expect(itemVisible(f.state, f.actors[0], f.item)).toBe(true);
    f.lists[0].ownerIds = [f.state.people[0].id];
    expect(itemVisible(f.state, f.actors[2], f.item)).toBe(true);
  });
  it("uses the designated managed-profile owner and follows transfers and takeover", () => {
    const f = fixture();
    vi.stubEnv(key, "false");
    f.item.archived = true;
    const p = f.state.people[0];
    delete p.userId;
    p.guardians = [f.actors[1].id, f.actors[2].id];
    p.managedOwnerId = f.actors[1].id;
    setPrivacy(f, 2, true);
    expect(itemVisible(f.state, f.actors[3], f.item)).toBe(true);
    p.managedOwnerId = f.actors[2].id;
    expect(itemVisible(f.state, f.actors[3], f.item)).toBe(false);
    expect(itemVisible(f.state, f.actors[1], f.item)).toBe(true);
    p.userId = f.actors[0].id;
    p.guardians = [];
    expect(itemVisible(f.state, f.actors[3], f.item)).toBe(true);
  });
  it("uses the idea creator's preference, not its recipient", () => {
    const f = fixture();
    vi.stubEnv(key, "false");
    const idea = {
      ...f.item,
      listId: undefined,
      archived: true,
      creatorId: f.actors[1].id,
      groupIds: [f.group.id],
      visibility: "visible" as const,
    };
    setPrivacy(f, 0, true);
    expect(itemVisible(f.state, f.actors[0], idea)).toBe(true);
    setPrivacy(f, 1, true);
    expect(itemVisible(f.state, f.actors[0], idea)).toBe(false);
    expect(itemVisible(f.state, f.actors[1], idea)).toBe(true);
  });
  it("keeps notification preferences separate and exports the personal choice", () => {
    const f = fixture();
    vi.stubEnv(key, "true");
    setPrivacy(f, 0, true);
    command(f.state, f.actors[0], "preferences.update", {
      events: ["wishlist"],
      email: false,
    });
    expect(f.state.preferences[0].hideArchivedItems).toBe(true);
    setPrivacy(f, 0, false);
    expect(f.state.preferences[0].email).toBe(false);
    expect(f.state.preferences[0].events).toEqual(["wishlist"]);
    expect(
      accountExport(f.state, f.actors[0]).preferences?.hideArchivedItems,
    ).toBe(false);
    expect(() =>
      command(f.state, f.actors[0], "preferences.archive-privacy", {
        hideArchivedItems: true,
        userId: f.actors[1].id,
      }),
    ).toThrow();
    expect(f.state.preferences).toHaveLength(1);
  });
});
