import { api } from "./api";
import {
  CollectionStatus,
  Pagination,
  useCollection,
  useCollectionPage,
  useDebounced,
} from "./Pagination";
import type { ItemPage } from "../shared/pagination";
import { BrowseTools } from "./BrowseTools";
import { useNavigationState } from "./NavigationScroll";
import {
  priorityLabels,
  matchesPriority,
  type PriorityFilter,
  ordered,
  orderedArchivedItems,
  sortLabels,
  archivedItemSort,
  archivedSortOrders,
} from "../shared/organization";
import {
  ItemActions,
  ReorderForm,
  SortSelect,
  useItemScope,
  useOrganization,
} from "./Management";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { GiftView } from "../shared/model";
import { useApp } from "./context";
import { Empty, GiftCard } from "./components";
import { SearchSelect } from "./SearchSelect";
import { X } from "lucide-react";
function subscribeSmallScreens(notify: () => void) {
  const query = matchMedia("(max-width: 650px)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const isSmallScreen = () => matchMedia("(max-width: 650px)").matches;
export function Browser({
  items,
  scope = "home",
  scopeId,
  tab,
  emptyTitle = "No items to show yet",
  emptyText = "Add an item to your wish list, or ask your people to share theirs.",
  emptyAction,
  searchLabel = "Search items and gift ideas",
  listNames,
  listId,
  headingLevel = 2,
  personScoped = false,
  compactEmpty = false,
}: {
  items: GiftView[];
  scope?: "home" | "person" | "list";
  scopeId?: string;
  tab?: string;
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: ReactNode;
  searchLabel?: string;
  listNames?: ReadonlyMap<string, string>;
  listId?: string;
  headingLevel?: 2 | 3;
  personScoped?: boolean;
  compactEmpty?: boolean;
}) {
  const [search, setSearch] = useNavigationState<string>("search", ""),
    [tag, setTag] = useNavigationState<string>("tag", ""),
    [available, setAvailable] = useNavigationState<boolean>("available", true);
  const [selectedPeople, setSelectedPeople] = useNavigationState<string[]>(
    "people",
    [],
  );
  const [itemType, setItemType] = useNavigationState<string>("itemType", "all");
  const [visibility, setVisibility] = useNavigationState<string>(
    "visibility",
    "all",
  );
  const [peopleSearch, setPeopleSearch] = useState("");
  const { world, open, mutate, toast } = useApp();
  const smallScreen = useSyncExternalStore(
    subscribeSmallScreens,
    isSmallScreen,
    () => false,
  );
  const cardLayout = smallScreen
    ? (world.giftCardLayoutMobile ?? world.giftCardLayout ?? "large-photos")
    : (world.giftCardLayout ?? "compact");
  const itemScope = useItemScope(listId);
  const parentList = world.lists.find((l) => l.id === listId);
  const [itemStatus, setItemStatus] = useNavigationState<string>(
    "itemStatus",
    "active",
  );
  const archivedSelected = itemStatus === "archived" && !parentList?.archived;
  const settings = useOrganization(
    archivedSelected ? `${itemScope}:archived` : itemScope,
    archivedSelected ? "archived-newest" : "manual",
  );
  const [priority, setPriority] = useNavigationState<PriorityFilter>(
    "priority",
    "all",
  );
  const archiveSort = archivedItemSort(settings.sort);
  const sort = archivedSelected ? archiveSort : settings.sort;
  const debounced = useDebounced(search);
  const availabilityApplies =
    !debounced.trim() && itemStatus === "active" && !parentList?.archived;
  const availableOnly = available && availabilityApplies;
  const queryParams = new URLSearchParams({
    scope,
    ...(scopeId ? { id: scopeId } : {}),
    ...(tab ? { tab } : {}),
    search: debounced,
    tag,
    priority,
    visibility,
    people: selectedPeople.join(","),
    available: String(availableOnly),
    type: itemType,
    status: itemStatus,
    sort,
  });
  const pagination = useCollectionPage(queryParams.toString());
  queryParams.set("page", String(pagination.page));
  const query = useCollection<ItemPage>(`items?${queryParams}`);
  const remote = world.paged ? query.data : undefined;
  useEffect(() => {
    if (remote && !query.isPlaceholderData && remote.page !== pagination.page)
      pagination.clamp(remote.page);
  }, [remote?.page, query.isPlaceholderData, pagination.page]);
  const collectionTotal = remote?.collectionTotal ?? items.length;
  const canManage =
    remote?.canManage ?? (parentList?.canEdit || items.some((i) => i.canEdit));
  const archivedView = canManage && archivedSelected;
  const canReorder =
    !!parentList?.canEdit && !parentList.archived && !archivedView;
  const visibleItems = parentList?.archived
    ? items
    : items.filter(
        (i) => i.archived === (canManage && itemStatus === "archived"),
      );
  const sorted = archivedView
    ? orderedArchivedItems(visibleItems, parentList?.itemOrder, archiveSort)
    : ordered(visibleItems, sort, parentList?.itemOrder);
  const showAvailability =
    remote?.showAvailability ??
    items.some((item) => item.available !== undefined);
  const tags =
    remote?.tags ?? [...new Set(items.flatMap((i) => i.tags))].sort();
  const recipientIds = new Set(
    remote?.people ?? items.flatMap((item) => item.recipientIds),
  );
  const people = world.people
    .filter((person) => recipientIds.has(person.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const showPeople = !personScoped && people.length > 1;
  const chosenPeople = showPeople
    ? people.filter((person) => selectedPeople.includes(person.id))
    : [];
  const filtered =
    remote?.rows ??
    sorted.filter(
      (i) =>
        `${i.title} ${i.recipientNames.join(" ")} ${i.tags.join(" ")}`
          .toLowerCase()
          .includes(debounced.trim().toLowerCase()) &&
        (itemType === "all" || !!i.listId === (itemType === "wish")) &&
        (!tag || i.tags.includes(tag)) &&
        matchesPriority(i.priority, priority) &&
        (visibility === "all" || i.visibilityScope === visibility) &&
        (!chosenPeople.length ||
          chosenPeople.some((person) => i.recipientIds.includes(person.id))) &&
        (!showAvailability ||
          !availableOnly ||
          i.available === undefined ||
          i.available > 0),
    );
  if (world.paged && (!query.data || query.error))
    return <CollectionStatus query={query} />;
  const paging = (position: string) => (
    <Pagination
      page={remote?.page ?? 1}
      total={remote?.total ?? filtered.length}
      change={pagination.setPage}
      busy={query.isFetching}
      position={position}
    />
  );
  return (
    <>
      {canManage && collectionTotal > 0 && !parentList?.archived && (
        <div className="tabs" role="group" aria-label="Item status">
          {["active", "archived"].map((status) => (
            <button
              key={status}
              aria-pressed={itemStatus === status}
              onClick={() => setItemStatus(status)}
            >
              {status === "active" ? "Active items" : "Archived items"}
            </button>
          ))}
        </div>
      )}
      {canManage &&
        collectionTotal > 0 &&
        !parentList?.archived &&
        itemStatus === "archived" && (
          <p className="notice archived-items-notice">
            These items are archived and kept for reference. Please don't
            reserve or buy them. When choosing a gift, take a look at{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setItemStatus("active");
                document
                  .querySelector<HTMLButtonElement>(
                    '[aria-label="Item status"] button',
                  )
                  ?.focus();
              }}
            >
              Active items
            </button>{" "}
            instead.
          </p>
        )}
      {collectionTotal > 0 && (
        <>
          <BrowseTools
            search={search}
            setSearch={setSearch}
            searchLabel={searchLabel}
            placeholder={
              searchLabel === "Search gift ideas"
                ? "Search gift ideas"
                : "Search items"
            }
            searchHint="Search by name, person, or tag"
            activeCount={
              Number(visibility !== "all") +
              Number(!!tag) +
              Number(priority !== "all") +
              Number(showAvailability && availableOnly) +
              Number(itemType !== "all") +
              Number(chosenPeople.length > 0)
            }
            summary={[
              ...(sort !== "manual" ? [sortLabels[sort]] : []),
              ...(tag ? [tag] : []),
              ...(priority !== "all"
                ? [
                    priority === "none"
                      ? "No priority"
                      : priorityLabels[priority],
                  ]
                : []),
              ...(visibility !== "all"
                ? [visibility === "only-me" ? "Only me" : "Shared with others"]
                : []),
              ...(chosenPeople.length
                ? [
                    `For ${chosenPeople.map((person) => person.name).join(", ")}`,
                  ]
                : []),
              ...(itemType !== "all"
                ? [itemType === "wish" ? "Wishes" : "Gift ideas"]
                : []),
              ...(showAvailability && availableOnly
                ? ["Available to give"]
                : []),
              ...(showAvailability && debounced.trim()
                ? ["Search includes taken-care-of gifts"]
                : []),
            ]}
            clear={() => {
              setTag("");
              setPriority("all");
              setVisibility("all");
              setAvailable(false);
              setSelectedPeople([]);
              setItemType("all");
              setPeopleSearch("");
            }}
          >
            <SortSelect
              items
              manualLabel={parentList ? "List order" : "Default order"}
              options={archivedView ? archivedSortOrders : undefined}
              sort={sort}
              change={(sort) => settings.save(sort)}
            />
            {canReorder && collectionTotal > 1 && (
              <button
                data-browse-reorder
                className="button secondary small"
                onClick={async () => {
                  try {
                    const entries = world.paged
                      ? await api<Array<{ id: string; name: string }>>(
                          `lists/${listId}/item-order`,
                        )
                      : ordered(
                          items.filter((i) => !i.archived),
                          "manual",
                          parentList.itemOrder,
                        ).map((i) => ({ id: i.id, name: i.title }));
                    open(
                      "Arrange wish-list items",
                      <ReorderForm
                        entries={entries}
                        save={async (order) => {
                          await mutate("lists/reorder", {
                            id: parentList.id,
                            revision: parentList.revision,
                            order,
                          });
                          await settings.save("manual");
                        }}
                      />,
                    );
                  } catch (error) {
                    toast((error as Error).message);
                  }
                }}
              >
                Reorder items
              </button>
            )}
            <label>
              Priority
              <select
                aria-label="Filter by priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityFilter)}
              >
                <option value="all">All priorities</option>
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                <option value="none">No priority</option>
              </select>
            </label>
            <label>
              Tag
              <select
                aria-label="Filter by tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              >
                <option value="">All tags</option>
                {tags.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            {scope === "home" && (
              <label>
                Item type
                <select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value)}
                >
                  <option value="all">All items</option>
                  <option value="wish">Wishes</option>
                  <option value="idea">Gift ideas</option>
                </select>
              </label>
            )}
            {showPeople && (
              <div className="people-filter">
                <SearchSelect
                  label="People"
                  value={peopleSearch}
                  onChange={setPeopleSearch}
                  placeholder="Search people by name"
                  multiple
                  selected={chosenPeople.map((person) => person.id)}
                  choices={people
                    .filter((person) =>
                      person.name
                        .toLowerCase()
                        .includes(peopleSearch.trim().toLowerCase()),
                    )
                    .slice(0, 20)
                    .map((person) => ({ id: person.id, label: person.name }))}
                  hint={
                    people.length > 20
                      ? "Type to narrow the results. No selection includes everyone."
                      : "No selection includes everyone."
                  }
                  onChoose={(id) =>
                    setSelectedPeople(
                      selectedPeople.includes(id)
                        ? selectedPeople.filter((value) => value !== id)
                        : [...selectedPeople, id],
                    )
                  }
                />
                {!!chosenPeople.length && (
                  <div className="purchase-chips">
                    {chosenPeople.map((person) => (
                      <span className="purchase-chip" key={person.id}>
                        {person.name}
                        <button
                          type="button"
                          aria-label={`Remove ${person.name}`}
                          onClick={() =>
                            setSelectedPeople(
                              selectedPeople.filter((id) => id !== person.id),
                            )
                          }
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <label>
              Visibility
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value)}
              >
                <option value="all">All visibility</option>
                <option value="only-me">Only me</option>
                <option value="shared">Shared with others</option>
              </select>
            </label>
            {showAvailability && (
              <label className="check filter-check">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  disabled={!availabilityApplies}
                  onChange={(e) => setAvailable(e.target.checked)}
                />
                Available to give
              </label>
            )}
          </BrowseTools>
        </>
      )}
      {world.paged && paging("above")}
      <div
        ref={pagination.target}
        tabIndex={-1}
        className="collection-results"
        role="region"
        aria-label="Results"
        aria-busy={query.isFetching}
      >
        {filtered.length ? (
          <div className={`gift-grid gift-grid-${cardLayout}`}>
            {filtered.map((i) => (
              <div className="gift-card-entry" key={i.id}>
                <GiftCard
                  gift={i}
                  headingLevel={headingLevel}
                  sourceListName={
                    i.listId ? listNames?.get(i.listId) : undefined
                  }
                />
                <ItemActions gift={i} />
              </div>
            ))}
          </div>
        ) : (
          <Empty
            compact={compactEmpty}
            title={
              (remote?.collectionTotal ?? visibleItems.length)
                ? "No matches found"
                : itemStatus === "archived"
                  ? "No archived items"
                  : emptyTitle
            }
            action={
              (remote?.collectionTotal ?? visibleItems.length) ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    setSearch("");
                    setTag("");
                    setPriority("all");
                    setVisibility("all");
                    setAvailable(false);
                    setSelectedPeople([]);
                    setItemType("all");
                    setPeopleSearch("");
                  }}
                >
                  Clear filters
                </button>
              ) : itemStatus === "archived" ? undefined : (
                emptyAction
              )
            }
          >
            {(remote?.collectionTotal ?? visibleItems.length)
              ? "Try another search, or clear your filters to see everything."
              : itemStatus === "archived"
                ? "Items you archive will appear here. You can restore them whenever you like."
                : emptyText}
          </Empty>
        )}
      </div>
      {world.paged && paging("below")}
    </>
  );
}
