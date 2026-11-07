import { SearchSelect, type Choice } from "./SearchSelect";
import { shoppingChoices, shoppingPayload } from "./shopping-context";
import { CollectionStatus, useCollection, useDebounced } from "./Pagination";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { LockKeyhole, Users, X } from "lucide-react";
import { api, dollars } from "./api";
import { useApp } from "./context";
import { Form, Field, useModalDismiss } from "./components";
import type { GiftView, World } from "../shared/model";
import type { SpendingView } from "../shared/spending";
import "./spending-purchase.css";

type PurchaseReservation = Pick<
  World["buying"][number],
  "id" | "revision" | "quantity" | "purchased" | "titleSnapshot" | "item"
>;
export function PurchaseForm({
  reservation: suppliedReservation,
  onSuccess,
  initialPerson,
  initialEvent,
  initialOccasion,
}: {
  onSuccess?: () => void;
  initialPerson?: string;
  initialEvent?: string;
  initialOccasion?: string;
  reservation?: PurchaseReservation;
}) {
  const { world, mutate, close } = useApp();
  const dismiss = useModalDismiss();
  const [params] = useSearchParams();
  const { data, error, refetch } = useQuery({
    queryKey: ["spending", world.me.id],
    queryFn: () => api<SpendingView>("spending"),
    enabled: world.spendingAvailable !== false,
  });
  const [selectedItem, setSelectedItem] = useState<GiftView>();
  const [selectedReservation, setSelectedReservation] =
    useState<PurchaseReservation>();
  const amountInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectedItem || selectedReservation) amountInput.current?.focus();
  }, [selectedItem, selectedReservation]);
  const reservationQuery = useCollection<PurchaseReservation>(
    `buying/reservations/${suppliedReservation?.id}`,
    !!suppliedReservation,
  );
  const reservation =
    reservationQuery.data ?? suppliedReservation ?? selectedReservation;
  const item = reservation?.item ?? selectedItem;
  const [selectionDirty, setSelectionDirty] = useState(false);
  const [title, setTitle] = useState(suppliedReservation?.titleSnapshot ?? "");
  const [recipients, setRecipients] = useState<string[]>(() => {
    const person = initialPerson ?? params.get("person");
    return person &&
      world.people.some((p) => p.id === person && p.userId !== world.me.id)
      ? [person]
      : [];
  });
  const [peopleSearch, setPeopleSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [keepPrivate, setKeepPrivate] = useState(false);
  const [shopping, setShopping] = useState({ itemId: "", key: "" });
  const [payer, setPayer] = useState(world.me.id);
  const [event, setEvent] = useState(initialEvent ?? params.get("event") ?? "");
  const [assignedList, setAssignedList] = useState<string | undefined>();
  const [occasion, setOccasion] = useState<string | undefined>(
    initialOccasion ?? params.get("occasion") ?? undefined,
  );
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const searchTerm = useDebounced(title);
  const searchQuery = useCollection<
    Array<{ gift: GiftView; reservation?: World["buying"][number] }>
  >(`items/search?search=${encodeURIComponent(searchTerm)}`);
  if (
    world.paged &&
    suppliedReservation &&
    (!reservationQuery.data || reservationQuery.error)
  )
    return <CollectionStatus query={reservationQuery} />;
  if (world.spendingAvailable === false)
    return <p role="status">Spending is unavailable.</p>;
  if (error)
    return (
      <div role="alert">
        <p>Unable to load purchase details.</p>
        <button className="button secondary" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  if (!data) return <p>Loading purchase details…</p>;
  const plan = data.records.find(
    (r) =>
      r.reservationId === reservation?.id && r.kind === "plan" && !r.sourceId,
  );
  if (!data.settings.enabled && reservation)
    return (
      <Form
        dialogLayout
        cancel={() => dismiss?.()}
        submit="Mark as purchased"
        onSubmit={async () => {
          await mutate("reservations/update", {
            id: reservation.id,
            revision: reservation.revision,
            quantity: reservation.quantity,
            purchased: reservation.quantity,
          });
          close();
          onSuccess?.();
        }}
      >
        <p>{reservation.titleSnapshot}</p>
      </Form>
    );
  const linked = !!reservation || !!item;
  const recipientIds = plan?.recipientIds ?? item?.recipientIds ?? recipients;
  const assignmentId =
    assignedList ?? (plan ? (plan.listId ?? "") : (item?.spendingListId ?? ""));
  const assignmentList = world.lists.find((l) => l.id === assignmentId);
  const sourceList = world.lists.find((l) => l.id === item?.listId);
  const overridesAssignment =
    !sourceList && (assignedList !== undefined || (!plan && !!assignmentId));
  const eventId =
    sourceList?.groupEventId ??
    (overridesAssignment
      ? assignmentList?.groupEventId
      : (plan?.eventId ?? (linked ? undefined : event)));
  const occasionId = occasion ?? plan?.occasionId ?? "";
  const price = item?.priceCents ?? plan?.unitEstimateCents ?? null;
  const maxQuantity = reservation
    ? reservation.quantity - reservation.purchased
    : (item?.available ?? 1);
  const choices = item && !reservation ? shoppingChoices(world, item) : [];
  const shoppingKey = shopping.itemId === item?.id ? shopping.key : "";
  const c = data.connection;
  const protectedGift =
    !!plan?.protected ||
    (!!shoppingKey && shoppingKey !== "ordinary") ||
    (!item?.listId && item?.visibility === "private") ||
    recipientIds.some((id) =>
      world.people.some(
        (p) =>
          p.id === id &&
          [p.userId, ...p.guardians].some(
            (user) => !!user && c?.users.includes(user),
          ),
      ),
    );
  const prospectiveShared =
    !keepPrivate &&
    !protectedGift &&
    !!c &&
    c.status === "active" &&
    c.resumed.length === 2 &&
    (plan
      ? !!plan.connectionId && plan.sharing !== "private"
      : date >= c.createdAt.slice(0, 10) &&
        [
          ...recipientIds.map((id) => `person:${id}`),
          `event:${eventId ?? ""}`,
          `occasion:${occasionId}`,
        ].some((rule) => c.rules[world.me.id]?.includes(rule)));
  const matches = world.items.filter(
    (gift) =>
      (gift.canShop ?? !gift.isRecipient) &&
      !gift.archived &&
      !gift.deletedAt &&
      (!gift.listId ||
        world.lists.some(
          (l) => l.id === gift.listId && !l.archived && !l.deletedAt,
        )) &&
      `${gift.title} ${gift.recipientNames.join(" ")} ${world.lists.find((l) => l.id === gift.listId)?.name ?? ""}`
        .toLowerCase()
        .includes(title.toLowerCase()),
  );
  const candidates = world.paged
    ? (searchQuery.data ?? [])
    : matches
        .flatMap<{ gift: GiftView; reservation?: World["buying"][number] }>(
          (gift) => {
            const reservations = world.buying.filter(
              (r) =>
                r.itemId === gift.id && !r.former && r.purchased < r.quantity,
            );
            return reservations.length
              ? reservations.map((r) => ({ gift, reservation: r }))
              : (gift.available ?? 0) > 0
                ? [{ gift, reservation: undefined }]
                : [];
          },
        )
        .slice(0, 8);
  const giftChoices: Choice[] = candidates.map(({ gift, reservation: r }) => ({
    id: r ? `reservation:${r.id}` : `item:${gift.id}`,
    label: gift.title,
    detail: `${gift.recipientNames.join(" & ")} · ${world.lists.find((l) => l.id === gift.listId)?.name ?? "Private gift idea"}${r ? ` · Your reservation (${r.quantity - r.purchased} left)${r.exchangeId ? " · Exchange" : ""}` : ""}`,
  }));
  if (title.trim())
    giftChoices.push({
      id: "manual",
      label: `Use “${title.trim()}” as a manual purchase`,
    });
  const people = world.people.filter((p) => p.userId !== world.me.id);
  const peopleChoices = people
    .filter((p) => p.name.toLowerCase().includes(peopleSearch.toLowerCase()))
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      label: p.name,
      detail: world.groups
        .filter((g) => p.userId && g.memberIds.includes(p.userId))
        .map((g) => g.name)
        .join(" · "),
    }));
  const detach = () => {
    setSelectedItem(undefined);
    setSelectedReservation(undefined);
    setQuantity(1);
    setPayer(world.me.id);
    setAssignedList(undefined);
  };
  return (
    <Form
      dialogLayout
      className="spending-purchase spending-dialog-form"
      secondaryActions={() => (
        <p className="spending-privacy">
          {prospectiveShared ? <Users size={16} /> : <LockKeyhole size={16} />}
          {prospectiveShared ? `Shared with ${data.partnerName}` : "Only me"}
        </p>
      )}
      dirty={selectionDirty || undefined}
      submit="Save purchase"
      cancel={() => dismiss?.()}
      onSubmit={async () => {
        if (!recipientIds.length)
          throw new Error("Choose at least one recipient.");
        if (choices.length && !shoppingKey)
          throw new Error("Choose who this gift is for.");
        await mutate("spending/purchase", {
          ...shoppingPayload(shoppingKey),
          keepPrivate: keepPrivate || !prospectiveShared,
          reservationId: reservation?.id,
          itemId: !reservation ? item?.id : undefined,
          itemRevision: !reservation ? item?.revision : undefined,
          title: reservation?.titleSnapshot ?? item?.title ?? title.trim(),
          recipientIds,
          amountCents:
            amount.trim() === "" ? null : Math.round(Number(amount) * 100),
          date,
          quantity,
          occasionId: occasionId || undefined,
          eventId: eventId || undefined,
          payerId: payer === world.me.id ? undefined : payer,
          listId:
            !sourceList &&
            (assignedList !== undefined || (!plan && assignmentId))
              ? assignmentId || null
              : undefined,
          planRevision: plan?.revision,
        });
        close();
        onSuccess?.();
      }}
    >
      {!!choices.length && (
        <Field label="Buying for">
          <select
            value={shoppingKey}
            onChange={(e) =>
              setShopping({ itemId: item!.id, key: e.target.value })
            }
          >
            <option value="" disabled>
              Choose who this gift is for
            </option>
            <option value="ordinary">Not part of an exchange</option>
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {linked ? (
        <div className="purchase-source">
          <span className="purchase-label">Gift</span>
          <strong>{reservation?.titleSnapshot ?? item?.title}</strong>
          <p className="purchase-hint">
            {sourceList?.name ??
              plan?.listName ??
              (item && !item.listId ? "Private gift idea" : "Your reservation")}
          </p>
          {!suppliedReservation && (
            <button
              type="button"
              className="text-button"
              data-form-change
              onClick={() => {
                setRecipients(recipientIds);
                detach();
              }}
            >
              Use as a manual purchase
            </button>
          )}
        </div>
      ) : (
        <SearchSelect
          label="Gift name"
          value={title}
          onChange={setTitle}
          choices={giftChoices}
          required
          placeholder="Search wish lists or enter a gift name"
          hint="Choose a wish-list item or private idea, or enter any gift name."
          onChoose={(id) => {
            setSelectionDirty(true);
            if (id === "manual") {
              detach();
              return;
            }
            const choice = candidates.find(
              ({ gift, reservation: r }) =>
                id === (r ? `reservation:${r.id}` : `item:${gift.id}`),
            );
            if (choice) {
              setAssignedList(undefined);
              setSelectedItem(choice.gift);
              setSelectedReservation(choice.reservation);
              setTitle(choice.gift.title);
              setQuantity(1);
              setPayer(world.me.id);
            }
          }}
        />
      )}
      {world.paged && !linked && searchQuery.error && (
        <div role="alert">
          Gift search is unavailable. You can enter a manual purchase.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => searchQuery.refetch()}
          >
            Retry search
          </button>
        </div>
      )}
      <div className="purchase-recipients">
        <span className="purchase-label">For</span>
        <div className="purchase-chips">
          {recipientIds.map((id) => (
            <span key={id} className="purchase-chip">
              {world.people.find((p) => p.id === id)?.name ??
                plan?.recipientNames[plan.recipientIds.indexOf(id)] ??
                "Recipient"}
              {!linked && (
                <button
                  type="button"
                  data-form-change
                  aria-label={`Remove ${people.find((p) => p.id === id)?.name ?? "recipient"}`}
                  onClick={() =>
                    setRecipients((ids) => ids.filter((v) => v !== id))
                  }
                >
                  <X size={14} />
                </button>
              )}
            </span>
          ))}
        </div>
        {linked ? (
          <p className="purchase-hint">
            Recipients come from the selected gift.
          </p>
        ) : (
          <>
            <SearchSelect
              label="Search people"
              value={peopleSearch}
              onChange={setPeopleSearch}
              choices={peopleChoices}
              multiple
              selected={recipients}
              placeholder="Search by name"
              onChoose={(id) => {
                setSelectionDirty(true);
                setRecipients((ids) =>
                  ids.includes(id)
                    ? ids.filter((v) => v !== id)
                    : ids.length < 20
                      ? [...ids, id]
                      : ids,
                );
              }}
            />
            <p className="purchase-hint" role="status">
              {recipients.length}{" "}
              {recipients.length === 1 ? "person" : "people"} selected
              {recipients.length === 20 ? " · Maximum 20 recipients" : ""}.
            </p>
          </>
        )}
        {recipientIds.length > 1 && (
          <p className="purchase-hint">
            {plan
              ? "Uses the saved recipient shares. You can adjust shares later."
              : "The amount is split equally. You can adjust shares later."}
          </p>
        )}
      </div>
      {linked && maxQuantity > 1 && (
        <Field label="Quantity bought">
          <input
            type="number"
            name="quantity"
            min={1}
            max={maxQuantity}
            required
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </Field>
      )}
      <div className="purchase-payment">
        <div className="purchase-amount">
          <Field
            label="Amount paid in USD, optional"
            help="Include tax and shipping. Leave blank to add later."
          >
            <input
              ref={amountInput}
              name="amount"
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          {price !== null && (
            <div className="purchase-estimate">
              <span>
                Listed price: <strong>{dollars(price * quantity)}</strong>
                {quantity > 1 && (
                  <small>
                    {quantity} × {dollars(price)}
                  </small>
                )}
              </span>
              <button
                type="button"
                className="button secondary small"
                data-form-change
                onClick={() => setAmount(String((price * quantity) / 100))}
              >
                Use listed price
              </button>
            </div>
          )}
        </div>
        <Field label="Purchase date">
          <input
            name="date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>
      {!sourceList && (
        <PurchaseListField
          recipientIds={recipientIds}
          value={assignmentId}
          onChange={setAssignedList}
        />
      )}
      <details className="purchase-details">
        <summary>
          Occasion details, optional{occasionId || eventId ? " · Selected" : ""}
        </summary>
        <Field
          label="Personal occasion"
          hint="Organize your gift history, such as a birthday."
        >
          <select
            name="occasion"
            value={occasionId}
            onChange={(e) => setOccasion(e.target.value)}
          >
            <option value="">No personal occasion</option>
            {data.occasions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        {linked || assignmentList?.groupEventId ? (
          (eventId || assignmentList?.groupEventId) && (
            <p className="purchase-hint">
              Group event:{" "}
              {world.groupEvents.find(
                (e) => e.id === (assignmentList?.groupEventId ?? eventId),
              )?.name ??
                plan?.eventName ??
                "Linked event"}
              . From the selected gift.
            </p>
          )
        ) : (
          <Field
            label="Group event"
            hint="Connect this purchase to a family-group event."
          >
            <select
              name="event"
              value={event}
              onChange={(e) => {
                setEvent(e.target.value);
                setAssignedList(undefined);
              }}
            >
              <option value="">No group event</option>
              {world.groupEvents.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </details>
      {plan?.connectionId &&
        c?.status === "active" &&
        c.resumed.length === 2 &&
        c.users.every((u) => c.editing.includes(u)) && (
          <Field label="Who paid">
            <select
              name="payer"
              value={payer}
              onChange={(e) => {
                setPayer(e.target.value);
                if (e.target.value !== world.me.id) setKeepPrivate(false);
              }}
            >
              {c.users.map((u) => (
                <option key={u} value={u}>
                  {u === world.me.id ? "You" : data.partnerName}
                </option>
              ))}
            </select>
          </Field>
        )}
      {c?.status === "active" && (
        <label className="purchase-private">
          <input
            type="checkbox"
            checked={keepPrivate}
            disabled={payer !== world.me.id}
            onChange={(e) => setKeepPrivate(e.target.checked)}
          />
          Keep this purchase private
        </label>
      )}
      {payer !== world.me.id && (
        <p className="purchase-hint">
          Purchases recorded for your partner stay shared.
        </p>
      )}
      {linked && (
        <p className="purchase-hint">
          Saving also marks {quantity} {quantity === 1 ? "gift" : "gifts"}{" "}
          purchased.
        </p>
      )}
    </Form>
  );
}

export function PurchaseListField({
  recipientIds,
  value,
  onChange,
}: {
  recipientIds: string[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { world } = useApp();
  const choices = world.lists.filter(
    (l) =>
      !l.deletedAt &&
      recipientIds.length > 0 &&
      recipientIds.every((id) => l.ownerIds.includes(id)),
  );
  return (
    <Field
      label="Wish list for spending, optional"
      hint="Includes this gift in the list’s spending totals without adding or sharing the gift. Event lists also include it in that event’s totals."
    >
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No wish list</option>
        {value && !choices.some((l) => l.id === value) && (
          <option value={value}>Previously assigned wish list</option>
        )}
        {choices.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} •{" "}
            {l.ownerIds
              .map(
                (id) =>
                  world.people.find((p) => p.id === id)?.name ?? "Recipient",
              )
              .join(" & ")}
            {l.archived ? " · Archived" : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}
