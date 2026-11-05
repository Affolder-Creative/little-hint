import { Archive } from "lucide-react";
import { useNavigationState } from "./NavigationScroll";
import { GuidelineLabel, ExchangeGuidelineForm } from "./SpendingGuidance";
import { ordered } from "../shared/organization";
import {
  ActionMenu,
  CollectionTools,
  RunButton,
  TrashButton,
  TrashView,
  useOrganization,
} from "./Management";
import { Confirm } from "./Confirm";
import { canManageGroupEvents } from "../shared/group-events";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Shuffle, Plus, ArrowRight, Check, Gift } from "lucide-react";
import { useApp } from "./context";
import { Avatar, Form, Empty, Header } from "./components";
import { ExchangeForm, value } from "./forms";
import { ExchangeReview, exchangeMissingLists } from "./ExchangeReview";
export function Exchanges() {
  const { world, open, mutate, toast, close } = useApp();
  const [view, setView] = useNavigationState<string>("exchangeView", "active"),
    [search, setSearch] = useNavigationState<string>("exchangeSearch", ""),
    [group, setGroup] = useNavigationState<string>("exchangeGroup", ""),
    [status, setStatus] = useNavigationState<string>("exchangeStatus", "");
  const settings = useOrganization("exchanges");
  const canCreate = world.groups.some((g) =>
    canManageGroupEvents(g, world.me.id),
  );
  const location = useLocation();
  useEffect(() => {
    const target = world.exchanges.find(
      (e) => `#exchange-${e.id}` === location.hash,
    );
    if (target) setView(target.archived ? "archived" : "active");
  }, [location.hash]);
  const rows = world.exchanges.filter(
    (e) => !!e.archived === (view === "archived"),
  );
  const exchanges = ordered(rows, settings.sort, settings.order).filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) &&
      (!group || e.groupId === group) &&
      (!status || e.status === status),
  );
  return (
    <>
      <Header
        title="Gift exchanges"
        description="Draw names and give them something to smile about."
      >
        {canCreate && (
          <button
            className="button"
            onClick={() => open("Secret gift exchange", <ExchangeForm />)}
          >
            <Plus size={17} />
            Create exchange
          </button>
        )}
      </Header>
      <div className="tabs" role="group" aria-label="Exchange view">
        {["active", "archived", "trash"].map((value) => (
          <button
            key={value}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {value === "active"
              ? "Current"
              : value === "archived"
                ? "Archived"
                : "Trash"}
          </button>
        ))}
      </div>
      {view !== "trash" && (
        <>
          <CollectionTools
            scope="exchanges"
            rows={rows}
            search={search}
            setSearch={setSearch}
            group={group}
            setGroup={setGroup}
            status={status}
            setStatus={setStatus}
          />
        </>
      )}
      {view === "trash" ? (
        <TrashView kinds={["exchanges"]} />
      ) : exchanges.length ? (
        <div className="exchange-list">
          {exchanges.map((e) => (
            <section
              className="exchange-panel"
              key={e.id}
              id={`exchange-${e.id}`}
            >
              <div className="section-heading">
                <div>
                  <h2>{e.name}</h2>
                  <p>
                    {e.participantIds.length} participants · Each person gives
                    to {e.count} {e.count === 1 ? "person" : "people"} and
                    receives from {e.count}
                  </p>
                </div>
                <span className="status">
                  {e.status === "drawn"
                    ? "Names drawn"
                    : e.status === "draft"
                      ? "Getting ready"
                      : "Cancelled"}
                </span>
              </div>
              <GuidelineLabel amount={e.spendingGuidelineCents} />
              {e.archived && (
                <p className="notice">
                  This exchange is archived. Assignments and purchase history
                  are kept.
                </p>
              )}
              {e.canManage && (
                <div className="actions exchange-controls">
                  {e.status === "drawn" && !e.archived && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        open(
                          "Edit spending guideline",
                          <ExchangeGuidelineForm exchange={e} />,
                        )
                      }
                    >
                      Edit spending guideline
                    </button>
                  )}
                  {e.status === "draft" && !e.archived && (
                    <>
                      <ExchangeReview world={world} exchange={e} />
                      <button
                        className="button secondary"
                        onClick={() =>
                          open("Edit exchange", <ExchangeForm exchange={e} />)
                        }
                      >
                        Edit exchange
                      </button>
                      <button
                        className="button"
                        disabled={exchangeMissingLists(world, e).length > 0}
                        onClick={() =>
                          open(
                            "Review before drawing names",
                            <Form
                              submit="Draw names"
                              onSubmit={async () => {
                                await mutate("exchanges/draw", {
                                  id: e.id,
                                  revision: e.revision,
                                });
                                close();
                                toast(
                                  "Names drawn. Each person can see who they are giving to.",
                                );
                              }}
                            >
                              <ExchangeReview world={world} exchange={e} />
                              <p>
                                After drawing, you cannot change the people or
                                rules. Each giver will receive an update. Check
                                the details before you continue.
                              </p>
                            </Form>,
                          )
                        }
                      >
                        <Shuffle size={16} />
                        Draw names
                      </button>
                    </>
                  )}

                  <ActionMenu name={e.name} label="Exchange actions">
                    {e.status !== "cancelled" && (
                      <button
                        className="text-button muted"
                        onClick={() =>
                          open(
                            "Cancel this exchange?",
                            <Confirm
                              onConfirm={() =>
                                mutate("exchanges/cancel", {
                                  id: e.id,
                                  revision: e.revision,
                                })
                              }
                              label="Cancel exchange"
                            >
                              People will no longer see who they drew. Purchase
                              history will be kept.
                            </Confirm>,
                          )
                        }
                      >
                        Cancel exchange
                      </button>
                    )}
                    <RunButton
                      run={() =>
                        mutate("exchanges/archive", {
                          id: e.id,
                          revision: e.revision,
                          archived: !e.archived,
                        })
                      }
                    >
                      {e.archived ? "Restore exchange" : "Archive exchange"}
                    </RunButton>
                    {e.status !== "drawn" && (
                      <TrashButton kind="exchanges" entry={e} />
                    )}
                    {e.status === "drawn" && (
                      <p>Cancel the exchange before moving it to Trash.</p>
                    )}
                  </ActionMenu>
                </div>
              )}
              {e.myAssignments.length > 0 && (
                <div className="assignments">
                  <h3>Who you’re giving to</h3>
                  {e.myAssignments.map(([g, r]) => (
                    <Link
                      to={`/people/${r}?shopping=${encodeURIComponent(`${e.id}:${g}:${r}`)}`}
                      key={`${g}:${r}`}
                    >
                      <Avatar
                        name={
                          world.people.find((p) => p.id === r)?.name ??
                          "Recipient"
                        }
                        small
                      />
                      <span>
                        {world.people.find((p) => p.id === g)?.name} is giving
                        to{" "}
                        <strong>
                          {world.people.find((p) => p.id === r)?.name}
                        </strong>
                      </span>
                      <ArrowRight size={17} />
                    </Link>
                  ))}
                </div>
              )}
              {e.canManage && e.status === "drawn" && (
                <details
                  className="exchange-notifications"
                  open={e.delivery.pending > 0 || e.delivery.failed > 0}
                >
                  <summary>
                    Notification delivery
                    {e.delivery.failed > 0
                      ? ` · ${e.delivery.failed} failed`
                      : e.delivery.pending > 0
                        ? ` · ${e.delivery.pending} pending`
                        : ""}
                  </summary>
                  <p>
                    Notifications: {e.delivery.sent} processed ·{" "}
                    {e.delivery.pending} pending · {e.delivery.failed} failed
                  </p>
                  <small>
                    Delivery follows each person’s notification settings.
                  </small>
                </details>
              )}
            </section>
          ))}
        </div>
      ) : (
        <Empty
          title={
            world.exchanges.length
              ? "No matching exchanges"
              : "Start a little surprise"
          }
          action={
            !world.groups.length ? (
              <Link className="button" to="/settings?section=groups">
                Create or join a family group
              </Link>
            ) : undefined
          }
        >
          {world.exchanges.length
            ? "Try another search, view, or status."
            : canCreate
              ? "Choose participants and let Little Hint draw the names."
              : world.groups.length
                ? "A family-group owner or event leader can create a gift exchange for your group."
                : "Create or join a family group to take part in gift exchanges."}
        </Empty>
      )}
    </>
  );
}
