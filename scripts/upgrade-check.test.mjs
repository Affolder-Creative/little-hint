import test from "node:test";
import assert from "node:assert/strict";
import { configuration, baseline } from "./upgrade-check.mjs";
import { assertPreserved } from "./upgrade/assertions.mjs";
test("upgrade requires an explicit candidate and pins a published baseline", () => {
  for (const value of [undefined, "", "--help", "bad image"])
    assert.throws(() => configuration(value, "/checks"));
  assert.match(
    baseline,
    /^ghcr\.io\/affolder-creative\/little-hint@sha256:[a-f0-9]{64}$/,
  );
});
test("disposable stack has no external volumes, ingress or live providers", () => {
  const config = configuration("candidate:test", "/checks");
  assert.equal(config.networks.default.internal, true);
  for (const volume of Object.values(config.volumes))
    assert.deepEqual(volume, {});
  for (const service of Object.values(config.services)) {
    assert.equal(service.ports, undefined);
    assert.equal(service.env_file, undefined);
    assert.equal(service.environment.OPENAI_API_KEY, undefined);
    assert.equal(service.environment.SMTP_HOST, undefined);
  }
  for (const name of ["app", "worker"]) {
    assert.equal(config.services[name].image, "candidate:test");
    assert.equal(config.services[name].environment.PAID_DAILY_LIMIT, "0");
    assert.equal(config.services[name].environment.SCRAPING_PROVIDER, "none");
  }
});
const original = {
  records: [{ id: "gift", amountCents: 1200 }],
  users: [{ id: "user", email: "alex@example.test" }],
  barrier: [{ id_hash: "closed" }],
  uploadHash: "original",
  views: { recipient: { items: [{ title: "Gift" }] }, buyer: { purchased: 1 } },
};
test("unchanged upgrade evidence passes", () =>
  assertPreserved(structuredClone(original), original));
for (const field of Object.keys(original))
  test(`rejects lost or altered ${field}`, () => {
    const changed = structuredClone(original);
    delete changed[field];
    assert.throws(() => assertPreserved(changed, original));
    changed[field] = null;
    assert.throws(() => assertPreserved(changed, original));
  });
test("rejects financial corruption and new privacy leakage", () => {
  const changed = structuredClone(original);
  changed.records[0].amountCents++;
  assert.throws(() => assertPreserved(changed, original));
  const leaked = structuredClone(original);
  leaked.views.recipient.buyerId = "user";
  assert.throws(() => assertPreserved(leaked, original));
});

test("upgrade adds explicit shopping eligibility without changing legacy permissions", () => {
  const baseline = structuredClone(original);
  baseline.views.recipient.items[0].isRecipient = true;
  baseline.views.buyer = {
    buying: [{ item: { title: "Gift", isRecipient: false } }],
  };
  const current = structuredClone(baseline);
  current.views.recipient.items[0].canShop = false;
  current.views.buyer.buying[0].item.canShop = true;
  assertPreserved(current, baseline);
  // Recovery boots the released image, which still omits the explicit flag.
  assertPreserved(baseline, baseline);
  for (const item of [
    current.views.recipient.items[0],
    current.views.buyer.buying[0].item,
  ]) {
    item.canShop = !item.canShop;
    assert.throws(() => assertPreserved(current, baseline));
    item.canShop = !item.canShop;
  }
  current.views.recipient.items[0].reservations = [{ buyerId: "private" }];
  assert.throws(() => assertPreserved(current, baseline));
});

