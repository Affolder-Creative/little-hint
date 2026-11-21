import { EventDate } from "./EventDate";
import { WishlistDrafts } from "./WishlistDrafts";
import { Browser } from "./Browser";
import { SpendingSummary } from "./Spending";
import { Pencil, Archive, ArchiveRestore, CalendarDays } from "lucide-react";
import { ImportDrafts } from "./ImportDrafts";
import { Action } from "./Action";
import { DiscoveryLink } from "./GiftPreferences";
import { ListIndex } from "./ListIndex";
import { ActionMenu, TrashButton } from "./Management";
import { FollowButton } from "./Notifications";
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Plus, ArrowRight, ArrowLeft, Check, Gift } from "lucide-react";
import { useApp } from "./context";
import { Empty, Header } from "./components";
import { ListForm, GiftForm } from "./forms";
import { GiftSummaryPanel } from "./ListFeatures";
import { PrivacyDetails } from "./PrivacyDetails";
import { ManagedEventNotice } from "./GroupEvents";
export function Lists() {
  const { id } = useParams();
  const { world, open, mutate } = useApp();
  const navigate = useNavigate();
  const [showSummary, setShowSummary] = useState(false);
  useEffect(() => setShowSummary(false), [id]);
  const list = world.lists.find((l) => l.id === id);
  const coManaging =
    !!list &&
    world.coManagement?.arrangements.some(
      (r) =>
        r.helperId === world.me.id &&
        r.status === "active" &&
        list.ownerIds.length === 1 &&
        !list.pendingOwnerIds.length &&
        list.ownerIds[0] === r.personId,
    );
  const coManagedPerson = coManaging
    ? world.people.find((p) => p.id === list?.ownerIds[0])
    : undefined;
  const ideaRecipients = world.people.filter(
    (person) =>
      list?.ownerIds.includes(person.id) &&
      person.userId !== world.me.id &&
      !person.guardians.includes(world.me.id),
  );
  if (id && !list)
    return (
      <Empty
        page
        title="List not found"
        action={
          <Link className="button secondary" to="/lists">
            Back to my lists
          </Link>
        }
      >
        This list may no longer be shared with you.
      </Empty>
    );
  const managesListPolicy = list?.canManagePolicy ?? list?.canEdit;
  const event = world.groupEvents.find((e) => e.id === list?.groupEventId);
  const eventName = event?.name ?? list?.name;
  const eventDescription = event?.description ?? list?.description;
  const giftIdeas = list &&
    (!managesListPolicy || coManaging) &&
    ideaRecipients.length > 0 && (
      <section className="list-gift-ideas">
        <h2>Gift ideas for {ideaRecipients.map((p) => p.name).join(" & ")}</h2>
        <p className="muted">
          {list.groupEventId
            ? `Save your own ideas for ${ideaRecipients.map((p) => p.name).join(" & ")} here, separately from this wish list.`
            : "Gift ideas are saved for a person, separately from this wish list."}
        </p>
        {(!managesListPolicy || coManaging) &&
          !list.archived &&
          ideaRecipients.length > 0 && (
            <button
              className="button secondary"
              onClick={() =>
                open(
                  "Add gift idea",
                  <GiftForm
                    initialSpendingListId={list.id}
                    recipientOptions={ideaRecipients.map((person) => person.id)}
                    onSaved={(gift) => navigate(`/gift/${gift.id}`)}
                  />,
                )
              }
            >
              <Plus size={17} /> Add gift idea
            </button>
          )}
        <nav aria-label="Saved gift ideas">
          {ideaRecipients.map((person) => (
            <Link
              className="gift-ideas-link"
              key={person.id}
              to={`/people/${person.id}?tab=ideas`}
            >
              {list.groupEventId && ideaRecipients.length === 1
                ? "View gift ideas"
                : `View gift ideas for ${person.name}`}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </section>
    );
  if (list)
    return (
      <>
        <Link
          className="back-link"
          to={
            coManaging
              ? `/people/${list.ownerIds[0]}`
              : managesListPolicy
                ? "/lists"
                : `/people/${list.ownerIds[0]}`
          }
        >
          <ArrowLeft size={16} />
          {coManaging
            ? (coManagedPerson?.name ?? "Your people")
            : managesListPolicy
              ? "My lists"
              : (world.people.find((p) => p.id === list.ownerIds[0])?.name ??
                "On their wish lists")}
        </Link>
        {coManaging && (
          <p className="notice">
            Managing wishes for {coManagedPerson?.name ?? "this person"}. You
            remain signed in as yourself and can still plan gifts for them.
          </p>
        )}
        <Header
          className={`list-heading${list.groupEventId ? " event-wish-heading" : ""}`}
          metadataBelow={!!list.groupEventId}
          title={
            list.groupEventId
              ? list.ownerIds.some((id) =>
                  world.people.some(
                    (p) => p.id === id && p.userId === world.me.id,
                  ),
                )
                ? "Your wish list"
                : `${list.ownerIds.map((id) => world.people.find((p) => p.id === id)?.name ?? "Recipient").join(" & ")}’s wish list`
              : list.name
          }
          description={list.groupEventId ? undefined : list.description}
          metadata={
            <>
              {list.groupEventId && (
                <div className="event-list-context">
                  <h2>{eventName}</h2>
                  {event?.eventDate && (
                    <p className="event-date">
                      <CalendarDays size={16} aria-hidden="true" />
                      <EventDate date={event.eventDate} />
                    </p>
                  )}
                  {eventDescription && (
                    <p className="muted">{eventDescription}</p>
                  )}
                </div>
              )}
              <div
                className={
                  list.groupEventId ? "event-wish-metadata" : undefined
                }
              >
                <PrivacyDetails
                  key={list.id}
                  list={list}
                  own={list.ownerIds.some((id) =>
                    world.people.some(
                      (p) => p.id === id && p.userId === world.me.id,
                    ),
                  )}
                />
                {list.groupEventId && event && (
                  <Link
                    className="text-button event-wish-manage"
                    to={`/events/${event.id}`}
                  >
                    {event.canManage ? "Manage event" : "View group event"}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                )}
              </div>
              {list.groupEventId && (
                <ManagedEventNotice list={list} showLink={false} />
              )}
            </>
          }
        >
          {list.canEdit && !list.archived && (
            <button
              className="button"
              onClick={() => open("Add item", <GiftForm listId={list.id} />)}
            >
              <Plus size={17} /> Add item
            </button>
          )}
          {list.canViewGiftSummary && !coManaging && !list.archived && (
            <DiscoveryLink
              personId={list.ownerIds.find((id) =>
                world.people.some(
                  (p) =>
                    p.id === id &&
                    (p.userId === world.me.id ||
                      p.guardians.includes(world.me.id)),
                ),
              )!}
              listId={list.id}
            />
          )}
          {list.canManageSettings ? (
            <ActionMenu name={list.name} label="List actions">
              <button
                className="text-button"
                onClick={() => open("Edit list", <ListForm list={list} />)}
              >
                <Pencil size={16} aria-hidden="true" /> Edit list
              </button>
              {(!managesListPolicy || list.hasOtherItemEditors) && (
                <FollowButton target="list" targetId={list.id} />
              )}
              <Action
                secondary
                onClick={() =>
                  mutate("lists/update", {
                    ...list,
                    archived: !list.archived,
                    ...(list.archived ? { archiveAfter: null } : {}),
                  })
                }
              >
                {list.archived ? (
                  <ArchiveRestore size={16} aria-hidden="true" />
                ) : (
                  <Archive size={16} aria-hidden="true" />
                )}{" "}
                {list.archived ? "Restore list" : "Archive list"}
              </Action>
              <TrashButton kind="lists" entry={list} />
            </ActionMenu>
          ) : !managesListPolicy || list.hasOtherItemEditors ? (
            <FollowButton target="list" targetId={list.id} />
          ) : null}
        </Header>
        {!list.ownerIds.some((id) =>
          world.people.some((p) => p.id === id && p.userId === world.me.id),
        ) && <SpendingSummary list={list.id} />}
        {list.archived && (
          <p className="notice">
            This list is archived. Existing purchase history is preserved.
          </p>
        )}
        {!list.groupEventId && giftIdeas}
        {list.groupEventId && (
          <h2 className="event-wish-items-heading">On this wish list</h2>
        )}
        {list.canEdit && (
          <>
            <WishlistDrafts listId={list.id} />
            <ImportDrafts listId={list.id} />
          </>
        )}
        {list.canViewGiftSummary && list.revealAvailable && (
          <div className="tabs" role="group" aria-label="List view">
            <button
              aria-pressed={!showSummary}
              onClick={() => setShowSummary(false)}
            >
              Items
            </button>
            <button
              aria-pressed={showSummary}
              onClick={() => setShowSummary(true)}
            >
              Gift summary
            </button>
          </div>
        )}
        {showSummary && list.canViewGiftSummary && list.revealAvailable ? (
          <GiftSummaryPanel listId={list.id} />
        ) : (
          <Browser
            scope="list"
            scopeId={list.id}
            listId={list.id}
            compactEmpty={!!list.groupEventId}
            items={world.items.filter((i) => i.listId === list.id)}
            searchLabel="Search items"
            emptyTitle={
              managesListPolicy && !list.archived && !list.groupEventId
                ? "Something in mind?"
                : "No items yet"
            }
            emptyText={
              list.archived
                ? "This archived wish list has no items."
                : list.groupEventId
                  ? managesListPolicy
                    ? `Add a few things you would love for ${eventName}.`
                    : `${list.ownerIds.map((id) => world.people.find((p) => p.id === id)?.name ?? "The recipient").join(" & ")} hasn’t added any wishes for ${eventName} yet.`
                  : managesListPolicy
                    ? "Add your first item to this wish list."
                    : "Check back when they have added a few hints."
            }
          />
        )}
        {list.groupEventId && giftIdeas}
      </>
    );
  return <ListIndex />;
}
