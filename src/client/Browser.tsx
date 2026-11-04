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
import { ordered, sortLabels } from "../shared/organization";
import {
  ItemActions,
  ReorderForm,
  SortSelect,
  useItemScope,
  useOrganization,
} from "./Management";
import { useEffect, type ReactNode } from "react";
import type { GiftView } from "../shared/model";
import { useApp } from "./context";
import { Empty, GiftCard } from "./components";
import { value } from "./forms";
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
    [available, setAvailable] = useNavigationState<boolean>("available", false);
  const [selectedPeople, setSelectedPeople] = useNavigationState<string[]>(
    "people",
    [],
  );
  const { world, open, mutate, toast } = useApp();
  const settings = useOrganization(useItemScope(listId));
  const parentList = world.lists.find((l) => l.id === listId);
  const [itemStatus, setItemStatus] = useNavigationState<string>(
    "itemStatus",
    "active",
  );
  const debounced = useDebounced(search);
  const queryParams = new URLSearchParams({
    scope,
    ...(scopeId ? { id: scopeId } : {}),
    ...(tab ? { tab } : {}),
    search: debounced,
    tag,
    people: selectedPeople.join(","),
    available: String(available),
    status: itemStatus,
    sort: settings.sort,
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
  const canReorder = !!parentList?.canEdit && !parentList.archived;
  const visibleItems = parentList?.archived
    ? items
    : items.filter(
        (i) => i.archived === (canManage && itemStatus === "archived"),
      );
  const sorted = ordered(visibleItems, settings.sort, parentList?.itemOrder);
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
          .includes(search.toLowerCase()) &&
        (!tag || i.tags.includes(tag)) &&
        (!chosenPeople.length ||
          chosenPeople.some((person) => i.recipientIds.includes(person.id))) &&
        (!showAvailability ||
          !available ||
          (i.available !== undefined && i.available > 0)),
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
              Number(!!tag) +
              Number(showAvailability && available) +
              Number(chosenPeople.length > 0)
            }
            summary={[
              ...(settings.sort !== "manual"
                ? [sortLabels[settings.sort]]
                : []),
              ...(tag ? [tag] : []),
              ...(chosenPeople.length
                ? [
                    `For ${chosenPeople.map((person) => person.name).join(", ")}`,
                  ]
                : []),
              ...(showAvailability && available ? ["Available to give"] : []),
            ]}
            clear={() => {
              setTag("");
              setAvailable(false);
              setSelectedPeople([]);
            }}
          >
            <SortSelect
              items
              manualLabel={parentList ? "List order" : "Default order"}
              sort={settings.sort}
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
            {showPeople && (
              <fieldset className="people-filter">
                <legend>People</legend>
                <details>
                  <summary>
                    {chosenPeople.length
                      ? `${chosenPeople.length} selected`
                      : "All people"}
                  </summary>
                  <div className="people-filter-options">
                    {people.map((person) => (
                      <label className="check" key={person.id}>
                        <input
                          type="checkbox"
                          checked={chosenPeople.some(
                            (selected) => selected.id === person.id,
                          )}
                          onChange={(event) =>
                            setSelectedPeople(
                              event.target.checked
                                ? [
                                    ...chosenPeople.map(
                                      (selected) => selected.id,
                                    ),
                                    person.id,
                                  ]
                                : chosenPeople
                                    .filter(
                                      (selected) => selected.id !== person.id,
                                    )
                                    .map((selected) => selected.id),
                            )
                          }
                        />
                        {person.name}
                      </label>
                    ))}
                  </div>
                </details>
              </fieldset>
            )}
            {showAvailability && (
              <label className="check filter-check">
                <input
                  type="checkbox"
                  checked={available}
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
          <div className="gift-grid">
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
                    setAvailable(false);
                    setSelectedPeople([]);
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