test("upgrade derives archive and editable-wish attribution from retained records", () => {
  const baseline = structuredClone(original);
  baseline.records = [
    {
      id: "gift",
      kind: "items",
      data: {
        id: "gift",
        listId: "list",
        creatorId: "author",
        archived: false,
      },
    },
    {
      id: "person",
      kind: "people",
      data: { id: "person", userId: "author", name: "Alex" },
    },
  ];
  const wish = {
    id: "gift",
    listId: "list",
    title: "Gift",
    archived: true,
    isRecipient: true,
    canEdit: true,
  };
  baseline.views = {
    recipient: { items: [wish] },
    buyer: {
      buying: [{ item: { ...wish, isRecipient: false, canEdit: false } }],
    },
  };
  const candidate = structuredClone(baseline);
  Object.assign(candidate.views.recipient.items[0], {
    individuallyArchived: false,
    creatorName: "Alex",
  });
  candidate.views.buyer.buying[0].item.individuallyArchived = false;
  assertPreserved(candidate, baseline);
  assertPreserved(baseline, baseline); // Recovery still runs the pinned release.
  for (const corrupt of [
    (v) => {
      v.views.recipient.items[0].individuallyArchived = true;
    },
    (v) => {
      v.views.recipient.items[0].creatorName = "Someone else";
    },
    (v) => {
      v.views.buyer.buying[0].item.creatorName = "Alex";
    },
    (v) => {
      v.views.recipient.items[0].reservations = [{ buyerId: "private" }];
    },
    (v) => {
      v.views.recipient.items[0].title = "Changed";
    },
  ]) {
    const changed = structuredClone(candidate);
    corrupt(changed);
    assert.throws(() => assertPreserved(changed, baseline));
  }
  baseline.records.pop();
  candidate.records.pop();
  candidate.views.recipient.items[0].creatorName = "Former member";
  assertPreserved(candidate, baseline);
});

test("upgrade retains existing gift-idea attribution evidence", () => {
  const baseline = structuredClone(original);
  baseline.records = [
    {
      id: "idea",
      kind: "items",
      data: { id: "idea", creatorId: "author", archived: true },
    },
  ];
  baseline.views.recipient.items = [
    {
      id: "idea",
      isRecipient: true,
      canEdit: false,
      creatorName: "Alex",
      archived: true,
    },
  ];
  const candidate = structuredClone(baseline);
  candidate.views.recipient.items[0].individuallyArchived = true;
  assertPreserved(candidate, baseline);
  delete candidate.views.recipient.items[0].creatorName;
  assert.throws(() => assertPreserved(candidate, baseline));
});

test("failed startup cleans only its two disposable projects and excludes operator credentials", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const path = await import("node:path");
  const directory = mkdtempSync(path.join(tmpdir(), "upgrade-failure-test-"));
  const log = path.join(directory, "calls.jsonl");
  try {
    writeFileSync(
      path.join(directory, "docker"),
      `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({args,secret:process.env.SMTP_PASS,database:process.env.DATABASE_URL})+'\\n');process.exit(args.includes('up')?23:0);\n`,
      { mode: 0o755 },
    );
    const result = spawnSync(process.execPath, ["scripts/upgrade-check.mjs"], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: directory,
        LITTLE_HINT_IMAGE: "candidate:test",
        SMTP_PASS: "must-not-enter",
        DATABASE_URL: "must-not-enter",
      },
    });
    assert.notEqual(result.status, 0);
    const calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
    assert.ok(
      calls.every((c) => c.secret === undefined && c.database === undefined),
    );
    const cleaned = calls.filter((c) => c.args.includes("down"));
    assert.equal(cleaned.length, 2);
    const names = cleaned.map((c) => c.args[c.args.indexOf("-p") + 1]);
    assert.match(names[0], /^little-hint-upgrade-[a-f0-9-]{36}$/);
    assert.equal(names[1], names[0] + "-restore");
    assert.ok(cleaned.every((c) => c.args.includes("--volumes")));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("schema 9 accepts only the exact lifecycle baseline and preserves legacy evidence", () => {
  const baseline = structuredClone(original);
  baseline.schemaVersion = 8;
  const item = { id: "gift", recipientIds: ["recipient"], archived: true };
  const reservation = {
    id: "plan",
    itemId: "gift",
    buyerId: "giver",
    quantity: 2,
    purchased: 1,
    titleSnapshot: "Gift",
  };
  baseline.records = [
    { id: "gift", kind: "items", data: item },
    { id: "plan", kind: "reservations", data: reservation },
  ];
  baseline.views.buyer = {
    buying: [{ ...reservation, item: { ...item, isRecipient: false } }],
    contributionHistory: [
      { contribution: { reservationId: "plan", amountCents: 1200 } },
    ],
  };
  const candidate = structuredClone(baseline);
  candidate.schemaVersion = 9;
  const added = {
    sourceState: "archived",
    sourceVersion: 1,
    sourceRecipientIds: ["recipient"],
  };
  Object.assign(candidate.records[1].data, added);
  Object.assign(candidate.views.buyer.buying[0], added, {
    sourceReviewedBy: {},
    planActions: {
      canRecordPurchase: false,
      canRelease: true,
      requiresReview: true,
    },
  });
  candidate.views.buyer.contributionHistory[0].sourceState = "archived";
  assertPreserved(candidate, baseline);
  assertPreserved(baseline, baseline); // Restoring the pre-upgrade backup.
  assertPreserved(candidate, candidate); // Candidate recreation is exact.
  for (const corrupt of [
    (v) => {
      v.records[1].data.sourceState = "active";
    },
    (v) => {
      v.records[1].data.sourceVersion = 2;
    },
    (v) => {
      delete v.records[1].data.sourceRecipientIds;
    },
    (v) => {
      v.records[1].data.purchased = 0;
    },
    (v) => {
      v.views.buyer.buying[0].planActions.canRecordPurchase = true;
    },
    (v) => {
      v.views.recipient.items[0].sourceRecipientIds = ["private"];
    },
    (v) => {
      v.views.buyer.contributionHistory[0].contribution.amountCents++;
    },
  ]) {
    const changed = structuredClone(candidate);
    corrupt(changed);
    assert.throws(() => assertPreserved(changed, baseline));
  }
});

