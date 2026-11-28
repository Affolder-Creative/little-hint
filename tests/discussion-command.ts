import { command, idempotent } from "../src/server/domain";
import { discussionAudience } from "../src/server/discussion-access";

/** Existing fixtures submit as a composer that has just reviewed its audience. */
function reviewedPayload(
  state: Parameters<typeof command>[0],
  actor: Parameters<typeof command>[1],
  action: string,
  raw: unknown,
) {
  if (
    [
      "reservations.create",
      "contribution-offers.create",
      "spending.purchase",
    ].includes(action) &&
    raw &&
    typeof raw === "object"
  ) {
    const body = raw as Record<string, unknown>;
    const item = state.items.find((i) => i.id === body.itemId);
    const list = state.lists.find((l) => l.id === item?.listId);
    if (list && body.expectedListMode === undefined)
      raw = { ...body, expectedListMode: list.mode };
  }
  if (
    (action === "comments.create" || action === "comments.update") &&
    raw &&
    typeof raw === "object"
  ) {
    const body = raw as Record<string, unknown>;
    if (body.audienceToken === undefined) {
      const comment =
        action === "comments.update"
          ? state.comments.find((c) => c.id === body.id)
          : undefined;
      const itemId = comment?.itemId ?? body.itemId;
      if (typeof itemId === "string") {
        try {
          raw = {
            ...body,
            audienceToken: discussionAudience(
              state,
              actor,
              itemId,
              comment?.id,
              body,
            ).token,
          };
        } catch {
          // The command must still exercise its normal authorization/error path.
        }
      }
    }
  }
  return raw;
}

export const commandWithAudience: typeof command = (
  state,
  actor,
  action,
  raw,
) => command(state, actor, action, reviewedPayload(state, actor, action, raw));

export const idempotentWithAudience: typeof idempotent = (
  state,
  actor,
  key,
  action,
  raw,
) =>
  idempotent(
    state,
    actor,
    key,
    action,
    reviewedPayload(state, actor, action, raw),
  );
