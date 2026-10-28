import { useNavigationState } from "./NavigationScroll";
import {
  GuidelineField,
  GuidelineLabel,
  guidelineValue,
} from "./SpendingGuidance";
import { ordered } from "../shared/organization";
import {
  ActionMenu,
  CollectionTools,
  TrashButton,
  useOrganization,
} from "./Management";
import { familyGroupLabel } from "../shared/households";
/* Group events extend the existing list rows and focused forms. Organizers choose
   recipients once; families open individual wish lists. Keep gift activity private. */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Plus } from "lucide-react";
import type { Group, GroupEvent, List } from "../shared/model";
import { canManageGroupEvents, peopleForGroup } from "../shared/group-events";
import { Avatar, Empty, Field, Form, Header, Privacy } from "./components";
import { useApp } from "./context";
import {
  ListPolicyFields,
  listPolicyValues,
  SharingReview,
} from "./ListPolicyFields";

export function EventForm({
  event,
  groupId: initialGroupId,
}: {
  event?: GroupEvent;
  groupId?: string;
}) {
  const { world, mutate, close, toast } = useApp();
  const navigate = useNavigate();
  const groups = world.groups.filter((g) =>
    canManageGroupEvents(g, world.me.id),
  );
  const [groupId, setGroupId] = useState(
    event?.groupId ?? initialGroupId ?? groups[0]?.id ?? "",
  );
  const group = groups.find((g) => g.id === groupId);
  const people = group ? peopleForGroup(world.people, group) : [];
  const [participants, setParticipants] = useState(
    event?.participantIds ?? people.map((p) => p.id),
  );
  const policy = event ? { ...event, modeLocked: true } : undefined;
  if (!group)
    return (
      <p>
        You can no longer manage events in this family group. Close this form
        and refresh the page.
      </p>
    );
  return (
    <Form
      className="list-form"
      submit={
        event
          ? "Save event"
          : `Create ${participants.length} wish ${participants.length === 1 ? "list" : "lists"}`
      }
      disabled={!event && participants.length === 0}
      review={(data) =>
        !event ? (
          <>
            <SharingReview data={data} audience={[group.name]} />
            <GuidelineLabel amount={guidelineValue(data)} />
          </>
        ) : null
      }
      onSubmit={async (form) => {
        if (participants.some((id) => !people.some((p) => p.id === id)))
          throw new Error(
            "The people in this family group have changed. Reopen this form to choose from the current members.",
          );
        const result = await mutate<{ id: string }>(
          event ? "group-events/update" : "group-events",
          {
            ...(event
              ? {
                  id: event.id,
                  revision: event.revision,
                  archived: event.archived,
                }
              : { groupId }),
            name: String(form.get("name") ?? ""),
            description: String(form.get("description") ?? ""),
            spendingGuidelineCents: guidelineValue(form),
            participantIds: participants,
            ...listPolicyValues(form, policy),
          },
        );
        close();
        navigate(`/events/${result.id}`);
        toast(
          event
            ? "Event updated."
            : "Your family group’s wish lists are ready.",
        );
      }}
    >
      {!event && groups.length > 1 ? (
        <Field label="Family group">
          <select
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setParticipants(
                peopleForGroup(
                  world.people,
                  groups.find((g) => g.id === e.target.value)!,
                ).map((p) => p.id),
              );
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {familyGroupLabel(g, world)}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p className="muted">For {group.name}</p>
      )}
      <Field label="Event name">
        <input
          name="name"
          required
          maxLength={160}
          defaultValue={event?.name}
          placeholder="Christmas 2026"
        />
      </Field>
      <Field label="A note for the family group">
        <textarea
          name="description"
          rows={2}
          maxLength={2000}
          defaultValue={event?.description}
          placeholder="Dates, gift ideas, or anything everyone should know."
        />
      </Field>
      <GuidelineField amount={event?.spendingGuidelineCents} />
      <ListPolicyFields list={policy} event>
        <fieldset className="choice-group form-section event-participants">
          <legend>Who needs a wish list?</legend>
          <p className="muted">
            Each selected person gets a wish list. Everyone in this family group
            can shop from it.
          </p>
          <div className="event-selection-actions">
            <span aria-live="polite">{participants.length} selected</span>
            <button
              type="button"
              className="text-button"
              data-form-change
              onClick={() => setParticipants(people.map((p) => p.id))}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-button"
              data-form-change
              onClick={() => setParticipants([])}
            >
              Clear
            </button>
          </div>
          {people.map((person) => (
            <label className="check event-person-choice" key={person.id}>
              <input
                type="checkbox"
                name="participantIds"
                value={person.id}
                checked={participants.includes(person.id)}
                onChange={(e) =>
                  setParticipants((selected) =>
                    e.target.checked
                      ? [...selected, person.id]
                      : selected.filter((id) => id !== person.id),
                  )
                }
              />
              <span>
                {person.name}
                {!person.userId && <small>Managed profile</small>}
              </span>
            </label>
          ))}
          {event && (
            <small>
              Removing someone archives their list and keeps its items and
              purchase history shared with the family group. Re-adding them
              restores the same list.
            </small>
          )}
          {!event && !participants.length && (
            <small>Select at least one person to create the event.</small>
          )}
          <small>
            New family-group members are added only when a leader selects them
            here.
          </small>
        </fieldset>
      </ListPolicyFields>
      {!event && (
        <p className="muted">
          Lists are shared immediately. Check privacy and reveal settings before
          creating the event; they lock when shared.
        </p>
      )}
    </Form>
  );
}

