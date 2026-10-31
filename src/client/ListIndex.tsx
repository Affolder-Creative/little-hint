import { Pencil, Archive, ArchiveRestore } from "lucide-react";
import { ImportDrafts } from "./ImportDrafts";
import { useNavigationState } from "./NavigationScroll";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ListChecks, Plus } from "lucide-react";
import { ordered } from "../shared/organization";
import { useApp } from "./context";
import { Empty, Header, Privacy } from "./components";
import { ListForm } from "./forms";
import { GroupEventsSection } from "./GroupEvents";
import {
  ActionMenu,
  CollectionTools,
  RunButton,
  TrashButton,
  TrashView,
  useOrganization,
} from "./Management";

export function ListIndex() {
  const { world, open, mutate } = useApp();
  const [params, setParams] = useSearchParams();
  const status = params.get("view") ?? "active";
  const setStatus = (view: string) =>
    setParams(view === "active" ? {} : { view });
  const [search, setSearch] = useNavigationState<string>("listSearch", ""),
    [group, setGroup] = useNavigationState<string>("listGroup", "");
  const settings = useOrganization("lists");
  const archived = status === "archived";
  const rows = world.lists.filter(
    (l) =>
      l.canEdit &&
      l.archived === archived &&
      (!l.groupEventId ||
        !world.groupEvents.some((e) => e.id === l.groupEventId)),
  );
  const filtered = ordered(rows, settings.sort, settings.order).filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) &&
      (!group || l.groupIds.includes(group)),
  );
  const pending = world.lists.filter(
    (l) =>
      l.archived === archived &&
      l.pendingOwnerIds.some((id) =>
        world.people.some(
          (p) =>
            p.id === id &&
            (p.userId === world.me.id || p.guardians.includes(world.me.id)),
        ),
      ),
  );
  return (
    <>
      <Header
        title="Your wish lists"
        description="A little hint about what you’d love."
      >
        <button
          className="button"
          onClick={() => open("A new wish list", <ListForm />)}
        >
          <Plus size={17} />
          Create a list
        </button>
      </Header>
      <ImportDrafts />
      <div className="tabs" role="group" aria-label="List status">
        {["active", "archived", "trash"].map((value) => (
          <button
            key={value}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {value === "trash"
              ? "Trash"
              : value === "active"
                ? "Active"
                : "Archived"}
          </button>
        ))}
      </div>
      {status === "trash" ? (
        <TrashView kinds={["lists", "items", "group-events"]} />
      ) : (
        <>
          <GroupEventsSection archived={archived} />
          <section aria-labelledby="standalone-lists-heading">
            <h2 id="standalone-lists-heading">Your lists</h2>
            {pending.map((l) => (
              <div className="invitation" key={l.id}>
                <p>You are invited to share ownership of “{l.name}”.</p>
                <RunButton run={() => mutate("lists/accept", { id: l.id })}>
                  Accept shared ownership
                </RunButton>
              </div>
            ))}
            {(rows.length > 0 || search || group) && (
              <CollectionTools
                scope="lists"
                rows={rows}
                search={search}
                setSearch={setSearch}
                group={group}
                setGroup={setGroup}
              />
            )}
            {filtered.map((l) => (
              <div className="managed-list-row" key={l.id}>
                <Link to={`/lists/${l.id}`} className="list-row">
                  <span className="list-symbol">
                    <ListChecks size={24} />
                  </span>
                  <div>
                    <h3>{l.name}</h3>
                    {l.groupEventId && (
                      <p>From an unavailable event · Your items are kept</p>
                    )}
                    <p>
                      {l.groupIds.length
                        ? `Shared with: ${l.groupIds.map((id) => world.groups.find((g) => g.id === id)?.name ?? "Family group").join(", ")}`
                        : "Only you for now"}
                    </p>
                  </div>
                  <Privacy mode={l.mode} />
                  <ArrowRight size={18} />
                </Link>
                {l.canManageSettings && (
                  <ActionMenu name={l.name} label="List actions">
                    <button
                      className="text-button"
                      onClick={() => open("Edit list", <ListForm list={l} />)}
                    >
                      <Pencil size={16} aria-hidden="true" /> Edit list
                    </button>
                    <RunButton
                      run={() =>
                        mutate("lists/update", {
                          ...l,
                          archived: !l.archived,
                          ...(l.archived ? { archiveAfter: null } : {}),
                        })
                      }
                    >
                      {l.archived ? (
                        <ArchiveRestore size={16} aria-hidden="true" />
                      ) : (
                        <Archive size={16} aria-hidden="true" />
                      )}{" "}
                      {l.archived ? "Restore list" : "Archive list"}
                    </RunButton>
                    <TrashButton kind="lists" entry={l} />
                  </ActionMenu>
                )}
              </div>
            ))}
            {!filtered.length && (
              <Empty
                title={
                  search || group
                    ? "No matching lists"
                    : archived
                      ? "No archived lists"
                      : "A list for any occasion"
                }
              >
                {search || group
                  ? "Try another search or family group."
                  : archived
                    ? "Finished occasions can go here. Restore a list whenever you need it."
                    : "Create a wish list, then add a few things you would love."}
              </Empty>
            )}
          </section>
        </>
      )}
    </>
  );
}
