import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, dollars } from "./api";
import { useApp } from "./context";
import { Action } from "./Action";
import { Field, Form } from "./components";
import { Confirm } from "./Confirm";
import type { Contribution, Reservation } from "../shared/model";
import { returnedCents } from "../shared/contribution-money";

export const sourceLabels = {
  active: "Wish available",
  archived: "Wish archived",
  removed: "Wish removed",
  unavailable: "Wish unavailable",
};
export function GiftPlanDetail() {
  const [params] = useSearchParams();
  const contributionId = params.get("contribution"),
    reservationId = params.get("reservation");
  const { world, mutate, open, close } = useApp();
  const query = useQuery({
    queryKey: [
      "buying-history",
      "detail",
      world.me.id,
      contributionId,
      reservationId,
    ],
    enabled: !!(contributionId || reservationId),
    queryFn: async () => {
      if (contributionId)
        return api<{
          contribution: Contribution;
          reservation: Reservation;
          purchaser: boolean;
        }>(`buying/contribution/${contributionId}`);
      return {
        reservation: await api<Reservation>(
          `buying/reservations/${reservationId}`,
        ),
        contribution: undefined,
        purchaser: true,
      };
    },
  });
  if (!contributionId && !reservationId) return null;
  if (query.error)
    return (
      <p role="alert">
        This gift plan could not be loaded.{" "}
        <button onClick={() => void query.refetch()}>Try again</button>
      </p>
    );
  if (!query.data) return <p role="status">Loading gift plan…</p>;
  const { reservation: r, contribution: c, purchaser } = query.data;
  const state = r.sourceState ?? "active";
  const reviewNeeded =
    state !== "active" && r.sourceReviewedBy?.[world.me.id] !== r.sourceVersion;
  const update = (status: string) =>
    mutate("contributions/update", {
      id: c!.id,
      revision: c!.revision,
      status,
    });
  const dateDefault = new Date().toISOString().slice(0, 10);
  const moneyForm = (returnId?: string) =>
    open(
      returnId ? "Confirm return received" : "Record money returned",
      <Form
        submit={returnId ? "Confirm received" : "Record return sent"}
        cancel={close}
        onSubmit={async (f) => {
          await mutate(
            returnId ? "contributions/return-update" : "contributions/return",
            {
              id: c!.id,
              revision: c!.revision,
              returnId,
              status: returnId ? "received" : undefined,
              date: String(f.get("date")),
              amountCents: returnId
                ? undefined
                : Math.round(Number(f.get("amount")) * 100),
            },
          );
          close();
        }}
      >
        <p>
          This records money transferred outside Little Hint. It does not send
          money.
        </p>
        {!returnId && (
          <Field label="Amount returned (USD)">
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={(c!.amountCents - returnedCents(c!)) / 100}
              required
            />
          </Field>
        )}
        <Field label={returnId ? "Date received" : "Date sent"}>
          <input
            name="date"
            type="date"
            defaultValue={dateDefault}
            max={dateDefault}
            required
          />
        </Field>
      </Form>,
    );
  return (
    <section
      className="detail-section gift-plan-detail"
      aria-label="Selected gift plan"
    >
      <h2>{r.titleSnapshot}</h2>
      <p>{sourceLabels[state]}</p>
      {state !== "active" && (
        <p>
          The original wish has changed. Your buying and payment records remain
          here. Check your plans before proceeding.
        </p>
      )}
      {reviewNeeded && (
        <Action
          secondary
          onClick={async () =>
            open(
              "Review changed wish",
              <Confirm
                label="I have reviewed this change"
                onConfirm={() =>
                  mutate("reservations/review", {
                    id: r.id,
                    sourceVersion: r.sourceVersion,
                  })
                }
              >
                The wish is {state}. Recording a purchase or payment does not
                contact a shop or transfer money. Review your gift plans before
                continuing.
              </Confirm>,
            )
          }
        >
          Review change
        </Action>
      )}
      {!c && (
        <>
          <p>
            {r.purchased} of {r.quantity} purchased
          </p>
          <div className="actions">
            {r.quantity > r.purchased && (
              <Action
                secondary
                onClick={async () =>
                  open(
                    "Release unpurchased quantity",
                    <Confirm
                      label="Release unpurchased quantity"
                      onConfirm={() =>
                        mutate("reservations/update", {
                          id: r.id,
                          revision: r.revision,
                          quantity: r.purchased,
                          purchased: r.purchased,
                        })
                      }
                    >
                      Release the remaining reservation? Purchased quantities
                      and payment history will be kept.
                    </Confirm>,
                  )
                }
              >
                Release unpurchased quantity
              </Action>
            )}
            {world.spendingEnabled && (
              <Link to="/buying/spending">
                View purchases and record a refund
              </Link>
            )}
          </div>
        </>
      )}
      {c && (
        <>
          <p>
            {dollars(c.amountCents)} contribution · {c.status}
          </p>
          <p>
            Return sent: {dollars(returnedCents(c))} · Receipt confirmed:{" "}
            {dollars(
              (c.returns ?? [])
                .filter((v) => v.status === "received")
                .reduce((n, v) => n + v.amountCents, 0),
            )}{" "}
            · Still held: {dollars(c.amountCents - returnedCents(c))}
          </p>
          <div className="actions">
            {!purchaser && c.status === "pledged" && (
              <>
                <Action disabled={reviewNeeded} onClick={() => update("sent")}>
                  Mark as sent
                </Action>
                <Action secondary onClick={() => update("cancelled")}>
                  Cancel contribution
                </Action>
              </>
            )}
            {purchaser && c.status === "sent" && (
              <Action onClick={() => update("received")}>
                Confirm contribution received
              </Action>
            )}
            {purchaser &&
              c.status === "received" &&
              returnedCents(c) < c.amountCents && (
                <button
                  className="button secondary"
                  onClick={() => moneyForm()}
                >
                  Record money returned
                </button>
              )}
          </div>
          {(c.returns ?? []).map((ret) => (
            <div className="reservation-row" key={ret.id}>
              <div>
                <strong>{dollars(ret.amountCents)} return</strong>
                <p>
                  {ret.status === "sent"
                    ? "Awaiting receipt confirmation"
                    : ret.status === "received"
                      ? "Receipt confirmed"
                      : "Voided record"}{" "}
                  · Sent {ret.date}
                  {ret.receivedDate ? ` · Received ${ret.receivedDate}` : ""}
                </p>
              </div>
              {ret.status === "sent" &&
                (!purchaser ? (
                  <button
                    className="button secondary"
                    onClick={() => moneyForm(ret.id)}
                  >
                    Confirm return received
                  </button>
                ) : (
                  <Action
                    secondary
                    onClick={async () =>
                      open(
                        "Correct return record",
                        <Confirm
                          label="Void unconfirmed record"
                          onConfirm={() =>
                            mutate("contributions/return-update", {
                              id: c.id,
                              revision: c.revision,
                              returnId: ret.id,
                              status: "voided",
                            })
                          }
                        >
                          Only void an entry recorded in error. This does not
                          reverse a money transfer.
                        </Confirm>,
                      )
                    }
                  >
                    Void mistaken entry
                  </Action>
                ))}
            </div>
          ))}
        </>
      )}
      <Link className="text-button" to="/buying">
        Close gift-plan details
      </Link>
    </section>
  );
}
