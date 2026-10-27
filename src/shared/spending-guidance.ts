import type { GiftView, World } from "./model";

export interface SpendingContext {
  kind: "exchange" | "event";
  id: string;
  recipientId: string;
  giverId?: string;
}
export interface SpendingPreview {
  itemId?: string;
  quantity?: number;
  poolReservationId?: string;
  poolTargetCents?: number;
  contributionReservationId?: string;
  amountCents?: number;
}

export function eventSpendingContext(
  world: World,
  gift: GiftView,
): SpendingContext | undefined {
  const list = world.lists.find((l) => l.id === gift.listId);
  if (!list?.groupEventId || list.ownerIds.length !== 1) return;
  if (!world.groupEvents.some((e) => e.id === list.groupEventId)) return;
  return {
    kind: "event",
    id: list.groupEventId,
    recipientId: list.ownerIds[0],
  };
}

export function reservationSpendingContext(
  world: World,
  r: World["buying"][number],
): SpendingContext | undefined {
  if (!r.exchangeId)
    return r.item ? eventSpendingContext(world, r.item) : undefined;
  const exchange = world.exchanges.find(
    (e) => e.id === r.exchangeId && e.status === "drawn",
  );
  if (!exchange) return;
  const recipients = exchange.myAssignments
    .filter(
      ([g, receiver]) =>
        g === r.giverId &&
        (r.exchangeRecipientId
          ? receiver === r.exchangeRecipientId
          : r.item?.recipientIds.includes(receiver)),
    )
    .map(([, receiver]) => receiver);
  if (recipients.length !== 1) return;
  return {
    kind: "exchange",
    id: exchange.id,
    giverId: r.giverId,
    recipientId: recipients[0],
  };
}

export function spendingGuideline(world: World, context: SpendingContext) {
  return (
    (context.kind === "exchange"
      ? world.exchanges.find((e) => e.id === context.id)
      : world.groupEvents.find((e) => e.id === context.id)
    )?.spendingGuidelineCents ?? null
  );
}

export function giftEstimate(
  priceCents: number | null,
  quantity: number,
  poolTargetCents = 0,
) {
  return {
    cents: Math.max((priceCents ?? 0) * quantity, poolTargetCents),
    unknown: priceCents === null,
  };
}

function sameContext(a: SpendingContext | undefined, b: SpendingContext) {
  return (
    !!a &&
    a.kind === b.kind &&
    a.id === b.id &&
    a.recipientId === b.recipientId &&
    a.giverId === b.giverId
  );
}

// Only consumes the viewer's authorized World. Never fetch other buyers' totals.
export function spendingSummary(
  world: World,
  context: SpendingContext,
  preview: SpendingPreview = {},
) {
  let cents = 0,
    unknown = 0,
    unattributed = 0;
  for (const r of world.buying) {
    if (r.quantity <= 0) continue;
    const resolved = reservationSpendingContext(world, r);
    if (
      context.kind === "exchange" &&
      r.exchangeId === context.id &&
      r.giverId === context.giverId &&
      !resolved
    ) {
      unattributed++;
      continue;
    }
    if (!sameContext(resolved, context)) continue;
    if (!r.item) {
      unknown++;
      continue;
    }
    const target =
      preview.poolReservationId === r.id
        ? preview.poolTargetCents
        : r.poolTargetCents;
    const estimate = giftEstimate(r.item.priceCents, r.quantity, target);
    const contributions =
      r.item.reservations?.find((entry) => entry.id === r.id)?.contributions ??
      [];
    const promised = contributions
      .filter((c) => c.status !== "cancelled" && c.userId !== world.me.id)
      .reduce((total, c) => total + c.amountCents, 0);
    cents += Math.max(0, estimate.cents - promised);
    if (estimate.unknown) unknown++;
  }
  if (context.kind === "event") {
    for (const gift of world.items) {
      if (!sameContext(eventSpendingContext(world, gift), context)) continue;
      for (const r of gift.reservations ?? []) {
        if (r.exchange || r.mine || r.quantity <= 0) continue;
        cents += (r.contributions ?? [])
          .filter((c) => c.userId === world.me.id && c.status !== "cancelled")
          .reduce((total, c) => total + c.amountCents, 0);
        if (preview.contributionReservationId === r.id)
          cents += preview.amountCents ?? 0;
      }
    }
  }
  if (preview.itemId && preview.quantity && preview.quantity > 0) {
    const gift = world.items.find((i) => i.id === preview.itemId);
    const estimate = giftEstimate(gift?.priceCents ?? null, preview.quantity);
    cents += estimate.cents;
    if (estimate.unknown) unknown++;
  }
  return { cents, unknown, unattributed };
}
