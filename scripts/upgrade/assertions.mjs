import assert from "node:assert/strict";
function currentViewContract(value) {
  if (Array.isArray(value)) return value.map(currentViewContract);
  if (!value || typeof value !== "object") return value;
  const view = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      currentViewContract(child),
    ]),
  );
  // The pinned release inferred shopping eligibility from isRecipient. Its
  // fixture has signed-in recipients, for whom the new explicit flag is equal.
  // Keep every existing field, including all reservation and privacy evidence.
  if (typeof view.isRecipient === "boolean" && !Object.hasOwn(view, "canShop"))
    view.canShop = !view.isRecipient;
  return view;
}
export function assertPreserved(actual, expected) {
  for (const field of ["records", "users", "barrier", "uploadHash", "views"]) {
    assert.ok(Object.hasOwn(actual, field), `Missing ${field} evidence`);
    assert.ok(
      Object.hasOwn(expected, field),
      `Missing baseline ${field} evidence`,
    );
    assert.deepEqual(
      field === "views" ? currentViewContract(actual[field]) : actual[field],
      field === "views"
        ? currentViewContract(expected[field])
        : expected[field],
      `${field} changed during upgrade or recovery`,
    );
  }
}