export function EventLeadersForm({ group }: { group: Group }) {
  const { world, mutate, close, toast } = useApp();
  return (
    <Form
      submit="Save event leaders"
      onSubmit={async (form) => {
        await mutate("groups/event-leaders", {
          groupId: group.id,
          revision: group.revision,
          userIds: form.getAll("leaders").map(String),
        });
        close();
        toast("Event leaders updated.");
      }}
    >
      <p>
        You manage events and gift exchanges as the family group owner. Choose
        other members who can create and manage every event and gift exchange in{" "}
        {group.name}.
      </p>
      <fieldset className="choice-group">
        <legend>Event leaders</legend>
        {group.memberIds
          .filter((id) => id !== group.ownerId)
          .map((id) => (
            <label className="check" key={id}>
              <input
                type="checkbox"
                name="leaders"
                value={id}
                defaultChecked={group.eventLeaderIds?.includes(id)}
              />
              {world.people.find((p) => p.userId === id)?.name ?? "Member"}
            </label>
          ))}
        {group.memberIds.length === 1 && (
          <p>Invite another member to appoint an event leader.</p>
        )}
      </fieldset>
      <p className="muted">
        Event leaders manage event and gift exchange settings, participants, and
        exchange drawings. This does not reveal anyone else’s secret
        assignments. Only the family group owner manages membership and appoints
        leaders. People still edit their own wish-list items.
      </p>
    </Form>
  );
}

