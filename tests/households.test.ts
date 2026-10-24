import { describe, expect, it } from "vitest";
import {
  emptyState,
  type Actor,
  type Exchange,
  type Group,
  type Household,
  type Person,
} from "../src/shared/model";
import { command, stamp, world } from "../src/server/domain";
import { matchExchange } from "../src/server/exchange";
import { familyGroupLabel, householdLabel } from "../src/shared/households";

function fixture() {
  const s = emptyState();
  const actors: Actor[] = [
    "Alex",
    "Sam",
    "Jamie",
    "Riley",
    "Taylor",
    "Robin",
  ].map((name) => ({
    id: stamp().id,
    name,
    email: `${name.toLowerCase()}@example.test`,
  }));
  s.people = actors.map((a) => ({
    ...stamp(),
    userId: a.id,
    guardians: [],
    name: a.name,
  }));
  const people = s.people;
  const group = command(s, actors[0], "groups.create", {
    name: "Family",
  }) as Group;
  group.memberIds = actors.slice(0, 5).map((a) => a.id);
  const other = command(s, actors[0], "groups.create", {
    name: "Family",
  }) as Group;
  other.memberIds.push(actors[1].id);
  const household = (name = "The Smiths", groupId = group.id) =>
    command(s, actors[0], "households.create", { name, groupId }) as Household;
  const set = (
    person: Person,
    hs: Household[],
    actor = actors[0],
    groupId = group.id,
  ) =>
    command(s, actor, "households.memberships", {
      groupId,
      personId: person.id,
      revision: person.revision,
      householdIds: hs.map((h) => h.id),
    });
  const exchange = (): Exchange => ({
    ...stamp(),
    name: "Draw",
    groupId: group.id,
    organizerId: actors[0].id,
    participantIds: people.slice(0, 5).map((p) => p.id),
    count: 1,
    excludeHousehold: true,
    exclusions: [],
    status: "draft",
    assignments: [],
  });
  return { s, actors, people, group, other, household, set, exchange };
}

