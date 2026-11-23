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
// Schema 13 changes write authority, never the set of visible records. Derive
// the expected flags from the released records and authenticated user evidence.
function administrationMigrationContract(evidence) {
  const migrated = structuredClone(evidence);
  const rows = (kind) =>
    migrated.records.filter((r) => r.kind === kind).map((r) => r.data);
  const people = rows("people"),
    groups = rows("groups"),
    lists = rows("lists"),
    items = rows("items");
  for (const group of groups) group.adminIds ??= [];
  for (const [email, view] of Object.entries(migrated.views)) {
    const userId = migrated.users.find((u) => u.email === email)?.id;
    if (!userId) continue;
    const appAdmin = people.some(
      (p) => p.userId === userId && p.admin && !p.mergedIntoId,
    );
    const controls = (id) =>
      people.some(
        (p) =>
          p.id === id &&
          (p.userId === userId || (!p.userId && p.guardians?.includes(userId))),
      );
    const manages = (g) =>
      appAdmin ||
      (g.memberIds.includes(userId) &&
        (g.ownerId === userId || g.adminIds.includes(userId)));
    const audience = (ids) =>
      appAdmin || groups.some((g) => ids.includes(g.id) && manages(g));
    for (const g of view.groups ?? []) {
      const retained = groups.find((r) => r.id === g.id);
      assert.ok(retained, "Group view must have retained evidence");
      g.adminIds = retained.adminIds;
      g.canAdminister = manages(retained);
    }
    for (const l of view.lists ?? []) {
      const retained = lists.find((r) => r.id === l.id);
      assert.ok(retained, "List view must have retained evidence");
      l.canManagePolicy = l.canEdit;
      l.canViewGiftSummary = retained.ownerIds.some(controls);
      l.canEdit ||=
        retained.groupIds.some((id) =>
          groups.some((g) => g.id === id && g.memberIds.includes(userId)),
        ) && audience(retained.groupIds);
    }
    for (const l of view.lists ?? [])
      if (Object.hasOwn(l, "canManageSettings"))
        l.canManageSettings =
          !lists.find((r) => r.id === l.id).groupEventId && l.canEdit;
    function gifts(value) {
      if (Array.isArray(value)) {
        value.forEach(gifts);
        return;
      }
      if (!value || typeof value !== "object") return;
      if (typeof value.isRecipient === "boolean") {
        const item = items.find((i) => i.id === value.id);
        assert.ok(item, "Gift view must have retained evidence");
        const ordinary = value.canEdit;
        const ids = item.listId
          ? (lists.find((l) => l.id === item.listId)?.groupIds ?? [])
          : item.groupIds;
        value.canEdit ||=
          item.publicationState !== "draft" && audience(ids ?? []);
        value.adminDetailsOnly = value.canEdit && !ordinary;
        if (value.canEdit && item.lastEditorId)
          value.lastEditorName =
            people.find((p) => p.userId === item.lastEditorId)?.name ??
            "Former member";
        for (const note of value.comments ?? [])
          if (value.canEdit && audience(ids ?? [])) note.canDelete = true;
      }
      Object.values(value).forEach(gifts);
    }
    gifts(view);
    for (const exchange of view.exchanges ?? []) {
      const group = groups.find((g) => g.id === exchange.groupId);
      assert.ok(group, "Exchange must have retained group evidence");
      exchange.canManage =
        group.memberIds.includes(userId) &&
        (manages(group) || !!group.eventLeaderIds?.includes(userId));
    }
  }
  return migrated;
}
// Match the migration's conservative duplicate key without importing candidate
// application code: this contract also runs inside the pinned release image.
function offerUrlKey(value) {
  try {
    const url = new URL(value);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      (url.port && !["80", "443"].includes(url.port)) ||
      /\/(auth|login|account|checkout|cart|password|reset|invite|share)(\/|$)/i.test(
        url.pathname,
      )
    )
      return value;
    url.hash = "";
    const amazon =
      /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|com\.au|co\.jp)$/.test(
        url.hostname,
      );
    const allowed = new Set([
      "id",
      "pid",
      "product_id",
      "variant",
      "sku",
      "color",
      "colour",
      "size",
      "currency",
      "locale",
      "lang",
      "country",
      "th",
      "psc",
    ]);
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        ["gclid", "fbclid", "msclkid"].includes(lower) ||
        (amazon && ["tag", "ref"].includes(lower))
      )
        url.searchParams.delete(key);
      else if (!allowed.has(lower)) return value;
    }
    return url.href;
  } catch {
    return value;
  }
}