test("upgrade permits empty discussions for recipient-visible content without weakening surprise checks", () => {
  for (const listed of [false, true]) {
    const baseline = structuredClone(original);
    const item = {
      id: "gift",
      visibility: "visible",
      publicationState: "published",
      ...(listed ? { listId: "list" } : {}),
    };
    baseline.records = [
      { id: "gift", kind: "items", data: item },
      { id: "list", kind: "lists", data: { mode: "transparent" } },
    ];
    baseline.views = {
      recipient: { items: [{ id: "gift", isRecipient: true }] },
    };
    const candidate = structuredClone(baseline);
    candidate.views.recipient.items[0].comments = [];
    assertPreserved(candidate, baseline);
    assertPreserved(baseline, baseline);
    candidate.views.recipient.items[0].comments = [{ body: "Secret plan" }];
    assert.throws(() => assertPreserved(candidate, baseline));
    candidate.views.recipient.items[0].comments = [];
    if (listed) {
      baseline.records[1].data.mode = "surprise";
      candidate.records[1].data.mode = "surprise";
    } else {
      item.visibility = "hidden";
      candidate.records[0].data.visibility = "hidden";
    }
    assert.throws(() => assertPreserved(candidate, baseline));
  }
});

test("upgrade derives visibility metadata from retained audiences without accepting changed values", () => {
  for (const [listId, visibility, scope] of [
    [undefined, "private", "only-me"],
    [undefined, "hidden", "shared"],
    ["list", "private", "shared"],
  ]) {
    const baseline = structuredClone(original);
    baseline.records = [
      { id: "gift", kind: "items", data: { id: "gift", listId, visibility } },
      { id: "list", kind: "lists", data: { id: "list", groupIds: ["family"] } },
      {
        id: "family",
        kind: "groups",
        data: { id: "family", memberIds: ["a", "b"] },
      },
      { id: "a", kind: "people", data: { userId: "a" } },
      { id: "b", kind: "people", data: { userId: "b" } },
    ];
    baseline.views.recipient.items = [{ id: "gift", isRecipient: false }];
    const candidate = structuredClone(baseline);
    candidate.views.recipient.items[0].visibilityScope = scope;
    assertPreserved(candidate, baseline);
    assertPreserved(baseline, baseline);
    candidate.views.recipient.items[0].visibilityScope =
      scope === "shared" ? "only-me" : "shared";
    assert.throws(() => assertPreserved(candidate, baseline));
  }
});

