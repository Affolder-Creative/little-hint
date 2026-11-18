import { command } from "../src/server/domain";
import { discussionAudience } from "../src/server/discussion-access";

/** Existing fixtures submit as a composer that has just reviewed its audience. */
export const commandWithAudience: typeof command = (
  state,
  actor,
  action,
  raw,
) => {
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
  return command(state, actor, action, raw);
};
