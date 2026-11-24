export type ArrivalFilter = "all" | "awaiting" | "in-hand";
export function matchesArrival(
  purchased: number,
  inHand: number | undefined,
  filter: ArrivalFilter,
) {
  return (
    filter === "all" ||
    (filter === "awaiting"
      ? inHand !== undefined && inHand < purchased
      : inHand === purchased && purchased > 0)
  );
}
export function arrivalLabel(purchased: number, inHand: number | undefined) {
  return inHand === undefined
    ? "Arrival not recorded"
    : inHand === purchased
      ? "In hand"
      : inHand === 0
        ? "Awaiting arrival"
        : `${inHand} of ${purchased} in hand`;
}