export function GroupEventSettings({ group }: { group: Group }) {
  const { world, open } = useApp();
  const events = world.groupEvents.filter(
    (event) => event.groupId === group.id && !event.archived,
  );
  return (
    <div className="group-event-settings">
      <div className="section-heading">
        <h4>Group events</h4>
        {canManageGroupEvents(group, world.me.id) && (
          <button
            className="text-button"
            onClick={() =>
              open(
                "Create a family group event",
                <EventForm groupId={group.id} />,
              )
            }
          >
            <Plus size={16} />
            Create event
          </button>
        )}
      </div>
      {events.length ? (
        <ul className="event-links">
          {events.map((event) => (
            <li key={event.id}>
              <Link to={`/events/${event.id}`}>
                {event.name}
                <ArrowRight size={16} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No active events yet.</p>
      )}
      {group.ownerId === world.me.id && (
        <button
          className="text-button"
          onClick={() =>
            open("Choose event leaders", <EventLeadersForm group={group} />)
          }
        >
          Manage event leaders
        </button>
      )}
    </div>
  );
}

export function GroupEventsSection({ archived }: { archived: boolean }) {
  const { world, open } = useApp();
  const [search, setSearch] = useNavigationState<string>("eventSearch", ""),
    [group, setGroup] = useNavigationState<string>("eventGroup", "");
  const settings = useOrganization("events");
  const ownedLists = world.lists.filter(
    (l) => l.canEdit && l.archived === archived,
  );
  const events = world.groupEvents.filter(
    (event) =>
      event.archived === archived ||
      ownedLists.some((l) => l.groupEventId === event.id),
  );
  const canCreate = world.groups.some((g) =>
    canManageGroupEvents(g, world.me.id),
  );
  if (!world.groups.length) return null;
  const filtered = ordered(events, settings.sort, settings.order).filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) &&
      (!group || e.groupId === group),
  );
  return (
    <section
      className="group-events-section"
      aria-labelledby="group-events-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="group-events-heading">Group events</h2>
          <p className="muted">One occasion, a wish list for each person.</p>
        </div>
        {canCreate && (
          <button
            className="button secondary small"
            onClick={() => open("Create a family group event", <EventForm />)}
          >
            <Plus size={17} />
            Create event
          </button>
        )}
      </div>
      {events.length > 1 && (
        <CollectionTools
          scope="events"
          rows={events}
          search={search}
          setSearch={setSearch}
          group={group}
          setGroup={setGroup}
        />
      )}
      {filtered.map((event) => {
        const mine = ownedLists
          .filter((l) => l.groupEventId === event.id)
          .sort(
            (a, b) =>
              Number(
                !a.ownerIds.some((id) =>
                  world.people.some(
                    (p) => p.id === id && p.userId === world.me.id,
                  ),
                ),
              ) -
                Number(
                  !b.ownerIds.some((id) =>
                    world.people.some(
                      (p) => p.id === id && p.userId === world.me.id,
                    ),
                  ),
                ) || a.ownerIds[0].localeCompare(b.ownerIds[0]),
          );
        return (
          <article className="event-entry" key={event.id}>
            <div className="event-entry-heading">
              <span className="list-symbol">
                <CalendarDays size={24} />
              </span>
              <div>
                <h3>{event.name}</h3>
                <p>
                  Shared with:{" "}
                  {world.groups.find((g) => g.id === event.groupId)?.name ??
                    "Family group"}{" "}
                  · {event.participantIds.length}{" "}
                  {event.participantIds.length === 1
                    ? "participant"
                    : "participants"}
                </p>
              </div>
              <Privacy mode={event.mode} />
            </div>
            <div className="event-entry-links">
              {mine.map((list) => {
                const own = list.ownerIds.some((id) =>
                  world.people.some(
                    (p) => p.id === id && p.userId === world.me.id,
                  ),
                );
                const label = own
                  ? "Your wish list"
                  : `${list.ownerIds.map((id) => world.people.find((p) => p.id === id)?.name ?? "Managed profile").join(" & ")}’s wish list`;
                return (
                  <Link
                    key={list.id}
                    className="event-wishlist-link"
                    to={`/lists/${list.id}`}
                  >
                    <span>
                      {label}
                      {list.archived && <small>Archived wish list</small>}
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                );
              })}
              <Link className="text-button" to={`/events/${event.id}`}>
                {event.canManage ? "Manage event" : "View event"}
                <ArrowRight size={16} />
              </Link>{" "}
              {event.canManage && (
                <ActionMenu name={event.name} label="Event actions">
                  <button
                    className="text-button"
                    onClick={() =>
                      open("Edit group event", <EventForm event={event} />)
                    }
                  >
                    Edit event
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      open(
                        event.archived
                          ? "Restore group event"
                          : "Archive group event",
                        <EventArchiveForm event={event} />,
                      )
                    }
                  >
                    {event.archived ? "Restore event" : "Archive event"}
                  </button>
                  <TrashButton kind="group-events" entry={event} />
                </ActionMenu>
              )}
            </div>
          </article>
        );
      })}
      {!filtered.length && (
        <p className="muted">
          {search || group
            ? "No matching events."
            : archived
              ? "No archived group events."
              : "Plan one occasion and create a wish list for each person taking part."}
        </p>
      )}
    </section>
  );
}

function EventArchiveForm({ event }: { event: GroupEvent }) {
  const { mutate, close, toast } = useApp();
  return (
    <Form
      submit={event.archived ? "Restore event" : "Archive event"}
      cancel={close}
      onSubmit={async () => {
        await mutate("group-events/update", {
          ...event,
          archived: !event.archived,
        });
        close();
        toast(event.archived ? "Event restored." : "Event archived.");
      }}
    >
      <p>
        {event.archived
          ? "Restore lists for current participants. Removed participants’ lists stay archived. The automatic archive date will be cleared."
          : "Archive every list in this event. Existing items and purchase history are kept. No one can add items or make new reservations."}
      </p>
    </Form>
  );
}

