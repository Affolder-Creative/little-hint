import type { Actor, State } from "../shared/model";
import { itemVisible, personVisible, listVisible } from "./domain-access";

export type ExportTable = "wishes" | "buying" | "spending";
type Cell = string | number | null | undefined;
/** RFC 4180 quoting, UTF-8 BOM for Excel, and inert user-supplied text. */
export function csv(rows: Cell[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (
              typeof value === "string" &&
              (/^[\s\uFEFF]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text))
            )
              text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
export function accountCsv(s: State, a: Actor, table: ExportTable) {
  const owned = new Set(
    s.people
      .filter((p) => p.userId === a.id || p.guardians.includes(a.id))
      .map((p) => p.id),
  );
  const ownLists = new Set(
    s.lists
      .filter((l) => l.ownerIds.some((id) => owned.has(id)))
      .map((l) => l.id),
  );
  const names = (ids: string[]) =>
    ids
      .map((id) => {
        const person = s.people.find((p) => p.id === id);
        return person && personVisible(s, a, person)
          ? person.name
          : "Former recipient";
      })
      .join("; ");
  const listName = (id?: string) => {
    const list = s.lists.find((l) => l.id === id);
    return list && (ownLists.has(list.id) || listVisible(s, a, list))
      ? list.name
      : "";
  };
  const money = (cents?: number | null) => (cents == null ? null : cents / 100);
  let rows: Cell[][];
  if (table === "wishes") {
    rows = [
      [
        "Type",
        "Title",
        "Description",
        "Recipients",
        "Wish list",
        "Price (USD)",
        "Quantity",
        "Priority",
        "Tags",
        "Visibility",
        "Status",
        "Shop URL",
        "Created at (UTC)",
        "Item ID",
      ],
      ...s.items
        .filter(
          (i) => i.creatorId === a.id || (!!i.listId && ownLists.has(i.listId)),
        )
        .map((i) => [
          i.listId ? "Wish" : "Idea",
          i.title,
          i.description,
          names(i.recipientIds),
          listName(i.listId),
          money(i.priceCents),
          i.quantity,
          i.priority,
          i.tags.join("; "),
          i.visibility,
          i.deletedAt
            ? "Deleted"
            : i.archived || s.lists.find((l) => l.id === i.listId)?.archived
              ? "Archived"
              : "Active",
          i.url,
          i.createdAt,
          i.id,
        ]),
    ];
  } else if (table === "buying") {
    rows = [
      [
        "Type",
        "Gift",
        "Recipients",
        "Wish list",
        "Reserved quantity",
        "Purchased quantity",
        "Contribution (USD)",
        "Status",
        "Purchased at (UTC)",
        "Created at (UTC)",
        "Record ID",
      ],
    ];
    for (const r of s.reservations.filter((r) => r.buyerId === a.id)) {
      const item = s.items.find(
        (i) => i.id === r.itemId && itemVisible(s, a, i),
      );
      rows.push([
        "Reservation",
        r.titleSnapshot,
        item ? names(item.recipientIds) : "",
        item ? listName(item.listId) : "",
        r.quantity,
        r.purchased,
        null,
        r.former
          ? "Former member"
          : r.quantity === 0
            ? "Released"
            : r.purchased >= r.quantity
              ? "Purchased"
              : "Reserved",
        r.purchasedAt,
        r.createdAt,
        r.id,
      ]);
    }
    for (const c of s.contributions.filter(
      (c) =>
        c.userId === a.id ||
        s.reservations.some(
          (r) => r.id === c.reservationId && r.buyerId === a.id,
        ),
    )) {
      const r = s.reservations.find((r) => r.id === c.reservationId);
      const item = s.items.find(
        (i) => i.id === r?.itemId && itemVisible(s, a, i),
      );
      rows.push([
        "Contribution",
        item?.title ?? r?.titleSnapshot ?? "Unavailable gift",
        item ? names(item.recipientIds) : "",
        item ? listName(item.listId) : "",
        null,
        null,
        money(c.amountCents),
        c.status,
        null,
        c.createdAt,
        c.id,
      ]);
      for (const ret of c.returns ?? [])
        rows.push([
          "Contribution return",
          r?.titleSnapshot ?? "Unavailable gift",
          "",
          "",
          null,
          null,
          money(ret.amountCents),
          ret.status,
          ret.receivedDate ?? ret.date,
          ret.createdAt,
          ret.id,
        ]);
    }
  } else {
    rows = [
      [
        "Type",
        "Title",
        "Recipients",
        "Wish list",
        "Event",
        "Occasion",
        "Amount (USD)",
        "Quantity",
        "Date",
        "Planning year",
        "Status",
        "Sharing",
        "Record ID",
      ],
      ...s.spendingRecords
        .filter((r) => r.ownerId === a.id)
        .map((r) => [
          r.kind,
          r.title,
          r.recipientNames.join("; "),
          r.listName,
          r.eventName,
          s.spendingOccasions.find(
            (o) => o.id === r.occasionId && o.ownerId === a.id,
          )?.name,
          money(r.amountCents),
          r.quantity,
          r.date,
          r.planningYear,
          r.voided ? "Voided" : "Active",
          r.sharing,
          r.id,
        ]),
    ];
  }
  return { filename: `little-hint-${table}.csv`, content: csv(rows) };
}
