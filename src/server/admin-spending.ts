import { createHash } from "node:crypto";
import { z } from "zod";
import type { Actor, State } from "../shared/model";
import type {
  AdminSpending,
  SpendingEnableResult,
} from "../shared/admin-spending";
import { fail, isAdmin, stamp } from "./domain";
import { spendingAvailable } from "./deployment";
const scopeSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("all") }).strict(),
  z.object({ scope: z.literal("group"), groupId: z.string().uuid() }).strict(),
]);
function authorize(s: State, a: Actor) {
  if (!isAdmin(s, a)) fail(403, "Administrator access required.");
}
function accounts(s: State, members?: string[]) {
  return [
    ...new Set(
      s.people.flatMap((p) =>
        p.userId && (!members || members.includes(p.userId)) ? [p.userId] : [],
      ),
    ),
  ];
}
function eligibility(s: State, ids: string[]) {
  const settings = new Map(s.spendingSettings.map((p) => [p.userId, p]));
  const eligible = ids.filter((id) => !settings.has(id));
  const alreadyEnabled = ids.filter((id) => settings.get(id)?.enabled).length;
  return {
    eligibleIds: eligible,
    counts: {
      total: ids.length,
      eligible: eligible.length,
      alreadyEnabled,
      optedOut: ids.length - eligible.length - alreadyEnabled,
    },
  };
}
export function adminSpending(s: State, a: Actor): AdminSpending {
  authorize(s, a);
  return {
    available: spendingAvailable(),
    overall: eligibility(s, accounts(s)).counts,
    groups: s.groups
      .map((g) => ({
        id: g.id,
        name: g.name,
        ...eligibility(s, accounts(s, g.memberIds)).counts,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
export function enableSpending(
  s: State,
  a: Actor,
  raw: unknown,
  key: string,
): SpendingEnableResult {
  authorize(s, a);
  if (!spendingAvailable()) fail(404, "Spending is unavailable.");
  const scope = scopeSchema.parse(raw);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
    fail(400, "Refresh the page and try again.");
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(["admin.spending.enable", scope]))
    .digest("hex");
  const prior = s.replays.find((r) => r.userId === a.id && r.key === key);
  if (prior) {
    if (prior.fingerprint !== fingerprint)
      fail(409, "This request changed. Refresh and try again.");
    return { ...(prior.result as SpendingEnableResult), replayed: true };
  }
  const group =
    scope.scope === "group"
      ? (s.groups.find((g) => g.id === scope.groupId) ??
        fail(404, "Family group not found. Refresh and choose another group."))
      : undefined;
  const { eligibleIds, counts } = eligibility(s, accounts(s, group?.memberIds));
  for (const userId of eligibleIds)
    s.spendingSettings.push({
      ...stamp(),
      userId,
      enabled: true,
      summaries: true,
      enabledSource: "admin",
    });
  const result = {
    total: counts.total,
    enabled: counts.eligible,
    alreadyEnabled: counts.alreadyEnabled,
    optedOut: counts.optedOut,
  };
  s.replays.push({ ...stamp(), userId: a.id, key, fingerprint, result });
  s.replays = s.replays.filter(
    (r) => Date.parse(r.createdAt) > Date.now() - 7 * 86400000,
  );
  return result;
}
