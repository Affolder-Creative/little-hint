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
// Schema 9 adds a baseline only: derive its exact expected fields from the
// released snapshot, never from candidate output. All prior evidence stays strict.
function lifecycleMigrationContract(evidence) {
  const migrated = structuredClone(evidence);
  const reservations = new Map();
  for (const row of migrated.records) {
    if (row.kind !== "reservations") continue;
    const r = row.data;
    const item = migrated.records.find(
      (v) => v.kind === "items" && v.id === r.itemId,
    )?.data;
    const list = migrated.records.find(
      (v) => v.kind === "lists" && v.id === item?.listId,
    )?.data;
    const visible = Object.values(migrated.views)
      .flatMap((v) => v.buying ?? [])
      .find((v) => v.id === r.id)?.item;
    r.sourceState ??=
      item?.deletedAt || list?.deletedAt
        ? "removed"
        : !visible
          ? "unavailable"
          : visible.archived
            ? "archived"
            : "active";
    r.sourceVersion ??= 1;
    if (visible) r.sourceRecipientIds ??= item.recipientIds;
    reservations.set(r.id, r);
  }
  for (const view of Object.values(migrated.views)) {
    for (const buying of view.buying ?? []) {
      const r = reservations.get(buying.id);
      assert.ok(r, "Buying record must have retained reservation evidence");
      const requiresReview = r.sourceState !== "active";
      buying.sourceState = r.sourceState;
      buying.sourceVersion = r.sourceVersion;
      if (r.sourceRecipientIds)
        buying.sourceRecipientIds = r.sourceRecipientIds;
      buying.sourceReviewedBy = {};
      buying.planActions = {
        canRecordPurchase:
          !!buying.item &&
          (buying.item.canShop ?? !buying.item.isRecipient) &&
          !requiresReview,
        canRelease: buying.quantity > buying.purchased,
        requiresReview,
      };
    }
    for (const entry of view.contributionHistory ?? []) {
      const r = reservations.get(entry.contribution.reservationId);
      assert.ok(
        r,
        "Contribution history must have retained reservation evidence",
      );
      entry.sourceState = r.sourceState;
    }
  }
  return migrated;
}
export function assertPreserved(actual, expected) {
  if (actual.schemaVersion >= 9 && (expected.schemaVersion ?? 0) < 9)
    expected = lifecycleMigrationContract(expected);
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
