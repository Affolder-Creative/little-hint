import type { Group, Person } from "./model";

export function canManageGroupEvents(group: Group, userId: string): boolean {
  return (
    group.memberIds.includes(userId) &&
    (group.ownerId === userId || !!group.eventLeaderIds?.includes(userId))
  );
}

export function peopleForGroup(people: Person[], group: Group): Person[] {
  return people.filter((person) =>
    [person.userId, ...person.guardians].some(
      (userId) => !!userId && group.memberIds.includes(userId),
    ),
  );
}
