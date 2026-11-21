import { z } from "zod";
import type { Actor, Item, State, Visibility } from "../shared/model";
import { fail, touch } from "./domain-common";

export function ideaRecipientsLocked(s: State, i: Item) {
  return (
    !!i.recipientsLocked ||
    s.reservations.some(
      (r) =>
        r.itemId === i.id ||
        s.items.some(
          (child) => child.id === r.itemId && child.parentItemId === i.id,
        ),
    )
  );
}
export function lockIdeaRecipients(s: State) {
  for (const i of s.items)
    if (!i.listId && !i.recipientsLocked && ideaRecipientsLocked(s, i)) {
      i.recipientsLocked = true;
      touch(i);
    }
}
export function checkIdeaExclusions(
  s: State,
  a: Actor,
  visibility: Visibility,
  groups: string[],
  excluded: string[],
  previous: string[] = [],
  draft = false,
) {
  if (visibility === "private") return;
  if (visibility !== "restricted") {
    if (excluded.length)
      fail(400, "Choose sharing with exceptions to hide additional people.");
    return;
  }
  if (!draft && (!groups.length || !excluded.length))
    fail(
      400,
      "Choose a family group and at least one person to hide this idea from.",
    );
  if (
    new Set(excluded).size !== excluded.length ||
    excluded.some(
      (userId) =>
        userId === a.id ||
        (!previous.includes(userId) &&
          (!s.people.some((p) => p.userId === userId) ||
            !s.groups.some(
              (g) =>
                groups.includes(g.id) &&
                g.memberIds.includes(a.id) &&
                g.memberIds.includes(userId),
            ))),
    )
  )
    fail(400, "Choose people from the selected family groups.");
}

export const excludedAccounts = z
  .array(z.string().min(1).max(200))
  .max(100)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Duplicate selections are not allowed.",
  );
