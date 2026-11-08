import type { Actor, Person, State } from "../shared/model";
import { controllers, personVisible } from "./domain-access";
import { fail } from "./domain-common";
export const profileOwner = (p: Person) => p.managedOwnerId ?? p.guardians[0];
export function managerCandidates(s: State, a: Actor, p: Person) {
  return s.people
    .filter(
      (q) =>
        q.userId &&
        !q.mergedIntoId &&
        (p.guardians.includes(q.userId) || personVisible(s, a, q)),
    )
    .map((q) => ({ id: q.userId!, name: q.name }));
}
export function managementDetails(s: State, a: Actor, id: string) {
  const p =
    s.people.find(
      (p) =>
        p.id === id &&
        !p.userId &&
        !p.mergedIntoId &&
        controllers(p).includes(a.id),
    ) ?? fail(404, "Managed profile not found.");
  return {
    ownerId: profileOwner(p),
    managers: p.guardians.map((id) => ({
      id,
      name: s.people.find((q) => q.userId === id)?.name ?? "Former member",
    })),
    candidates: profileOwner(p) === a.id ? managerCandidates(s, a, p) : [],
    pending: s.links
      .filter(
        (l) =>
          l.kind === "guardian" &&
          l.targetId === p.id &&
          !l.consumed &&
          Date.parse(l.expiresAt) > Date.now(),
      )
      .map((l) => ({
        id: l.id,
        name: s.people.find((q) => q.userId === l.userId)?.name ?? "Member",
      })),
  };
}
export function validateManagers(s: State, a: Actor, p: Person, ids: string[]) {
  if (p.userId || profileOwner(p) !== a.id)
    fail(403, "Only the profile owner can change managers.");
  if (!ids.includes(profileOwner(p)!))
    fail(400, "Transfer ownership before removing the owner.");
  const eligible = managerCandidates(s, a, p);
  if (ids.some((id) => !eligible.some((q) => q.id === id)))
    fail(400, "Choose a connected account holder.");
}
