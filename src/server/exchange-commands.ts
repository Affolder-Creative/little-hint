import { z } from "zod";
import type { State, Actor, Exchange } from "../shared/model";
import { listIsArchived } from "../shared/list-dates";

import { emitActivity } from "./activity";

import {
  fail,
  stamp,
  touch,
  text,
  id,
  ids,
  revision,
  spendingGuideline,
  checkRevision,
} from "./domain-common";
import {
  controllers,
  managesGroupExchanges,
  archived,
  name,
  mode,
} from "./domain-access";
import { matchExchange as solveExchange } from "./exchange";
function matchExchange(...args: Parameters<typeof solveExchange>) {
  try {
    return solveExchange(...args);
  } catch {
    fail(
      400,
      "We cannot draw names with these rules. Add people, have each person give to fewer people, or allow more people to draw each other.",
    );
  }
}

export const exchangeActions = [
  "exchanges.create",
  "exchanges.update",
  "exchanges.guideline",
  "exchanges.draw",
  "exchanges.cancel",
];
export function exchangeCommand(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
): unknown {
  const b = raw as Record<string, unknown>;
  switch (action) {
    case "exchanges.create":
    case "exchanges.update": {
      const updating = action === "exchanges.update";
      const edit = updating ? z.object({ id, revision }).parse(b) : undefined;
      const existing = edit
        ? s.exchanges.find(
            (e) =>
              e.id === edit.id &&
              !e.deletedAt &&
              !e.archived &&
              managesGroupExchanges(s, a, e.groupId),
          )
        : undefined;
      if (edit) {
        if (!existing) fail(404, "Exchange not found.");
        checkRevision(existing!, edit.revision);
        if (existing!.status !== "draft")
          fail(
            409,
            "You can only edit an exchange before names are drawn and before it is cancelled.",
          );
      }
      const p = z
        .object({
          spendingGuidelineCents: spendingGuideline.optional(),
          name: text,
          groupId: id,
          participantIds: ids.min(2),
          count: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          excludeHousehold: z.boolean(),
          exclusions: z
            .array(z.tuple([id, id]))
            .max(10000)
            .default([]),
          previousId: id.optional(),
        })
        .parse(b);
      if (!managesGroupExchanges(s, a, p.groupId))
        fail(
          404,
          "Exchange management is not available for this family group.",
        );
      if (existing && p.groupId !== existing.groupId)
        fail(400, "An exchange cannot move to another family group.");
      if (
        p.exclusions.some(
          ([from, to]) =>
            from === to ||
            !p.participantIds.includes(from) ||
            !p.participantIds.includes(to),
        )
      )
        fail(
          400,
          "Choose two different people taking part in this exchange: a giver and someone they should not draw.",
        );
      if (existing && p.previousId === existing.id)
        fail(400, "Choose a different previous exchange.");
      const g = s.groups.find((g) => g.id === p.groupId)!;
      if (
        p.participantIds.some(
          (id) =>
            !s.people.some(
              (q) =>
                q.id === id &&
                controllers(q).some((u) => g.memberIds.includes(u)),
            ),
        )
      )
        fail(400, "Every participant must belong to the family group.");
      if (
        p.previousId &&
        !s.exchanges.some(
          (e) =>
            e.id === p.previousId && !e.deletedAt && e.groupId === p.groupId,
        )
      )
        fail(404, "Previous exchange not found.");
      const e: Exchange = {
        ...(existing ?? stamp()),
        ...p,
        organizerId: existing?.organizerId ?? a.id,
        status: "draft",
        assignments: [],
      };
      matchExchange(e, s.people, s);
      if (existing) {
        Object.assign(existing, e);
        touch(existing);
      } else s.exchanges.push(e);
      return { id: e.id };
    }
    case "exchanges.guideline": {
      const p = z
        .object({ id, revision, spendingGuidelineCents: spendingGuideline })
        .strict()
        .parse(b);
      const e =
        s.exchanges.find(
          (e) =>
            e.id === p.id &&
            !e.deletedAt &&
            managesGroupExchanges(s, a, e.groupId),
        ) ?? fail(404, "Exchange not found.");
      checkRevision(e, p.revision);
      if (e.archived || e.status === "cancelled")
        fail(409, "Restore an active exchange before changing its guideline.");
      if ((e.spendingGuidelineCents ?? null) === p.spendingGuidelineCents)
        return { ok: true };
      e.spendingGuidelineCents = p.spendingGuidelineCents;
      touch(e);
      if (e.status === "drawn")
        emitActivity(
          s,
          "exchange",
          e.participantIds.flatMap((id) =>
            s.people.filter((p) => p.id === id).flatMap(controllers),
          ),
          {
            exchangeId: e.id,
            actorId: a.id,
            action: "spending-guideline-updated",
          },
        );
      return { ok: true };
    }
    case "exchanges.draw": {
      const p = z.object({ id, revision }).parse(b);
      const e =
        s.exchanges.find(
          (e) =>
            e.id === p.id &&
            !e.deletedAt &&
            managesGroupExchanges(s, a, e.groupId),
        ) ?? fail(404, "Exchange not found.");
      checkRevision(e, p.revision);
      if (e.archived || e.status !== "draft")
        fail(409, "This exchange has already been drawn or cancelled.");
      const g = s.groups.find((g) => g.id === e.groupId)!;
      if (
        e.participantIds.some(
          (id) =>
            !s.people.some(
              (p) =>
                p.id === id &&
                controllers(p).some((u) => g.memberIds.includes(u)),
            ),
        )
      )
        fail(
          409,
          "A participant has left the family group. Create a new exchange.",
        );
      if (
        e.participantIds.some(
          (p) =>
            !s.lists.some(
              (l) =>
                !l.deletedAt &&
                !listIsArchived(l) &&
                l.mode === "surprise" &&
                l.ownerIds.includes(p) &&
                l.groupIds.includes(e.groupId),
            ),
        )
      )
        fail(
          400,
          "Each person needs a wish list set to Keep it a surprise and shared with this family group.",
        );
      e.assignments = matchExchange(
        e,
        s.people,
        s,
        s.exchanges.find((p) => p.id === e.previousId)?.assignments,
      );
      e.status = "drawn";
      e.drawnAt = new Date().toISOString();
      touch(e);
      emitActivity(
        s,
        "exchange",
        e.participantIds.flatMap((id) =>
          controllers(s.people.find((p) => p.id === id)!),
        ),
        { exchangeId: e.id },
      );
      return { ok: true };
    }
    case "exchanges.cancel": {
      const p = z.object({ id, revision }).parse(b);
      const e =
        s.exchanges.find(
          (e) =>
            e.id === p.id &&
            !e.deletedAt &&
            managesGroupExchanges(s, a, e.groupId),
        ) ?? fail(404, "Exchange not found.");
      checkRevision(e, p.revision);
      const wasDrawn = e.status === "drawn";
      e.status = "cancelled";
      touch(e);
      if (wasDrawn)
        emitActivity(
          s,
          "exchange",
          e.participantIds.flatMap((id) =>
            controllers(s.people.find((p) => p.id === id)!),
          ),
          { exchangeId: e.id, action: "cancelled", actorId: a.id },
        );
      return { ok: true };
    }
    default:
      fail(400, "Unknown action.");
  }
}
