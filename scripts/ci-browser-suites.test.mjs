import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  suites,
  suiteFiles,
  validateCoverage,
  browserMatrix,
  browserCommand,
} from "./ci-browser-suites.mjs";

test("every checked-in browser spec has exactly one logical owner", () => {
  validateCoverage();
  assert.ok(
    suiteFiles(suites["gift-discovery"]).includes(
      "tests/product-sources.spec.ts",
    ),
  );
});

test("new, duplicate and deleted specs cannot silently escape CI", () => {
  assert.throws(
    () => validateCoverage(["tests/new.spec.ts"], {}),
    /Unassigned/,
  );
  assert.throws(
    () => validateCoverage(["tests/a.spec.ts"], { a: { files: ["a", "a"] } }),
    /Duplicate/,
  );
  assert.throws(() => validateCoverage([], { a: { files: ["a"] } }), /Missing/);
});

test("matrix expands only the two slow suites with unique artifact identities", () => {
  const jobs = browserMatrix().include;
  assert.equal(jobs.length, 14);
  assert.equal(new Set(jobs.map(({ id }) => id)).size, jobs.length);
  assert.deepEqual(
    jobs.filter((job) => job.suite === "critique").map(({ shard }) => shard),
    ["1/3", "2/3", "3/3"],
  );
  const polish = jobs
    .filter((job) => job.suite === "polish")
    .flatMap(({ suite, shard }) =>
      browserCommand(suite, shard).args.filter((arg) =>
        arg.endsWith(".spec.ts"),
      ),
    );
  assert.deepEqual(polish.sort(), suiteFiles(suites.polish).sort());
});

test("only critique opts into test sharding; local unsharded commands retain all files", () => {
  assert.ok(
    browserCommand("critique", "1/3").args.includes("--fully-parallel"),
  );
  assert.ok(!browserCommand("critique").args.includes("--fully-parallel"));
  assert.ok(!browserCommand("polish", "1/2").args.includes("--fully-parallel"));
  assert.deepEqual(
    browserCommand("polish").args.filter((arg) => arg.endsWith(".spec.ts")),
    suiteFiles(suites.polish),
  );
  assert.equal(browserCommand("list-features").scripts.length, 2);
  for (const { suite, shard } of browserMatrix().include) {
    const { args } = browserCommand(suite, shard);
    for (const required of ["--workers=1", "--max-failures=1", "--retries=0"])
      assert.ok(args.includes(required));
  }
});

test("reject unknown suites and malformed or incompatible shards", () => {
  for (const suite of ["unknown", "toString", "__proto__"])
    assert.throws(() => browserCommand(suite));
  for (const shard of ["0/3", "4/3", "1/2", "1", "1/3 --workers=4"])
    assert.throws(() => browserCommand("critique", shard), /Invalid shard/);
  assert.throws(() => browserCommand("e2e", "1/1"), /Invalid shard/);
});

test("Playwright lists every critique test on exactly one shard", () => {
  const listed = (shard = "") => {
    const { args } = browserCommand("critique", shard);
    const result = spawnSync(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        ...args.slice(2),
        "--list",
        "--reporter=json",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, CI: "true", E2E_BUILT: "1" },
        maxBuffer: 8 * 1024 * 1024,
        timeout: 30_000,
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const ids = [];
    const visit = (suite) => {
      ids.push(...(suite.specs ?? []).map((spec) => spec.id));
      for (const child of suite.suites ?? []) visit(child);
    };
    for (const suite of JSON.parse(result.stdout).suites) visit(suite);
    return ids;
  };
  const full = listed();
  const shards = ["1/3", "2/3", "3/3"].map(listed);
  assert.ok(shards.every((ids) => ids.length > 0));
  const combined = shards.flat();
  assert.equal(new Set(combined).size, combined.length);
  assert.deepEqual(combined.sort(), full.sort());
});
