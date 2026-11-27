import { OfferSelection } from "./ContributionOffers";
import { isPriceRange, priceEstimateCents } from "../shared/price";
import { productItems } from "../shared/item-groups";
import { netContribution } from "../shared/contribution-money";
import { useCollection } from "./Pagination";
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
import { Field, Form, useModalDismiss } from "./components";
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
    priceMaxCents?: number | null;
    quantity: number;
    poolTotalCents?: number;
    poolTargetCents?: number;
  };
}) {
  const { world } = useApp();
  const params = new URLSearchParams(
    Object.entries({ ...context, ...preview })
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  const summary = useCollection<ReturnType<typeof spendingSummary>>(
    `buying/guidance?${params}`,
    !!context,
  );
  if (!context) return null;
  const limit = spendingGuideline(world, context);
  if (limit == null) return null;
  const total = world.paged
    ? summary.data
    : spendingSummary(world, context, preview);
  if (!total)
    return (
      <p role="status">
        {summary.error
          ? "Spending estimate unavailable."
          : "Loading spending estimate…"}
      </p>
    );
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
        sharedGift.poolTotalCents,
        sharedGift.priceMaxCents,
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
      {(total.usesRangeMaximum ||
        (sharedGift &&
          sharedGift.poolTotalCents == null &&
          isPriceRange(sharedGift))) && (
        <small>Estimates for price ranges use the upper price.</small>
      )}
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
  const dismiss = useModalDismiss();
  const cost = r.recordedCost;
  const startsLinked =
    r.poolCostSource === "recorded-spending" ||
    (r.poolTotalCents == null &&
      r.poolTargetCents == null &&
      cost?.status === "ready");
  const [linked, setLinked] = useState(startsLinked);
  const legacy =
    r.poolTargetCents !== undefined && r.poolTotalCents === undefined;
  const [totalEdited, setTotalEdited] = useState(false);
  const [total, setTotal] = useState(
    startsLinked && cost?.totalCents != null
      ? String(cost.totalCents / 100)
      : r.poolTotalCents != null
        ? String(r.poolTotalCents / 100)
        : !legacy && r.item?.priceCents != null
          ? String((priceEstimateCents(r.item)! * r.quantity) / 100)
          : "",
  );
  const [own, setOwn] = useState(
    startsLinked && cost?.totalCents != null
      ? String(Math.max(0, cost.totalCents - (r.poolTargetCents ?? 0)) / 100)
      : r.poolOwnContributionCents != null
        ? String(r.poolOwnContributionCents / 100)
        : legacy
          ? ""
          : "0",
  );
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const offers = (r.item?.contributionOffers ?? []).filter(
    (offer) => offer.userId !== world.me.id,
  );
  const acceptedOffers = offers.filter((offer) =>
    selectedOffers.includes(offer.id),
  );
  const offeredCents = acceptedOffers.reduce(
    (sum, offer) => sum + offer.amountCents,
    0,
  );
  const totalCents = Math.round(Number(total) * 100);
  const ownCents = Math.round(Number(own) * 100);
  const target = totalCents - ownCents;
  const contributions =
    r.item?.reservations?.find((v) => v.id === r.id)?.contributions ?? [];
  const pledged = contributions.reduce((n, c) => n + netContribution(c), 0);
  const received = contributions
    .filter((c) => c.status === "received")
    .reduce((n, c) => n + netContribution(c), 0);
  return (
    <Form
      dialogLayout
      className="contribution-dialog"
      cancel={() => dismiss?.()}
      submit={
        acceptedOffers.length
          ? "Save and accept offers"
          : "Save contribution goal"
      }
      onSubmit={async () => {
        if (ownCents > totalCents)
          throw new Error(
            "Your contribution cannot exceed the total gift cost.",
          );
        if (target < pledged + offeredCents)
          throw new Error(
            "The goal from others must cover existing contributions and selected offers.",
          );
        await mutate("reservations/update", {
          id: r.id,
          revision: r.revision,
          quantity: r.quantity,
          purchased: r.purchased,
          poolCostSource: linked ? "recorded-spending" : "manual",
          costToken: linked ? cost?.token : undefined,
          poolTotalCents: totalCents,
          poolOwnContributionCents: ownCents,
          acceptedOffers: acceptedOffers.map(({ id, revision }) => ({
            id,
            revision,
          })),
        });
        close();
      }}
    >
      <p>
        <strong>{r.titleSnapshot}</strong>
        {r.item ? ` · For ${r.item.recipientNames.join(" & ")}` : ""}
      </p>
      <p className="muted" role="status">
        {linked
          ? cost?.status === "incomplete"
            ? "Waiting for a complete purchase cost. Record all purchase amounts before saving, or enter a manual total."
            : cost?.status === "review"
              ? "Review shared cost. Adjust the goal from others to fit the recorded cost before saving."
              : "Linked to recorded spending. Purchase corrections and shop refunds update this total and your share."
          : cost?.status === "incomplete" && r.purchased > 0
            ? "Manual total. Finish buying and record every purchase amount to link this cost."
            : "Manual total. Recorded spending will not change this goal."}
      </p>
      {!linked &&
        cost?.totalCents != null &&
        cost.totalCents >= 0 &&
        cost.totalCents <= 100000000 && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setLinked(true);
              setTotal(String(cost.totalCents! / 100));
              setOwn(
                String(
                  Math.max(0, cost.totalCents! - (r.poolTargetCents ?? 0)) /
                    100,
                ),
              );
            }}
          >
            Use recorded spending
          </button>
        )}
      {legacy && (
        <p className="muted">
          Your existing goal from others is {dollars(r.poolTargetCents!)}. Enter
          the full gift cost and your intended share to update it.
        </p>
      )}
      <Field
        label="Total gift cost in USD"
        hint={
          linked
            ? "Uses your recorded purchase cost after shop refunds."
            : !totalEdited &&
                r.poolTotalCents == null &&
                !legacy &&
                r.item &&
                isPriceRange(r.item)
              ? "Starts with the upper price for the quantity reserved. Adjust it to include tax and shipping."
              : "The full cost for the quantity you reserved, including any tax or shipping you want to cover."
        }
      >
        <input
          name="totalCost"
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          required
          value={total}
          onChange={(e) => {
            setLinked(false);
            setTotalEdited(true);
            setTotal(e.target.value);
          }}
        />
      </Field>
      <Field
        label="Your contribution in USD"
        hint="Your intended share. Lower it to ask others to contribute. This does not record a payment."
      >
        <input
          name="ownContribution"
          type="number"
          min="0"
          max={total || "1000000"}
          step="0.01"
          required
          value={own}
          onChange={(e) => setOwn(e.target.value)}
        />
      </Field>
      <OfferSelection
        offers={offers}
        selected={selectedOffers}
        onChange={setSelectedOffers}
      />
      {total !== "" && own !== "" && target >= 0 && (
        <div className="shared-cost-summary" role="status" aria-live="polite">
          <p>
            <strong>Goal from others: {dollars(target)}</strong>
          </p>
          {pledged > 0 && (
            <p>
              Already pledged: {dollars(pledged)} · Received:{" "}
              {dollars(received)}
            </p>
          )}
          {offeredCents > 0 && <p>Offers selected: {dollars(offeredCents)}</p>}
          <p>
            Still needs contributors:{" "}
            {dollars(Math.max(0, target - pledged - offeredCents))}
          </p>
        </div>
      )}
      <SpendingGuidance
        context={reservationSpendingContext(world, r)}
        preview={{
          poolReservationId: r.id,
          poolTargetCents: Math.max(0, target),
          poolTotalCents: totalCents > 0 ? totalCents : undefined,
        }}
        sharedGift={{
          priceCents: r.item?.priceCents ?? null,
          priceMaxCents: r.item?.priceMaxCents,
          quantity: r.quantity,
          poolTargetCents: Math.max(0, target),
          poolTotalCents: totalCents > 0 ? totalCents : undefined,
        }}
      />
      <p className="shared-cost-help">
        Your spending estimate includes the full cost until others pledge. You
        buy the gift and confirm each payment received. Little Hint does not
        collect or send money.
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
          priceMaxCents: gift.priceMaxCents,
          quantity: r.quantity,
          poolTargetCents: r.poolTargetCents,
          poolTotalCents: r.poolTotalCents,
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
  const query = useCollection<GiftView | null>(
    `buying/contribution-context/${reservationId}`,
  );
  const gift = world.paged
    ? query.data
    : productItems(world.items).find((i) =>
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
        priceMaxCents: gift.priceMaxCents,
        quantity: reservation.quantity,
        poolTargetCents: reservation.poolTargetCents,
        poolTotalCents: reservation.poolTotalCents,
      }}
    />
  );
}