test("schema 13 permits only derived admin fields and retains privacy evidence", () => {
  const baseline = structuredClone(original);
  baseline.schemaVersion = 12;
  baseline.users = [
    { id: "admin", email: "admin@example.test" },
    { id: "member", email: "member@example.test" },
  ];
  const group = {
    id: "group",
    ownerId: "admin",
    memberIds: ["admin", "member"],
  };
  const list = { id: "list", ownerIds: ["person"], groupIds: ["group"] };
  baseline.records = [
    { id: "group", kind: "groups", data: group },
    { id: "list", kind: "lists", data: list },
    {
      id: "person",
      kind: "people",
      data: { id: "person", userId: "member", name: "Member" },
    },
    {
      id: "gift",
      kind: "items",
      data: { id: "gift", listId: "list", creatorId: "member" },
    },
  ];
  const gift = { id: "gift", isRecipient: false, canEdit: false, comments: [] };
  baseline.views = Object.fromEntries(
    baseline.users.map((u) => [
      u.email,
      {
        groups: [structuredClone(group)],
        lists: [{ ...list, canEdit: u.id === "member" }],
        items: [{ ...gift, canEdit: u.id === "member" }],
      },
    ]),
  );
  const candidate = structuredClone(baseline);
  candidate.schemaVersion = 13;
  candidate.records[0].data.adminIds = [];
  for (const [email, view] of Object.entries(candidate.views)) {
    const owner = email === "admin@example.test";
    Object.assign(view.groups[0], { adminIds: [], canAdminister: owner });
    Object.assign(view.lists[0], {
      canEdit: true,
      canManagePolicy: !owner,
      canViewGiftSummary: !owner,
    });
    Object.assign(view.items[0], { canEdit: true, adminDetailsOnly: owner });
  }
  assertPreserved(candidate, baseline);
  assertPreserved(baseline, baseline);
  for (const corrupt of [
    (v) => {
      v.records[0].data.adminIds = ["member"];
    },
    (v) => {
      v.views["member@example.test"].groups[0].canAdminister = true;
    },
    (v) => {
      v.views["admin@example.test"].lists[0].canManagePolicy = true;
    },
    (v) => {
      v.views["admin@example.test"].items[0].reservations = [
        { buyerId: "private" },
      ];
    },
    (v) => {
      v.views["admin@example.test"].items.push({ id: "private-gift" });
    },
  ]) {
    const changed = structuredClone(candidate);
    corrupt(changed);
    assert.throws(() => assertPreserved(changed, baseline));
  }
});

