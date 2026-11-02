import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { LockKeyhole, Users, ArrowRight } from "lucide-react";
import { api, dollars } from "./api";
import { useApp } from "./context";
import { Form, Field, Header } from "./components";
import { Action } from "./Action";
import type { World } from "../shared/model";
import {
  allocatedCents,
  spendingMatches,
  spendingTotals,
  type SpendingView,
  type SpendingHistoryView,
  type SpendingRecord,
} from "../shared/spending";
import "./spending.css";
const today = () => new Date().toLocaleDateString("en-CA");
function useSpending() {
  const { world } = useApp();
  return useQuery({
    queryKey: ["spending", world.me.id],
    queryFn: () => api<SpendingView>("spending"),
    refetchInterval: 20000,
  });
}
function useSpendingHistory(params: URLSearchParams) {
  const { world } = useApp();
  return useQuery({
    queryKey: ["spending", world.me.id, "history", params.toString()],
    queryFn: () => api<SpendingHistoryView>("spending/history?" + params),
    refetchInterval: 20000,
  });
}
const amount = (f: FormData, name = "amount") =>
  String(f.get(name) ?? "").trim() === ""
    ? null
    : Math.round(Number(f.get(name)) * 100);
function MoneyField({
  value,
  label = "Amount paid in USD, optional",
  required = false,
}: {
  value?: number | null;
  label?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        name="amount"
        required={required}
        type="number"
        inputMode="decimal"
        min="0"
        max="1000000"
        step="0.01"
        defaultValue={value == null ? "" : value / 100}
      />
    </Field>
  );
}
export function SpendingSettingsPanel() {
  const { world, mutate, open, close } = useApp();
  const { data, error } = useSpending();
  if (error)
    return (
      <p role="alert">
        Unable to load spending settings. Refresh to try again.
      </p>
    );
  if (!data) return <p>Loading spending settings…</p>;
  const { settings, connection: c } = data;
  const update = (enabled: boolean, summaries = settings.summaries) =>
    mutate("spending/settings", { enabled, summaries });
  const operation = (op: string, extra = {}) =>
    mutate("spending/connection", {
      id: c!.id,
      revision: c!.revision,
      operation: op,
      ...extra,
    });
  const rules = [
    ...world.people
      .filter(
        (p) =>
          p.userId !== world.me.id &&
          (!c || !p.userId || !c.users.includes(p.userId)),
      )
      .map((p) => ({ id: "person:" + p.id, name: p.name })),
    ...world.groupEvents.map((e) => ({ id: "event:" + e.id, name: e.name })),
    ...data.occasions.map((o) => ({ id: "occasion:" + o.id, name: o.name })),
  ];
  return (
    <section className="spending-settings">
      <h2>Spending</h2>
      <Form
        submit="Save spending settings"
        onSubmit={async (f) => {
          await update(f.get("enabled") === "on", f.get("summaries") === "on");
        }}
      >
        <label>
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={settings.enabled}
          />{" "}
          Track my spending
        </label>
        <p>
          Record amounts and review gift history in Buying. Turning this off
          keeps your records private and pauses sharing.
        </p>
        <label>
          <input
            type="checkbox"
            name="summaries"
            defaultChecked={settings.summaries}
          />{" "}
          Show quick totals on people, wish lists, and events
        </label>
      </Form>
      {!settings.enabled && c?.status === "pending" && (
        <p>
          {data.partnerName} invited you to share spending. Turn on tracking
          above to review and accept the connection.
        </p>
      )}
      {settings.enabled && (
        <>
          <Link className="button secondary" to="/buying/spending">
            View your spending
          </Link>
          <h2>Spending partner</h2>
          {!c ? (
            <Form
              submit="Invite spending partner"
              onSubmit={async (f) => {
                await mutate("spending/connect", { userId: f.get("partner") });
              }}
            >
              <Field label="Choose a person">
                <select name="partner" required>
                  <option value="">Choose a person</option>
                  {world.people
                    .filter((p) => p.userId && p.userId !== world.me.id)
                    .map((p) => (
                      <option key={p.id} value={p.userId}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              <p>
                Both people must accept. Household membership does not share
                spending.
              </p>
            </Form>
          ) : (
            <>
              <p>
                {data.partnerName} ·{" "}
                {c.status === "pending" ? "Invitation pending" : "Connected"}
              </p>
              {c.status === "pending" && c.users[1] === world.me.id && (
                <Action onClick={() => operation("accept")}>
                  Accept connection
                </Action>
              )}
              {c.status === "active" && (
                <>
                  {!c.resumed.includes(world.me.id) && (
                    <Action onClick={() => operation("resume")}>
                      Resume sharing
                    </Action>
                  )}
                  <h3>Share my spending for</h3>
                  <Form
                    key={c.revision}
                    submit="Save sharing choices"
                    onSubmit={async (f) => {
                      await operation("rules", { rules: f.getAll("rules") });
                    }}
                  >
                    {rules.map((r) => (
                      <label className="spending-choice" key={r.id}>
                        <input
                          type="checkbox"
                          name="rules"
                          value={r.id}
                          defaultChecked={c.rules[world.me.id]?.includes(r.id)}
                        />
                        {r.name}
                      </label>
                    ))}
                    <p>
                      These choices apply to new entries. Existing history stays
                      private until you share it. Gifts for either of you always
                      stay private.
                    </p>
                  </Form>
                  <h3>Joint editing</h3>
                  <p>
                    {c.users.every((u) => c.editing.includes(u))
                      ? "Both of you can edit shared gifts."
                      : c.editing.includes(world.me.id)
                        ? "Waiting for your partner to allow joint editing."
                        : "Each person updates their own gifts. Both can edit shared budgets."}
                  </p>
                  <Action
                    secondary
                    onClick={() =>
                      operation(
                        c.editing.includes(world.me.id)
                          ? "edit-off"
                          : "edit-on",
                      )
                    }
                  >
                    {c.editing.includes(world.me.id)
                      ? "Turn off joint editing"
                      : "Allow joint editing"}
                  </Action>
                </>
              )}
              <Action
                secondary
                onClick={async () => {
                  open(
                    "Disconnect spending partner",
                    <Form
                      submit="Disconnect"
                      onSubmit={async () => {
                        await operation("disconnect");
                        close();
                      }}
                    >
                      <p>
                        Shared access ends. Each person keeps their own purchase
                        records.
                      </p>
                    </Form>,
                  );
                }}
              >
                Disconnect
              </Action>
            </>
          )}
        </>
      )}
    </section>
  );
}
export function PurchaseForm({
  reservation,
  onSuccess,
}: {
  onSuccess?: () => void;
  reservation?: Pick<
    World["buying"][number],
    "id" | "revision" | "quantity" | "purchased" | "titleSnapshot" | "item"
  >;
}) {
  const { world, mutate, close } = useApp();
  const { data, error, refetch } = useSpending();
  const [amountEdited, setAmountEdited] = useState(false);
  const [skip, setSkip] = useState(false);
  const [keepPrivate, setKeepPrivate] = useState(false);
  const [payer, setPayer] = useState(world.me.id);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [selectedOccasion, setSelectedOccasion] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today());
  if (error)
    return (
      <div role="alert">
        <p>Unable to load purchase details.</p>
        <button onClick={() => void refetch()}>Try again</button>
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
  const c = data.connection;
  const protectedGift = (plan?.recipientIds ?? selectedRecipients).some((id) =>
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
      : purchaseDate >= c.createdAt.slice(0, 10) &&
        [
          ...selectedRecipients.map((id) => "person:" + id),
          "event:" + selectedEvent,
          "occasion:" + selectedOccasion,
        ].some((rule) => c.rules[world.me.id]?.includes(rule)));
  return (
    <Form
      submit="Save purchase"
      onSubmit={async (f) => {
        await mutate("spending/purchase", {
          keepPrivate: keepPrivate || !prospectiveShared,
          reservationId: reservation?.id,
          title: reservation?.titleSnapshot ?? String(f.get("title")),
          recipientIds: plan?.recipientIds ?? f.getAll("recipients"),
          amountCents: skip ? null : amount(f),
          date: String(f.get("date")),
          quantity: Number(f.get("quantity") ?? 1),
          occasionId: String(f.get("occasion") ?? "") || undefined,
          eventId: String(f.get("event") ?? "") || undefined,
          payerId: String(f.get("payer") ?? world.me.id),
          planRevision: plan?.revision,
        });
        close();
        onSuccess?.();
      }}
    >
      {reservation ? (
        <p>
          <strong>{reservation.titleSnapshot}</strong>
        </p>
      ) : (
        <>
          <Field label="Gift name">
            <input name="title" required maxLength={200} />
          </Field>
          <fieldset>
            <legend>For</legend>
            {world.people
              .filter((p) => p.userId !== world.me.id)
              .map((p) => (
                <label className="spending-choice" key={p.id}>
                  <input
                    type="checkbox"
                    name="recipients"
                    value={p.id}
                    onChange={(e) =>
                      setSelectedRecipients((ids) =>
                        e.target.checked
                          ? [...ids, p.id]
                          : ids.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
          </fieldset>
        </>
      )}
      <div onInput={() => setAmountEdited(true)}>
        <MoneyField
          value={
            reservation?.item?.priceCents ??
            (plan?.amountCents == null
              ? null
              : Math.round(plan.amountCents / Math.max(1, plan.quantity)))
          }
        />
      </div>
      <p className="muted">
        Suggested prices are estimates. Enter the total you paid, including tax
        and shipping.
      </p>
      <label>
        <input
          type="checkbox"
          checked={skip}
          onChange={(e) => setSkip(e.target.checked)}
        />{" "}
        Skip the amount for now
      </label>
      <Field label="Purchase date">
        <input
          name="date"
          type="date"
          required
          value={purchaseDate}
          onChange={(e) => setPurchaseDate(e.target.value)}
        />
      </Field>
      {reservation && reservation.quantity - reservation.purchased > 1 && (
        <Field label="Quantity bought">
          <input
            name="quantity"
            onChange={(e) => {
              if (!amountEdited) {
                const input = e.currentTarget.form?.elements.namedItem(
                  "amount",
                ) as HTMLInputElement | null;
                const price =
                  reservation?.item?.priceCents ??
                  (plan?.amountCents == null
                    ? null
                    : plan.amountCents / Math.max(1, plan.quantity));
                if (input && price !== null)
                  input.value = String(
                    Math.round(price * Number(e.target.value)) / 100,
                  );
              }
            }}
            type="number"
            min={1}
            max={reservation.quantity - reservation.purchased}
            defaultValue={1}
            required
          />
        </Field>
      )}
      <Field label="Personal occasion, optional">
        <select
          name="occasion"
          onChange={(e) => setSelectedOccasion(e.target.value)}
          defaultValue={plan?.occasionId ?? ""}
        >
          <option value="">No personal occasion</option>
          {data.occasions.map((o) => (
            <option value={o.id} key={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      {!reservation && (
        <Field label="Group event, optional">
          <select
            name="event"
            onChange={(e) => setSelectedEvent(e.target.value)}
          >
            <option value="">No group event</option>
            {world.groupEvents.map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {plan?.connectionId &&
        data.connection?.users.every((u) =>
          data.connection!.editing.includes(u),
        ) && (
          <Field label="Who paid">
            <select
              name="payer"
              value={payer}
              onChange={(e) => {
                setPayer(e.target.value);
                if (e.target.value !== world.me.id) setKeepPrivate(false);
              }}
            >
              {data.connection.users.map((u) => (
                <option key={u} value={u}>
                  {u === world.me.id ? "You" : data.partnerName}
                </option>
              ))}
            </select>
          </Field>
        )}
      {c?.status === "active" && (
        <label>
          <input
            type="checkbox"
            disabled={payer !== world.me.id}
            checked={keepPrivate}
            onChange={(e) => setKeepPrivate(e.target.checked)}
          />{" "}
          Keep this purchase private
        </label>
      )}
      {payer !== world.me.id && (
        <p>Purchases recorded for your partner stay shared.</p>
      )}
      <p className="spending-privacy">
        <LockKeyhole size={16} />
        {prospectiveShared ? `Shared with ${data.partnerName}` : "Only me"}
      </p>
    </Form>
  );
}
function RecordForm({ record: r }: { record: SpendingRecord }) {
  const { mutate, close } = useApp();
  return (
    <Form
      submit="Save changes"
      onSubmit={async (f) => {
        await mutate("spending/record", {
          id: r.id,
          revision: r.revision,
          amountCents: amount(f),
          date: String(f.get("date") ?? "") || null,
          planningYear: Number(f.get("year") ?? r.planningYear),
          splits: r.recipientIds.map((_, i) => Number(f.get("split" + i))),
        });
        close();
      }}
    >
      <p>{r.title}</p>
      <MoneyField
        value={r.amountCents}
        label={
          r.kind === "plan"
            ? "Estimated total in USD"
            : "Total paid in USD, optional"
        }
      />
      {r.kind === "plan" ? (
        <Field label="Planning year">
          <input
            name="year"
            type="number"
            min={1900}
            max={2200}
            defaultValue={r.planningYear}
          />
        </Field>
      ) : (
        <Field label="Purchase date">
          <input name="date" type="date" defaultValue={r.date ?? ""} />
        </Field>
      )}
      <fieldset>
        <legend>Split between recipients</legend>
        <p>
          Equal values split the cost equally. Use relative shares, such as 1
          and 2.
        </p>
        {r.recipientIds.map((id, i) => (
          <Field key={id} label={r.recipientNames[i]}>
            <input
              name={"split" + i}
              type="number"
              min={0}
              max={1000000}
              step="any"
              required
              defaultValue={r.splits[i]}
            />
          </Field>
        ))}
      </fieldset>
    </Form>
  );
}
export function SpendingSummary({
  person,
  list,
  event,
}: {
  person?: string;
  list?: string;
  event?: string;
}) {
  const { data } = useSpending();
  const historyParams = new URLSearchParams(
    Object.entries({ person, list, event }).filter(
      (v): v is [string, string] => !!v[1],
    ),
  );
  const history = useSpendingHistory(historyParams);
  const { world } = useApp();
  if (!data) return null;
  if (!data.settings.enabled)
    return person || list || event ? null : (
      <p>
        <Link to="/settings?section=spending">
          Track what you spend on gifts <ArrowRight size={16} />
        </Link>
      </p>
    );
  if (!data.settings.summaries && (person || list || event)) return null;
  const filter = { person, list, event };
  const totals = history.data?.summary;
  if (!totals) return null;
  const params = new URLSearchParams(
    Object.entries(filter).filter((v): v is [string, string] => !!v[1]),
  );
  return (
    <section className="spending-quick" aria-label="Your spending">
      <span>
        Spent <strong>{dollars(totals.spent)}</strong>
      </span>
      <span>
        Still planning <strong>{dollars(totals.planned)}</strong> · estimated
      </span>
      {totals.missing > 0 && (
        <span>
          {totals.missing} {totals.missing === 1 ? "amount" : "amounts"} missing
        </span>
      )}
      <Link to={"/buying/spending?" + params}>
        View spending <ArrowRight size={16} />
      </Link>
    </section>
  );
}
export function SpendingPage() {
  const { world, open, mutate, close } = useApp();
  const { data, error } = useSpending();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const historyParams = new URLSearchParams(params);
  historyParams.delete("view");
  historyParams.set(
    "shared",
    String(
      params.get("view") === "shared" && data?.connection?.status === "active",
    ),
  );
  historyParams.set("page", String(page));
  const history = useSpendingHistory(historyParams);
  if (error)
    return <p role="alert">Unable to load spending. Refresh to try again.</p>;
  if (!data) return <p>Loading spending…</p>;
  if (!data.settings.enabled)
    return (
      <>
        <Header
          title="Your spending"
          description="Keep track of the gifts you buy."
        />
        <SpendingSettingsPanel />
      </>
    );
  const shared =
    params.get("view") === "shared" && data.connection?.status === "active";
  const filter = {
    person: params.get("person") || undefined,
    list: params.get("list") || undefined,
    event: params.get("event") || undefined,
    occasion: params.get("occasion") || undefined,
    year: params.get("year") ? Number(params.get("year")) : undefined,
  };
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
    setPage(1);
  };
  if (history.error)
    return (
      <p role="alert">Unable to load spending history. Refresh to try again.</p>
    );
  if (!history.data) return <p>Loading spending history…</p>;
  const records = history.data.records;
  const totals = history.data.summary;
  const scope =
    [
      filter.person && "person:" + filter.person,
      filter.list && "list:" + filter.list,
      filter.event && "event:" + filter.event,
      filter.occasion && "occasion:" + filter.occasion,
    ]
      .filter(Boolean)
      .join("|") || "all";
  const budget = data.budgets.find(
    (b) =>
      b.scope === scope &&
      b.year === (filter.year ?? null) &&
      (shared ? b.connectionId === data.connection?.id : !b.connectionId),
  );
  const budgetForm = () =>
    open(
      "Set a budget",
      <Form
        submit="Save budget"
        onSubmit={async (f) => {
          await mutate("spending/budget", {
            scope,
            year: filter.year ?? null,
            amountCents: amount(f),
            shared: !!shared,
            revision: budget?.revision,
          });
          close();
        }}
      >
        <p>
          For the people, collection, and period currently selected.{" "}
          {shared
            ? "Both partners can edit this budget."
            : "Only you can see this budget."}
        </p>
        <MoneyField
          value={budget?.amountCents}
          label="Budget in USD"
          required
        />
      </Form>,
    );
  return (
    <div className="spending-page">
      <Header
        title="Your spending"
        description="Gift costs, plans, and history."
      />
      <div className="spending-toolbar">
        <div className="tabs" role="group" aria-label="Spending view">
          <button aria-pressed={!shared} onClick={() => set("view", "")}>
            Only me
          </button>
          {data.connection?.status === "active" && (
            <button
              aria-pressed={!!shared}
              onClick={() => set("view", "shared")}
            >
              You + {data.partnerName}
            </button>
          )}
        </div>
        <button
          className="button"
          onClick={() => open("Add purchase", <PurchaseForm />)}
        >
          Add purchase
        </button>
        <Link to="/settings?section=spending">Sharing settings</Link>
      </div>
      {shared && data.connection?.resumed.length !== 2 && (
        <p role="status">
          Sharing is paused. Shared totals are unavailable until both people
          resume sharing in Settings.
        </p>
      )}
      <div className="spending-filters">
        <Field label="Person">
          <select
            value={filter.person ?? ""}
            onChange={(e) => set("person", e.target.value)}
          >
            <option value="">Everyone</option>
            {[
              ...new Map(
                [...world.people, ...history.data.recipients].map((p) => [
                  p.id,
                  p,
                ]),
              ).values(),
            ].map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Occasion">
          <select
            value={
              filter.event
                ? "event:" + filter.event
                : filter.occasion
                  ? "occasion:" + filter.occasion
                  : ""
            }
            onChange={(e) => {
              const next = new URLSearchParams(params);
              next.delete("event");
              next.delete("occasion");
              if (e.target.value) {
                const [kind, id] = e.target.value.split(":");
                next.set(kind, id);
              }
              setParams(next);
              setPage(1);
            }}
          >
            <option value="">All occasions</option>
            {[
              ...new Map(
                [...world.groupEvents, ...history.data.events]
                  .reverse()
                  .map((e) => [e.id, e]),
              ).values(),
            ].map((e) => (
              <option value={"event:" + e.id} key={e.id}>
                {e.name}
              </option>
            ))}
            {data.occasions.map((o) => (
              <option value={"occasion:" + o.id} key={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <details className="spending-extra-filters">
        <summary>
          More filters{filter.year ? " · " + filter.year : ""}
          {filter.list ? " · Wish list" : ""}
        </summary>
        <div className="spending-filters">
          <Field label="Wish list">
            <select
              value={filter.list ?? ""}
              onChange={(e) => set("list", e.target.value)}
            >
              <option value="">All wish lists</option>
              {[
                ...new Map(
                  [...world.lists, ...history.data.lists]
                    .reverse()
                    .map((l) => [l.id, l]),
                ).values(),
              ].map((l) => (
                <option value={l.id} key={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Period">
            <select
              value={filter.year ?? ""}
              onChange={(e) => set("year", e.target.value)}
            >
              <option value="">All time</option>
              {history.data.years
                .sort((a, b) => b - a)
                .map((y) => (
                  <option value={y} key={y}>
                    {y}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      </details>
      <button
        className="text-button"
        onClick={() =>
          open(
            "Add personal occasion",
            <Form
              submit="Add occasion"
              onSubmit={async (f) => {
                await mutate("spending/occasion", {
                  name: f.get("name"),
                  shared: !!shared,
                });
                close();
              }}
            >
              <Field label="Occasion name">
                <input
                  name="name"
                  required
                  maxLength={150}
                  placeholder="Mom’s birthday 2025"
                />
              </Field>
              <p>{shared ? `Shared with ${data.partnerName}` : "Only me"}</p>
            </Form>,
          )
        }
      >
        Add personal occasion
      </button>
      {(!shared || data.connection?.resumed.length === 2) && (
        <section className="spending-numbers" aria-live="polite">
          <div>
            <span>{shared ? "Spent together" : "Spent"}</span>
            <strong>{dollars(totals.spent)}</strong>
          </div>
          <div>
            <span>Still planning · estimated</span>
            <strong>{dollars(totals.planned)}</strong>
          </div>
        </section>
      )}
      {!!totals.missing && (
        <p role="status">
          {totals.missing} {totals.missing === 1 ? "amount" : "amounts"}{" "}
          missing. Totals and remaining budget use recorded amounts only.
        </p>
      )}
      {budget ? (
        <section className="spending-budget">
          <div className="spending-toolbar">
            <h2>Budget {dollars(budget.amountCents)}</h2>
            <button className="text-button" onClick={budgetForm}>
              Edit
            </button>
          </div>
          <p>{dollars(budget.amountCents - totals.spent)} left to spend</p>
          <p>
            {dollars(budget.amountCents - totals.spent - totals.planned)} left
            after planned gifts
          </p>
          <div className="spending-meter" aria-hidden="true">
            <span
              style={{
                width:
                  Math.min(
                    100,
                    (Math.max(0, totals.spent) / (budget.amountCents || 1)) *
                      100,
                  ) + "%",
              }}
            />
            <span
              style={{
                width:
                  Math.min(
                    100,
                    (totals.planned / (budget.amountCents || 1)) * 100,
                  ) + "%",
              }}
            />
          </div>
          {totals.spent + totals.planned > budget.amountCents && (
            <p>
              {dollars(totals.spent + totals.planned - budget.amountCents)} over
              your plan. You can still buy or reserve gifts.
            </p>
          )}
        </section>
      ) : (
        <button className="text-button" onClick={budgetForm}>
          Set a budget
        </button>
      )}
      <h2>Gift history and plans</h2>
      {records.length === 0 && (
        <p>
          No gifts match this view. Add a purchase or reserve a gift to get
          started.
        </p>
      )}
      {records.map((r) => (
        <article className="spending-row" key={r.id}>
          <div>
            <h3>{r.title}</h3>
            <p>
              {r.recipientNames.join(" & ")} ·{" "}
              {r.kind === "plan"
                ? "Reserved · estimated"
                : r.kind === "refund"
                  ? "Refund"
                  : r.kind === "contribution"
                    ? "Contribution"
                    : "Purchased"}
            </p>
            <p className="muted">
              {r.kind === "plan"
                ? `Planned for ${r.planningYear}`
                : (r.date ?? "Purchase date not recorded")}{" "}
              · {r.payerName}
            </p>
            <span className="spending-privacy">
              {r.connectionId && r.sharing !== "private" ? (
                <Users size={16} />
              ) : (
                <LockKeyhole size={16} />
              )}
              {r.connectionId && r.sharing !== "private"
                ? `Shared with ${data.partnerName}`
                : "Only me"}
            </span>
          </div>
          <strong className="spending-amount">
            {r.amountCents === null
              ? "Amount missing"
              : dollars(allocatedCents(r, filter.person))}
            {filter.person && r.recipientIds.length > 1 && (
              <small> of {dollars(r.amountCents)} total</small>
            )}
          </strong>
          <div className="spending-row-actions">
            {r.kind === "plan" && r.canEdit && r.reservationId && (
              <button
                className="button secondary"
                onClick={() => {
                  const reservation = world.buying.find(
                    (v) => v.id === r.reservationId,
                  );
                  open(
                    "Mark as purchased",
                    <PurchaseForm
                      reservation={
                        reservation ?? {
                          id: r.reservationId!,
                          revision: 0,
                          quantity: r.quantity,
                          purchased: 0,
                          titleSnapshot: r.title,
                        }
                      }
                    />,
                  );
                }}
              >
                Mark as purchased
              </button>
            )}
            {r.canEdit && (
              <button
                className="button secondary"
                onClick={() =>
                  open(
                    r.kind === "plan" ? "Update plan" : "Edit purchase",
                    <RecordForm record={r} />,
                  )
                }
              >
                Edit {r.kind === "plan" ? "plan" : "purchase"}
              </button>
            )}
            {r.ownerId === world.me.id &&
              data.connection?.status === "active" &&
              !r.protected && (
                <Action
                  secondary
                  onClick={() =>
                    mutate("spending/share", {
                      id: r.id,
                      revision: r.revision,
                      shared: r.sharing === "private",
                    })
                  }
                >
                  {r.sharing === "private"
                    ? "Share with partner"
                    : "Keep private"}
                </Action>
              )}
            {r.canEdit && r.kind === "purchase" && (
              <button
                className="text-button"
                onClick={() =>
                  open(
                    "Record refund",
                    <Form
                      submit="Save refund"
                      onSubmit={async (f) => {
                        await mutate("spending/refund", {
                          id: r.id,
                          revision: r.revision,
                          amountCents: amount(f),
                          date: f.get("date"),
                        });
                        close();
                      }}
                    >
                      <MoneyField label="Refund received in USD" required />
                      <Field label="Refund date">
                        <input
                          name="date"
                          type="date"
                          defaultValue={today()}
                          required
                        />
                      </Field>
                      <p>
                        This records a refund already received. It does not
                        contact the shop.
                      </p>
                    </Form>,
                  )
                }
              >
                Record refund
              </button>
            )}
          </div>
          {r.history.length > 0 && (
            <details>
              <summary>Purchase history</summary>
              {r.history.map((h, i) => (
                <p key={i}>
                  {h.description} · {new Date(h.at).toLocaleDateString()}
                  {h.changes &&
                    Object.entries(h.changes).map(([key, change]) => (
                      <span className="spending-change" key={key}>
                        {(
                          {
                            amountCents: "Amount paid",
                            date: "Purchase date",
                            planningYear: "Planning year",
                            splits: "Recipient shares",
                          } as Record<string, string>
                        )[key] ?? key}
                        :{" "}
                        {key === "amountCents"
                          ? dollars(change.before as number | null)
                          : String(change.before ?? "Not recorded")}{" "}
                        →{" "}
                        {key === "amountCents"
                          ? dollars(change.after as number | null)
                          : String(change.after ?? "Not recorded")}
                      </span>
                    ))}
                </p>
              ))}
            </details>
          )}
        </article>
      ))}
      {page > 1 && (
        <button className="button secondary" onClick={() => setPage(page - 1)}>
          Previous page
        </button>
      )}
      {history.data.total > page * 30 && (
        <button className="button secondary" onClick={() => setPage(page + 1)}>
          Next page
        </button>
      )}
    </div>
  );
}
