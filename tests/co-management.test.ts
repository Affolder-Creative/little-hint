import { commandWithAudience as command } from "./discussion-command";
import { describe, it, expect } from "vitest";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world } from "../src/server/domain";
import { listCanEdit } from "../src/server/co-management";
import {
  canEdit,
  canShop,
  controls,
  draftAccess,
} from "../src/server/domain-access";
import { accountExport } from "../src/server/account-export";
import { inbox } from "../src/server/activity";
import type { List, Item } from "../src/shared/model";
function setup() {
  const f = stagingFixtures();
  const owner = f.actors[0],
    helper = f.actors[1];
  const person = f.state.people.find((p) => p.userId === owner.id)!;
  const list = command(f.state, owner, "lists.create", {
    name: "Co-managed",
    ownerIds: [person.id],
    groupIds: [],
    mode: "surprise",
  }) as List;
  const request = command(f.state, owner, "co-management.request", {
    personId: person.id,
    helperId: helper.id,
  }) as { id: string };
  return { ...f, owner, helper, person, list, request };
}
const wish = (list: List, title = "Wish") => ({
  listId: list.id,
  title,
  description: "Personal text",
  url: "",
  image: "",
  priceCents: null,
  quantity: 1,
  recipientIds: [],
  groupIds: [],
  tags: [],
  visibility: "visible",
});
function accept(f: ReturnType<typeof setup>) {
  command(f.state, f.helper, "co-management.respond", {
    id: f.request.id,
    accept: true,
  });
}
describe("self-managed wish-list co-management", () => {
  it("requires mutual consent, uses separate authority, locks reveal policy, and permits shopping", () => {
    const f = setup();
    expect(listCanEdit(f.state, f.helper, f.list)).toBe(false);
    accept(f);
    expect(listCanEdit(f.state, f.helper, f.list)).toBe(true);
    expect(controls(f.state, f.helper, f.person.id)).toBe(false);
    expect(f.list.modeLocked).toBe(false);
    expect(f.list.revealPolicyLocked).toBe(true);
    const view = command(
      f.state,
      f.helper,
      "items.create",
      wish(f.list),
    ) as Item;
    const item = f.state.items.find((i) => i.id === view.id)!;
    expect(canEdit(f.state, f.helper, item)).toBe(true);
    expect(canShop(f.state, f.helper, item)).toBe(true);
    expect(
      world(f.state, f.owner).items.find((i) => i.id === item.id)?.creatorName,
    ).toBe(f.helper.name);
    command(f.state, f.helper, "lists.update", {
      ...f.list,
      mode: "transparent",
    });
    expect(f.list.mode).toBe("transparent");
    expect(() =>
      command(f.state, f.helper, "people.update", {
        id: f.person.id,
        revision: f.person.revision,
        name: "Hijacked",
      }),
    ).toThrow();
  });
  it("shares through owner groups and preserves existing audiences on unrelated changes", () => {
    const f = setup();
    accept(f);
    const group = f.state.groups.find(
      (g) =>
        g.memberIds.includes(f.owner.id) && g.memberIds.includes(f.helper.id),
    )!;
    group.memberIds = group.memberIds.filter((id) => id !== f.helper.id);
    command(f.state, f.helper, "lists.update", {
      ...f.list,
      groupIds: [group.id],
      description: "Shared",
    });
    expect(f.list.groupIds).toContain(group.id);
    expect(world(f.state, f.helper).groups.some((g) => g.id === group.id)).toBe(
      false,
    );
    expect(
      world(f.state, f.helper)
        .coManagement!.audiences.find((a) => a.personId === f.person.id)!
        .groups.some((g) => g.id === group.id),
    ).toBe(true);
    expect(listCanEdit(f.state, f.helper, f.list)).toBe(true);
  });
  it("keeps personal drafts private and recovers only helper work after revocation", () => {
    const f = setup();
    accept(f);
    const own = command(f.state, f.owner, "items.create", {
      ...wish(f.list, "Owner draft"),
      publicationState: "draft",
    }) as Item;
    const theirs = command(f.state, f.helper, "items.create", {
      ...wish(f.list, "Helper draft"),
      publicationState: "draft",
    }) as Item;
    expect(
      draftAccess(
        f.state,
        f.helper,
        f.state.items.find((i) => i.id === own.id)!,
      ),
    ).toBe(false);
    expect(
      draftAccess(
        f.state,
        f.owner,
        f.state.items.find((i) => i.id === theirs.id)!,
      ),
    ).toBe(false);
    command(f.state, f.owner, "co-management.end", { id: f.request.id });
    expect(
      world(f.state, f.helper).coManagement!.recoveredDrafts.map(
        (d) => d.title,
      ),
    ).toEqual(["Helper draft"]);
    expect(world(f.state, f.owner).coManagement!.recoveredDrafts).toEqual([]);
    expect(
      accountExport(f.state, f.helper).items.some((i) => i.id === own.id),
    ).toBe(false);
  });
  it("excludes pending and joint lists and prevents permanent deletion", () => {
    const f = setup();
    accept(f);
    const item = command(
      f.state,
      f.helper,
      "items.create",
      wish(f.list),
    ) as Item;
    const actual = f.state.items.find((i) => i.id === item.id)!;
    command(f.state, f.helper, "items.trash", {
      id: item.id,
      revision: actual.revision,
    });
    expect(() =>
      command(f.state, f.helper, "items.purge", {
        id: item.id,
        revision: actual.revision,
      }),
    ).toThrow("Only the account holder");
    f.list.pendingOwnerIds.push(
      f.state.people.find((p) => p.userId === f.helper.id)!.id,
    );
    expect(listCanEdit(f.state, f.helper, f.list)).toBe(false);
    f.list.pendingOwnerIds = [];
    expect(listCanEdit(f.state, f.helper, f.list)).toBe(true);
  });
  it("records content activity for the owner without surprise gift details", () => {
    const f = setup();
    accept(f);
    command(f.state, f.helper, "items.create", wish(f.list));
    expect(
      f.state.notices.some(
        (n) => n.userId === f.owner.id && n.coManagement?.content,
      ),
    ).toBe(true);
    expect(JSON.stringify(inbox(f.state, f.owner))).toContain("updated a wish");
    expect(
      f.state.notices
        .filter((n) => n.coManagement)
        .every((n) => n.deliveryChannels?.length === 0),
    ).toBe(true);
  });
});

