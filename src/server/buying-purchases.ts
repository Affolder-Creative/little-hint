import type { Actor, State, World } from "../shared/model";
import { spendingView } from "./spending";
import { spendingAvailable } from "./deployment";
export function standaloneBuying(s: State, a: Actor): World["buying"] {
  if (!spendingAvailable()) return [];
  return spendingView(s, a)
    .records.filter(
      (r) =>
        r.ownerId === a.id &&
        r.kind === "purchase" &&
        !r.reservationId &&
        !r.voided,
    )
    .map((r) => ({
      id: r.id,
      revision: r.revision,
      createdAt: r.createdAt,
      buyerId: r.ownerId,
      itemId: "",
      titleSnapshot: r.title,
      quantity: r.quantity,
      purchased: r.quantity,
      former: false,
      inHandQuantity: r.inHandQuantity,
      standalonePurchase: r,
    }));
}
