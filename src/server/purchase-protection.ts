import type {
  Actor,
  State,
  TrashKind,
  LifecyclePermissions,
} from "../shared/model";
import { isAdmin, recipient, mode, itemVisible } from "./domain-access";
import { reservationNeedsReview } from "./privacy-review";
import { fail } from "./domain-common";
import { manages, canPurge } from "./management";

export function affectedItems(s: State, kind: TrashKind, id: string) {
  const lists = new Set(
    s.lists.filter((l) => l.groupEventId === id).map((l) => l.id),
  );
  return s.items.filter((i) =>
    kind === "items"
      ? i.id === id || i.parentItemId === id
      : kind === "lists"
        ? i.listId === id
        : kind === "group-events"
          ? !!i.listId && lists.has(i.listId)
          : false,
  );
}
export function protection(
  s: State,
  a: Actor,
  kind: TrashKind,
  id: string,
): LifecyclePermissions {
  if (!manages(s, a, kind, id))
    return {
      canArchive: false,
      canTrash: false,
      canPurge: false,
      overrideOperations: [],
    };
  const items = affectedItems(s, kind, id);
  const purchases = s.reservations.filter(
    (r) => r.purchased > 0 && items.some((i) => i.id === r.itemId),
  );
  const blocked = purchases.length > 0;
  const disclosed =
    blocked &&
    purchases.every((r) => {
      const i = items.find((i) => i.id === r.itemId)!;
      return (
        itemVisible(
          {
            ...s,
            lists: s.lists.map((l) =>
              l.id === i.listId ? { ...l, deletedAt: undefined } : l,
            ),
            items: s.items.map((row) =>
              row.id === i.parentItemId
                ? { ...row, deletedAt: undefined }
                : row,
            ),
          },
          a,
          { ...i, deletedAt: undefined },
        ) &&
        (r.buyerId === a.id ||
          (!r.exchangeId &&
            !reservationNeedsReview(s, r) &&
            (!recipient(s, a, i) || mode(s, i) === "transparent")))
      );
    });
  const admin = blocked && isAdmin(s, a) && manages(s, a, kind, id);
  return {
    canArchive: kind !== "items" || !blocked,
    canTrash: !blocked,
    canPurge: !blocked,
    ...(disclosed
      ? {
          message:
            kind === "items"
              ? "This gift is marked as purchased and cannot be archived or removed."
              : "This collection contains purchased gifts. You can archive it instead.",
        }
      : {}),
    overrideOperations: admin
      ? [
          ...(kind === "items" ? ["archive" as const] : []),
          "trash",
          ...(canPurge(s, a, kind, id) ? ["purge" as const] : []),
        ]
      : [],
  };
}
const overrides = new WeakMap<State, Set<string>>();
export function withRemovalOverride<T>(
  s: State,
  kind: TrashKind,
  id: string,
  run: () => T,
): T {
  overrides.set(s, new Set([`${kind}:${id}`]));
  try {
    return run();
  } finally {
    overrides.delete(s);
  }
}
export function assertRemovalAllowed(
  s: State,
  a: Actor,
  kind: TrashKind,
  id: string,
) {
  if (overrides.get(s)?.has(`${kind}:${id}`)) return;
  const policy = protection(s, a, kind, id);
  if (!policy.canTrash)
    fail(409, policy.message ?? "This action is unavailable for this item.");
}
