import type { ItemPriority } from "./model";
import { priorityLabels } from "./organization";

const clean = (value: string, max: number) => {
  const chars = Array.from(
    value
      .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  return chars.length > max
    ? chars.slice(0, max - 1).join("") + "…"
    : chars.join("");
};

export function wishlistCopy(
  listName: string,
  actorName: string | undefined,
  priorities: (ItemPriority | null | undefined)[],
) {
  const name = clean(listName, 80);
  const generic = /^(wish\s?list)$/i.test(name);
  const destination = generic ? "their wish list" : `"${name || "Wish list"}"`;
  const listSubject = generic ? "The wish list" : `"${name || "Wish list"}"`;
  const who = actorName ? clean(actorName, 60) : undefined;
  const count = priorities.length;
  if (!count) return "A wish list has been updated.";
  if (count === 1) {
    const priority = priorities[0];
    if (!who)
      return `${listSubject} has a new item${priority ? ` marked ${priorityLabels[priority]}` : ""}.`;
    const item =
      priority === "most-wanted"
        ? "a most-wanted item"
        : priority === "would-love"
          ? "something they'd love"
          : priority === "nice-to-have"
            ? "a nice-to-have"
            : "something";
    return `${who} added ${item} to ${destination}.`;
  }
  const highest = (Object.keys(priorityLabels) as ItemPriority[]).find((p) =>
    priorities.includes(p),
  );
  const suffix = highest
    ? `, including ${priorities.filter((p) => p === highest).length} marked ${priorityLabels[highest]}`
    : "";
  return `${who ? `${who} added ${count} items to ${destination}` : `${listSubject} has ${count} new items`}${suffix}.`;
}
