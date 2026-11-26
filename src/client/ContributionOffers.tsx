import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ContributionOfferView, GiftView } from "../shared/model";
import type { HistoryPage } from "../shared/world";
import { priceEstimateCents } from "../shared/price";
import { api, dollars } from "./api";
import { useApp } from "./context";
import { Field, Form, useModalDismiss } from "./components";
import { Action } from "./Action";
import "./contribution-offers.css";

type GiftIdentity = Pick<GiftView, "id" | "title" | "recipientNames">;
export function ContributionOfferForm({
  gift,
  offer,
}: {
  gift: GiftIdentity;
  offer?: ContributionOfferView;
}) {
  const { mutate, close, toast, world } = useApp();
  const dismiss = useModalDismiss();
  return (
    <Form
      dialogLayout
      className="contribution-dialog"
      submit={offer ? "Save offer" : "Offer to contribute"}
      cancel={() => dismiss?.()}
      onSubmit={async (f) => {
        const amountCents = Math.round(Number(f.get("amount")) * 100);
        await mutate(
          offer ? "contribution-offers/update" : "contribution-offers",
          offer
            ? { id: offer.id, revision: offer.revision, amountCents }
            : { itemId: gift.id, amountCents },
        );
        close();
        toast("Offer saved. A buyer must accept it before you send payment.");
      }}
    >
      <p>
        <strong>{gift.title}</strong> · For {gift.recipientNames.join(" & ")}
      </p>
      <Field label="Your offer in USD">
        <input
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          max="1000000"
          step="0.01"
          required
          defaultValue={offer ? offer.amountCents / 100 : ""}
        />
      </Field>
      <p className="muted">
        Whoever reserves this gift can accept your offer. This does not reserve
        the gift or send money. You can cancel before marking payment as sent.
      </p>
      {world.spendingEnabled && (
        <p className="muted">
          Your offer counts in Still planning while it awaits acceptance.
        </p>
      )}
    </Form>
  );
}