export function EventPage() {
  const { id } = useParams();
  const { world, open } = useApp();
  const event = world.groupEvents.find((event) => event.id === id);
  if (!event)
    return (
      <Empty page title="Event not found">
        This event may no longer be shared with you.{" "}
        <Link to="/lists">Return to My lists</Link>.
      </Empty>
    );
  const lists = world.lists.filter((list) => list.groupEventId === event.id);
  const participantSet = new Set(event.participantIds);
  const current = lists.filter((list) => participantSet.has(list.ownerIds[0]));
  const removed = lists.filter((list) => !participantSet.has(list.ownerIds[0]));
  const group = world.groups.find((g) => g.id === event.groupId)!;
  const rows = (entries: List[]) => (
    <div className="list-index">
      {entries.map((list) => {
        const person = world.people.find((p) => p.id === list.ownerIds[0]);
        return (
          <Link
            to={`/lists/${list.id}`}
            className="list-row event-participant-row"
            key={list.id}
          >
            <Avatar name={person?.name ?? "Former member"} />
            <div>
              <h3>{person?.name ?? "Former member"}</h3>
              <p>
                {list.archived ? "Archived wish list" : "Open wish list"}
                {person && !person.userId ? " · Managed profile" : ""}
              </p>
            </div>
            <ArrowRight size={18} />
          </Link>
        );
      })}
    </div>
  );
  return (
    <>
      <Link className="back-link" to="/lists">
        <ArrowLeft size={16} />
        My lists
      </Link>
      <Header
        title={event.name}
        description={
          event.description || `Individual wish lists for ${group.name}.`
        }
      >
        <Privacy mode={event.mode} />
        {event.canManage && (
          <>
            <button
              className="button secondary"
              onClick={() =>
                open(
                  event.archived
                    ? "Restore this event?"
                    : "Archive this event?",
                  <EventArchiveForm event={event} />,
                )
              }
            >
              {event.archived ? "Restore event" : "Archive event"}
            </button>
            <button
              className="button"
              onClick={() =>
                open("Edit group event", <EventForm event={event} />)
              }
            >
              Edit event
            </button>
            <TrashButton kind="group-events" entry={event} />
          </>
        )}
      </Header>
      <p className="muted">
        Shared with everyone in {group.name}. Each person manages their own
        wish-list items.
      </p>
      <GuidelineLabel amount={event.spendingGuidelineCents} />
      {event.archived && (
        <p className="notice">
          This event is archived. Items and purchase history are kept.
        </p>
      )}
      {!event.archived && event.archiveAfter && (
        <p className="muted">
          Lists archive after {event.archiveAfter} in {event.timeZone}.
        </p>
      )}
      <section aria-labelledby="event-participants-heading">
        <h2 id="event-participants-heading">Participants</h2>
        {current.length ? (
          rows(current)
        ) : (
          <p className="muted">
            No current participants. An event leader can add people in Edit
            event.
          </p>
        )}
      </section>
      {!!removed.length && (
        <section
          className="event-removed"
          aria-labelledby="event-removed-heading"
        >
          <h2 id="event-removed-heading">Removed participants</h2>
          <p className="muted">
            Their lists are archived. Re-adding an eligible person restores the
            same list.
          </p>
          {rows(removed)}
        </section>
      )}
    </>
  );
}

export function ManagedEventNotice({ list }: { list: List }) {
  const { world } = useApp();
  const event = world.groupEvents.find(
    (event) => event.id === list.groupEventId,
  );
  const names = list.ownerIds
    .map((id) => world.people.find((p) => p.id === id)?.name ?? "Recipient")
    .join(", ");
  return (
    <div className="managed-event-notice">
      <GuidelineLabel amount={event?.spendingGuidelineCents} />
      <p>
        Wish list for {names}. Event leaders manage this list’s settings; the
        recipient or the person managing their profile edits the items.
      </p>
      {!event && (
        <p>
          The event is unavailable. Your list and items are kept; an event
          leader can restore the event.
        </p>
      )}
      {event && (
        <Link className="text-button" to={`/events/${event.id}`}>
          {event.canManage ? "Manage event" : "View group event"}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
