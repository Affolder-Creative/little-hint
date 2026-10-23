import type { Group, Household, World } from "./model";

export function familyGroupLabel(
  group: Group,
  world: Pick<World, "groups" | "people">,
): string {
  if (world.groups.filter((g) => g.name === group.name).length < 2)
    return group.name;
  const owner =
    world.people.find((p) => p.userId === group.ownerId)?.name ?? "Owner";
  return `${group.name} · ${owner} · ${group.id.slice(0, 8)}`;
}

export function householdLabel(
  household: Household,
  world: Pick<World, "households" | "householdMemberships" | "people">,
  includeName = true,
): string {
  const memberIds = new Set(
    world.householdMemberships
      .filter((m) => m.householdId === household.id)
      .map((m) => m.personId),
  );
  const members =
    world.people
      .filter((p) => memberIds.has(p.id))
      .map((p) => p.name)
      .join(", ") || "No members";
  const duplicate = world.households.some(
    (h) =>
      h.id !== household.id &&
      h.groupId === household.groupId &&
      h.name === household.name,
  );
  return `${includeName ? `${household.name} · ` : ""}${members}${duplicate ? ` · ${household.id.slice(0, 8)}` : ""}`;
}
