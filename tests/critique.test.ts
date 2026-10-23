import { describe, expect, it } from "vitest";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { command, stamp, world } from "../src/server/domain";
import type { Exchange, Invitation } from "../src/shared/model";

describe("P1 coordination permissions", () => {
  it("projects contributor identities only to the contributor and purchaser", () => {
    const { state, actors } = stagingFixtures();
    const purchaser = world(state, actors[1]);
    expect(
      purchaser.contributionHistory.map((row) => row.contributorName),
    ).toEqual(expect.arrayContaining(["Jamie Chen", "Riley Morgan"]));
    expect(
      purchaser.contributionHistory.every(
        (row) => row.purchaserName === "Sam Morgan",
      ),
    ).toBe(true);
    expect(world(state, actors[0]).contributionHistory).toEqual([]);
    expect(
      world(state, actors[2]).contributionHistory.every(
        (row) => row.contribution.userId === actors[2].id,
      ),
    ).toBe(true);
  });
  it("shows invitation context only after recipient/owner authorization", () => {
    const { state, actors } = stagingFixtures();
    const invitation = command(state, actors[0], "groups.invite", {
      groupId: state.groups[0].id,
      email: actors[4].email,
    }) as Invitation;
    const incoming = world(state, actors[4]).invitations.find(
      (i) => i.id === invitation.id,
    )!;
    expect(incoming).toMatchObject({
      groupName: "Morgan family",
      inviterName: "Alex Morgan",
    });
    expect(
      world(state, actors[1]).invitations.some((i) => i.id === invitation.id),
    ).toBe(false);
    expect(
      world(state, actors[4]).groups.some((g) => g.id === state.groups[0].id),
    ).toBe(false);
    invitation.expiresAt = "2000-01-01";
    expect(
      world(state, actors[4]).invitations.some((i) => i.id === invitation.id),
    ).toBe(false);
  });
  it("identifies claims without granting access to the target profile", () => {
    const { state, actors } = stagingFixtures();
    const profile = { ...stamp(), name: "Avery", guardians: [actors[0].id] };
    state.people.push(profile);
    command(state, actors[0], "people.link", {
      id: profile.id,
      email: actors[4].email,
    });
    const link = world(state, actors[4]).links.find(
      (l) => l.targetId === profile.id,
    )!;
    expect(link).toMatchObject({
      targetName: "Avery",
      requesterName: "Alex Morgan",
    });
    expect(link).not.toHaveProperty("tokenHash");
    expect(world(state, actors[1]).links.some((l) => l.id === link.id)).toBe(
      false,
    );
  });
  it("edits only the organizer's current draft and preserves a completed draw", () => {
    const { state, actors } = stagingFixtures();
    const input = {
      name: "Draft",
      groupId: state.groups[0].id,
      participantIds: state.people.slice(0, 4).map((p) => p.id),
      count: 1,
      excludeHousehold: false,
      exclusions: [],
    };
    const { id } = command(state, actors[0], "exchanges.create", input) as {
      id: string;
    };
    const edit = { ...input, id, revision: 1, name: "Reviewed" };
    expect(() => command(state, actors[1], "exchanges.update", edit)).toThrow(
      "Exchange not found",
    );
    command(state, actors[0], "exchanges.update", edit);
    expect(() => command(state, actors[0], "exchanges.update", edit)).toThrow(
      "changed since",
    );
    const exchange = state.exchanges.find((e) => e.id === id)!;
    expect(exchange.name).toBe("Reviewed");
    command(state, actors[0], "exchanges.draw", {
      id,
      revision: exchange.revision,
    });
    const before = structuredClone(exchange);
    expect(() =>
      command(state, actors[0], "exchanges.update", {
        ...edit,
        revision: exchange.revision,
      }),
    ).toThrow("Only an undrawn");
    expect(exchange).toEqual(before);
  });
  it("rejects exclusions outside participants without changing a draft", () => {
    const { state, actors } = stagingFixtures();
    const input = {
      name: "Draft",
      groupId: state.groups[0].id,
      participantIds: state.people.slice(0, 4).map((p) => p.id),
      count: 1,
      excludeHousehold: false,
      exclusions: [],
    };
    const { id } = command(state, actors[0], "exchanges.create", input) as {
      id: string;
    };
    const draft = state.exchanges.find((e) => e.id === id)!;
    const before = structuredClone(draft);
    expect(() =>
      command(state, actors[0], "exchanges.update", {
        ...input,
        id,
        revision: 1,
        exclusions: [[input.participantIds[0], state.people[4].id]],
      }),
    ).toThrow("two different selected");
    expect(draft).toEqual(before);
  });
});
