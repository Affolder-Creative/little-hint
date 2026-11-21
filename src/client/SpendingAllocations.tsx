import { useState } from "react";
import { Field } from "./components";
import { useApp } from "./context";
import { dollars } from "./api";
import { splitCents, type SpendingAllocation } from "../shared/spending";

export function defaultAllocations(
  ids: string[],
  listId?: string | null,
): SpendingAllocation[] {
  return ids.map((recipientId) => ({
    recipientId,
    share: 1,
    listId: listId || null,
  }));
}
export function SpendingAllocations({
  value,
  onChange,
  amountCents = null,
  amountKind = "payment",
}: {
  value: SpendingAllocation[];
  onChange: (value: SpendingAllocation[]) => void;
  amountCents?: number | null;
  amountKind?: "estimate" | "payment";
}) {
  const { world } = useApp();
  const [custom, setCustom] = useState(
    value.some((v) => v.share !== value[0]?.share),
  );
  const total = value.reduce((n, v) => n + v.share, 0);
  const amounts =
    amountCents === null
      ? null
      : splitCents(
          amountCents,
          value.map((v) => v.share),
        );
  return (
    <fieldset className="spending-allocations">
      <legend>Wish lists for spending, optional</legend>
      <p className="muted">
        Each list counts only that person's share. This does not add or share
        the gift.
      </p>
      {value.length > 1 && (
        <Field
          label="Split between recipients"
          hint={
            custom
              ? "Use relative shares, such as 1 and 2. Each list counts only its share."
              : undefined
          }
        >
          <select
            value={custom ? "custom" : "equal"}
            onChange={(e) => {
              const next = e.target.value === "custom";
              setCustom(next);
              if (!next) onChange(value.map((v) => ({ ...v, share: 1 })));
            }}
          >
            <option value="equal">Split equally</option>
            <option value="custom">Adjust shares</option>
          </select>
        </Field>
      )}
      {value.map((v, index) => {
        const name =
          world.people.find((p) => p.id === v.recipientId)?.name ?? "Recipient";
        const choices = world.lists.filter(
          (l) => !l.deletedAt && l.ownerIds.includes(v.recipientId),
        );
        const update = (patch: Partial<SpendingAllocation>) =>
          onChange(
            value.map((entry, i) =>
              i === index ? { ...entry, ...patch } : entry,
            ),
          );
        return (
          <div key={v.recipientId} className="spending-allocation-row">
            <Field label={`${name}'s wish list`}>
              <select
                value={v.listId ?? ""}
                onChange={(e) => update({ listId: e.target.value || null })}
              >
                <option value="">No wish list</option>
                {v.listId && !choices.some((l) => l.id === v.listId) && (
                  <option value={v.listId}>
                    Previously assigned wish list
                  </option>
                )}
                {choices.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.archived ? " · Archived" : ""}
                  </option>
                ))}
              </select>
            </Field>
            {custom && value.length > 1 && (
              <Field label={`${name}'s share`}>
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  step="any"
                  required
                  value={v.share}
                  onChange={(e) => update({ share: Number(e.target.value) })}
                />
              </Field>
            )}
            {value.length > 1 && (
              <p className="muted">
                {name}'s share:{" "}
                {total > 0
                  ? `${Math.round((v.share / total) * 10000) / 100}%`
                  : "Enter at least one positive share"}
                {amountCents !== null && total > 0
                  ? ` · ${amountKind === "estimate" ? "estimated " : ""}${dollars(amounts![index])}`
                  : ""}
              </p>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
