import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyPaths,
  changedPaths,
  selectChecks,
  gateErrors,
} from "./ci-policy.mjs";

const flags = (names = []) =>
  Object.fromEntries(
    ["integration", "browser", "containers", "brand"].map((name) => [
      name,
      names.includes(name),
    ]),
  );
const full = flags(["integration", "browser", "containers", "brand"]);

for (const [description, files, expected] of [
  ["docs only", ["README.md", "docs/RELEASING.md"], flags()],
  [
    "marketing only",
    ["marketing/index.html", "scripts/check-marketing.mjs"],
    flags(),
  ],
  ["design only", ["design/mockup.tsx", ".impeccable/design.json"], flags()],
  [
    "frontend",
    ["src/client/ListFeatures.tsx", "src/client/style.css"],
    flags(["browser"]),
  ],
  [
    "public assets",
    ["public/brand/logo.svg", "index.html"],
    flags(["browser"]),
  ],
  ["backend", ["src/server/domain.ts"], flags(["integration", "browser"])],
  ["shared model", ["src/shared/model.ts"], flags(["integration", "browser"])],
  [
    "entrypoints",
    ["src/server/worker.ts"],
    flags(["integration", "browser", "containers"]),
  ],
  ["integration test", ["tests/integration.test.ts"], flags(["integration"])],
  [
    "browser helpers",
    ["tests/browser-helpers.ts", "playwright.config.ts"],
    flags(["browser"]),
  ],
  ["browser spec", ["tests/pwa.spec.ts"], flags(["browser"])],
  ["unit tests", ["tests/domain.test.ts"], flags()],
  ["dependencies", ["package-lock.json"], full],
  ["package scripts", ["package.json"], full],
  ["build configuration", ["vite.config.ts"], full],
  ["build scripts", ["scripts/build-sw.mjs"], full],
  ["Docker", ["Dockerfile", ".dockerignore"], flags(["containers"])],
  [
    "Compose",
    ["compose.yaml", "compose.ghcr.yaml", ".env.production.example"],
    flags(["containers"]),
  ],
  [
    "compliance",
    ["compliance/sources/native.md"],
    flags(["containers", "brand"]),
  ],
  [
    "release tooling",
    ["scripts/release-image.sh", "scripts/release-sources.mjs"],
    flags(["containers"]),
  ],
  [
    "brand tooling",
    [
      "brand/little-hint-final/source/package-lock.json",
      "scripts/audit-brand.py",
    ],
    flags(["brand"]),
  ],
  [
    "license policy tooling",
    ["scripts/licenses.mjs"],
    flags(["containers", "brand"]),
  ],
  ["workflow", [".github/workflows/ci.yml"], full],
  ["CI selector", ["scripts/ci-policy.mjs"], full],
  ["unknown path", ["new-runtime/config.json"], full],
  [
    "mixed changes",
    ["docs/README.md", "src/client/App.tsx", "Dockerfile"],
    flags(["browser", "containers"]),
  ],
]) {
  test(`check selection: ${description}`, () => {
    assert.deepEqual(classifyPaths(files), expected);
  });
}

test("manual, main and reusable runs always validate everything", () => {
  for (const input of [
    { eventName: "workflow_dispatch" },
    { eventName: "push" },
    { eventName: "workflow_call" },
    { eventName: "pull_request", ref: "a".repeat(40) },
    {},
  ]) {
    assert.deepEqual(
      selectChecks(input, () => assert.fail("must not inspect PR diff"))
        .selected,
      full,
    );
  }
});

test("unavailable or invalid diff falls back to full coverage", () => {
  const result = selectChecks({ eventName: "pull_request" }, () => {
    throw new Error("missing history");
  });
  assert.deepEqual(result.selected, full);
  assert.match(result.reason, /unavailable/);
  assert.throws(() => changedPaths("--bad-ref", "a".repeat(40)), /SHA/);
  assert.deepEqual(selectChecks({ eventName: "pull_request" }).selected, full);
});

