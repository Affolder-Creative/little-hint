import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  emptyState,
  type World,
  type Actor,
  type List,
} from "../src/shared/model";
import { stamp, world } from "../src/server/domain";
import { AppContext } from "../src/client/context";
import {
  CoManagementSettings,
  PersonCoManagement,
  RecoveredCoManagementDrafts,
  recoveredDraftContent,
} from "../src/client/CoManagement";
import { ListForm } from "../src/client/forms";
import { SharingReview } from "../src/client/ListPolicyFields";

vi.mock("../src/client/pwa", () => ({ useOnline: () => true }));

function fixture() {
  const state = emptyState();
  const people = ["Alex", "Sam", "Riley"].map((name, index) => ({
    ...stamp(),
    name,
    userId: `user-${index}`,
    guardians: [],
  }));
  state.people.push(...people);
  const actors: Actor[] = people.map((p) => ({
    id: p.userId,
    name: p.name,
    email: `${p.name}@example.test`,
  }));
  const shared = {
    ...stamp(),
    name: "Family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  };
  const ownerGroup = {
    ...stamp(),
    name: "Alex's friends",
    ownerId: actors[0].id,
    memberIds: [actors[0].id],
  };
  const helperGroup = {
    ...stamp(),
    name: "Sam's friends",
    ownerId: actors[1].id,
    memberIds: [actors[1].id],
  };
  state.groups.push(shared, ownerGroup, helperGroup);
  const arrangement = {
    ...stamp(),
    personId: people[0].id,
    ownerId: actors[0].id,
    helperId: actors[1].id,
    requestedBy: actors[0].id,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    status: "active" as const,
  };
  state.coManagement.push(arrangement);
  return { state, people, actors, arrangement, ownerGroup, helperGroup };
}
function render(node: ReactNode, visible: World) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AppContext.Provider,
        {
          value: {
            world: visible,
            mutate: async () => {
              throw new Error("Rendering must not mutate");
            },
            open: vi.fn(),
            close: vi.fn(),
            toast: vi.fn(),
            dark: false,
          },
        },
        node,
      ),
    ),
  );
}