describe("structured households", () => {
  it("allows duplicate household and family-group names, multiple memberships, and none", () => {
    const f = fixture();
    const a = f.household(),
      b = f.household(),
      c = f.household("The Smiths", f.other.id);
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    f.set(f.people[0], [a, b]);
    f.set(f.people[0], [c], f.actors[0], f.other.id);
    expect(f.s.householdMemberships).toHaveLength(3);
    const w = world(f.s, f.actors[0]);
    expect(familyGroupLabel(f.group, w)).not.toBe(familyGroupLabel(f.other, w));
    expect(householdLabel(a, w)).not.toBe(householdLabel(b, w));
    f.set(f.people[0], []);
    expect(f.s.householdMemberships.map((m) => m.householdId)).toEqual([c.id]);
  });
  it("lets members change themselves and controlled profiles, but only owners manage records", () => {
    const f = fixture(),
      a = f.household(),
      b = f.household();
    const child = command(f.s, f.actors[1], "people.create", {
      name: "Avery",
    }) as Person;
    f.set(f.people[1], [a], f.actors[1]);
    f.set(child, [a, b], f.actors[1]);
    expect(
      f.s.householdMemberships.filter((m) => m.personId === child.id),
    ).toHaveLength(2);
    expect(() => f.set(f.people[2], [a], f.actors[1])).toThrow("controller");
    expect(() =>
      command(f.s, f.actors[1], "households.create", {
        groupId: f.group.id,
        name: "No",
      }),
    ).toThrow("not found");
    for (const action of ["households.update", "households.delete"])
      expect(() =>
        command(f.s, f.actors[1], action, { ...a, name: "No" }),
      ).toThrow("not found");
    f.set(child, [], f.actors[0]);
    expect(f.s.householdMemberships.some((m) => m.personId === child.id)).toBe(
      false,
    );
  });
  it("rejects cross-group IDs, outsiders, stale revisions and repeated selections", () => {
    const f = fixture(),
      a = f.household(),
      b = f.household("Other", f.other.id);
    expect(() => f.set(f.people[2], [b])).toThrow("Choose households");
    expect(() => f.set(f.people[5], [a])).toThrow("Person not found");
    expect(() => f.set(f.people[5], [a], f.actors[5])).toThrow(
      "Family group not found",
    );
    const old = { ...f.people[1] };
    f.set(f.people[1], [a]);
    expect(() => f.set(old, [])).toThrow();
    expect(() => f.set(f.people[1], [a, a])).toThrow("Duplicate");
    expect(world(f.s, f.actors[5]).households).toEqual([]);
    expect(world(f.s, f.actors[2]).households.map((h) => h.id)).toEqual([a.id]);
    expect(world(f.s, f.actors[5]).householdMemberships).toEqual([]);
  });
  it("renames without changing identity or memberships and deletes only the selected household", () => {
    const f = fixture(),
      a = f.household(),
      b = f.household();
    f.set(f.people[1], [a, b]);
    const links = structuredClone(f.s.householdMemberships);
    command(f.s, f.actors[0], "households.update", { ...a, name: "New name" });
    expect(f.s.householdMemberships).toEqual(links);
    expect(a.name).toBe("New name");
    command(f.s, f.actors[0], "households.delete", a);
    expect(f.s.households.map((h) => h.id)).toEqual([b.id]);
    expect(f.s.householdMemberships.map((m) => m.householdId)).toEqual([b.id]);
    expect(f.group.memberIds).toHaveLength(5);
    expect(f.s.people).toHaveLength(6);
  });
  it("cleans memberships on leaving, retains other groups and profiles with another member guardian", () => {
    const f = fixture(),
      a = f.household(),
      b = f.household("Other", f.other.id);
    const child = command(f.s, f.actors[1], "people.create", {
      name: "Avery",
    }) as Person;
    const sharedChild = command(f.s, f.actors[1], "people.create", {
      name: "Casey",
    }) as Person;
    sharedChild.guardians.push(f.actors[2].id);
    f.set(f.people[1], [a]);
    f.set(child, [a]);
    f.set(sharedChild, [a]);
    f.set(f.people[1], [b], f.actors[1], f.other.id);
    command(f.s, f.actors[1], "groups.remove", {
      groupId: f.group.id,
      userId: f.actors[1].id,
    });
    expect(
      f.s.householdMemberships.map((m) => [m.personId, m.householdId]),
    ).toEqual([
      [sharedChild.id, a.id],
      [f.people[1].id, b.id],
    ]);
    expect(() => f.set(child, [a], f.actors[1])).toThrow();
  });
  it("reconciles a managed profile claiming an account outside the group", () => {
    const f = fixture(),
      a = f.household();
    const child = command(f.s, f.actors[1], "people.create", {
      name: "Avery",
    }) as Person;
    f.set(child, [a]);
    command(f.s, f.actors[1], "people.link", {
      id: child.id,
      email: f.actors[5].email,
    });
    command(f.s, f.actors[5], "links.accept", { id: f.s.links[0].id });
    expect(f.s.householdMemberships).toEqual([]);
  });
});

