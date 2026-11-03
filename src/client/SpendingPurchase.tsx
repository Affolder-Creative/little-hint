import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { LockKeyhole, Users, X, Check } from "lucide-react";
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
type Choice = { id: string; label: string; detail?: string };

/** Input focus stays in the combobox while the active option is announced. */
function PurchaseSearch({
  label,
  value,
  onChange,
  choices,
  onChoose,
  hint,
  required = false,
  placeholder,
  multiple = false,
  selected = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  choices: Choice[];
  onChoose: (id: string) => void;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  multiple?: boolean;
  selected?: string[];
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const index = Math.min(active, Math.max(choices.length - 1, 0));
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${index}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, index, id]);
  const choose = (choice: Choice) => {
    onChoose(choice.id);
    if (!multiple) setOpen(false);
    input.current?.focus();
  };
  return (
    <div
      className="purchase-search field"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="purchase-search-anchor">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && choices.length ? `${id}-option-${index}` : undefined
          }
          aria-describedby={hint ? `${id}-hint` : undefined}
          autoComplete="off"
          value={value}
          maxLength={multiple ? 150 : 200}
          required={required}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((i) =>
                Math.max(
                  0,
                  Math.min(
                    choices.length - 1,
                    i + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter" && open && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (choices[index]) choose(choices[index]);
            }
          }}
        />
        {open && (
          <div
            className="purchase-options"
            id={`${id}-options`}
            role="listbox"
            aria-label={label}
            aria-multiselectable={multiple || undefined}
          >
            {choices.map((choice, i) => (
              <button
                type="button"
                tabIndex={-1}
                data-form-change
                key={choice.id}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={
                  multiple ? selected.includes(choice.id) : index === i
                }
                className={
                  index === i ? "purchase-option active" : "purchase-option"
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(choice)}
              >
                <span>
                  {multiple && (
                    <span aria-hidden="true" className="purchase-check">
                      {selected.includes(choice.id) ? (
                        <Check size={14} />
                      ) : null}
                    </span>
                  )}
                  {choice.label}
                </span>
                {choice.detail && <small>{choice.detail}</small>}
              </button>
            ))}
            {!choices.length && (
              <p className="purchase-hint">
                {multiple
                  ? "No matching people."
                  : "No matching items. Enter any gift name."}
              </p>
            )}
          </div>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="purchase-hint">
          {hint}
        </p>
      )}
      <span className="sr-only" role="status">
        {open
          ? `${choices.length} options shown${multiple ? `, ${selected.length} people selected` : ""}.`
          : ""}
      </span>
    </div>
  );
}

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
  const reservation = suppliedReservation ?? selectedReservation;
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
  const [payer, setPayer] = useState(world.me.id);
  const [event, setEvent] = useState(initialEvent ?? params.get("event") ?? "");
  const [occasion, setOccasion] = useState<string | undefined>(
    initialOccasion ?? params.get("occasion") ?? undefined,
  );
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
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
  const sourceList = world.lists.find((l) => l.id === item?.listId);
  const eventId =
    plan?.eventId ?? sourceList?.groupEventId ?? (linked ? undefined : event);
  const occasionId = occasion ?? plan?.occasionId ?? "";
  const price = item?.priceCents ?? plan?.unitEstimateCents ?? null;
  const maxQuantity = reservation
    ? reservation.quantity - reservation.purchased
    : (item?.available ?? 1);
  const c = data.connection;
  const protectedGift =
    !!plan?.protected ||
    recipientIds.some((id) =>
      world.people.some(
        (p) => p.id === id && !!p.userId && c?.users.includes(p.userId),
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
      gift.listId &&
      !gift.isRecipient &&
      !gift.archived &&
      !gift.deletedAt &&
      world.lists.some(
        (l) => l.id === gift.listId && !l.archived && !l.deletedAt,
      ) &&
      `${gift.title} ${gift.recipientNames.join(" ")} ${world.lists.find((l) => l.id === gift.listId)?.name ?? ""}`
        .toLowerCase()
        .includes(title.toLowerCase()),
  );
  const candidates = matches
    .flatMap<{ gift: GiftView; reservation?: World["buying"][number] }>(
      (gift) => {
        const reservations = world.buying.filter(
          (r) => r.itemId === gift.id && !r.former && r.purchased < r.quantity,
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
    detail: `${gift.recipientNames.join(" & ")} · ${world.lists.find((l) => l.id === gift.listId)?.name ?? "Wish list"}${r ? ` · Your reservation (${r.quantity - r.purchased} left)${r.exchangeId ? " · Exchange" : ""}` : ""}`,
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
  };
  return (
    <Form
      dialogLayout
      className="spending-purchase"
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
        await mutate("spending/purchase", {
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
          payerId: payer,
          planRevision: plan?.revision,
        });
        close();
        onSuccess?.();
      }}
    >
      {linked ? (
        <div className="purchase-source">
          <span className="purchase-label">Gift</span>
          <strong>{reservation?.titleSnapshot ?? item?.title}</strong>
          <p className="purchase-hint">
            {sourceList?.name ?? plan?.listName ?? "Your reservation"}
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
        <PurchaseSearch
          label="Gift name"
          value={title}
          onChange={setTitle}
          choices={giftChoices}
          required
          placeholder="Search wish lists or enter a gift name"
          hint="Choose a wish-list item, or enter any gift name."
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
              setSelectedItem(choice.gift);
              setSelectedReservation(choice.reservation);
              setTitle(choice.gift.title);
              setQuantity(1);
              setPayer(world.me.id);
            }
          }}
        />
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
            <PurchaseSearch
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
        <Field
          label="Amount paid in USD, optional"
          hint="Include tax and shipping. Leave blank to add later."
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
      {price !== null && (
        <p className="purchase-hint">
          Listed-price estimate: {dollars(price * quantity)}.{" "}
          <button
            type="button"
            className="text-button"
            data-form-change
            onClick={() => setAmount(String((price * quantity) / 100))}
          >
            Use {dollars(price * quantity)}
          </button>
        </p>
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
        {linked ? (
          eventId && (
            <p className="purchase-hint">
              Group event:{" "}
              {world.groupEvents.find((e) => e.id === eventId)?.name ??
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
              onChange={(e) => setEvent(e.target.value)}
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