describe("wish-list co-management UI", () => {
  it("lets the owner remove helpers but gives a helper only their own leave action", () => {
    const f = fixture();
    f.state.coManagement.push({
      ...f.arrangement,
      ...stamp(),
      helperId: f.actors[2].id,
    });
    const owner = render(
      createElement(CoManagementSettings),
      world(f.state, f.actors[0]),
    );
    expect(owner.match(/Remove co-manager/g)).toHaveLength(2);
    const helper = render(
      createElement(PersonCoManagement, { personId: f.people[0].id }),
      world(f.state, f.actors[1]),
    );
    expect(helper).toContain("Riley helps Alex");
    expect(helper.match(/>Leave</g)).toHaveLength(1);
    expect(helper).not.toContain("Remove co-manager");
  });

  it("shows acceptance only to the recipient of a pending invitation", () => {
    const f = fixture();
    f.state.coManagement[0].status = "pending";
    const owner = render(
      createElement(CoManagementSettings),
      world(f.state, f.actors[0]),
    );
    expect(owner).toContain("Cancel request");
    expect(owner).not.toContain("Review and accept");
    const helper = render(
      createElement(CoManagementSettings),
      world(f.state, f.actors[1]),
    );
    expect(helper).toContain("Review and accept");
    expect(helper).toContain("Decline");
    expect(helper).not.toContain("Cancel request");
  });

  it("offers requests only for connected accounts and hides expired invitations", () => {
    const f = fixture();
    f.state.coManagement[0].status = "pending";
    f.state.coManagement[0].expiresAt = "2000-01-01T00:00:00Z";
    const helper = render(
      createElement(PersonCoManagement, { personId: f.people[0].id }),
      world(f.state, f.actors[1]),
    );
    expect(helper).toContain("Ask to co-manage");
    expect(helper).not.toContain("Review and accept");
    f.state.groups = [];
    const unconnected = render(
      createElement(PersonCoManagement, { personId: f.people[0].id }),
      world(f.state, f.actors[1]),
    );
    expect(unconnected).toBe("");
  });

  it("creates delegated lists for a fixed recipient using the owner's audiences", () => {
    const f = fixture();
    const html = render(
      createElement(ListForm, { personId: f.people[0].id }),
      world(f.state, f.actors[1]),
    );
    expect(html).toContain("This list is for Alex");
    expect(html).not.toContain('name="ownerIds"');
    expect(html).toContain(f.ownerGroup.id);
    expect(html).not.toContain(f.helperGroup.id);
    expect(html).toContain("Gifting policy locks");
  });

  it("explains immediate policy locking even when a co-managed list is unshared", () => {
    const data = new FormData();
    data.set("name", "Birthday");
    data.set("mode", "surprise");
    const html = renderToStaticMarkup(
      createElement(SharingReview, {
        data,
        audience: [],
        coManagerAccess: true,
      }),
    );
    expect(html).toContain("The account holder and co-managers");
    expect(html).toContain("permanently locks the gifting policy");
    expect(html).not.toContain("Only the list owners");
  });

  it("preserves an existing audience outside the helper's memberships", () => {
    const f = fixture();
    const legacyGroup = {
      ...stamp(),
      name: "Previous sharing",
      ownerId: f.actors[2].id,
      memberIds: [f.actors[2].id],
    };
    f.state.groups.push(legacyGroup);
    const list: List = {
      ...stamp(),
      name: "Birthday",
      description: "",
      ownerIds: [f.people[0].id],
      pendingOwnerIds: [],
      groupIds: [legacyGroup.id],
      mode: "surprise",
      modeLocked: true,
      archived: false,
    };
    f.state.lists.push(list);
    const html = render(
      createElement(ListForm, { list }),
      world(f.state, f.actors[1]),
    );
    expect(html).toContain(`checked="" value="${legacyGroup.id}"`);
    expect(html).toContain("Previously shared family group");
  });

  it("keeps recovered authored details copyable without offering publication", () => {
    const f = fixture();
    f.state.recoveredDrafts.push({
      ...stamp(),
      userId: f.actors[1].id,
      sourceId: "old-item",
      title: "Coffee set",
      description: "Blue glaze",
      url: "https://example.test/coffee",
      image: "/api/v1/media/photo",
      priceCents: 2500,
      currency: "USD",
      quantity: 2,
      tags: ["Kitchen"],
      priority: "would-love",
      descriptionRich: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Blue glaze", marks: [{ type: "bold" }] },
            ],
          },
        ],
      },
    });
    const html = render(
      createElement(RecoveredCoManagementDrafts),
      world(f.state, f.actors[1]),
    );
    expect(html).toContain("Coffee set");
    expect(html).toContain("$25.00");
    expect(html).toContain("Quantity: 2");
    expect(html).toContain("Kitchen");
    expect(html).toContain("/api/v1/media/photo");
    expect(html).toContain("Copy draft");
    expect(html).toContain("Download complete draft");
    const exported = recoveredDraftContent(f.state.recoveredDrafts[0]);
    expect(exported.descriptionRich?.content?.[0].content?.[0].marks).toEqual([
      { type: "bold" },
    ]);
    expect(exported).toMatchObject({
      priceCents: 2500,
      quantity: 2,
      tags: ["Kitchen"],
      image: "/api/v1/media/photo",
    });
    expect(exported).not.toHaveProperty("sourceId");
    expect(exported).not.toHaveProperty("userId");
    expect(html).toContain("Discard");
    expect(html).not.toContain("Publish");
    expect(
      render(
        createElement(RecoveredCoManagementDrafts),
        world(f.state, f.actors[0]),
      ),
    ).toBe("");
  });
});
