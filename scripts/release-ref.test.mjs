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
      GITHUB_REPOSITORY: "kaffolder7/little-hint",
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
    "api\nrepos/kaffolder7/little-hint/git/ref/heads/main\n",
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
