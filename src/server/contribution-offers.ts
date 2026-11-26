import { z } from "zod";
import type {
  Actor,
  ContributionOffer,
  ContributionOfferView,
  Item,
  Reservation,
  State,
} from "../shared/model";
import {
  archived,
  canShop,
  getItem,
  itemVisible,
  recipient,
  name,
} from "./domain-access";
import { itemTrashed } from "../shared/organization";
import {
  checkRevision,
  fail,
  id,
  revision,
  stamp,
  touch,
} from "./domain-common";
import { emitActivity } from "./activity";
import { netContribution } from "../shared/contribution-money";

export const acceptedOffersInput = z
  .array(z.object({ id, revision }))
  .max(100)
  .refine(
    (v) => new Set(v.map((o) => o.id)).size === v.length,
    "Choose each offer once.",
  )
  .optional();
export function canOffer(s: State, a: Actor, i: Item) {
  return (
    itemVisible(s, a, i) &&
    canShop(s, a, i) &&
    !recipient(s, a, i) &&
    !archived(s, i) &&
    !itemTrashed(s, i) &&
    (!!i.listId || i.visibility !== "private")
  );
}
export function offerView(
  s: State,
  a: Actor,
  o: ContributionOffer,
): ContributionOfferView {
  return {
    ...o,
    status: o.status === "open" && !offerActive(s, o) ? "cancelled" : o.status,
    contributorName: name(s, o.userId),
    mine: o.userId === a.id,
  };
}
export function giftOffers(s: State, a: Actor, i: Item) {
  return canOffer(s, a, i)
    ? s.contributionOffers
        .filter(
          (o) => o.itemId === i.id && o.status === "open" && offerActive(s, o),
        )
        .map((o) => offerView(s, a, o))
    : undefined;
}
function offerActive(s: State, o: ContributionOffer) {
  const i = s.items.find((i) => i.id === o.itemId);
  return !!i && canOffer(s, { id: o.userId, name: "", email: "" }, i);
}
function notifyBuyers(s: State, a: Actor, o: ContributionOffer) {
  emitActivity(
    s,
    "contribution",
    s.reservations
      .filter((r) => r.itemId === o.itemId && r.quantity > 0 && !r.exchangeId)
      .map((r) => r.buyerId),
    {
      itemId: o.itemId,
      contributionOfferId: o.id,
      actorId: a.id,
      action: "offer-updated",
    },
  );
}
export function offerCommand(s: State, a: Actor, action: string, raw: unknown) {
  if (action === "contribution-offers.create") {
    const p = z
      .object({
        itemId: id,
        amountCents: z.number().int().positive().max(100000000),
      })
      .parse(raw);
    const i = getItem(s, a, p.itemId);
    if (
      s.reservations.some(
        (r) => r.itemId === i.id && r.buyerId === a.id && r.quantity > 0,
      )
    )
      fail(
        409,
        "You are already buying this gift. Review cost sharing in Buying.",
      );
    if (!canOffer(s, a, i))
      fail(403, "You cannot offer to contribute to this gift.");
    if (
      s.contributionOffers.some(
        (o) => o.itemId === i.id && o.userId === a.id && o.status === "open",
      )
    )
      fail(409, "You already have an offer for this gift. Edit it in Buying.");
    const list = s.lists.find((l) => l.id === i.listId);
    const o: ContributionOffer = {
      ...stamp(),
      ...p,
      userId: a.id,
      status: "open",
      titleSnapshot: i.title,
      recipientIds: [...i.recipientIds],
      recipientNames: i.recipientIds.map(
        (id) => s.people.find((p) => p.id === id)?.name ?? "Recipient",
      ),
      listId: list?.id,
      listName: list?.name,
      eventId: list?.groupEventId,
      eventName: s.groupEvents.find((e) => e.id === list?.groupEventId)?.name,
    };
    s.contributionOffers.push(o);
    notifyBuyers(s, a, o);
    return o;
  }
  const p = z
    .object({
      id,
      revision,
      amountCents: z.number().int().positive().max(100000000).optional(),
      status: z.literal("cancelled").optional(),
    })
    .refine(
      (v) => (v.amountCents !== undefined) !== (v.status !== undefined),
      "Choose an amount change or cancellation.",
    )
    .parse(raw);
  const o =
    s.contributionOffers.find((o) => o.id === p.id && o.userId === a.id) ??
    fail(404, "Contribution offer not found.");
  checkRevision(o, p.revision);
  if (o.status !== "open")
    fail(409, "This offer has changed. Refresh Buying to review it.");
  if (p.amountCents !== undefined && !offerActive(s, o))
    fail(409, "This gift is no longer available for offers.");
  if (p.status) o.status = p.status;
  if (p.amountCents !== undefined) o.amountCents = p.amountCents;
  touch(o);
  notifyBuyers(s, a, o);
  return o;
}
export function validateAcceptedOffers(
  s: State,
  a: Actor,
  r: Pick<
    Reservation,
    "itemId" | "quantity" | "exchangeId" | "id" | "poolTargetCents"
  >,
  selections: { id: string; revision: number }[] = [],
) {
  if (!selections.length) return [];
  const i = getItem(s, a, r.itemId);
  if (!canOffer(s, a, i) || r.exchangeId || !r.quantity || !r.poolTargetCents)
    fail(
      400,
      "Set a contribution goal for an ordinary gift before accepting offers.",
    );
  const offers = selections.map((selected) => {
    const o =
      s.contributionOffers.find(
        (o) => o.id === selected.id && o.itemId === r.itemId,
      ) ?? fail(404, "Contribution offer not found.");
    checkRevision(o, selected.revision);
    if (o.status !== "open" || o.userId === a.id || !offerActive(s, o))
      fail(
        409,
        "An offer is no longer available. Refresh and review the offers.",
      );
    return o;
  });
  const pledged = s.contributions
    .filter((c) => c.reservationId === r.id && c.status !== "cancelled")
    .reduce((n, c) => n + netContribution(c), 0);
  if (
    pledged + offers.reduce((n, o) => n + o.amountCents, 0) >
    r.poolTargetCents!
  )
    fail(
      409,
      "The selected offers exceed your contribution goal. Adjust the goal or choose fewer offers.",
    );
  return offers;
}
export function acceptOffers(
  s: State,
  a: Actor,
  r: Reservation,
  offers: ContributionOffer[],
) {
  for (const o of offers) {
    const c = {
      ...stamp(),
      reservationId: r.id,
      userId: o.userId,
      amountCents: o.amountCents,
      status: "pledged" as const,
    };
    s.contributions.push(c);
    o.status = "accepted";
    o.reservationId = r.id;
    o.contributionId = c.id;
    touch(o);
    for (const entry of s.spendingRecords.filter(
      (v) => v.sourceId === o.id && v.ownerId === o.userId,
    )) {
      entry.sourceId = c.id;
      entry.reservationId = r.id;
      // Spending reconciliation clears the pending marker and applies the
      // contributor's current sharing rules after the acceptance commits.
      entry.revision++;
    }
    emitActivity(s, "contribution", [o.userId], {
      itemId: r.itemId,
      reservationId: r.id,
      contributionId: c.id,
      actorId: a.id,
      action: "offer-accepted",
    });
  }
  if (
    offers.length &&
    r.poolTargetCents &&
    s.contributions
      .filter((c) => c.reservationId === r.id && c.status !== "cancelled")
      .reduce((sum, c) => sum + netContribution(c), 0) === r.poolTargetCents
  ) {
    emitActivity(
      s,
      "contribution",
      [
        r.buyerId,
        ...s.contributions
          .filter((c) => c.reservationId === r.id && c.status !== "cancelled")
          .map((c) => c.userId),
      ],
      { itemId: r.itemId, reservationId: r.id, action: "funded" },
    );
  }
}
export function closeOwnOffers(s: State, a: Actor, itemId: string) {
  for (const o of s.contributionOffers.filter(
    (o) => o.itemId === itemId && o.userId === a.id && o.status === "open",
  )) {
    o.status = "cancelled";
    touch(o);
  }
}
export function reconcileOffers(s: State) {
  for (const o of s.contributionOffers)
    if (o.status === "open" && !offerActive(s, o)) {
      o.status = "cancelled";
      touch(o);
      emitActivity(s, "contribution", [o.userId], {
        contributionOfferId: o.id,
        action: "offer-cancelled",
      });
    }
}
