import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./release-ref.mjs", import.meta.url));
const checked = "a".repeat(40);
const newer = "b".repeat(40);

function releaseCommand(
  t,
  command,
  {
    createdTag = "",
    retryTag = "",
    tagSha = checked,
    version = "0.3.0",
    draft = true,
    ancestorStatus = 0,
  } = {},
) {
  const root = mkdtempSync(
    path.join(tmpdir(), "little-hint-release-candidate-"),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ version }));
  writeFileSync(
    path.join(root, "gh"),
    `#!/bin/sh
echo "$*" >> "$TEST_CALLS"
if [ "$1" = release ]; then printf '%s' "$TEST_RELEASE";
else printf '%s' "$TEST_TAG_REF"; fi
`,
    { mode: 0o755 },
  );
  writeFileSync(
    path.join(root, "git"),
    `#!/bin/sh
echo "git $*" >> "$TEST_CALLS"
if [ "$1" = rev-parse ]; then printf '%s' "$TEST_TAG_SHA";
else exit "$TEST_ANCESTOR_STATUS"; fi
`,
    { mode: 0o755 },
  );
  const output = path.join(root, "output");
  const calls = path.join(root, "calls");
  writeFileSync(output, "");
  writeFileSync(calls, "");
  const result = spawnSync(process.execPath, [script, command], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${root}${path.delimiter}${process.env.PATH}`,
      GITHUB_REF: "refs/heads/main",
      GITHUB_SHA: newer,
      GITHUB_REPOSITORY: "Affolder-Creative/little-hint",
      CHECKED_SHA: checked,
      CREATED_TAG: createdTag,
      RETRY_TAG: retryTag,
      GITHUB_OUTPUT: output,
      TEST_CALLS: calls,
      TEST_RELEASE: JSON.stringify({ isDraft: draft }),
      TEST_TAG_REF: JSON.stringify({ object: { type: "commit", sha: tagSha } }),
      TEST_TAG_SHA: tagSha,
      TEST_ANCESTOR_STATUS: String(ancestorStatus),
    },
  });
  assert.ifError(result.error);
  return {
    ...result,
    output: readFileSync(output, "utf8"),
    calls: readFileSync(calls, "utf8"),
  };
}

test("ordinary main merge produces no release candidate or release API calls", (t) => {
  const result = releaseCommand(t, "resolve");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, "");
  assert.equal(result.calls, "");
});

test("draft candidate resolves only its selected commit and package version", (t) => {
  const result = releaseCommand(t, "resolve", { createdTag: "v0.3.0" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, "tag=v0.3.0\nversion=0.3.0\n");
});

for (const [name, options] of [
  ["moved tag", { tagSha: newer }],
  ["wrong version", { version: "0.4.0" }],
  ["published release", { draft: false }],
])
  test(`candidate rejects ${name} without exposing build outputs`, (t) => {
    const result = releaseCommand(t, "resolve", {
      createdTag: "v0.3.0",
      ...options,
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.output, "");
  });

test("manual retry selects the old draft commit and requires main ancestry", (t) => {
  const result = releaseCommand(t, "select", { retryTag: "v0.3.0" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, `sha=${checked}\n`);
  assert.match(result.calls, /git rev-parse v0\.3\.0\^\{commit\}/);
  assert.ok(
    result.calls.includes(
      `git merge-base --is-ancestor ${checked} origin/main`,
    ),
  );
  assert.notEqual(
    releaseCommand(t, "select", { retryTag: "v0.3.0", ancestorStatus: 1 })
      .status,
    0,
  );
  const resolved = releaseCommand(t, "resolve", { retryTag: "v0.3.0" });
  assert.equal(resolved.status, 0, resolved.stderr);
  assert.equal(resolved.output, "tag=v0.3.0\nversion=0.3.0\n");
});

function checkMain(t, { sha = checked, ref, response, apiStatus = 0 }) {
  const root = mkdtempSync(path.join(tmpdir(), "little-hint-release-ref-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, "gh"),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_GH_ARGS"\nprintf "%s\\n" "$TEST_GH_RESPONSE"\nexit "$TEST_GH_STATUS"\n',
    { mode: 0o755 },
  );
  const output = path.join(root, "output");
  const summary = path.join(root, "summary");
  writeFileSync(output, "");
  writeFileSync(summary, "");
  const result = spawnSync(process.execPath, [script, "check-main"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${root}${path.delimiter}${process.env.PATH}`,
      CHECKED_SHA: sha,
      GITHUB_REPOSITORY: "Affolder-Creative/little-hint",
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      TEST_GH_ARGS: path.join(root, "args"),
      TEST_GH_RESPONSE: response ?? JSON.stringify({ object: ref }),
      TEST_GH_STATUS: String(apiStatus),
    },
  });
  assert.ifError(result.error);
  assert.equal(
    readFileSync(path.join(root, "args"), "utf8"),
    "api\nrepos/Affolder-Creative/little-hint/git/ref/heads/main\n",
  );
  return {
    ...result,
    output: readFileSync(output, "utf8"),
    summary: readFileSync(summary, "utf8"),
  };
}

test("current main remains eligible for release generation", (t) => {
  const result = checkMain(t, { ref: { type: "commit", sha: checked } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, "current=true\n");
  assert.equal(result.summary, "");
});

test("superseded main exits successfully without allowing release generation", (t) => {
  const result = checkMain(t, { ref: { type: "commit", sha: newer } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, "current=false\n");
  assert.match(result.stdout, /::notice::Release generation skipped/);
  assert.ok(result.summary.includes(checked));
  assert.ok(result.summary.includes(newer));
});

for (const [description, options] of [
  ["API failure", { apiStatus: 1, ref: { type: "commit", sha: newer } }],
  ["malformed JSON", { response: "not JSON" }],
  ["missing main ref", { response: "{}" }],
  ["non-commit ref", { ref: { type: "tag", sha: newer } }],
  ["missing main SHA", { ref: { type: "commit" } }],
  ["malformed main SHA", { ref: { type: "commit", sha: "invalid" } }],
  ["non-string main SHA", { ref: { type: "commit", sha: [newer] } }],
  ["missing checked SHA", { sha: "", ref: { type: "commit", sha: newer } }],
  [
    "matching but invalid SHAs",
    { sha: "invalid", ref: { type: "commit", sha: "invalid" } },
  ],
]) {
  test(`${description} fails instead of reporting a clean skip`, (t) => {
    const result = checkMain(t, options);
    assert.notEqual(result.status, 0);
    assert.equal(result.output, "");
    assert.equal(result.summary, "");
    assert.doesNotMatch(result.stdout, /::notice::/);
  });
}
