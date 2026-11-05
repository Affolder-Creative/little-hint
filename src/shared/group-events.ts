import type { Group, GroupEvent, Person } from "./model";

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

/** Start a new occasion with current participants and an explicitly reviewed schedule. */
export function repeatEventDefaults(
  event: GroupEvent,
  people: Person[],
  group: Group,
) {
  const eligible = new Set(
    peopleForGroup(people, group).map((person) => person.id),
  );
  return {
    name: `${event.name.slice(0, 140)} (new occasion)`,
    description: event.description,
    mode: event.mode,
    modeLocked: false,
    timeZone: event.timeZone,
    spendingGuidelineCents: event.spendingGuidelineCents ?? null,
    revealExchangeGivers: event.revealExchangeGivers,
    archiveAfter: null,
    revealAfter: null,
    participantIds: event.participantIds.filter((id) => eligible.has(id)),
  };
}
