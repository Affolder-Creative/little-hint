import {
  buyingSorts,
  buyingSortLabels,
  sortBuying,
  type BuyingSort,
} from "../shared/buying-sort";
import { formatPrice, priceTotal } from "../shared/price";
import { shoppingUrl } from "../shared/shopping-offers";
import { dismissActionMenu } from "./menu-dismiss";
import { InfoHelp } from "./InfoHelp";
import { GiftPlanDetail, sourceLabels } from "./GiftPlanDetail";
import {
  CollectionStatus,
  Pagination,
  useCollection,
  useCollectionPage,
} from "./Pagination";
import type { BuyingPage } from "../shared/pagination";
import { UpdatePurchase } from "./UpdatePurchase";
import { useBuyingHistory } from "./useBuyingHistory";
import { SpendingSummary, PurchaseForm } from "./Spending";
import { Action } from "./Action";
import { useNavigationState } from "./NavigationScroll";
import {
  ContributionSpendingGuidance,
  ShareCostForm,
  SpendingGuidance,
} from "./SpendingGuidance";
import { reservationSpendingContext } from "../shared/spending-guidance";
import { ActionMenu, useOrganization } from "./Management";
import { contributionStatus } from "./copy";
import { Confirm } from "./Confirm";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Gift,
  Pencil,
  Users,
  CircleX,
  ExternalLink,
  Check,
} from "lucide-react";
import type { Reservation } from "../shared/model";
import { dollars } from "./api";
import { useApp } from "./context";
import {
  Form,
  Field,
  Empty,
  GiftPhoto,
  PrivateIdeaBadge,
  isPrivateIdea,
  privateIdeaDescription,
  Header,
} from "./components";
import { value } from "./forms";
export function Buying() {
  const { world, open, mutate, toast, close } = useApp();
  const history = useBuyingHistory("contributions");
  const contributions = history.data?.pages.flatMap((p) => p.rows) ?? [];
  const [showCancelled, setShowCancelled] = useState(false);
  const cancelled = useBuyingHistory("cancelled", showCancelled);
  const [view, setView] = useNavigationState<
    "needs-buying" | "purchased" | "all"
  >("buyingView", "needs-buying");
  const activeView = useRef<HTMLButtonElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (!focusRequest) return;
    // Wait for React to close the dialog and finish restoring its opener.
    (activeView.current ?? document.getElementById("main"))?.focus({
      preventScroll: true,
    });
  }, [focusRequest]);
  const settings = useOrganization("buying", "newest");
  const sort: BuyingSort = buyingSorts.includes(settings.sort as BuyingSort)
    ? (settings.sort as BuyingSort)
    : "newest";
  const [sortBusy, setSortBusy] = useState(false);
  const [sortError, setSortError] = useState("");
  const pagination = useCollectionPage(`${view}:${sort}`);
  const query = useCollection<BuyingPage>(
    `buying/active?view=${view}&sort=${sort}&page=${pagination.page}`,
  );
  const remote = world.paged ? query.data : undefined;
  useEffect(() => {
    if (remote && !query.isPlaceholderData && remote.page !== pagination.page)
      pagination.clamp(remote.page);
  }, [remote?.page, query.isPlaceholderData, pagination.page]);
  const reservations =
    remote?.rows ?? world.buying.filter((r) => r.quantity > 0);
  const needsBuying = reservations.filter((r) => r.purchased < r.quantity);
  const matchesView = (r: Pick<Reservation, "quantity" | "purchased">) =>
    view === "all" ||
    (view === "purchased"
      ? r.purchased >= r.quantity
      : r.purchased < r.quantity);
  const visible = sortBuying(reservations.filter(matchesView), sort);
  const focusView = () => setFocusRequest((request) => request + 1);
  if (world.paged && (!query.data || query.error))
    return <CollectionStatus query={query} />;
  const allCount = remote?.counts.all ?? reservations.length;
  const needsCount = remote?.counts.needsBuying ?? needsBuying.length;
  const sortControl = allCount > 0 && (
    <label className="buying-sort">
      <span className="sr-only">Sort gift plans</span>
      <select
        aria-label="Sort gift plans"
        value={sort}
        disabled={sortBusy}
        onChange={async (event) => {
          setSortBusy(true);
          setSortError("");
          try {
            await settings.save(event.target.value as BuyingSort);
          } catch (error) {
            setSortError(
              error instanceof Error
                ? error.message
                : "Could not save sort. Try again.",
            );
          } finally {
            setSortBusy(false);
          }
        }}
      >
        {buyingSorts.map((key) => (
          <option key={key} value={key}>
            {buyingSortLabels[key]}
          </option>
        ))}
      </select>
    </label>
  );
  const paging = (position: string) => (
    <Pagination
      page={remote?.page ?? 1}
      total={remote?.total ?? visible.length}
      change={pagination.setPage}
      busy={query.isFetching}
      position={position}
      controls={position === "above" ? sortControl : undefined}
    />
  );
  return (
    <>
      <Header
        title="Your gift plans"
        description="Keep track of gifts you’re buying and helping pay for."
      />
      <GiftPlanDetail />
      <SpendingSummary />
      {allCount > 0 && (
        <div
          className="tabs buying-views"
          role="group"
          aria-label="Gift purchase status"
        >
          {(
            [
              ["needs-buying", "Needs buying", needsCount],
              ["purchased", "Purchased", allCount - needsCount],
              ["all", "All", allCount],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              ref={view === key ? activeView : undefined}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      )}
      <div className="buying-toolbar">
        {world.paged ? paging("above") : sortControl}
      </div>
      {sortError && (
        <p role="alert" className="error">
          {sortError}
        </p>
      )}
      <div
        ref={pagination.target}
        tabIndex={-1}
        className="collection-results buying-results"
        role="region"
        aria-label="Gift plans"
      >
        {visible.length > 0 ? (
          <div className="buying-list">
            {visible.map((r) => {
              const needsBuying = r.purchased < r.quantity;
              const quickPurchase =
                !!r.item && r.quantity === 1 && r.purchased === 0;
              const shopFirst = needsBuying && !!r.item?.url;
              const shopAction = r.item?.url ? (
                <a
                  className={
                    shopFirst ? "button secondary small" : "text-button"
                  }
                  href={shoppingUrl(r.item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visit shop for ${r.titleSnapshot} (opens in a new tab)`}
                  onClick={(event) => dismissActionMenu(event.currentTarget)}
                >
                  Visit shop <ExternalLink size={16} aria-hidden="true" />
                </a>
              ) : null;
              const markAction = (
                <Action
                  secondary
                  onClick={async (button) => {
                    if (world.spendingEnabled) {
                      dismissActionMenu(button);
                      open(
                        "Mark as purchased",
                        <PurchaseForm
                          reservation={r}
                          onSuccess={() => {
                            toast("Purchase saved.");
                            focusView();
                          }}
                        />,
                      );
                      return;
                    }
                    await mutate("reservations/update", {
                      id: r.id,
                      revision: r.revision,
                      quantity: 1,
                      purchased: 1,
                    });
                    toast(
                      view === "needs-buying"
                        ? "Marked as purchased. Find it in Purchased to update or cancel."
                        : "Marked as purchased. Use Update purchase if your plans change.",
                    );
                    if (view === "needs-buying") focusView();
                  }}
                  label={`Mark ${r.titleSnapshot} as purchased`}
                >
                  <Check size={16} aria-hidden="true" /> Mark as purchased
                </Action>
              );
              const updateAction = (
                <button
                  className="button secondary small"
                  onClick={() =>
                    world.spendingEnabled && r.purchased < r.quantity
                      ? open(
                          "Mark as purchased",
                          <PurchaseForm
                            reservation={r}
                            onSuccess={() => {
                              toast("Purchase saved.");
                              focusView();
                            }}
                          />,
                        )
                      : world.spendingEnabled
                        ? open(
                            "Update purchase",
                            <UpdatePurchase
                              reservation={r}
                              onSuccess={() => {
                                toast("Purchase updated.");
                                focusView();
                              }}
                            />,
                          )
                        : open(
                            "Update purchase",
                            <Form
                              submit="Save purchase status"
                              onSubmit={async (f) => {
                                await mutate("reservations/update", {
                                  id: r.id,
                                  revision: r.revision,
                                  quantity: r.quantity,
                                  purchased: Number(value(f, "purchased")),
                                });
                                close();
                                toast("Purchase status updated.");
                                if (
                                  !matchesView({
                                    quantity: r.quantity,
                                    purchased: Number(value(f, "purchased")),
                                  })
                                )
                                  focusView();
                              }}
                            >
                              <p>
                                <strong>{r.titleSnapshot}</strong>
                                {r.item
                                  ? ` · For ${r.item.recipientNames.join(" & ")}`
                                  : ""}
                              </p>
                              <Field label="Quantity purchased">
                                <input
                                  name="purchased"
                                  type="number"
                                  min="0"
                                  max={r.quantity}
                                  defaultValue={r.purchased}
                                  required
                                />
                              </Field>
                              <p>
                                {isPrivateIdea(r.item)
                                  ? privateIdeaDescription
                                  : "Mark what you have bought so others know it is covered."}{" "}
                                If your plans change, choose Cancel reservation.
                              </p>
                            </Form>,
                          )
                  }
                >
                  <Pencil size={16} aria-hidden="true" /> Update purchase
                </button>
              );
              return (
                <div className="buying-row" key={r.id}>
                  {r.item ? (
                    <Link
                      to={`/gift/${r.item.id}`}
                      data-navigation-focus={`reservation-${r.id}`}
                      aria-label={`View ${r.titleSnapshot}`}
                    >
                      <GiftPhoto gift={r.item} />
                    </Link>
                  ) : (
                    <Gift size={36} />
                  )}
                  <div>
                    <h2>
                      {r.item ? (
                        <Link to={`/gift/${r.item.id}`}>{r.titleSnapshot}</Link>
                      ) : (
                        r.titleSnapshot
                      )}
                    </h2>
                    {r.item?.parentTitle && (
                      <p className="muted">Part of {r.item.parentTitle}</p>
                    )}
                    {r.sourceState && r.sourceState !== "active" && (
                      <p>
                        {sourceLabels[r.sourceState]} ·{" "}
                        <Link to={`/buying?reservation=${r.id}`}>
                          Review gift plan
                        </Link>
                      </p>
                    )}
                    <div className="idea-privacy">
                      {isPrivateIdea(r.item) && (
                        <InfoHelp
                          title="Only me"
                          triggerLabel={<PrivateIdeaBadge gift={r.item} />}
                        >
                          {privateIdeaDescription}
                        </InfoHelp>
                      )}
                    </div>
                    <p>
                      {r.item
                        ? `For ${r.item.recipientNames.join(" & ")}`
                        : "Access to the original gift has changed."}
                    </p>
                    <p className="buying-price">
                      {r.item?.priceCents != null ? (
                        <>
                          Listed price {formatPrice(r.item)}
                          {r.quantity > 1 && (
                            <>
                              {" "}
                              each ·{" "}
                              {formatPrice(
                                priceTotal(r.item, r.quantity),
                              )} for {r.quantity}
                            </>
                          )}
                        </>
                      ) : (
                        "Price not listed"
                      )}
                    </p>
                    <span className="status">
                      {r.purchased === r.quantity
                        ? "Purchased"
                        : r.purchased
                          ? `${r.purchased} of ${r.quantity} purchased`
                          : "Reserved"}
                    </span>
                    {r.exchangeId && (
                      <p className="muted">Secret gift exchange</p>
                    )}
                    <SpendingGuidance
                      context={reservationSpendingContext(world, r)}
                      sharedGift={
                        r.poolTargetCents
                          ? {
                              priceCents: r.item?.priceCents ?? null,
                              priceMaxCents: r.item?.priceMaxCents,
                              quantity: r.quantity,
                              poolTargetCents: r.poolTargetCents,
                              poolTotalCents: r.poolTotalCents,
                            }
                          : undefined
                      }
                    />
                  </div>
                  <div className="actions">
                    {shopFirst
                      ? shopAction
                      : quickPurchase
                        ? markAction
                        : updateAction}
                    <ActionMenu name={r.titleSnapshot} label="More actions">
                      {shopFirst && quickPurchase && markAction}
                      {(shopFirst || quickPurchase) && updateAction}
                      {!needsBuying && shopAction}
                      {!r.exchangeId && r.item && !r.item.archived && (
                        <button
                          className="text-button"
                          onClick={() =>
                            open(
                              "Share the cost",
                              <ShareCostForm reservation={r} />,
                            )
                          }
                        >
                          <Users size={16} aria-hidden="true" />
                          {r.poolTargetCents !== undefined
                            ? "Edit contribution goal"
                            : "Share the cost"}
                        </button>
                      )}
                      <button
                        className="text-button danger menu-destructive"
                        onClick={() =>
                          open(
                            "Cancel reservation",
                            <Form
                              submit="Cancel selected quantity"
                              onSubmit={async (f) => {
                                const release = Number(value(f, "release"));
                                const qty = r.quantity - release;
                                await mutate("reservations/update", {
                                  id: r.id,
                                  revision: r.revision,
                                  quantity: qty,
                                  purchased: Math.min(r.purchased, qty),
                                });
                                close();
                                if (
                                  !qty ||
                                  !matchesView({
                                    quantity: qty,
                                    purchased: Math.min(r.purchased, qty),
                                  })
                                )
                                  focusView();
                              }}
                            >
                              <p>
                                <strong>{r.titleSnapshot}</strong>
                                {r.item
                                  ? ` · For ${r.item.recipientNames.join(" & ")}`
                                  : ""}
                              </p>
                              <Field label="Quantity to cancel">
                                <input
                                  name="release"
                                  type="number"
                                  min="1"
                                  max={r.quantity}
                                  defaultValue={r.quantity}
                                  required
                                />
                              </Field>
                              <p>
                                The quantity you cancel becomes available for
                                others to reserve. This also reduces the
                                quantity marked as purchased if it is higher
                                than your remaining reservation. It does not
                                cancel a shop order or refund a payment.
                              </p>
                            </Form>,
                          )
                        }
                      >
                        <CircleX size={16} aria-hidden="true" /> Cancel
                        reservation
                      </button>
                    </ActionMenu>
                  </div>
                </div>
              );
            })}
          </div>
        ) : allCount > 0 ? (
          <Empty
            title={
              view === "needs-buying"
                ? "Nothing left to buy"
                : "No purchases marked yet"
            }
            action={
              <button
                className="button secondary"
                onClick={() => {
                  setView(
                    view === "needs-buying" ? "purchased" : "needs-buying",
                  );
                  focusView();
                }}
              >
                {view === "needs-buying"
                  ? "View purchased gifts"
                  : "View gifts to buy"}
              </button>
            }
          >
            {view === "needs-buying"
              ? "All your reserved quantities are marked purchased. You can still review or change them in Purchased."
              : "Gifts appear here once all reserved quantities are marked purchased. Partially purchased gifts stay in Needs buying."}
          </Empty>
        ) : (
          <Empty
            title="No gift plans yet"
            action={
              <Link className="button" to="/people">
                View wish lists <ArrowRight size={16} />
              </Link>
            }
          >
            Reserve a gift from someone’s list and you’ll find it here.
          </Empty>
        )}
      </div>
      {world.paged && paging("below")}
      <details
        className="detail-section"
        onToggle={(event) => setShowCancelled(event.currentTarget.open)}
      >
        <summary>Cancelled reservations</summary>
        {cancelled.isPending && showCancelled && (
          <p role="status">Loading cancelled reservations…</p>
        )}
        {cancelled.data?.pages
          .flatMap((p) => p.rows)
          .map((r) => (
            <div className="reservation-row" key={r.id}>
              <div>
                <strong>{r.titleSnapshot}</strong>
                <p>
                  Cancelled · first reserved{" "}
                  {new Date(r.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        {cancelled.data?.pages[0].rows.length === 0 && (
          <p>No cancelled reservations.</p>
        )}
        {cancelled.error && (
          <p role="alert">
            Could not load cancelled reservations.{" "}
            <button onClick={() => void cancelled.refetch()}>Try again</button>
          </p>
        )}
        {cancelled.hasNextPage && (
          <button
            className="button secondary"
            disabled={cancelled.isFetching}
            onClick={() => void cancelled.fetchNextPage()}
          >
            Load more cancelled reservations
          </button>
        )}
      </details>
      {history.isPending && <p role="status">Loading contributions…</p>}
      {history.error && (
        <p role="alert">
          Could not load contributions.{" "}
          <button onClick={() => void history.refetch()}>Try again</button>
        </p>
      )}
      {contributions.length > 0 && (
        <section className="detail-section">
          <h2>Contributions</h2>
          {contributions.map(
            ({
              contribution: c,
              purchaser,
              title,
              contributorName,
              purchaserName,
              sourceState,
            }) => (
              <div className="reservation-row" key={c.id}>
                <div>
                  <strong>{title}</strong>
                  {sourceState && sourceState !== "active" && (
                    <p>{sourceLabels[sourceState]}</p>
                  )}
                  <p>
                    <Link to={`/buying?contribution=${c.id}`}>
                      Review contribution and returns
                    </Link>
                  </p>
                  <p>
                    {contributorName} contributing to {purchaserName}'s purchase
                  </p>
                  <p>
                    {dollars(c.amountCents)} · {contributionStatus[c.status]}
                    {c.userId === world.me.id ? " · Your contribution" : ""}
                  </p>
                  {c.userId === world.me.id && c.status !== "cancelled" && (
                    <ContributionSpendingGuidance
                      reservationId={c.reservationId}
                    />
                  )}
                </div>
                {c.status === "pledged" &&
                  c.userId === world.me.id &&
                  (!sourceState || sourceState === "active") && (
                    <>
                      <Action
                        onClick={() =>
                          mutate("contributions/update", {
                            id: c.id,
                            revision: c.revision,
                            status: "sent",
                          })
                        }
                      >
                        Mark as sent
                      </Action>
                      <Action
                        secondary
                        onClick={() =>
                          mutate("contributions/update", {
                            id: c.id,
                            revision: c.revision,
                            status: "cancelled",
                          })
                        }
                      >
                        Cancel contribution
                      </Action>
                    </>
                  )}
                {c.status === "sent" && purchaser && (
                  <Action
                    onClick={() =>
                      mutate("contributions/update", {
                        id: c.id,
                        revision: c.revision,
                        status: "received",
                      })
                    }
                  >
                    Confirm {contributorName}'s {dollars(c.amountCents)}{" "}
                    received
                  </Action>
                )}
              </div>
            ),
          )}
          {history.hasNextPage && (
            <button
              className="button secondary"
              disabled={history.isFetching}
              onClick={() => void history.fetchNextPage()}
            >
              Load more contributions
            </button>
          )}
        </section>
      )}
    </>
  );
}