// Schema 14 preserves scalar URLs/prices and all buying/privacy evidence. Only
// new UUIDs are nondeterministic; validate their freshness and bind each exact
// value across persisted offers and every visible copy before comparing all data.
function shoppingMigrationContract(evidence, actual) {
  const migrated = structuredClone(evidence);
  const identifiers = new Set();
  function remember(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === "id" || key === "generation") && typeof child === "string")
        identifiers.add(child);
      remember(child);
    }
  }
  remember(evidence);
  const freshUuid = (value) => {
    assert.equal(typeof value, "string", "Migration must generate a UUID");
    assert.match(
      value,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i,
    );
    assert.ok(!identifiers.has(value), "Migration UUID must be new and unique");
    identifiers.add(value);
    return value;
  };
  const changed = new Map();
  for (const row of migrated.records) {
    const item = row.data;
    if (
      row.kind === "priceChecks" &&
      ["pending", "running"].includes(item.status)
    ) {
      delete item.leaseUntil;
      delete item.token;
      Object.assign(item, {
        status: "failed",
        outcome: "skipped",
        error: "Superseded by shopping-offer migration.",
      });
    }
    if (row.kind !== "items" || item.shoppingOffers) continue;
    const candidate = actual.records?.find(
      (r) => r.kind === "items" && r.id === row.id,
    )?.data;
    const offers = [];
    if (item.url) {
      let label = "Shop";
      try {
        label = new URL(item.url).hostname.replace(/^www\./, "");
      } catch {}
      offers.push({
        id: `${item.id}:primary`,
        url: item.url,
        label,
        ...(Object.hasOwn(item, "priceCents")
          ? { priceCents: item.priceCents }
          : {}),
        ...(item.pricing ? { pricing: structuredClone(item.pricing) } : {}),
      });
    }
    for (const legacy of item.purchaseOffers ?? []) {
      if (offers.some((o) => offerUrlKey(o.url) === offerUrlKey(legacy.url)))
        continue;
      const generated = candidate?.shoppingOffers?.[offers.length];
      offers.push({
        id: freshUuid(generated?.id),
        url: legacy.url,
        label: legacy.retailer,
        priceCents: legacy.priceCents,
        pricing: {
          baseline: legacy.priceCents,
          baselineLabel: "when tracking started",
          generation: freshUuid(generated?.pricing?.generation),
          ...(Object.hasOwn(legacy, "checkedAt")
            ? { checkedAt: legacy.checkedAt }
            : {}),
          status: "verified",
        },
      });
    }
    item.shoppingOffers = offers;
    const primary = offers.find((o) => o.url === item.url);
    if (primary) item.primaryOfferId = primary.id;
    else delete item.primaryOfferId;
    if (offers.length > 1 && item.pricing)
      item.pricing.generation = freshUuid(candidate?.pricing?.generation);
    delete item.purchaseOffers;
    changed.set(item.id, item);
  }
  function gifts(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.isRecipient === "boolean" && changed.has(value.id)) {
      const item = changed.get(value.id);
      value.shoppingOffers = structuredClone(item.shoppingOffers);
      if (item.primaryOfferId) value.primaryOfferId = item.primaryOfferId;
      else delete value.primaryOfferId;
      if (value.pricing) value.pricing.generation = item.pricing.generation;
      delete value.purchaseOffers;
    }
    Object.values(value).forEach(gifts);
  }
  gifts(migrated.views);
  return migrated;
}

// Schema 16 adds only a derived price source and pauses custom-price checks.
// Keep amounts, retailer prices, history and all unrelated evidence exact.
function priceSourceMigrationContract(evidence) {
  const migrated = structuredClone(evidence);
  const changed = new Map();
  const now = Date.now();
  for (const row of migrated.records) {
    const item = row.data;
    if (row.kind !== "items" || item.kind === "group") continue;
    const ranged = item.priceCents != null && item.priceMaxCents != null;
    const offers =
      item.shoppingOffers ??
      (item.url
        ? [
            {
              priceCents: ranged ? null : item.priceCents,
              pricing: ranged ? undefined : item.pricing,
            },
          ]
        : []);
    const priced = offers.filter((offer) => offer.priceCents != null);
    const fresh = priced.filter((offer) => {
      const checked = Date.parse(offer.pricing?.checkedAt ?? "");
      return (
        offer.pricing?.status === "verified" &&
        checked <= now &&
        now - checked < 48 * 3600000
      );
    });
    const selected = (fresh.length ? fresh : priced).sort(
      (a, b) => a.priceCents - b.priceCents,
    )[0];
    item.priceSource ??=
      item.priceCents != null &&
      item.priceMaxCents == null &&
      selected?.priceCents === item.priceCents
        ? "shops"
        : "custom";
    if (item.priceSource === "custom" && item.pricing)
      item.pricing.paused = true;
    changed.set(item.id, item);
  }
  function gifts(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.isRecipient === "boolean" && changed.has(value.id)) {
      const item = changed.get(value.id);
      value.priceSource = item.priceSource;
      if (item.priceSource === "custom" && value.pricing)
        value.pricing.paused = true;
    }
    Object.values(value).forEach(gifts);
  }
  gifts(migrated.views);
  return migrated;
}

export function assertPreserved(actual, expected) {
  if (actual.schemaVersion >= 9 && (expected.schemaVersion ?? 0) < 9)
    expected = lifecycleMigrationContract(expected);
  if (actual.schemaVersion >= 13 && (expected.schemaVersion ?? 0) < 13)
    expected = administrationMigrationContract(expected);
  if (actual.schemaVersion >= 14 && (expected.schemaVersion ?? 0) < 14)
    expected = shoppingMigrationContract(expected, actual);
  if (actual.schemaVersion >= 16 && (expected.schemaVersion ?? 0) < 16)
    expected = priceSourceMigrationContract(expected);
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
