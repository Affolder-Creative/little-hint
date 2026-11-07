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