export function OfferSelection({
  offers,
  selected,
  onChange,
}: {
  offers: ContributionOfferView[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (!offers.length) return null;
  return (
    <fieldset className="contribution-offer-selection">
      <legend>Contribution offers</legend>
      <div>
        <p className="muted">
          Select the offers you want to accept. Each offer is accepted for its
          full amount.
        </p>
        {offers.map((offer) => (
          <label className="check" key={offer.id}>
            <input
              type="checkbox"
              checked={selected.includes(offer.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, offer.id]
                    : selected.filter((id) => id !== offer.id),
                )
              }
            />
            {offer.contributorName} · {dollars(offer.amountCents)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function GiftContributionOffers({
  gift,
  ordinary,
}: {
  gift: GiftView;
  ordinary: boolean;
}) {
  const { world, open, mutate, toast } = useApp();
  const offers = gift.contributionOffers ?? [];
  const mine = offers.find((offer) => offer.userId === world.me.id);
  const openGoal = gift.reservations?.some(
    (r) => !r.exchange && !!r.poolTargetCents,
  );
  if (!ordinary || (!gift.canOfferContribution && !offers.length)) return null;
  return (
    <section className="contribution-offers">
      {offers.length > 0 && (
        <>
          <h3>Contribution offers</h3>
          {offers.map((offer) => (
            <p key={offer.id}>
              {offer.contributorName}
              {offer.mine ? " · You" : ""} offered {dollars(offer.amountCents)}
            </p>
          ))}
          <p className="muted">
            Awaiting buyer acceptance.
            {!gift.reservations?.length &&
              " No one has reserved this gift yet."}
          </p>
        </>
      )}
      <div className="actions">
        {gift.canOfferContribution &&
          (mine || (!openGoal && !gift.reservations?.some((r) => r.mine))) && (
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                open(
                  mine ? "Edit contribution offer" : "Offer to contribute",
                  <ContributionOfferForm gift={gift} offer={mine} />,
                )
              }
            >
              {mine ? "Edit your offer" : "Offer to contribute"}
            </button>
          )}
        {mine && (
          <Action
            secondary
            onClick={async () => {
              await mutate("contribution-offers/update", {
                id: mine.id,
                revision: mine.revision,
                status: "cancelled",
              });
              toast("Offer cancelled.");
            }}
          >
            Cancel offer
          </Action>
        )}
      </div>
    </section>
  );
}

export function ReserveWithOffers({
  gift,
  quantity,
  onSuccess,
}: {
  gift: GiftView;
  quantity: number;
  onSuccess: () => void;
}) {
  const { world, mutate, close } = useApp();
  const dismiss = useModalDismiss();
  const [selected, setSelected] = useState<string[]>([]);
  const [total, setTotal] = useState(
    priceEstimateCents(gift) == null
      ? ""
      : String((priceEstimateCents(gift)! * quantity) / 100),
  );
  const [own, setOwn] = useState("0");
  const offers = (gift.contributionOffers ?? []).filter(
    (offer) => offer.userId !== world.me.id,
  );
  const ownOffer = gift.contributionOffers?.find(
    (offer) => offer.userId === world.me.id,
  );
  const accepted = offers.filter((offer) => selected.includes(offer.id));
  const acceptedCents = accepted.reduce(
    (sum, offer) => sum + offer.amountCents,
    0,
  );
  return (
    <Form
      dialogLayout
      className="contribution-dialog"
      submit={selected.length ? "Reserve and accept offers" : "Reserve gift"}
      cancel={() => dismiss?.()}
      onSubmit={async () => {
        const poolTotalCents = Math.round(Number(total) * 100),
          poolOwnContributionCents = Math.round(Number(own) * 100);
        if (
          selected.length &&
          poolTotalCents - poolOwnContributionCents < acceptedCents
        )
          throw new Error(
            "The goal from others must cover the offers you selected.",
          );
        await mutate("reservations", {
          itemId: gift.id,
          ordinary: true,
          quantity,
          ...(selected.length
            ? {
                poolTotalCents,
                poolOwnContributionCents,
                acceptedOffers: accepted.map(({ id, revision }) => ({
                  id,
                  revision,
                })),
              }
            : {}),
        });
        close();
        onSuccess();
      }}
    >
      <p>
        <strong>{gift.title}</strong> · For {gift.recipientNames.join(" & ")}
      </p>
      <p>
        Quantity to reserve: {quantity}. You will be responsible for buying the
        gift.
      </p>
      {ownOffer && (
        <p className="notice">
          Your {dollars(ownOffer.amountCents)} offer will close when you become
          the buyer. Your buying plan replaces it in Still planning.
        </p>
      )}
      <OfferSelection
        offers={offers}
        selected={selected}
        onChange={setSelected}
      />
      {selected.length > 0 && (
        <>
          <Field
            label="Total gift cost in USD"
            hint="Starts with the listed price, or upper price for a range, for the quantity reserved. Adjust for tax and shipping."
          >
            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              inputMode="decimal"
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </Field>
          <Field
            label="Your contribution in USD"
            hint="Your intended share. This does not record a payment."
          >
            <input
              type="number"
              min="0"
              max={total || "1000000"}
              step="0.01"
              inputMode="decimal"
              required
              value={own}
              onChange={(e) => setOwn(e.target.value)}
            />
          </Field>
          <div className="shared-cost-summary" role="status">
            <p>Offers selected: {dollars(acceptedCents)}</p>
            <p>
              Goal from others:{" "}
              {dollars(
                Math.max(0, Math.round((Number(total) - Number(own)) * 100)),
              )}
            </p>
          </div>
        </>
      )}
      <p className="muted">
        Unselected offers stay available. Your spending estimate includes the
        full gift cost minus accepted contributions. Little Hint does not
        collect or send money.
      </p>
    </Form>
  );
}

export function ContributionOfferHistory() {
  const { world, open, mutate, toast } = useApp();
  const query = useInfiniteQuery({
    queryKey: ["buying-history", world.me.id, "contribution-offers"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<HistoryPage<ContributionOfferView>>(
        `buying/contribution-offers?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        undefined,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: 20000,
  });
  if (query.isPending) return <p role="status">Loading contribution offers…</p>;
  if (query.error)
    return (
      <p role="alert">
        Could not load contribution offers.{" "}
        <button className="text-button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </p>
    );
  const offers = query.data.pages
    .flatMap((page) => page.rows)
    .filter((offer) => offer.status === "open");
  if (!offers.length && !query.hasNextPage) return null;
  return (
    <section className="detail-section contribution-offers">
      <h2>Awaiting acceptance</h2>
      {offers.map((offer) => (
        <div className="contribution-offer-row" key={offer.id}>
          <div>
            <h3>{offer.titleSnapshot}</h3>
            <p>
              {dollars(offer.amountCents)} offered · Awaiting buyer acceptance
            </p>
            <p className="muted">For {offer.recipientNames.join(" & ")}</p>
            <Link to={`/gift/${offer.itemId}`}>View gift</Link>
          </div>
          <div className="actions">
            <button
              className="button secondary"
              onClick={() =>
                open(
                  "Edit contribution offer",
                  <ContributionOfferForm
                    gift={{
                      id: offer.itemId,
                      title: offer.titleSnapshot,
                      recipientNames: offer.recipientNames,
                    }}
                    offer={offer}
                  />,
                )
              }
            >
              Edit offer
            </button>
            <Action
              secondary
              onClick={async () => {
                await mutate("contribution-offers/update", {
                  id: offer.id,
                  revision: offer.revision,
                  status: "cancelled",
                });
                toast("Offer cancelled.");
              }}
            >
              Cancel offer
            </Action>
          </div>
        </div>
      ))}
      {query.hasNextPage && (
        <button
          className="button secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more offers
        </button>
      )}
    </section>
  );
}
