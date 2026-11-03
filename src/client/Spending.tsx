import { useId, useState, type ComponentProps } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  LockKeyhole,
  Users,
  ArrowRight,
  Plus,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { api, dollars } from "./api";
import { useApp } from "./context";
import { Form, Field, Header, useModalDismiss } from "./components";
import { Action } from "./Action";
import { ActionMenu } from "./Management";
import { PurchaseForm } from "./SpendingPurchase";
export { PurchaseForm } from "./SpendingPurchase";
import {
  allocatedCents,
  type SpendingView,
  type SpendingHistoryView,
  type SpendingRecord,
} from "../shared/spending";
import "./spending.css";
const today = () => new Date().toLocaleDateString("en-CA");
function useSpending(enabled = true) {
  const { world } = useApp();
  return useQuery({
    queryKey: ["spending", world.me.id],
    queryFn: () => api<SpendingView>("spending"),
    enabled: enabled && world.spendingAvailable !== false,
    refetchInterval: 20000,
  });
}
function useSpendingHistory(params: URLSearchParams, enabled = true) {
  const { world } = useApp();
  return useQuery({
    queryKey: ["spending", world.me.id, "history", params.toString()],
    queryFn: () => api<SpendingHistoryView>("spending/history?" + params),
    enabled: enabled && world.spendingAvailable !== false,
    placeholderData: keepPreviousData,
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
        secondaryActionsPosition="after"
        secondaryActions={() =>
          settings.enabled ? (
            <Link className="button secondary" to="/buying/spending">
              View your spending
            </Link>
          ) : null
        }
        submit="Save spending settings"
        onSubmit={async (f) => {
          await update(f.get("enabled") === "on", f.get("summaries") === "on");
        }}
      >
        <label className="check">
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
        <label className="check">
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
          <h2>Spending partner</h2>
          {!c ? (
            <Form
              className="spending-partner-form"
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
function SpendingDialogForm(
  props: Omit<ComponentProps<typeof Form>, "cancel" | "dialogLayout">,
) {
  const dismiss = useModalDismiss();
  return <Form {...props} dialogLayout cancel={() => dismiss?.()} />;
}
function RecordForm({
  record: r,
  onSuccess,
}: {
  record: SpendingRecord;
  onSuccess?: () => void;
}) {
  const { mutate, close } = useApp();
  return (
    <SpendingDialogForm
      submit="Save changes"
      onSubmit={async (f) => {
        await mutate("spending/record", {
          id: r.id,
          revision: r.revision,
          amountCents: amount(f),
          date: String(f.get("date") ?? "") || null,
          planningYear: Number(f.get("year") ?? r.planningYear),
          splits:
            r.recipientIds.length === 1
              ? r.splits
              : r.recipientIds.map((_, i) => Number(f.get("split" + i))),
        });
        if (onSuccess) onSuccess();
        else close();
      }}
    >
      <div className="spending-edit-context">
        <h3>{r.title}</h3>
        <p>For {r.recipientNames.join(" & ")}</p>
      </div>
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
      {r.recipientIds.length > 1 && (
        <fieldset className="spending-splits">
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
      )}
    </SpendingDialogForm>
  );
}
type Totals = SpendingHistoryView["summary"];
function totalLabel(t: Totals, planned = false) {
  return planned
    ? !t.knownPlanned && t.missingPlanned
      ? "Not estimated"
      : dollars(t.planned)
    : !t.knownActual && t.missingActual
      ? "Not recorded"
      : dollars(t.spent);
}
function dateLabel(date: string | null) {
  return date
    ? new Date(date + "T12:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date not recorded";
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
  const { world } = useApp();
  const { data } = useSpending();
  const scoped = !!(person || list || event);
  const params = new URLSearchParams(
    Object.entries({ person, list, event }).filter(
      (v): v is [string, string] => !!v[1],
    ),
  );
  const visible =
    !!data?.settings.enabled && (!scoped || !!data.settings.summaries);
  const history = useSpendingHistory(params, visible);
  if (world.spendingAvailable === false || !data) return null;
  if (!data.settings.enabled)
    return scoped ? null : (
      <p>
        <Link className="button secondary" to="/settings?section=spending">
          Track what you spend on gifts <ArrowRight size={16} />
        </Link>
      </p>
    );
  if (!visible || !history.data) return null;
  const totals = history.data.summary;
  return (
    <section className="spending-quick" aria-label="Your spending">
      <div className="spending-quick-title">
        Your spending <span>· All time</span>
      </div>
      <div className="spending-quick-metric">
        <span>Recorded spending</span>
        <strong>{totalLabel(totals)}</strong>
        {totals.missingActual > 0 && (
          <small>
            {totals.missingActual}{" "}
            {totals.missingActual === 1 ? "entry needs" : "entries need"} an
            amount
          </small>
        )}
      </div>
      <div className="spending-quick-metric">
        <span>Still planning · Estimated</span>
        <strong>{totalLabel(totals, true)}</strong>
        {totals.missingPlanned > 0 && (
          <small>
            {totals.missingPlanned}{" "}
            {totals.missingPlanned === 1 ? "plan needs" : "plans need"} an
            estimate
          </small>
        )}
      </div>
      <Link className="button secondary" to={"/buying/spending?" + params}>
        View spending <ArrowRight size={16} />
      </Link>
    </section>
  );
}
function MissingAmounts({
  params,
  kind,
}: {
  params: string;
  kind: "actual" | "planned";
}) {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<SpendingRecord>();
  const query = new URLSearchParams(params);
  query.set("missingAmounts", kind);
  query.set("page", String(page));
  const history = useSpendingHistory(query);
  if (editing)
    return (
      <RecordForm
        record={editing}
        onSuccess={() => {
          setEditing(undefined);
          setPage(1);
        }}
      />
    );
  return (
    <div className="spending-missing-list">
      <p>Amounts missing from this view. Adding them updates your totals.</p>
      {history.error && (
        <p role="alert">
          Unable to load entries.{" "}
          <button
            className="text-button"
            onClick={() => void history.refetch()}
          >
            Try again
          </button>
        </p>
      )}
      {(!history.data || history.isPlaceholderData) && (
        <p role="status">Loading entries…</p>
      )}
      {!history.isPlaceholderData &&
        history.data?.records.map((r) => (
          <article className="spending-missing-row" key={r.id}>
            <div>
              <strong>{r.title}</strong>
              <p className="muted">For {r.recipientNames.join(" & ")}</p>
            </div>
            {r.canEdit ? (
              <button
                className="button secondary"
                onClick={() => setEditing(r)}
              >
                {kind === "planned" ? "Add estimate" : "Add amount"}
              </button>
            ) : (
              <span className="muted">{r.payerName} can update this entry</span>
            )}
          </article>
        ))}
      {history.data?.total === 0 && (
        <p>No amounts are missing from this view.</p>
      )}
      <div className="spending-pagination">
        {page > 1 && (
          <button
            className="button secondary"
            onClick={() => setPage(page - 1)}
          >
            Previous page
          </button>
        )}
        {!!history.data && history.data.total > page * 30 && (
          <button
            className="button secondary"
            onClick={() => setPage(page + 1)}
          >
            Next page
          </button>
        )}
      </div>
    </div>
  );
}
function SpendingRow({
  r,
  data,
  person,
}: {
  r: SpendingView["records"][number];
  data: SpendingView;
  person?: string;
}) {
  const { world, open, close, mutate } = useApp();
  const edit = () =>
    open(
      r.kind === "plan" ? "Update plan" : "Edit purchase",
      <RecordForm record={r} />,
    );
  const canPurchase =
    r.kind === "plan" && r.canEdit && !!r.reservationId && !r.sourceId;
  const secondaryActions = [
    canPurchase && (
      <button key="edit" className="text-button" onClick={edit}>
        {r.amountCents === null ? "Add estimate" : "Edit plan"}
      </button>
    ),
    r.ownerId === world.me.id &&
      data.connection?.status === "active" &&
      !r.protected && (
        <Action
          key="share"
          secondary
          onClick={() =>
            mutate("spending/share", {
              id: r.id,
              revision: r.revision,
              shared: r.sharing === "private",
            })
          }
        >
          {r.sharing === "private" ? "Share with partner" : "Keep private"}
        </Action>
      ),
    r.canEdit && r.kind === "purchase" && (
      <button
        key="refund"
        className="text-button"
        onClick={() =>
          open(
            "Record refund",
            <SpendingDialogForm
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
                This records a refund already received. It does not contact the
                shop.
              </p>
            </SpendingDialogForm>,
          )
        }
      >
        Record refund
      </button>
    ),
    r.history.length > 0 && (
      <button
        key="history"
        className="text-button"
        onClick={() =>
          open(
            "Purchase history",
            <div className="spending-audit">
              <h3>{r.title}</h3>{" "}
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
            </div>,
          )
        }
      >
        View history
      </button>
    ),
  ].filter(Boolean);
  return (
    <article className="spending-row">
      <div className="spending-row-description">
        <h3>{r.title}</h3>
        <p>
          For {r.recipientNames.join(" & ")}{" "}
          <span className="spending-row-status">
            ·{" "}
            {r.kind === "plan"
              ? "Reserved"
              : r.kind === "refund"
                ? "Refund"
                : r.kind === "contribution"
                  ? "Contribution"
                  : "Purchased"}
          </span>
        </p>
        <p className="spending-row-meta">
          {r.kind === "plan"
            ? `Planned for ${r.planningYear}`
            : dateLabel(r.date)}{" "}
          · {r.kind === "plan" ? "Planned by" : "Paid by"}{" "}
          {r.ownerId === world.me.id ? "you" : r.payerName}
        </p>
        {(r.eventName || r.occasionId) && (
          <p className="spending-row-meta">
            {[
              r.eventName,
              data.occasions.find((o) => o.id === r.occasionId)?.name,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <span className="spending-privacy">
          {r.connectionId && r.sharing !== "private" ? (
            <Users size={15} />
          ) : (
            <LockKeyhole size={15} />
          )}{" "}
          {r.connectionId && r.sharing !== "private"
            ? `Shared with ${data.partnerName}`
            : "Only me"}
        </span>
      </div>
      <div className="spending-row-controls">
        <div
          className={
            r.amountCents === null
              ? "spending-amount spending-unknown"
              : "spending-amount"
          }
        >
          {r.amountCents === null
            ? r.kind === "plan"
              ? "Estimate not recorded"
              : "Amount not recorded"
            : dollars(allocatedCents(r, person))}
          {r.kind === "plan" && r.amountCents !== null && (
            <small>Estimated</small>
          )}
          {person && r.recipientIds.length > 1 && r.amountCents !== null && (
            <small>of {dollars(r.amountCents)} total</small>
          )}
        </div>
        <div className="spending-row-actions">
          {canPurchase ? (
            <button
              className="button secondary"
              onClick={() =>
                open(
                  "Mark as purchased",
                  <PurchaseForm
                    reservation={
                      world.buying.find((v) => v.id === r.reservationId) ?? {
                        id: r.reservationId!,
                        revision: 0,
                        quantity: r.quantity,
                        purchased: 0,
                        titleSnapshot: r.title,
                      }
                    }
                  />,
                )
              }
            >
              Mark purchased
            </button>
          ) : (
            r.canEdit && (
              <button className="button secondary" onClick={edit}>
                {r.amountCents === null
                  ? r.kind === "plan"
                    ? "Add estimate"
                    : "Add amount"
                  : r.kind === "plan"
                    ? "Edit plan"
                    : "Edit purchase"}
              </button>
            )
          )}
          {secondaryActions.length === 1 ? (
            secondaryActions[0]
          ) : secondaryActions.length > 1 ? (
            <ActionMenu name={r.title} label="More actions">
              {secondaryActions}
            </ActionMenu>
          ) : null}
        </div>
      </div>
    </article>
  );
}
export function SpendingPage() {
  const [moreFilters, setMoreFilters] = useState(false);
  const moreFiltersId = useId();
  const { world, open, mutate, close } = useApp();
  const { data, error } = useSpending();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const shared =
    params.get("view") === "shared" && data?.connection?.status === "active";
  const historyParams = new URLSearchParams(params);
  historyParams.delete("view");
  historyParams.set("shared", String(shared));
  historyParams.set("page", String(page));
  const history = useSpendingHistory(historyParams, !!data?.settings.enabled);
  if (world.spendingAvailable === false) return null;
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
  const filter = {
    person: params.get("person") || undefined,
    list: params.get("list") || undefined,
    event: params.get("event") || undefined,
    occasion: params.get("occasion") || undefined,
    year: params.get("year") ? Number(params.get("year")) : undefined,
  };
  const setParamsQuiet = (next: URLSearchParams) => {
    setParams(next, {
      preventScrollReset: true,
      state: { preserveFocus: true },
    });
    setPage(1);
  };
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParamsQuiet(next);
  };
  const recipients = [
    ...new Map(
      [...world.people, ...(history.data?.recipients ?? [])].map((p) => [
        p.id,
        p,
      ]),
    ).values(),
  ];
  const lists = [
    ...new Map(
      [...(history.data?.lists ?? []), ...world.lists].map((l) => [l.id, l]),
    ).values(),
  ];
  const events = [
    ...new Map(
      [...(history.data?.events ?? []), ...world.groupEvents].map((e) => [
        e.id,
        e,
      ]),
    ).values(),
  ];
  const scope =
    [
      filter.person && "person:" + filter.person,
      filter.list && "list:" + filter.list,
      filter.event && "event:" + filter.event,
      filter.occasion && "occasion:" + filter.occasion,
    ]
      .filter(Boolean)
      .join("|") || "all";
  const scopeLabel = [
    filter.person
      ? (recipients.find((p) => p.id === filter.person)?.name ??
        "Selected person")
      : "Everyone",
    filter.list &&
      (lists.find((l) => l.id === filter.list)?.name ?? "Selected wish list"),
    filter.event &&
      (events.find((e) => e.id === filter.event)?.name ?? "Selected event"),
    filter.occasion &&
      (data.occasions.find((o) => o.id === filter.occasion)?.name ??
        "Selected occasion"),
    filter.year ?? "All time",
  ]
    .filter(Boolean)
    .join(" · ");
  const budget = data.budgets.find(
    (b) =>
      b.scope === scope &&
      b.year === (filter.year ?? null) &&
      (shared ? b.connectionId === data.connection?.id : !b.connectionId),
  );
  const budgetForm = () =>
    open(
      "Set a budget",
      <SpendingDialogForm
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
        <p>{scopeLabel}</p>
        <p className="muted">
          {shared
            ? "Both partners can edit this budget."
            : "Only you can see this budget."}
        </p>
        <MoneyField
          value={budget?.amountCents}
          label="Budget in USD"
          required
        />
      </SpendingDialogForm>,
    );
  const occasionForm = () =>
    open(
      "Add personal occasion",
      <SpendingDialogForm
        submit="Add occasion"
        onSubmit={async (f) => {
          const result = (await mutate("spending/occasion", {
            name: f.get("name"),
            shared: !!shared,
          })) as { id: string };
          const next = new URLSearchParams(params);
          next.delete("event");
          next.set("occasion", result.id);
          setParamsQuiet(next);
          close();
        }}
      >
        <Field label="Occasion name">
          <input
            name="name"
            required
            maxLength={150}
            placeholder="A birthday or celebration"
          />
        </Field>
        <p>{shared ? `Shared with ${data.partnerName}` : "Only me"}</p>
      </SpendingDialogForm>,
    );
  const totals = history.data?.summary;
  const ready = !!totals && !history.isPlaceholderData;
  const paused = shared && data.connection?.resumed.length !== 2;
  const review = (kind: "actual" | "planned") =>
    open(
      kind === "actual" ? "Missing purchase amounts" : "Missing estimates",
      <MissingAmounts params={historyParams.toString()} kind={kind} />,
    );
  return (
    <div className="spending-page">
      <Header
        title="Your spending"
        description="Gift costs, plans, and history."
      >
        <Link className="button secondary" to="/settings?section=spending">
          <Settings size={17} />
          Sharing settings
        </Link>
        <button
          className="button"
          onClick={() =>
            open(
              "Add purchase",
              <PurchaseForm
                initialPerson={filter.person}
                initialEvent={filter.event}
                initialOccasion={filter.occasion}
              />,
            )
          }
        >
          <Plus size={18} />
          Add purchase
        </button>
      </Header>
      {data.connection?.status === "active" && (
        <div className="spending-view" role="group" aria-label="Spending view">
          <button aria-pressed={!shared} onClick={() => set("view", "")}>
            My spending
          </button>
          <button aria-pressed={!!shared} onClick={() => set("view", "shared")}>
            You + {data.partnerName}
          </button>
        </div>
      )}
      <section className="spending-filter-section" aria-label="Filter spending">
        <h2>Show spending for</h2>
        <div className="spending-filters">
          <Field label="Person">
            <select
              value={filter.person ?? ""}
              onChange={(e) => set("person", e.target.value)}
            >
              <option value="">Everyone</option>
              {recipients.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div>
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
                  setParamsQuiet(next);
                }}
              >
                <option value="">All occasions</option>
                <optgroup label="Group events">
                  {events.map((e) => (
                    <option value={"event:" + e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Personal occasions">
                  {data.occasions.map((o) => (
                    <option value={"occasion:" + o.id} key={o.id}>
                      {o.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <button
              className="text-button spending-occasion-action"
              onClick={occasionForm}
            >
              <Plus size={15} />
              Add personal occasion
            </button>
          </div>
          <Field label="Period">
            <select
              value={filter.year ?? ""}
              onChange={(e) => set("year", e.target.value)}
            >
              <option value="">All time</option>
              {[...(history.data?.years ?? [new Date().getFullYear()])]
                .sort((a, b) => b - a)
                .map((y) => (
                  <option value={y} key={y}>
                    {y}
                  </option>
                ))}
            </select>
          </Field>
          <div className="spending-filter-toggle">
            <span aria-hidden="true">Filters</span>
            <button
              className="button secondary"
              aria-expanded={moreFilters}
              aria-controls={moreFiltersId}
              onClick={() => setMoreFilters((v) => !v)}
            >
              <SlidersHorizontal size={17} />
              More filters{filter.list ? " (1)" : ""}
            </button>
          </div>
        </div>
        <div
          id={moreFiltersId}
          hidden={!moreFilters}
          className="spending-extra-filters"
        >
          {" "}
          <Field label="Wish list">
            <select
              value={filter.list ?? ""}
              onChange={(e) => set("list", e.target.value)}
            >
              <option value="">All wish lists</option>
              {lists.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="spending-filter-help">
          <p>Filters update totals, budget, and gift history.</p>
          {Object.values(filter).some(Boolean) && (
            <button
              className="text-button"
              onClick={() => {
                const next = new URLSearchParams();
                if (shared) next.set("view", "shared");
                setParamsQuiet(next);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="spending-scope">{scopeLabel}</p>
      </section>
      {paused && (
        <p role="status">
          Sharing is paused. Shared totals are unavailable until both people
          resume sharing in Settings.
        </p>
      )}
      {history.error && (
        <p role="alert">
          Unable to load spending history.{" "}
          <button
            className="text-button"
            onClick={() => void history.refetch()}
          >
            Try again
          </button>
        </p>
      )}
      {!ready && !history.error && <p role="status">Updating spending…</p>}
      {ready && !paused && (
        <>
          <section className="spending-overview" aria-label="Spending totals">
            <div className="spending-numbers">
              <div>
                <span>
                  {shared ? "Recorded spending together" : "Recorded spending"}
                </span>
                <strong>{totalLabel(totals)}</strong>
                {totals.missingActual > 0 && (
                  <p className="spending-completeness">
                    {totals.missingActual}{" "}
                    {totals.missingActual === 1
                      ? "entry needs"
                      : "entries need"}{" "}
                    an amount.{" "}
                    <button
                      className="text-button"
                      onClick={() => review("actual")}
                    >
                      Review
                    </button>
                  </p>
                )}
              </div>
              <div>
                <span>Still planning</span>
                <strong>{totalLabel(totals, true)}</strong>
                <small>Estimated</small>
                {totals.missingPlanned > 0 && (
                  <p className="spending-completeness">
                    {totals.missingPlanned}{" "}
                    {totals.missingPlanned === 1 ? "plan needs" : "plans need"}{" "}
                    an estimate.{" "}
                    <button
                      className="text-button"
                      onClick={() => review("planned")}
                    >
                      Review
                    </button>
                  </p>
                )}
              </div>
            </div>
            <section className="spending-budget">
              <h2>Budget{budget ? " " + dollars(budget.amountCents) : ""}</h2>
              <button className="button secondary" onClick={budgetForm}>
                {budget ? "Edit budget" : "Set a budget"}
              </button>
              <p className="muted">{scopeLabel}</p>
              {budget && (
                <>
                  <p>
                    {dollars(budget.amountCents - totals.spent)} left to spend
                  </p>
                  <p className="muted">
                    {dollars(
                      budget.amountCents - totals.spent - totals.planned,
                    )}{" "}
                    after planned gifts
                  </p>
                  {totals.missing > 0 && (
                    <p className="muted">
                      Based on recorded amounts; missing amounts are not
                      included.
                    </p>
                  )}
                  <div className="spending-meter" aria-hidden="true">
                    <span
                      style={{
                        width:
                          Math.min(
                            100,
                            (Math.max(0, totals.spent) /
                              Math.max(1, budget.amountCents)) *
                              100,
                          ) + "%",
                      }}
                    />
                    <span
                      style={{
                        width:
                          Math.min(
                            100,
                            (totals.planned / Math.max(1, budget.amountCents)) *
                              100,
                          ) + "%",
                      }}
                    />
                  </div>
                  {totals.spent + totals.planned > budget.amountCents && (
                    <p>
                      {dollars(
                        totals.spent + totals.planned - budget.amountCents,
                      )}{" "}
                      over your plan. You can still buy or reserve gifts.
                    </p>
                  )}
                </>
              )}
            </section>
          </section>
          <h2 className="spending-history-title">Gift history and plans</h2>
          <p className="spending-scope">
            {history.data!.giftCount}{" "}
            {history.data!.giftCount === 1 ? "gift" : "gifts"}
          </p>
          {history.data!.records.length === 0 && (
            <p>No purchases or plans match these filters.</p>
          )}
          {history.data!.records.map((r) => (
            <SpendingRow key={r.id} r={r} data={data} person={filter.person} />
          ))}
          <div className="spending-pagination">
            {page > 1 && (
              <button
                className="button secondary"
                onClick={() => setPage(page - 1)}
              >
                Previous page
              </button>
            )}
            {history.data!.total > page * 30 && (
              <button
                className="button secondary"
                onClick={() => setPage(page + 1)}
              >
                Next page
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
