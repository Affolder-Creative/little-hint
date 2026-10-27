import type { Follow, List, NotificationChannel, State } from "./model";

export const notificationChannels = [
  "push",
  "email",
  "telegram",
  "sms",
] as const;
export const channelLabels: Record<NotificationChannel, string> = {
  push: "Push",
  email: "Email",
  telegram: "Telegram",
  sms: "Text messages",
};
type FollowState = Pick<
  State,
  "groups" | "households" | "householdMemberships"
>;
const rank = { group: 1, household: 2, person: 3, list: 4 };

// Sharing and household membership remain separate. A household follow never
// reaches lists shared only with a different family group.
export function matchingFollows(
  s: FollowState,
  follows: Follow[],
  userId: string,
  list: Pick<List, "id" | "ownerIds" | "groupIds">,
) {
  return follows.filter((f) => {
    if (f.userId !== userId) return false;
    if (f.target === "list") return f.targetId === list.id;
    if (f.target === "person") return list.ownerIds.includes(f.targetId);
    const groupId =
      f.target === "group"
        ? f.targetId
        : s.households.find((h) => h.id === f.targetId)?.groupId;
    if (
      !groupId ||
      !list.groupIds.includes(groupId) ||
      !s.groups.some((g) => g.id === groupId && g.memberIds.includes(userId))
    )
      return false;
    return (
      f.target === "group" ||
      s.householdMemberships.some(
        (m) =>
          m.householdId === f.targetId && list.ownerIds.includes(m.personId),
      )
    );
  });
}

export function resolveFollows(
  matches: Pick<Follow, "target" | "muted" | "channels">[],
  defaults: NotificationChannel[],
) {
  const muted = matches.some((f) => f.target === "list" && f.muted);
  const following = !muted && matches.some((f) => !f.muted);
  const custom = matches.filter((f) => !f.muted && f.channels !== undefined);
  const highest = Math.max(0, ...custom.map((f) => rank[f.target]));
  const sources = custom.filter((f) => rank[f.target] === highest);
  const channels = !following
    ? []
    : sources.length
      ? notificationChannels.filter((c) =>
          sources.some((f) => f.channels!.includes(c)),
        )
      : defaults;
  return { following, muted, channels, sources };
}
