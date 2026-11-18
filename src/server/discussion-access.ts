import { createHash } from "node:crypto";
import type { Actor, Comment, Item, State } from "../shared/model";
import {
  controls,
  itemVisible,
  selfRecipient,
  mode,
  archived,
} from "./domain-access";
import { fail } from "./domain-common";
import { noteNeedsReview } from "./privacy-review";
import {
  resolveShoppingContext,
  type ShoppingContext,
} from "./shopping-context";

export function discussionProtection(s: State, item: Item, giverId?: string) {
  return {
    authorOnly: !item.listId && item.visibility === "private",
    excludeRecipients:
      !!giverId ||
      (item.listId
        ? mode(s, item) === "surprise"
        : item.visibility !== "visible"),
  };
}

export function noteVisible(
  s: State,
  a: Actor,
  item: Item,
  giverId?: string,
  comment?: Comment,
): boolean {
  const current = discussionProtection(s, item, giverId);
  return (
    s.people.some((p) => p.userId === a.id) &&
    item.publicationState !== "draft" &&
    itemVisible(s, a, item) &&
    (!(
      current.excludeRecipients ||
      (comment && (comment.excludeRecipients ?? true))
    ) ||
      !selfRecipient(s, a, item.recipientIds)) &&
    (!giverId || controls(s, a, giverId)) &&
    (!(
      current.authorOnly ||
      comment?.authorOnly ||
      (comment && noteNeedsReview(s, comment))
    ) ||
      (comment?.authorId ?? item.creatorId) === a.id)
  );
}

export function discussionLabel(
  s: State,
  item: Item,
  giverId?: string,
  comment?: Comment,
): string {
  const current = discussionProtection(s, item, giverId);
  if (
    current.authorOnly ||
    comment?.authorOnly ||
    (comment && noteNeedsReview(s, comment))
  )
    return "Only you";
  if (giverId) return "Giver and profile managers; recipients excluded";
  if (
    current.excludeRecipients ||
    (comment && (comment.excludeRecipients ?? true))
  )
    return "People with access, excluding recipients";
  return "People with access, including recipients";
}

/** The token binds a draft to its actual audience, including membership changes. */
export function discussionAudience(
  s: State,
  a: Actor,
  itemId: string,
  commentId?: string,
  context: ShoppingContext = {},
) {
  const item = s.items.find((i) => i.id === itemId);
  if (!item || !noteVisible(s, a, item) || archived(s, item))
    fail(404, "Discussion is not available for this item.");
  const comment = commentId
    ? s.comments.find(
        (c) => c.id === commentId && c.itemId === itemId && c.authorId === a.id,
      )
    : undefined;
  if (
    commentId &&
    (!comment || !noteVisible(s, a, item, comment.giverId, comment))
  )
    fail(404, "Note not available.");
  const giverId = comment
    ? comment.giverId
    : resolveShoppingContext(s, a, item, context)?.giverId;
  if (!noteVisible(s, a, item, giverId, comment))
    fail(403, "You cannot participate in this discussion audience.");
  const readers = [
    ...new Map(
      s.people.filter((p) => p.userId).map((p) => [p.userId!, p]),
    ).values(),
  ]
    .filter((p) =>
      noteVisible(
        s,
        { id: p.userId!, email: "", name: p.name },
        item,
        giverId,
        comment,
      ),
    )
    .map((p) => ({ userId: p.userId!, name: p.name }))
    .sort((a, b) => a.userId.localeCompare(b.userId));
  const protection = discussionProtection(s, item, giverId);
  const label = discussionLabel(s, item, giverId, comment);
  const token = createHash("sha256")
    .update(
      JSON.stringify({
        itemId,
        commentId,
        giverId,
        protection,
        label,
        recipients: [...item.recipientIds].sort(),
        readers: readers.map((p) => p.userId),
      }),
    )
    .digest("hex");
  return { token, label, readers };
}

export function checkDiscussionAudience(
  s: State,
  a: Actor,
  item: Item,
  token: string | undefined,
  comment?: Comment,
  context: ShoppingContext = {},
) {
  if (token !== discussionAudience(s, a, item.id, comment?.id, context).token)
    fail(
      409,
      "The discussion audience changed. Review who can read your note before posting.",
    );
}