function shoppingUpgradeFixture(legacy = false) {
  const baseline = structuredClone(original);
  baseline.schemaVersion = 13;
  const item = {
    id: "gift",
    title: "Jacket",
    url: "https://www.shop.test/jacket?size=M",
    priceCents: 12000,
    recipientIds: ["recipient"],
    pricing: {
      baseline: 15000,
      baselineLabel: "when tracking started",
      generation: "original-watch-generation",
      status: "verified",
      checkedAt: "2026-11-19T00:00:00.000Z",
      paused: true,
    },
  };
  if (legacy)
    item.purchaseOffers = [
      {
        url: item.url + "&utm_source=duplicate",
        retailer: "Duplicate",
        priceCents: 1,
      },
      {
        url: "https://rei.test/jacket?size=M",
        retailer: "REI",
        priceCents: 10000,
        checkedAt: "2026-11-18T00:00:00.000Z",
        identity: { obsolete: true },
      },
      {
        url: "https://rei.test/jacket?size=M&utm_source=duplicate",
        retailer: "Duplicate",
        priceCents: 2,
      },
      {
        url: "https://rei.test/jacket?size=L",
        retailer: "REI large",
        priceCents: 11000,
        checkedAt: "2026-11-17T00:00:00.000Z",
      },
    ];
  baseline.records = [
    { kind: "items", id: "gift", data: item },
    {
      kind: "items",
      id: "unlinked",
      data: { id: "unlinked", url: "", priceCents: null },
    },
    {
      kind: "priceWatches",
      id: "watch",
      data: {
        id: "watch",
        itemId: "gift",
        userId: "buyer",
        generation: item.pricing.generation,
        lastNotifiedPrice: 15000,
      },
    },
    {
      kind: "priceChanges",
      id: "history",
      data: {
        id: "history",
        itemId: "gift",
        oldPriceCents: 15000,
        priceCents: 12000,
      },
    },
  ];
  baseline.views = {
    recipient: {
      items: [{ ...structuredClone(item), isRecipient: true, canEdit: false }],
    },
    buyer: {
      buying: [
        {
          id: "plan",
          purchased: 1,
          item: {
            ...structuredClone(item),
            isRecipient: false,
            reservations: [{ id: "plan", buyerId: "buyer", quantity: 1 }],
          },
        },
      ],
    },
  };
  const candidate = structuredClone(baseline);
  candidate.schemaVersion = 14;
  const migrated = candidate.records[0].data;
  migrated.shoppingOffers = [
    {
      id: "gift:primary",
      url: item.url,
      label: "shop.test",
      priceCents: 12000,
      pricing: structuredClone(item.pricing),
    },
  ];
  migrated.primaryOfferId = "gift:primary";
  if (legacy) {
    for (const [index, old] of [
      item.purchaseOffers[1],
      item.purchaseOffers[3],
    ].entries())
      migrated.shoppingOffers.push({
        id: `00000000-0000-4000-8000-00000000000${index + 1}`,
        url: old.url,
        label: old.retailer,
        priceCents: old.priceCents,
        pricing: {
          baseline: old.priceCents,
          baselineLabel: "when tracking started",
          generation: `00000000-0000-4000-8000-00000000000${index + 3}`,
          checkedAt: old.checkedAt,
          status: "verified",
        },
      });
    migrated.pricing.generation = "00000000-0000-4000-8000-000000000005";
    delete migrated.purchaseOffers;
  }
  candidate.records[1].data.shoppingOffers = [];
  for (const view of [
    candidate.views.recipient.items[0],
    candidate.views.buyer.buying[0].item,
  ]) {
    view.shoppingOffers = structuredClone(migrated.shoppingOffers);
    view.primaryOfferId = migrated.primaryOfferId;
    view.pricing = structuredClone(migrated.pricing);
    delete view.purchaseOffers;
  }
  return { baseline, candidate };
}

test("schema 14 preserves primary URLs, prices, tracking, and unlinked items", () => {
  const { baseline, candidate } = shoppingUpgradeFixture();
  assertPreserved(candidate, baseline);
  assertPreserved(baseline, baseline); // Recovery restores the released snapshot.
  assertPreserved(candidate, candidate); // Subsequent boots preserve exact IDs.
  for (const corrupt of [
    (v) => {
      delete v.records[1].data.shoppingOffers;
    },
    (v) => {
      v.records[0].data.url = "https://wrong.test/";
    },
    (v) => {
      v.records[0].data.priceCents++;
    },
    (v) => {
      v.records[0].data.shoppingOffers[0].priceCents++;
    },
    (v) => {
      v.records[0].data.shoppingOffers[0].pricing.paused = false;
    },
    (v) => {
      v.records[0].data.pricing.generation = "changed";
    },
    (v) => {
      v.records[0].data.primaryOfferId = "wrong";
    },
    (v) => {
      v.views.recipient.items[0].shoppingOffers[0].url = "https://wrong.test/";
    },
    (v) => {
      v.views.recipient.items[0].reservations = [{ buyerId: "private" }];
    },
    (v) => {
      v.views.buyer.buying[0].purchased = 0;
    },
    (v) => {
      v.records[2].data.lastNotifiedPrice++;
    },
    (v) => {
      v.records[3].data.priceCents++;
    },
  ]) {
    const changed = structuredClone(candidate);
    corrupt(changed);
    assert.throws(() => assertPreserved(changed, baseline));
  }
});

