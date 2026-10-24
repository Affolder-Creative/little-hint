import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./registry-tags.mjs", import.meta.url));
function query(t, { status = 0, output = "", error = "" } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "little-hint-registry-tags-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, "gh"),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_ARGS"\nprintf "%s" "$TEST_OUTPUT"\nprintf "%s" "$TEST_ERROR" >&2\nexit "$TEST_STATUS"\n',
    { mode: 0o755 },
  );
  const result = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${root}${path.delimiter}${process.env.PATH}`,
      TEST_ARGS: path.join(root, "args"),
      TEST_OUTPUT: output,
      TEST_ERROR: error,
      TEST_STATUS: String(status),
    },
  });
  assert.ifError(result.error);
  assert.equal(
    readFileSync(path.join(root, "args"), "utf8"),
    "api\n--paginate\norgs/Affolder-Creative/packages/container/little-hint/versions?per_page=100\n--jq\n.[].metadata.container.tags[]\n",
  );
  return result;
}

test("reads organization package tags with pagination", (t) => {
  const result = query(t, { output: "0.2.2\nlatest\n" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ["0.2.2", "latest"]);
});
test("first organization publication permits a missing package", (t) => {
  const result = query(t, { status: 1, error: "gh: Not Found (HTTP 404)" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
});
for (const code of [401, 403, 500]) {
  test(`HTTP ${code} fails instead of hiding registry errors`, (t) => {
    const result = query(t, {
      status: 1,
      error: `gh: Request failed (HTTP ${code})`,
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
  });
}
