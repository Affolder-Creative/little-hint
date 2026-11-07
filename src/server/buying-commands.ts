import { canShop } from "./domain-access";
import { resolveShoppingContext } from "./shopping-context";
import { z } from "zod";
import type { State, Actor, Reservation, Exchange } from "../shared/model";

import { itemTrashed } from "../shared/organization";
import { emitActivity, emitGiftActivity } from "./activity";
import { registerSpendingReservation } from "./spending";
import {
  fail,
  stamp,
  touch,
  id,
  revision,
  checkRevision,
} from "./domain-common";
import {
  controls,
  groupAccess,
  recipient,
  itemVisible,
  getItem,
  archived,
  mode,
} from "./domain-access";

export const buyingActions = [
  "reservations.create",
  "reservations.update",
  "contributions.create",
  "contributions.update",
];
export function buyingCommand(
  s: State,
  a: Actor,
  action: string,
  raw: unknown,
): unknown {
  const b = raw as Record<string, unknown>;
  switch (action) {
    case "reservations.create": {
      const p = z
        .object({
          itemId: id,
          quantity: z.number().int().min(1).max(999),
          ordinary: z.boolean().optional(),
          exchangeId: id.optional(),
          exchangeRecipientId: id.optional(),
          giverId: id.optional(),
        })
        .parse(b);
      const i = getItem(s, a, p.itemId);
      if (!canShop(s, a, i))
        fail(403, "You cannot reserve a gift for yourself.");
      if (archived(s, i)) fail(409, "This gift is archived.");
      resolveShoppingContext(s, a, i, p);
      if (p.exchangeId) {
        const e =
          s.exchanges.find(
            (e) =>
              e.id === p.exchangeId &&
              !e.deletedAt &&
              !e.archived &&
              e.status === "drawn" &&
              groupAccess(s, a, e.groupId),
          ) ?? fail(404, "Exchange not found.");
        if (
          !p.giverId ||
          !controls(s, a, p.giverId) ||
          !e.assignments.some(
            ([g, r]) => g === p.giverId && i.recipientIds.includes(r),
          ) ||
          mode(s, i) !== "surprise"
        )
          fail(403, "Choose a gift for one of your assigned recipients.");
        const recipients = e.assignments
          .filter(
            ([giver, receiver]) =>
              giver === p.giverId && i.recipientIds.includes(receiver),
          )
          .map(([, receiver]) => receiver);
        if (!p.exchangeRecipientId && recipients.length === 1)
          p.exchangeRecipientId = recipients[0];
        if (
          !p.exchangeRecipientId ||
          !recipients.includes(p.exchangeRecipientId)
        )
          fail(400, "Choose who this exchange gift is for in Buying for.");
      } else if (p.exchangeRecipientId || p.giverId) {
        fail(400, "Choose an exchange for this giver and recipient.");
      }
      const used = s.reservations
        .filter((r) => r.itemId === i.id)
        .reduce((n, r) => n + r.quantity, 0);
      if (used + p.quantity > i.quantity)
        fail(
          409,
          "Someone has already reserved that quantity. Refresh to see what remains.",
        );
      const r: Reservation = {
        ...stamp(),
        ...p,
        ordinary: !p.exchangeId,
        buyerId: a.id,
        purchased: 0,
        former: false,
        titleSnapshot: i.title,
      };
      s.reservations.push(r);
      registerSpendingReservation(s, a, r.id);
      if (!r.exchangeId) emitGiftActivity(s, a, i, "reservation");
      return { id: r.id };
    }
    case "reservations.update": {
      const p = z
        .object({
          id,
          revision,
          quantity: z.number().int().min(0).max(999),
          purchased: z.number().int().min(0).max(999),
          poolTargetCents: z
            .number()
            .int()
            .positive()
            .max(100000000)
            .optional(),
        })
        .parse(b);
      const r =
        s.reservations.find((r) => r.id === p.id && r.buyerId === a.id) ??
        fail(404, "Reservation not found.");
      checkRevision(r, p.revision);
      if (p.quantity > r.quantity || p.purchased > p.quantity)
        fail(
          400,
          "Make a new reservation to buy more. The quantity purchased cannot be higher than the quantity reserved.",
        );
      const i = s.items.find((i) => i.id === r.itemId);
      if (p.purchased > r.purchased && (!i || !canShop(s, a, i)))
        fail(403, "This gift is no longer available for new purchases.");
      if (
        p.poolTargetCents &&
        p.poolTargetCents !== r.poolTargetCents &&
        (r.exchangeId || !i || !itemVisible(s, a, i) || archived(s, i))
      )
        fail(400, "Contributions are not available for this reservation.");
      const pledged = s.contributions
        .filter((c) => c.reservationId === r.id && c.status !== "cancelled")
        .reduce((n, c) => n + c.amountCents, 0);
      if (p.poolTargetCents && p.poolTargetCents < pledged)
        fail(
          409,
          "The contribution goal must cover the contributions already promised.",
        );
      const wasFunded = !!r.poolTargetCents && pledged >= r.poolTargetCents;
      const increased = p.purchased > r.purchased;
      if (increased) r.purchasedAt = new Date().toISOString();
      Object.assign(r, p);
      touch(r);
      if (
        !wasFunded &&
        r.poolTargetCents &&
        pledged >= r.poolTargetCents &&
        r.quantity > 0
      )
        emitActivity(
          s,
          "contribution",
          [
            r.buyerId,
            ...s.contributions
              .filter(
                (c) => c.reservationId === r.id && c.status !== "cancelled",
              )
              .map((c) => c.userId),
          ],
          { itemId: r.itemId, reservationId: r.id, action: "funded" },
        );
      if (!r.quantity && r.poolTargetCents)
        emitActivity(
          s,
          "contribution",
          [
            r.buyerId,
            ...s.contributions
              .filter(
                (c) => c.reservationId === r.id && c.status !== "cancelled",
              )
              .map((c) => c.userId),
          ],
          {
            itemId: r.itemId,
            reservationId: r.id,
            actorId: a.id,
            action: "pool-cancelled",
          },
        );
      if (!r.quantity)
        for (const c of s.contributions.filter(
          (c) => c.reservationId === r.id && c.status === "pledged",
        )) {
          c.status = "cancelled";
          touch(c);
        }
      if (!r.exchangeId && i && !itemTrashed(s, i))
        emitGiftActivity(s, a, i, increased ? "purchase" : "reservation", {
          reservationId: r.id,
          action: !r.quantity ? "released" : undefined,
        });
      return r;
    }
    case "contributions.create": {
      const p = z
        .object({
          reservationId: id,
          amountCents: z.number().int().positive().max(100000000),
        })
        .parse(b);
      const r =
        s.reservations.find(
          (r) =>
            r.id === p.reservationId &&
            r.quantity > 0 &&
            !r.exchangeId &&
            r.poolTargetCents,
        ) ?? fail(404, "Shared gift not found.");
      const i = getItem(s, a, r.itemId);
      if (recipient(s, a, i) || archived(s, i) || r.buyerId === a.id)
        fail(403, "You cannot contribute to this gift.");
      const total = s.contributions
        .filter((c) => c.reservationId === r.id && c.status !== "cancelled")
        .reduce((n, c) => n + c.amountCents, 0);
      if (total + p.amountCents > r.poolTargetCents!)
        fail(
          409,
          "That amount is more than this gift still needs. Enter a smaller amount.",
        );
      const c = { ...stamp(), ...p, userId: a.id, status: "pledged" as const };
      s.contributions.push(c);
      emitActivity(s, "contribution", [r.buyerId], {
        itemId: i.id,
        reservationId: r.id,
        contributionId: c.id,
        action: "pledged",
        actorId: a.id,
      });
      if (total + p.amountCents === r.poolTargetCents)
        emitActivity(
          s,
          "contribution",
          [
            r.buyerId,
            ...s.contributions
              .filter(
                (c) => c.reservationId === r.id && c.status !== "cancelled",
              )
              .map((c) => c.userId),
          ],
          { itemId: i.id, reservationId: r.id, action: "funded" },
        );
      return c;
    }
    case "contributions.update": {
      const p = z
        .object({
          id,
          revision,
          status: z.enum(["sent", "received", "cancelled"]),
        })
        .parse(b);
      const c =
        s.contributions.find((c) => c.id === p.id) ??
        fail(404, "Contribution not found.");
      const r = s.reservations.find((r) => r.id === c.reservationId)!;
      if (p.status === "received" ? r.buyerId !== a.id : c.userId !== a.id)
        fail(404, "Contribution not found.");
      checkRevision(c, p.revision);
      if (
        (p.status === "received" && c.status !== "sent") ||
        (p.status === "sent" && c.status !== "pledged") ||
        (p.status === "cancelled" && c.status !== "pledged")
      )
        fail(
          409,
          "This contribution can no longer be changed that way. Refresh to see its current status.",
        );
      c.status = p.status;
      if (p.status === "sent") c.sentAt = new Date().toISOString();
      if (p.status === "received") c.receivedAt = new Date().toISOString();
      touch(c);
      emitActivity(s, "contribution", [r.buyerId, c.userId], {
        itemId: r.itemId,
        reservationId: r.id,
        contributionId: c.id,
        action: p.status,
        actorId: a.id,
      });
      return c;
    }
    default:
      fail(400, "Unknown action.");
  }
}
