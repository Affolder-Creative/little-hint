import assert from "node:assert/strict";
export function assertPreserved(actual, expected) {
  for (const field of ["records", "users", "barrier", "uploadHash", "views"]) {
    assert.ok(Object.hasOwn(actual, field), `Missing ${field} evidence`);
    assert.ok(
      Object.hasOwn(expected, field),
      `Missing baseline ${field} evidence`,
    );
    assert.deepEqual(
      actual[field],
      expected[field],
      `${field} changed during upgrade or recovery`,
    );
  }
}
