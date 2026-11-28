import { describe, expect, it } from "vitest";
import { fixture } from "./privacy-fixture";
import { commandWithAudience } from "./discussion-command";
import { command, giftView, world } from "../src/server/domain";
import {
  migrateListPolicies,
  reconcileListPolicies,
} from "../src/server/list-policy";
import type { Item } from "../src/shared/model";
import { listIcons, isListIconKey } from "../src/shared/list-icons";

describe("activity-based gifting policy", () => {
  it("allows either mode before activity, including a shared list with a reveal date", () => {
    const f = fixture("2099-12-25");
    const list = f.lists[0];
    for (const mode of ["transparent", "surprise"] as const) {
      command(f.state, f.actors[0], "lists.update", { ...list, mode });
      expect(list).toMatchObject({
        mode,
        modeLocked: false,
        revealPolicyLocked: true,
      });
    }
    expect(() =>
      command(f.state, f.actors[0], "lists.update", {
        ...list,
        revealAfter: null,
      }),
    ).toThrow();
  });

  it.each(["reservation", "offer", "discussion", "purchase"])(
    "permanently locks on first %s without disclosing its cause",
    (kind) => {
      const f = fixture();
      const list = f.lists[0];
      const before = giftView(f.state, f.actors[0], f.item);
      if (kind === "reservation")
        commandWithAudience(f.state, f.actors[1], "reservations.create", {
          itemId: f.item.id,
          quantity: 1,
        });
      if (kind === "offer")
        commandWithAudience(
          f.state,
          f.actors[1],
          "contribution-offers.create",
          { itemId: f.item.id, amountCents: 2500 },
        );
      if (kind === "discussion")
        commandWithAudience(f.state, f.actors[1], "comments.create", {
          itemId: f.item.id,
          body: "An invisible plan",
        });
      if (kind === "purchase") {
        command(f.state, f.actors[1], "spending.settings", {
          enabled: true,
          summaries: true,
        });
        commandWithAudience(f.state, f.actors[1], "spending.purchase", {
          itemId: f.item.id,
          itemRevision: f.item.revision,
          title: f.item.title,
          recipientIds: list.ownerIds,
          amountCents: 1000,
          date: "2026-11-27",
          quantity: 1,
        });
      }
      expect(list.modeLocked).toBe(true);
      // Action availability is the explicitly accepted indirect purchase signal.
      expect({
        ...giftView(f.state, f.actors[0], f.item),
        lifecycle: undefined,
      }).toEqual({ ...before, lifecycle: undefined });
      const dto = world(f.state, f.actors[0]).lists.find(
        (l) => l.id === list.id,
      )!;
      expect(dto.modeLocked).toBe(true);
      expect(dto).not.toHaveProperty("lockReason");
      expect(dto).not.toHaveProperty("lockedAt");
      // Physical deletion also cannot reverse the historical promise.
      f.state.reservations = [];
      f.state.contributions = [];
      f.state.contributionOffers = [];
      f.state.comments = [];
      command(f.state, f.actors[0], "lists.update", {
        ...list,
        groupIds: [],
        archived: true,
      });
      expect(() =>
        command(f.state, f.actors[0], "lists.update", {
          ...list,
          mode: "transparent",
        }),
      ).toThrow("Gifting mode can no longer be changed.");
    },
  );

  it("does not lock for wishes, drafts, views, watches or private idea organization", () => {
    const f = fixture();
    command(f.state, f.actors[0], "items.create", {
      listId: f.lists[0].id,
      title: "Unfinished wish",
      publicationState: "draft",
    });
    command(f.state, f.actors[1], "watches.update", {
      itemId: f.item.id,
      watching: true,
    });
    command(f.state, f.actors[1], "items.create", {
      title: "Private thought",
      recipientIds: f.lists[0].ownerIds,
      visibility: "private",
      spendingAllocations: [
        {
          recipientId: f.lists[0].ownerIds[0],
          share: 1,
          listId: f.lists[0].id,
        },
      ],
    });
    world(f.state, f.actors[1]);
    reconcileListPolicies(f.state);
    expect(f.lists[0].modeLocked).toBe(false);
  });

  it.each([
    "reservations.create",
    "contribution-offers.create",
    "spending.purchase",
  ])(
    "rejects missing or stale reviewed mode for %s without activity",
    (action) => {
      const f = fixture();
      command(f.state, f.actors[1], "spending.settings", {
        enabled: true,
        summaries: true,
      });
      command(f.state, f.actors[0], "lists.update", {
        ...f.lists[0],
        mode: "transparent",
      });
      const body = {
        itemId: f.item.id,
        itemRevision: f.item.revision,
        quantity: 1,
        amountCents: 1000,
        title: f.item.title,
        recipientIds: f.lists[0].ownerIds,
        date: "2026-11-27",
      };
      for (const expectedListMode of [undefined, "surprise"]) {
        expect(() =>
          command(f.state, f.actors[1], action, { ...body, expectedListMode }),
        ).toThrow("Gifting settings changed.");
        expect(f.lists[0].modeLocked).toBe(false);
        expect(f.state.reservations).toHaveLength(0);
        expect(f.state.contributionOffers).toHaveLength(0);
      }
      command(f.state, f.actors[1], action, {
        ...body,
        expectedListMode: "transparent",
      });
      expect(f.lists[0].modeLocked).toBe(true);
    },
  );

  it("allows only event managers to change every participant's mode, then locks the whole event", () => {
    const f = fixture();
    const created = command(f.state, f.actors[0], "group-events.create", {
      groupId: f.group.id,
      name: "Celebration",
      mode: "surprise",
      participantIds: f.state.people.slice(0, 2).map((p) => p.id),
    }) as { id: string };
    const event = f.state.groupEvents.find((e) => e.id === created.id)!;
    const lists = f.state.lists.filter((l) => l.groupEventId === event.id);
    expect(() =>
      command(f.state, f.actors[1], "group-events.update", {
        ...event,
        mode: "transparent",
      }),
    ).toThrow();
    expect(() =>
      command(f.state, f.actors[0], "lists.update", {
        ...lists[0],
        mode: "transparent",
      }),
    ).toThrow();
    command(f.state, f.actors[0], "groups.event-leaders", {
      groupId: f.group.id,
      revision: f.group.revision,
      userIds: [f.actors[2].id],
    });
    command(f.state, f.actors[2], "group-events.update", {
      ...event,
      mode: "transparent",
    });
    expect(lists.every((l) => l.mode === "transparent" && !l.modeLocked)).toBe(
      true,
    );
    command(f.state, f.actors[2], "group-events.update", {
      ...event,
      mode: "surprise",
    });
    const item = command(f.state, f.actors[0], "items.create", {
      listId: lists[0].id,
      title: "Event wish",
    }) as Item;
    command(f.state, f.actors[3], "reservations.create", {
      itemId: item.id,
      quantity: 1,
      expectedListMode: "surprise",
    });
    expect(event.modeLocked).toBe(true);
    expect(lists.every((l) => l.modeLocked)).toBe(true);
    command(f.state, f.actors[0], "group-events.update", {
      ...event,
      participantIds: [f.state.people[1].id],
    });
    expect(() =>
      command(f.state, f.actors[2], "group-events.update", {
        ...event,
        mode: "transparent",
      }),
    ).toThrow("Gifting mode can no longer be changed.");
  });

  it("preserves legacy locks without locking untouched private lists", () => {
    const f = fixture();
    f.lists[0].modeLocked = true;
    f.lists[1].groupIds = [];
    delete f.lists[1].revealPolicyLocked;
    migrateListPolicies(f.state);
    expect(f.lists[0]).toMatchObject({
      modeLocked: true,
      revealPolicyLocked: true,
    });
    expect(f.lists[1]).toMatchObject({
      modeLocked: false,
      revealPolicyLocked: false,
    });
  });
});

describe("list icons", () => {
  it("persists only bundled keys and allows reset without changing privacy", () => {
    const f = fixture();
    const list = f.lists[0];
    expect(list.iconKey).toBeUndefined();
    for (const icon of listIcons) expect(isListIconKey(icon.key)).toBe(true);
    command(f.state, f.actors[0], "lists.update", {
      ...list,
      iconKey: "fire-extinguisher",
    });
    expect(
      world(f.state, f.actors[0]).lists.find((l) => l.id === list.id)?.iconKey,
    ).toBe("fire-extinguisher");
    expect(() =>
      command(f.state, f.actors[0], "lists.update", {
        ...list,
        iconKey: "unknown",
      }),
    ).toThrow();
    command(f.state, f.actors[0], "lists.update", { ...list, iconKey: null });
    expect(list.iconKey).toBeNull();
    expect(list.modeLocked).toBe(false);
  });
});
