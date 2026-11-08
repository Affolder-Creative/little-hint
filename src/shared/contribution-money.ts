import type { Contribution } from "./model";
export const returnedCents = (c: Contribution) =>
  (c.returns ?? [])
    .filter((r) => r.status !== "voided")
    .reduce((n, r) => n + r.amountCents, 0);
export const netContribution = (c: Contribution) =>
  c.status === "cancelled" ? 0 : c.amountCents - returnedCents(c);