describe("household exchange exclusions", () => {
  it("compares IDs, permits same-name distinct households and ignores other groups", () => {
    const f = fixture(),
      a = f.household(),
      b = f.household(),
      c = f.household("Shared", f.other.id);
    f.set(f.people[0], [a]);
    f.set(f.people[1], [b]);
    f.set(f.people[0], [c], f.actors[0], f.other.id);
    f.set(f.people[1], [c], f.actors[1], f.other.id);
    const e = f.exchange();
    e.participantIds = [f.people[0].id, f.people[1].id];
    expect(matchExchange(e, f.people, f.s)).toHaveLength(2);
  });
  it("excludes any shared household and preserves self, controller and explicit exclusions", () => {
    const f = fixture(),
      a = f.household(),
      b = f.household();
    f.set(f.people[0], [a, b]);
    f.set(f.people[1], [a]);
    f.set(f.people[2], [b]);
    const child = command(f.s, f.actors[3], "people.create", {
      name: "Child",
    }) as Person;
    const e = f.exchange();
    e.participantIds.push(child.id);
    e.exclusions = [[f.people[1].id, f.people[2].id]];
    const pairs = matchExchange(e, f.people, f.s);
    for (const [giver, recipient] of pairs) {
      expect(giver).not.toBe(recipient);
      const own = f.s.householdMemberships
        .filter((m) => m.personId === giver)
        .map((m) => m.householdId);
      expect(
        f.s.householdMemberships.some(
          (m) => m.personId === recipient && own.includes(m.householdId),
        ),
      ).toBe(false);
      expect([giver, recipient]).not.toEqual(e.exclusions[0]);
      expect(new Set([giver, recipient])).not.toEqual(
        new Set([child.id, f.people[3].id]),
      );
    }
  });
  it("explains impossible drawings, including membership changes after draft creation", () => {
    const f = fixture(),
      a = f.household();
    const e = command(f.s, f.actors[0], "exchanges.create", f.exchange()) as {
      id: string;
    };
    for (const person of f.people.slice(0, 5)) {
      command(
        f.s,
        f.actors.find((a) => a.id === person.userId)!,
        "lists.create",
        {
          name: "Wishes",
          ownerIds: [person.id],
          groupIds: [f.group.id],
          mode: "surprise",
        },
      );
      f.set(person, [a]);
    }
    expect(() =>
      command(f.s, f.actors[0], "exchanges.draw", { ...e, revision: 1 }),
    ).toThrow("allow more people to draw each other");
    expect(f.s.exchanges[0].status).toBe("draft");
    const draft = f.exchange();
    draft.excludeHousehold = false;
    expect(matchExchange(draft, f.people, f.s)).toHaveLength(5);
  });
  it("keeps completed drawings and existing lists unchanged through edits, deletion and leaving", () => {
    const f = fixture(),
      a = f.household();
    f.people.slice(0, 5).forEach((person, i) =>
      command(f.s, f.actors[i], "lists.create", {
        name: "Wishes",
        ownerIds: [person.id],
        groupIds: [f.group.id],
        mode: "surprise",
      }),
    );
    const { id } = command(
      f.s,
      f.actors[0],
      "exchanges.create",
      f.exchange(),
    ) as { id: string };
    command(f.s, f.actors[0], "exchanges.draw", { id, revision: 1 });
    const drawn = structuredClone(f.s.exchanges[0]);
    const lists = structuredClone(f.s.lists);
    f.set(f.people[0], [a]);
    f.set(f.people[1], [a]);
    command(f.s, f.actors[0], "households.update", { ...a, name: "Renamed" });
    command(f.s, f.actors[0], "households.delete", a);
    expect(f.s.lists).toEqual(lists);
    command(f.s, f.actors[1], "groups.remove", {
      groupId: f.group.id,
      userId: f.actors[1].id,
    });
    expect(f.s.exchanges[0]).toEqual(drawn);
    expect(() =>
      command(f.s, f.actors[0], "exchanges.draw", {
        id,
        revision: drawn.revision,
      }),
    ).toThrow("already been drawn");
  });
  it("households do not grant access; invitation acceptance still shares the group's lists", () => {
    const f = fixture(),
      a = f.household();
    command(f.s, f.actors[0], "lists.create", {
      name: "Wishes",
      ownerIds: [f.people[0].id],
      groupIds: [f.group.id],
      mode: "surprise",
    });
    expect(world(f.s, f.actors[5]).lists).toEqual([]);
    const inv = command(f.s, f.actors[0], "groups.invite", {
      groupId: f.group.id,
      email: f.actors[5].email,
    }) as { id: string };
    command(f.s, f.actors[5], "invitations.accept", inv);
    expect(world(f.s, f.actors[5]).lists).toHaveLength(1);
    expect(world(f.s, f.actors[5]).householdMemberships).toEqual([]);
    f.set(f.people[5], [a], f.actors[5]);
    expect(world(f.s, f.actors[5]).lists).toHaveLength(1);
  });
});

describe("additive synthetic household fixture", () => {
  it("seeds duplicate names and managed multi-household profiles once without overwriting existing records", async () => {
    const { stagingFixtures } = await import("../src/server/staging-fixtures");
    const { addHouseholdScenario, householdScenarioId } =
      await import("../src/server/household-fixtures");
    const { state, actors } = stagingFixtures();
    const originalLists = structuredClone(state.lists),
      originalDraws = structuredClone(state.exchanges);
    expect(addHouseholdScenario(state, actors)).toBe(true);
    expect(
      state.households.filter(
        (h) => h.groupId === householdScenarioId && h.name === "The Smiths",
      ),
    ).toHaveLength(2);
    const child = state.people.find((p) => !p.userId)!;
    expect(
      state.householdMemberships.filter((m) => m.personId === child.id),
    ).toHaveLength(2);
    const snapshot = structuredClone(state);
    expect(addHouseholdScenario(state, actors)).toBe(false);
    expect(state).toEqual(snapshot);
    expect(state.lists.slice(0, originalLists.length)).toEqual(originalLists);
    expect(state.exchanges).toEqual(originalDraws);
  });
});