describe("delegation boundaries and lifecycle", () => {
  it("rejects helper-only audiences while allowing eligible event wish edits", () => {
    const f = setup();
    accept(f);
    const helperGroup = command(f.state, f.helper, "groups.create", {
      name: "Helper contacts",
    }) as { id: string };
    expect(() =>
      command(f.state, f.helper, "lists.update", {
        ...f.list,
        groupIds: [helperGroup.id],
      }),
    ).toThrow("account holder");
    const group = command(f.state, f.owner, "groups.create", {
      name: "Owner event group",
    }) as { id: string };
    const event = command(f.state, f.owner, "group-events.create", {
      groupId: group.id,
      name: "Birthday",
      mode: "surprise",
      participantIds: [f.person.id],
    }) as { id: string };
    const list = f.state.lists.find((l) => l.groupEventId === event.id)!;
    expect(() =>
      command(f.state, f.helper, "items.create", wish(list)),
    ).not.toThrow();
    expect(() =>
      command(f.state, f.helper, "lists.update", {
        ...list,
        name: "Changed event",
      }),
    ).toThrow("group event");
    expect(() =>
      command(f.state, f.helper, "lists.trash", {
        id: list.id,
        revision: list.revision,
      }),
    ).toThrow();
    expect(
      world(f.state, f.helper).groupEvents.some((e) => e.id === event.id),
    ).toBe(false);
  });
  it("preserves purchased records but releases unpurchased commitments after last access ends", () => {
    const f = setup();
    accept(f);
    const item = command(f.state, f.helper, "items.create", {
      ...wish(f.list),
      quantity: 2,
    }) as Item;
    const reservation = command(f.state, f.helper, "reservations.create", {
      itemId: item.id,
      ordinary: true,
      quantity: 2,
    }) as { id: string };
    const stored = f.state.reservations.find((r) => r.id === reservation.id)!;
    command(f.state, f.helper, "reservations.update", {
      ...stored,
      purchased: 1,
    });
    command(f.state, f.owner, "co-management.end", { id: f.request.id });
    expect(stored.quantity).toBe(1);
    expect(stored.purchased).toBe(1);
    expect(stored.former).toBe(true);
    expect(world(f.state, f.helper).lists.some((l) => l.id === f.list.id)).toBe(
      false,
    );
    expect(
      accountExport(f.state, f.helper).items.some((i) => i.id === item.id),
    ).toBe(false);
  });
  it("updates actual last editor even after the last helper departs", () => {
    const f = setup();
    accept(f);
    const view = command(
      f.state,
      f.helper,
      "items.create",
      wish(f.list),
    ) as Item;
    command(f.state, f.owner, "co-management.end", { id: f.request.id });
    const item = f.state.items.find((i) => i.id === view.id)!;
    const changed = command(f.state, f.owner, "items.update", {
      ...item,
      title: "Owner updated",
    }) as { lastEditorName: string };
    expect(item.lastEditorId).toBe(f.owner.id);
    expect(changed.lastEditorName).toBe(f.owner.name);
    expect(
      world(f.state, f.owner).items.find((i) => i.id === item.id)
        ?.lastEditorName,
    ).toBe(f.owner.name);
  });
  it("names actual sharing changes in owner activity", () => {
    const f = setup();
    accept(f);
    const group = f.state.groups.find((g) => g.memberIds.includes(f.owner.id))!;
    command(f.state, f.helper, "lists.update", {
      ...f.list,
      groupIds: [group.id],
    });
    expect(
      f.state.notices.some(
        (n) =>
          n.userId === f.owner.id &&
          n.coManagement?.message.includes(`shared with ${group.name}`),
      ),
    ).toBe(true);
  });
});