test("schema 14 migrates legacy offers with fresh bound UUIDs and distinct variants", () => {
  const { baseline, candidate } = shoppingUpgradeFixture(true);
  assertPreserved(candidate, baseline);
  assertPreserved(baseline, baseline);
  assertPreserved(candidate, candidate);
  for (const corrupt of [
    (v) => {
      v.records[0].data.shoppingOffers.pop();
    },
    (v) => {
      v.records[0].data.shoppingOffers.push(
        structuredClone(v.records[0].data.shoppingOffers[1]),
      );
    },
    (v) => {
      v.records[0].data.shoppingOffers[1].id = "not-a-uuid";
    },
    (v) => {
      v.records[0].data.shoppingOffers[1].pricing.generation =
        v.records[0].data.shoppingOffers[1].id;
    },
    (v) => {
      v.records[0].data.shoppingOffers[1].pricing.checkedAt =
        "2026-11-20T00:00:00.000Z";
    },
    (v) => {
      v.records[0].data.shoppingOffers[1].priceCents++;
    },
    (v) => {
      v.records[0].data.shoppingOffers[1].pricing.identity = { obsolete: true };
    },
    (v) => {
      v.records[0].data.pricing.generation =
        baseline.records[0].data.pricing.generation;
    },
    (v) => {
      v.records[0].data.shoppingOffers[0].pricing.generation =
        v.records[0].data.pricing.generation;
    },
    (v) => {
      v.records[0].data.shoppingOffers[1].id =
        "00000000-0000-4000-8000-000000000099";
    }, // Persisted/view ID mismatch.
    (v) => {
      v.records[2].data.generation = v.records[0].data.pricing.generation;
    }, // Watch must re-baseline on its next check.
    (v) => {
      v.views.recipient.items[0].purchaseOffers =
        baseline.records[0].data.purchaseOffers;
    },
  ]) {
    const changed = structuredClone(candidate);
    corrupt(changed);
    assert.throws(() => assertPreserved(changed, baseline));
  }
  const recreated = structuredClone(candidate);
  recreated.records[0].data.shoppingOffers[1].id =
    "00000000-0000-4000-8000-000000000099";
  assert.throws(() => assertPreserved(recreated, candidate));
});

test("schema 14 invalidates only unfinished legacy price jobs and retains their targets", () => {
  const { baseline, candidate } = shoppingUpgradeFixture();
  for (const status of ["pending", "running", "complete", "failed"]) {
    const row = {
      kind: "priceChecks",
      id: status,
      data: {
        id: status,
        status,
        itemId: "gift",
        url: baseline.records[0].data.url,
        generation: "original-watch-generation",
        token: "lease-token",
        leaseUntil: "later",
        requestedBy: "buyer",
        outcome: "verified",
      },
    };
    baseline.records.push(row);
    const migrated = structuredClone(row);
    if (["pending", "running"].includes(status)) {
      delete migrated.data.token;
      delete migrated.data.leaseUntil;
      Object.assign(migrated.data, {
        status: "failed",
        outcome: "skipped",
        error: "Superseded by shopping-offer migration.",
      });
    }
    candidate.records.push(migrated);
  }
  assertPreserved(candidate, baseline);
  for (const corrupt of [
    (v) => {
      v.records[4].data.token = "lease-token";
    },
    (v) => {
      v.records[5].data.status = "running";
    },
    (v) => {
      delete v.records[5].data.requestedBy;
    },
    (v) => {
      v.records[6].data.status = "failed";
    },
    (v) => {
      delete v.records[7].data.token;
    },
  ]) {
    const changed = structuredClone(candidate);
    corrupt(changed);
    assert.throws(() => assertPreserved(changed, baseline));
  }
});

