import { createHash } from "node:crypto";
import { fail } from "./domain-common";
export const accountFingerprint = (id: string) =>
  createHash("sha256").update(id).digest("hex");
/** Reject late writes from requests/jobs that authenticated before closure. */
export function rejectClosedAccountReferences(
  value: unknown,
  closed: Set<string>,
) {
  if (!closed.size || value == null) return;
  if (typeof value === "string") {
    for (const token of value.split(/[:/\s]+/))
      if (closed.has(accountFingerprint(token)))
        fail(401, "This account is closed. Sign in with an active account.");
  } else if (Array.isArray(value)) {
    value.forEach((v) => rejectClosedAccountReferences(v, closed));
  } else if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      rejectClosedAccountReferences(key, closed);
      rejectClosedAccountReferences(entry, closed);
    }
  }
}
