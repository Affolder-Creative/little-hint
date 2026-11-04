import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { World } from "../shared/model";
import type { SpendingHistoryView, SpendingView } from "../shared/spending";
import { api, dollars } from "./api";
import { useApp } from "./context";
import { Field, Form, useModalDismiss } from "./components";
import { PurchaseListField } from "./SpendingPurchase";

type Purchase = World["buying"][number];
export function UpdatePurchase({
  reservation,
  onSuccess,
}: {
  reservation: Purchase;
  onSuccess: () => void;
}) {
  const { world } = useApp();
  const history = useQuery({
    queryKey: ["spending", world.me.id, "purchase-editor", reservation.id],
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const records: SpendingView["records"] = [];
      for (let page = 1; ; page++) {
        const result = await api<SpendingHistoryView>(
          `spending/history?reservation=${reservation.id}&page=${page}`,
        );
        records.push(...result.records);
        if (page * 30 >= result.total) break;
      }
      return records.filter((r) => r.kind === "purchase");
    },
  });
  if (history.error)
    return (
      <p role="alert">
        Unable to load purchases.{" "}
        <button className="text-button" onClick={() => void history.refetch()}>
          Try again
        </button>
      </p>
    );
  if (!history.data) return <p role="status">Loading purchase details…</p>;
  return (
    <PurchaseEditor
      reservation={reservation}
      records={history.data}
      onSuccess={onSuccess}
    />
  );
}
function PurchaseEditor({
  reservation: r,
  records: loadedRecords,
  onSuccess,
}: {
  reservation: Purchase;
  records: SpendingView["records"];
  onSuccess: () => void;
}) {
  const [records] = useState(loadedRecords);
  const { mutate, close } = useApp();
  const dismiss = useModalDismiss();
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  return (
    <Form
      dialogLayout
      className="spending-purchase spending-dialog-form"
      submit="Save purchase"
      cancel={() => dismiss?.()}
      onSubmit={async (f) => {
        await mutate("spending/update-purchase", {
          reservationId: r.id,
          reservationRevision: r.revision,
          purchased: Number(f.get("purchased")),
          records: records
            .filter((record) => record.canEdit)
            .map((record) => ({
              id: record.id,
              revision: record.revision,
              amountCents:
                String(f.get(`amount-${record.id}`) ?? "").trim() === ""
                  ? null
                  : Math.round(Number(f.get(`amount-${record.id}`)) * 100),
              date: String(f.get(`date-${record.id}`) ?? "") || null,
              planningYear: record.planningYear,
              splits: record.splits,
              ...(record.canAssignList &&
              assignments[record.id] !== undefined &&
              assignments[record.id] !== (record.listId ?? "")
                ? { listId: assignments[record.id] || null }
                : {}),
            })),
        });
        close();
        onSuccess();
      }}
    >
      <div className="spending-edit-context">
        <h3>{r.titleSnapshot}</h3>
        <p>
          For {r.item?.recipientNames.join(" & ") ?? "the original recipient"}
        </p>
      </div>
      <Field label="Quantity purchased">
        <input
          name="purchased"
          type="number"
          min="0"
          max={r.quantity}
          defaultValue={r.purchased}
          required
        />
      </Field>
      <p className="muted">
        Changing purchase status does not remove recorded spending or record a
        refund. Record refunds in Spending.
      </p>
      {!records.length && (
        <p>No spending entries have been recorded for this purchase.</p>
      )}
      {records.map((record, index) => (
        <fieldset key={record.id} className="purchase-record-fields">
          <legend>
            {records.length > 1
              ? `Purchase ${index + 1} · ${record.quantity} bought`
              : "Recorded spending"}
          </legend>
          {record.canEdit ? (
            <>
              <Field label="Amount paid in USD, optional">
                <input
                  name={`amount-${record.id}`}
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  inputMode="decimal"
                  defaultValue={
                    record.amountCents === null ? "" : record.amountCents / 100
                  }
                />
              </Field>
              <Field label="Purchase date">
                <input
                  name={`date-${record.id}`}
                  type="date"
                  defaultValue={record.date ?? ""}
                />
              </Field>
              {record.canAssignList ? (
                <PurchaseListField
                  recipientIds={record.recipientIds}
                  value={assignments[record.id] ?? record.listId ?? ""}
                  onChange={(value) =>
                    setAssignments((previous) => ({
                      ...previous,
                      [record.id]: value,
                    }))
                  }
                />
              ) : (
                record.listName && <p>Wish list: {record.listName}</p>
              )}
            </>
          ) : (
            <p>
              {record.amountCents === null
                ? "Amount not recorded"
                : dollars(record.amountCents)}{" "}
              · {record.date ?? "Date not recorded"} · {record.payerName} can
              edit this entry.
            </p>
          )}
        </fieldset>
      ))}
    </Form>
  );
}
