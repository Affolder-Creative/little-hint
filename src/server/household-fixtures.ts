import type { Actor, Group, Household, Person, State } from "../shared/model";
import { command } from "./domain";

// Fixed IDs make this additive scenario repeatable without treating names as identity.
export const householdScenarioId = "a43cd385-6ae4-4f83-9344-4ec3921bbdb4";
export function addHouseholdScenario(s: State, actors: Actor[]) {
  if (s.groups.some((g) => g.id === householdScenarioId)) return false;
  const byEmail = (email: string) => actors.find((a) => a.email === email);
  const members = ["alex", "sam", "jamie", "riley", "taylor"].map((n) =>
    byEmail(`${n}@example.test`),
  );
  if (members.some((a) => !a || !s.people.some((p) => p.userId === a.id)))
    throw new Error(
      "Seed the synthetic staging accounts before adding the household scenario.",
    );
  const [alex, sam] = members as Actor[];
  const group = command(s, alex, "groups.create", {
    name: "Household sandbox",
  }) as Group;
  group.id = householdScenarioId;
  group.memberIds = members.map((a) => a!.id);
  const other = command(s, alex, "groups.create", {
    name: "Household sandbox",
  }) as Group;
  other.memberIds.push(sam.id);
  const people = members.map((a) => s.people.find((p) => p.userId === a!.id)!);
  const child = command(s, sam, "people.create", {
    name: "Avery Smith (synthetic)",
  }) as Person;
  const homes = ["The Smiths", "The Smiths", "Weekend home"].map(
    (name) =>
      command(s, alex, "households.create", {
        groupId: group.id,
        name,
      }) as Household,
  );
  const set = (person: Person, homes: Household[], groupId = group.id) =>
    command(s, alex, "households.memberships", {
      groupId,
      personId: person.id,
      revision: person.revision,
      householdIds: homes.map((h) => h.id),
    });
  set(people[0], [homes[0], homes[2]]);
  set(people[1], [homes[0]]);
  set(people[2], [homes[1], homes[2]]);
  set(people[3], [homes[1]]);
  set(child, [homes[0], homes[1]]);
  const otherHome = command(s, alex, "households.create", {
    groupId: other.id,
    name: "The Smiths",
  }) as Household;
  set(people[0], [otherHome], other.id);
  set(people[1], [otherHome], other.id);
  // Leave Taylor without a household; every adult has a list for a test drawing.
  people.forEach((p, index) =>
    command(s, members[index]!, "lists.create", {
      name: `${p.name}'s household test wishes`,
      ownerIds: [p.id],
      groupIds: [group.id],
      mode: "surprise",
      description: "Synthetic household testing scenario.",
    }),
  );
  return true;
}
