import { useState } from "react";
import type { GiftView, World } from "../shared/model";
import {
  eventSpendingContext,
  giftEstimate,
  reservationSpendingContext,
  spendingGuideline,
  spendingSummary,
  type SpendingContext,
  type SpendingPreview,
} from "../shared/spending-guidance";
import { dollars } from "./api";
import { Field, Form } from "./components";
import { useApp } from "./context";

export function guidelineValue(data: FormData) {
  const value = String(data.get("spendingGuideline") ?? "").trim();
  return value ? Math.round(Number(value) * 100) : null;
}

export function GuidelineField({ amount }: { amount?: number | null }) {
  return (
    <Field
      label="Spending guideline in USD, optional"
      hint="Aim to spend no more than this amount in total for each person you give to. Gifts and contributions above it are still allowed. Leave blank for no guideline."
    >
      <input
        name="spendingGuideline"
        type="number"
        min="0.01"
        max="1000000"
        step="0.01"
        defaultValue={amount == null ? "" : amount / 100}
      />
    </Field>
  );
}

export function GuidelineLabel({ amount }: { amount?: number | null }) {
  return amount == null ? null : (
    <p className="muted">
      Spending guideline: {dollars(amount)} per person you give to, across all
      your gifts. Gifts above it are still allowed.
    </p>
  );
}

export function SpendingGuidance({
  context,
  preview,
  sharedGift,
}: {
  context?: SpendingContext;
  preview?: SpendingPreview;
  sharedGift?: {
    priceCents: number | null;
    quantity: number;
    poolTargetCents?: number;
  };
}) {
  const { world } = useApp();
  if (!context) return null;
  const limit = spendingGuideline(world, context);
  if (limit == null) return null;
  const total = spendingSummary(world, context, preview);
  const person =
    world.people.find((p) => p.id === context.recipientId)?.name ??
    "this recipient";
  const source =
    context.kind === "exchange"
      ? world.exchanges.find((e) => e.id === context.id)
      : world.groupEvents.find((e) => e.id === context.id);
  const shared = sharedGift
    ? giftEstimate(
        sharedGift.priceCents,
        sharedGift.quantity,
        sharedGift.poolTargetCents,
      )
    : null;
  return (
    <div
      className="spending-guidance"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p>
        {source?.name}: {dollars(limit)} guideline for {person}.
      </p>
      <p>
        Your planned gifts total {total.unknown ? "at least " : ""}
        {dollars(total.cents)}
        {total.cents > limit
          ? `, which is ${dollars(total.cents - limit)} above the guideline`
          : ""}
        . You can still reserve, buy, or contribute above it.
      </p>
      {preview?.itemId && (
        <small>Includes the quantity you are about to reserve.</small>
      )}
      {preview?.contributionReservationId && (
        <small>Includes the contribution entered above.</small>
      )}
      {preview?.poolReservationId && (
        <small>Uses the contribution goal entered above.</small>
      )}
      {shared && shared.cents > limit && (
        <p>
          This shared gift totals {shared.unknown ? "at least " : ""}
          {dollars(shared.cents)}, above the {dollars(limit)} guideline. Your
          personal total counts only your share.
        </p>
      )}
      {total.unknown > 0 && (
        <p>Some gifts have no listed price. Their full cost is not included.</p>
      )}
      {total.unattributed > 0 && (
        <p>
          Some earlier exchange gifts could not be assigned to a recipient and
          are not included.
        </p>
      )}
      <small>
        Estimate from gift plans you can currently view, including promised
        contributions. Prices may change. Tax and shipping are not included.
      </small>
    </div>
  );
}

export function ExchangeGuidelineForm({
  exchange,
}: {
  exchange: World["exchanges"][number];
}) {
  const { mutate, close, toast } = useApp();
  return (
    <Form
      submit="Save spending guideline"
      onSubmit={async (data) => {
        await mutate("exchanges/guideline", {
          id: exchange.id,
          revision: exchange.revision,
          spendingGuidelineCents: guidelineValue(data),
        });
        close();
        toast("Spending guideline saved.");
      }}
    >
      <GuidelineField amount={exchange.spendingGuidelineCents} />
      <p>
        Participants will receive an update if the guideline changes. Their
        assignments stay the same.
      </p>
    </Form>
  );
}

export function ShareCostForm({
  reservation: r,
}: {
  reservation: World["buying"][number];
}) {
  const { world, mutate, close } = useApp();
  const [amount, setAmount] = useState(
    r.poolTargetCents ? String(r.poolTargetCents / 100) : "",
  );
  const cents = Math.max(0, Math.round(Number(amount) * 100)) || 0;
  return (
    <Form
      submit="Save contribution goal"
      onSubmit={async () => {
        await mutate("reservations/update", {
          id: r.id,
          revision: r.revision,
          quantity: r.quantity,
          purchased: r.purchased,
          poolTargetCents: cents,
        });
        close();
      }}
    >
      <p>
        <strong>{r.titleSnapshot}</strong>
        {r.item ? ` · For ${r.item.recipientNames.join(" & ")}` : ""}
      </p>
      <Field label="Target amount in USD">
        <input
          name="amount"
          type="number"
          min="0.01"
          max="1000000"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <SpendingGuidance
        context={reservationSpendingContext(world, r)}
        preview={{ poolReservationId: r.id, poolTargetCents: cents }}
        sharedGift={{
          priceCents: r.item?.priceCents ?? null,
          quantity: r.quantity,
          poolTargetCents: cents,
        }}
      />
      <p>
        You buy the gift and confirm when you receive each contribution. Little
        Hint does not collect or send money.
      </p>
    </Form>
  );
}

export function ContributionForm({
  gift,
  reservation: r,
}: {
  gift: GiftView;
  reservation: NonNullable<GiftView["reservations"]>[number];
}) {
  const { world, mutate, toast, close } = useApp();
  const [amount, setAmount] = useState("");
  const cents = Math.max(0, Math.round(Number(amount) * 100)) || 0;
  return (
    <Form
      submit="Save contribution"
      onSubmit={async () => {
        await mutate("contributions", {
          reservationId: r.id,
          amountCents: cents,
        });
        toast(
          "Contribution saved. Send your payment to the person buying the gift.",
        );
        close();
      }}
    >
      <p>
        <strong>{gift.title}</strong> · For {gift.recipientNames.join(" & ")} ·
        Person buying the gift: {r.buyerName}
      </p>
      <Field label="Contribution in USD">
        <input
          name="amount"
          type="number"
          min="0.01"
          max="1000000"
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <SpendingGuidance
        context={eventSpendingContext(world, gift)}
        preview={{ contributionReservationId: r.id, amountCents: cents }}
        sharedGift={{
          priceCents: gift.priceCents,
          quantity: r.quantity,
          poolTargetCents: r.poolTargetCents,
        }}
      />
      <p>
        Little Hint does not send money. Pay the person buying the gift
        separately, then mark your contribution as sent.
      </p>
    </Form>
  );
}

export function ContributionSpendingGuidance({
  reservationId,
}: {
  reservationId: string;
}) {
  const { world } = useApp();
  const gift = world.items.find((i) =>
    i.reservations?.some(
      (r) => r.id === reservationId && !r.exchange && r.quantity > 0,
    ),
  );
  const reservation = gift?.reservations?.find((r) => r.id === reservationId);
  if (!gift || !reservation) return null;
  return (
    <SpendingGuidance
      context={eventSpendingContext(world, gift)}
      sharedGift={{
        priceCents: gift.priceCents,
        quantity: reservation.quantity,
        poolTargetCents: reservation.poolTargetCents,
      }}
    />
  );
}
