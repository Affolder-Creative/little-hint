import assert from "node:assert/strict";
function currentViewContract(value, records) {
  if (Array.isArray(value))
    return value.map((child) => currentViewContract(child, records));
  if (!value || typeof value !== "object") return value;
  const view = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      currentViewContract(child, records),
    ]),
  );
  // The pinned release inferred shopping eligibility from isRecipient. Its
  // fixture has signed-in recipients, for whom the new explicit flag is equal.
  // Keep every existing field, including all reservation and privacy evidence.
  if (typeof view.isRecipient === "boolean" && !Object.hasOwn(view, "canShop"))
    view.canShop = !view.isRecipient;
  // New view metadata is derived from retained baseline records, never from
  // candidate output. Preserve existing values so corruption and leaks fail.
  if (typeof view.isRecipient === "boolean") {
    const item = records.find(
      (r) => r.kind === "items" && r.id === view.id,
    )?.data;
    if (item) {
      if (!Object.hasOwn(view, "visibilityScope")) {
        if (
          !item.listId &&
          ["private", "hidden", "visible"].includes(item.visibility)
        )
          view.visibilityScope =
            item.visibility === "private" ? "only-me" : "shared";
        else if (item.listId) {
          const list = records.find(
            (r) => r.kind === "lists" && r.id === item.listId,
          )?.data;
          // The pinned fixture's wishes have groups with multiple account holders.
          // Prove another reader from retained records; do not guess for other lists.
          const readers = new Set(
            records
              .filter(
                (r) => r.kind === "groups" && list?.groupIds?.includes(r.id),
              )
              .flatMap((r) => r.data.memberIds)
              .filter((id) =>
                records.some(
                  (r) =>
                    r.kind === "people" &&
                    r.data.userId === id &&
                    !r.data.mergedIntoId,
                ),
              ),
          );
          if (!list?.deletedAt && readers.size > 1)
            view.visibilityScope = "shared";
        }
      }
      // Recipient-visible content now exposes a discussion. For the pinned
      // fixture, which has no notes on these items, derive only an empty list.
      // Never discard candidate notes or allow this on surprise content.
      const recipientVisible = item.listId
        ? records.find((r) => r.kind === "lists" && r.id === item.listId)?.data
            .mode === "transparent"
        : item.visibility === "visible";
      if (
        view.isRecipient === true &&
        recipientVisible &&
        item.publicationState !== "draft" &&
        !Object.hasOwn(view, "comments") &&
        !records.some((r) => r.kind === "comments" && r.data.itemId === item.id)
      )
        view.comments = [];
      if (
        !Object.hasOwn(view, "individuallyArchived") &&
        typeof item.archived === "boolean"
      )
        view.individuallyArchived = item.archived;
      if (
        item.listId &&
        view.canEdit === true &&
        !Object.hasOwn(view, "creatorName")
      )
        view.creatorName =
          records.find(
            (r) => r.kind === "people" && r.data.userId === item.creatorId,
          )?.data.name ?? "Former member";
    }
  }
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
      field === "views"
        ? currentViewContract(actual[field], expected.records)
        : actual[field],
      field === "views"
        ? currentViewContract(expected[field], expected.records)
        : expected[field],
      `${field} changed during upgrade or recovery`,
    );
  }
}