test("schema 16 derives sources while preserving prices and retailer evidence", () => {
  for (const [priceCents, priceMaxCents, source] of [
    [10900, null, "shops"],
    [100, null, "custom"],
    [0, null, "custom"],
    [null, null, "custom"],
    [10900, 15000, "custom"],
  ]) {
    const before = structuredClone(original);
    before.schemaVersion = 15;
    const item = {
      id: "gift",
      priceCents,
      priceMaxCents,
      shoppingOffers: [
        { id: "shop", url: "https://shop.example/gift", priceCents: 10900 },
      ],
      pricing: { baseline: 10900, generation: "original" },
    };
    before.records = [{ id: item.id, kind: "items", data: item }];
    before.views.recipient.items = [
      { ...structuredClone(item), isRecipient: true },
    ];
    const after = structuredClone(before);
    after.schemaVersion = 16;
    for (const value of [
      after.records[0].data,
      after.views.recipient.items[0],
    ]) {
      value.priceSource = source;
      if (source === "custom") value.pricing.paused = true;
    }
    assertPreserved(after, before);
    const changed = structuredClone(after);
    changed.records[0].data.priceCents = 9000;
    assert.throws(() => assertPreserved(changed, before));
    const wrongSource = structuredClone(after);
    wrongSource.records[0].data.priceSource =
      source === "shops" ? "custom" : "shops";
    assert.throws(() => assertPreserved(wrongSource, before));
    const changedShop = structuredClone(after);
    changedShop.records[0].data.shoppingOffers[0].priceCents = 9000;
    assert.throws(() => assertPreserved(changedShop, before));
  }
});

test("schema 16 distinguishes legacy scalar links from explicitly empty shops", () => {
  for (const explicitEmpty of [false, true]) {
    const before = structuredClone(original);
    before.schemaVersion = 15;
    const item = {
      id: "gift",
      url: "https://shop.example/gift",
      priceCents: 10900,
      ...(explicitEmpty ? { shoppingOffers: [] } : {}),
    };
    before.records = [{ id: "gift", kind: "items", data: item }];
    const after = structuredClone(before);
    after.schemaVersion = 16;
    after.records[0].data.priceSource = explicitEmpty ? "custom" : "shops";
    assertPreserved(after, before);
  }
});

test("schema 18 derives offer capabilities without inventing offers or exposing recipients", () => {
  const baseline = structuredClone(original);
  baseline.schemaVersion = 17;
  baseline.records = [
    {
      id: "wish",
      kind: "items",
      data: { id: "wish", listId: "list", archived: false },
    },
    {
      id: "private",
      kind: "items",
      data: { id: "private", visibility: "private", archived: false },
    },
    {
      id: "archived",
      kind: "items",
      data: { id: "archived", listId: "list", archived: true },
    },
    { id: "list", kind: "lists", data: { id: "list", mode: "surprise" } },
  ];
  baseline.views = {
    recipient: { items: [{ id: "wish", isRecipient: true, canShop: false }] },
    buyer: {
      items: [
        { id: "wish", isRecipient: false, canShop: true, archived: false },
        { id: "private", isRecipient: false, canShop: true, archived: false },
        { id: "archived", isRecipient: false, canShop: true, archived: true },
      ],
    },
  };
  const candidate = structuredClone(baseline);
  candidate.schemaVersion = 18;
  candidate.views.buyer.items[0].canOfferContribution = true;
  candidate.views.buyer.items[0].contributionOffers = [];
  candidate.views.buyer.items[1].canOfferContribution = false;
  candidate.views.buyer.items[2].canOfferContribution = false;
  assertPreserved(candidate, baseline);
  assertPreserved(baseline, baseline);
  for (const corrupt of [
    (v) => {
      v.views.buyer.items[0].canOfferContribution = false;
    },
    (v) => {
      delete v.views.buyer.items[0].contributionOffers;
    },
    (v) => {
      v.views.buyer.items[0].contributionOffers = [{ amountCents: 100 }];
    },
    (v) => {
      v.views.buyer.items[1].canOfferContribution = true;
    },
    (v) => {
      v.views.buyer.items[2].canOfferContribution = true;
    },
    (v) => {
      v.views.recipient.items[0].canOfferContribution = false;
    },
    (v) => {
      v.views.recipient.items[0].contributionOffers = [];
    },
  ]) {
    const bad = structuredClone(candidate);
    corrupt(bad);
    assert.throws(() => assertPreserved(bad, baseline));
  }
});