test("PR selection uses the complete three-dot diff, including deletions and both sides of renames", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "little-hint-ci-diff-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const write = (file, contents = "fixture\n") => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), contents);
  };
  const commit = () => {
    git("add", ".");
    git("commit", "-qm", "fixture");
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.name", "CI test");
    git("config", "user.email", "ci@example.test");
    git("config", "commit.gpgsign", "false");
    write("src/client/Old.tsx");
    write("src/server/obsolete.ts");
    commit();
    git("switch", "-qc", "feature");
    mkdirSync(path.join(cwd, "docs"));
    git("mv", "src/client/Old.tsx", "docs/moved.md");
    git("rm", "src/server/obsolete.ts");
    // Exceed GitHub's 300-file path-filter limit; preserve unusual filenames.
    for (let i = 0; i < 350; i++) write(`docs/page-${i}.md`);
    write("src/client/name with\na newline.tsx");
    const head = commit();
    git("switch", "-q", "main");
    write("unknown-main-only.json");
    const base = commit();
    const files = changedPaths(base, head, cwd);
    assert.equal(files.length, 354);
    assert.ok(files.includes("src/client/Old.tsx"));
    assert.ok(files.includes("docs/moved.md"));
    assert.ok(files.includes("src/server/obsolete.ts"));
    assert.ok(files.includes("src/client/name with\na newline.tsx"));
    assert.ok(!files.includes("unknown-main-only.json"));
    assert.deepEqual(
      selectChecks({ eventName: "pull_request", base, head }, (a, b) =>
        changedPaths(a, b, cwd),
      ).selected,
      flags(["integration", "browser"]),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

const results = (selected = full) => ({
  changes: {
    result: "success",
    outputs: Object.fromEntries(
      Object.entries(selected).map(([key, value]) => [key, String(value)]),
    ),
  },
  quality: {
    result: "success",
    outputs: { brand: selected.brand ? "success" : "skipped" },
  },
  ...Object.fromEntries(
    ["integration", "browser", "containers"].map((name) => [
      name,
      { result: selected[name] ? "success" : "skipped" },
    ]),
  ),
});

test("gate accepts full coverage and explicitly unselected jobs", () => {
  assert.deepEqual(gateErrors(results()), []);
  assert.deepEqual(gateErrors(results(flags())), []);
  assert.deepEqual(gateErrors(results(flags(["browser"]))), []);
});

test("gate rejects failures, cancellations, missing jobs and unexpected skips", () => {
  for (const name of [
    "changes",
    "quality",
    "integration",
    "browser",
    "containers",
  ]) {
    for (const result of ["failure", "cancelled", "skipped", undefined]) {
      const jobs = results();
      jobs[name].result = result;
      assert.ok(gateErrors(jobs).length, `${name}: ${result}`);
    }
    const jobs = results();
    delete jobs[name];
    assert.ok(gateErrors(jobs).length, `missing ${name}`);
  }
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    const jobs = results();
    jobs.quality.outputs.brand = result;
    assert.ok(gateErrors(jobs).length, `brand: ${result}`);
  }
  for (const name of Object.keys(full)) {
    for (const value of [undefined, "", "FALSE", false]) {
      const jobs = results(flags());
      jobs.changes.outputs[name] = value;
      assert.ok(gateErrors(jobs).length, `invalid selection ${name}: ${value}`);
    }
  }
  assert.ok(gateErrors(null).length);
});

test("gate never ignores failures in an unselected job", () => {
  for (const name of ["integration", "browser", "containers", "brand"]) {
    const jobs = results(flags());
    if (name === "brand") jobs.quality.outputs.brand = "failure";
    else jobs[name].result = "failure";
    assert.ok(gateErrors(jobs).length);
  }
});

test("CLI writes workflow outputs and exits unsuccessfully for a bad gate", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "little-hint-ci-output-"));
  const output = path.join(directory, "output"),
    summary = path.join(directory, "summary");
  try {
    execFileSync(process.execPath, ["scripts/ci-policy.mjs", "select"], {
      env: {
        ...process.env,
        CI_EVENT_NAME: "workflow_dispatch",
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
      },
    });
    assert.equal(
      readFileSync(output, "utf8"),
      "integration=true\nbrowser=true\ncontainers=true\nbrand=true\n",
    );
    assert.match(readFileSync(summary, "utf8"), /Full validation/);
    for (const [jobs, expected] of [
      [results(), 0],
      [results(flags()), 0],
      [{}, 1],
    ]) {
      const child = spawnSync(
        process.execPath,
        ["scripts/ci-policy.mjs", "gate"],
        {
          env: { ...process.env, RESULTS: JSON.stringify(jobs) },
        },
      );
      assert.equal(child.status, expected);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
