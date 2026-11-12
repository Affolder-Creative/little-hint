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
