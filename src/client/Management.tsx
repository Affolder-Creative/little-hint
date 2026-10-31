import { Trash2 } from "lucide-react";
import { dismissActionMenu } from "./menu-dismiss";
import "./action-menu.css";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  MoreHorizontal,
  Search,
} from "lucide-react";
import type {
  Base,
  GiftView,
  ItemPriority,
  SortOrder,
  TrashEntry,
  TrashKind,
} from "../shared/model";
import { ordered, priorityLabels, sortLabels } from "../shared/organization";
import { api } from "./api";
import { useApp } from "./context";
import { Confirm } from "./Confirm";
import { Empty, Field, Form, useModalDismiss } from "./components";
import { GiftForm } from "./forms";
import { actionError } from "./copy";
import { BrowseTools, useBrowseSaving } from "./BrowseTools";

export function RunButton({
  children,
  run,
  className = "text-button",
  disabled = false,
}: {
  children: ReactNode;
  run: () => Promise<unknown>;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy || disabled}
        aria-busy={busy}
        onClick={async (event) => {
          const button = event.currentTarget;
          setBusy(true);
          setError("");
          try {
            await run();
            dismissActionMenu(button);
          } catch (error) {
            setError(actionError(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : children}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function ActionMenu({
  name,
  label,
  children,
}: {
  name: string;
  label?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    // Safari moves focus to the main region between pointerdown and click.
    // Keep the menu mounted until that activation has completed.
    let pointerInside = false;
    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        ref.current &&
        !ref.current.contains(event.target)
      )
        ref.current.open = false;
    };
    const pointer = (event: Event) => {
      pointerInside =
        event.target instanceof Node && !!ref.current?.contains(event.target);
      outside(event);
    };
    const focus = (event: Event) => {
      if (!pointerInside) outside(event);
    };
    const finish = () => {
      queueMicrotask(() => {
        pointerInside = false;
        if (ref.current && document.querySelector("dialog[open]"))
          ref.current.open = false;
      });
    };
    const reset = () => {
      pointerInside = false;
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("click", finish);
    document.addEventListener("pointercancel", reset);
    document.addEventListener("keydown", reset, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("click", finish);
      document.removeEventListener("pointercancel", reset);
      document.removeEventListener("keydown", reset, true);
    };
  }, []);
  return (
    <details
      ref={ref}
      className="entry-actions"
      onToggle={(event) => {
        if (!event.currentTarget.open) return;
        const menu = event.currentTarget.querySelector<HTMLElement>(
          ".entry-actions-content",
        );
        if (!menu) return;
        menu.style.translate = "";
        const bounds = menu.getBoundingClientRect();
        const shift = Math.max(
          20 - bounds.left,
          Math.min(0, innerWidth - 20 - bounds.right),
        );
        menu.style.translate = `${shift}px`;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={`${label ?? "Actions"} for ${name}`}>
        <MoreHorizontal size={20} />
        {label && <span className="entry-actions-label">{label}</span>}
      </summary>
      <div className="entry-actions-content">{children}</div>
    </details>
  );
}
export function TrashButton({
  kind,
  entry,
}: {
  kind: TrashKind;
  entry: Base & { name?: string; title?: string };
}) {
  const { open, mutate, toast } = useApp();
  const navigate = useNavigate(),
    location = useLocation();
  const name = entry.title ?? entry.name ?? "entry";
  return (
    <button
      type="button"
      className="text-button danger"
      onClick={() =>
        open(
          `Move “${name}” to Trash?`,
          <Confirm
            label="Move to Trash"
            onConfirm={async () => {
              await mutate(`${kind}/trash`, {
                id: entry.id,
                revision: entry.revision,
              });
              toast("Moved to Trash. You can restore it there.");
              if (location.pathname.endsWith(`/${entry.id}`))
                navigate("/lists?view=trash");
            }}
          >
            {kind === "group-events"
              ? "Participants’ lists will be archived and kept. You can restore the event from Trash."
              : kind === "lists"
                ? "This list and its items will leave normal views. You can restore them from Trash. Buyers keep their purchase and contribution records."
                : "This will leave normal views. You can restore it from Trash. Buyers keep their purchase and contribution records."}
          </Confirm>,
        )
      }
    >
      <Trash2 size={16} aria-hidden="true" /> Move to Trash
    </button>
  );
}
export function PrioritySelect({
  value,
  onChange,
  label = "Priority",
}: {
  value: ItemPriority | null;
  onChange: (priority: ItemPriority | null) => void;
  label?: string;
}) {
  return (
    <Field label={label} hint="Optional. Several items can share a priority.">
      <select
        value={value ?? ""}
        onChange={(event) =>
          onChange((event.target.value || null) as ItemPriority | null)
        }
      >
        <option value="">No priority</option>
        {Object.entries(priorityLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
}
function PriorityForm({ gift }: { gift: GiftView }) {
  const { mutate, close, toast } = useApp();
  const [priority, setPriority] = useState(gift.priority ?? null);
  return (
    <Form
      submit="Save priority"
      onSubmit={async () => {
        await mutate("items/organize", {
          id: gift.id,
          revision: gift.revision,
          priority,
        });
        close();
        toast("Priority saved.");
      }}
    >
      <PrioritySelect value={priority} onChange={setPriority} />
    </Form>
  );
}
export function ItemActions({ gift }: { gift: GiftView }) {
  const { open, mutate, toast, world } = useApp();
  if (!gift.canEdit) return null;
  const parentArchived = !!world.lists.find((l) => l.id === gift.listId)
    ?.archived;
  return (
    <ActionMenu name={gift.title}>
      <button
        type="button"
        className="text-button"
        onClick={() =>
          open(
            gift.listId ? "Edit item" : "Edit gift idea",
            <GiftForm gift={gift} />,
          )
        }
      >
        Edit {gift.listId ? "item" : "gift idea"}
      </button>
      {gift.listId && (
        <button
          type="button"
          className="text-button"
          onClick={() =>
            open(`Priority for ${gift.title}`, <PriorityForm gift={gift} />)
          }
        >
          Set priority
        </button>
      )}
      {!parentArchived && (
        <RunButton
          run={async () => {
            await mutate("items/archive", {
              id: gift.id,
              revision: gift.revision,
              archived: !gift.archived,
            });
            toast(gift.archived ? "Item restored." : "Item archived.");
          }}
        >
          {gift.archived ? "Restore item" : "Archive item"}
        </RunButton>
      )}
      <TrashButton kind="items" entry={gift} />
    </ActionMenu>
  );
}
export function ReorderForm({
  entries,
  save,
}: {
  entries: Array<{ id: string; name: string }>;
  save: (ids: string[]) => Promise<unknown>;
}) {
  const { close, toast } = useApp();
  const dismiss = useModalDismiss();
  const [rows, setRows] = useState(entries),
    [saving, setSaving] = useState(false),
    [dragged, setDragged] = useState<string | null>(null),
    [announcement, announce] = useState("");
  function move(id: string, to: number) {
    const from = rows.findIndex((row) => row.id === id);
    if (from < 0 || to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setRows(next);
    announce(`${row.name} moved to position ${to + 1} of ${next.length}.`);
  }
  return (
    <Form
      submit="Save order"
      dirty={rows.some((row, index) => row.id !== entries[index]?.id)}
      onSubmit={async () => {
        setSaving(true);
        try {
          await save(rows.map((row) => row.id));
          close();
          toast("Order saved.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <p>
        Move entries with the arrows or drag their handles. This does not change
        priority labels.
      </p>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      <ol className="reorder-list">
        {rows.map((row, index) => (
          <li
            key={row.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged) move(dragged, index);
              setDragged(null);
            }}
          >
            <span
              className="drag-handle"
              draggable
              onDragStart={(event) => {
                setDragged(row.id);
                event.dataTransfer.setData("text/plain", row.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragged(null)}
              aria-hidden="true"
            >
              <GripVertical size={18} />
            </span>
            <span>{row.name}</span>
            <button
              type="button"
              className="icon-button"
              disabled={!index}
              aria-label={`Move ${row.name} up`}
              onClick={() => move(row.id, index - 1)}
            >
              <ArrowUp size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={index === rows.length - 1}
              aria-label={`Move ${row.name} down`}
              onClick={() => move(row.id, index + 1)}
            >
              <ArrowDown size={18} />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="button secondary"
        disabled={saving}
        onClick={() => (dismiss ? dismiss() : close())}
      >
        Cancel
      </button>
    </Form>
  );
}
export function useOrganization(scope: string) {
  const { world, mutate } = useApp();
  const preference = world.organization?.find((p) => p.scope === scope);
  return {
    sort: preference?.sort ?? ("manual" as SortOrder),
    order: preference?.order ?? [],
    save: (sort: SortOrder, order?: string[]) =>
      mutate("organization/update", {
        scope,
        revision: preference?.revision ?? 0,
        sort,
        ...(order ? { order } : {}),
      }),
  };
}
export function SortSelect({
  sort,
  change,
  items = false,
  manualLabel,
}: {
  sort: SortOrder;
  change: (sort: SortOrder) => Promise<unknown>;
  items?: boolean;
  manualLabel?: string;
}) {
  const saving = useBrowseSaving();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="sort-control" data-busy={busy}>
      <label>
        Sort by
        <select
          aria-label="Sort by"
          disabled={busy}
          value={sort}
          onChange={async (e) => {
            const value = e.target.value as SortOrder;
            setBusy(true);
            saving.setBusy(true);
            setError("");
            try {
              await change(value);
            } catch (error) {
              setError(actionError(error));
            } finally {
              setBusy(false);
              saving.setBusy(false);
            }
          }}
        >
          {Object.entries(sortLabels)
            .filter(
              ([key]) =>
                items || !["priority", "price-asc", "price-desc"].includes(key),
            )
            .map(([key, label]) => (
              <option key={key} value={key}>
                {key === "manual"
                  ? (manualLabel ?? (items ? label : "My order"))
                  : label}
              </option>
            ))}
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
function mergeOrder(active: string[], all: string[]) {
  const included = new Set(active);
  let index = 0;
  return all.map((id) => (included.has(id) ? active[index++] : id));
}
export function CollectionTools({
  scope,
  rows,
  search,
  setSearch,
  group,
  setGroup,
  status,
  setStatus,
}: {
  scope: "lists" | "events" | "exchanges";
  rows: Array<Base & { name: string }>;
  search: string;
  setSearch: (value: string) => void;
  group: string;
  setGroup: (value: string) => void;
  status?: string;
  setStatus?: (value: string) => void;
}) {
  const { world, open } = useApp();
  const settings = useOrganization(scope);
  return (
    <BrowseTools
      search={search}
      setSearch={setSearch}
      searchLabel={`Search ${scope}`}
      activeCount={Number(!!group) + Number(!!status)}
      summary={[
        ...(settings.sort !== "manual" ? [sortLabels[settings.sort]] : []),
        ...(group
          ? [world.groups.find((g) => g.id === group)?.name ?? "Family group"]
          : []),
        ...(status
          ? [
              status === "drawn"
                ? "Names drawn"
                : status === "draft"
                  ? "Getting ready"
                  : "Cancelled",
            ]
          : []),
      ]}
      clear={() => {
        setGroup("");
        setStatus?.("");
      }}
    >
      {world.groups.length > 1 && (
        <label>
          Shared with
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All family groups</option>
            {world.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <SortSelect sort={settings.sort} change={(sort) => settings.save(sort)} />
      {setStatus && (
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="draft">Getting ready</option>
            <option value="drawn">Names drawn</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      )}
      {rows.length > 1 && (
        <button
          data-browse-reorder
          className="button secondary small"
          onClick={() =>
            open(
              "Arrange your entries",
              <ReorderForm
                entries={ordered(rows, "manual", settings.order)}
                save={(ids) =>
                  settings.save(
                    "manual",
                    mergeOrder(
                      ids,
                      ordered<Base & { name: string }>(
                        scope === "lists"
                          ? world.lists.filter(
                              (l) =>
                                l.canEdit &&
                                (!l.groupEventId ||
                                  !world.groupEvents.some(
                                    (e) => e.id === l.groupEventId,
                                  )),
                            )
                          : scope === "events"
                            ? world.groupEvents
                            : world.exchanges,
                        "manual",
                        settings.order,
                      ).map((r) => r.id),
                    ),
                  )
                }
              />,
            )
          }
        >
          Reorder
        </button>
      )}
    </BrowseTools>
  );
}
export function TrashView({ kinds }: { kinds: TrashKind[] }) {
  const { world, mutate, open, toast } = useApp();
  const query = useQuery({
    queryKey: ["trash", world.me.id],
    queryFn: () => api<TrashEntry[]>("trash"),
  });
  const [search, setSearch] = useState("");
  const entries = (query.data ?? []).filter(
    (row) =>
      kinds.includes(row.kind) &&
      row.name.toLowerCase().includes(search.toLowerCase()),
  );
  const labels = {
    items: "Item",
    lists: "Wish list",
    "group-events": "Group event",
    exchanges: "Exchange",
  };
  return (
    <section className="trash-view" aria-label="Trash">
      <p>
        Restore entries you still want. Nothing here is automatically deleted.
      </p>
      <label className="search">
        <Search size={18} />
        <input
          aria-label="Search Trash"
          placeholder="Search Trash"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {query.isPending && <p role="status">Loading Trash…</p>}
      {query.error && (
        <p className="error" role="alert">
          {actionError(query.error)}{" "}
          <button className="text-button" onClick={() => query.refetch()}>
            Try again
          </button>
        </p>
      )}
      {!query.isPending && !query.error && !entries.length && (
        <Empty title={search ? "No matches in Trash" : "Trash is empty"}>
          Entries you remove will appear here.
        </Empty>
      )}
      {entries.map((entry) => (
        <div key={entry.id} className="trash-row">
          <div>
            <h3>{entry.name}</h3>
            <p>
              {labels[entry.kind]} · Removed{" "}
              {new Date(entry.deletedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="actions">
            <RunButton
              run={async () => {
                await mutate(`${entry.kind}/restore`, {
                  id: entry.id,
                  revision: entry.revision,
                });
                toast("Restored.");
              }}
            >
              Restore
            </RunButton>
            <button
              className="text-button danger"
              onClick={() =>
                open(
                  `Permanently delete “${entry.name}”?`,
                  <Confirm
                    label="Delete permanently"
                    onConfirm={async () => {
                      await mutate(`${entry.kind}/purge`, {
                        id: entry.id,
                        revision: entry.revision,
                      });
                      toast("Permanently deleted.");
                    }}
                  >
                    {entry.kind === "group-events"
                      ? "This cannot be undone. Participants keep their wish lists as independent archived lists."
                      : "This cannot be undone. The entry and its contents will be deleted. Buyers’ purchase and contribution records will remain."}
                  </Confirm>,
                )
              }
            >
              Delete permanently
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
export function useItemScope(listId?: string) {
  const location = useLocation();
  return listId
    ? `items:list:${listId}`
    : location.pathname.startsWith("/people/")
      ? `items:person:${location.pathname.split("/")[2]}`
      : "items:home";
}
