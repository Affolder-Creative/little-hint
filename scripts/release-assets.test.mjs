import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./release-assets.mjs", import.meta.url));
const image = "ghcr.io/affolder-creative/little-hint";
const digest = `sha256:${"a".repeat(64)}`;
const revision = "b".repeat(40);
const marker = "<!-- little-hint-artifacts -->";

function generate(t, version, body) {
  const root = mkdtempSync(path.join(tmpdir(), "little-hint-release-copy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, ".local/release-assets"), { recursive: true });
  writeFileSync(
    path.join(root, "gh"),
    `#!/bin/sh\nprintf '%s' "$TEST_RELEASE"\n`,
    { mode: 0o755 },
  );
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${root}${path.delimiter}${process.env.PATH}`,
      TEST_RELEASE: JSON.stringify({ body }),
      IMAGE: image,
      IMAGE_DIGEST: digest,
      VERSION: version,
      RELEASE_SHA: revision,
      RELEASE_TAG: `v${version}`,
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return {
    notes: readFileSync(path.join(root, ".local/release-notes.md"), "utf8"),
    install: readFileSync(
      path.join(root, ".local/release-assets/INSTALL.md"),
      "utf8",
    ),
    image: readFileSync(
      path.join(root, ".local/release-assets/IMAGE.txt"),
      "utf8",
    ),
  };
}

for (const version of ["0.19.5", "1.0.0"]) {
  test(`release ${version} gives tagged support and upgrade guidance without a stale maturity claim`, (t) => {
    const body =
      "# Release highlights\n\nReviewed fixes and compatibility notes.\n";
    const result = generate(t, version, body);
    assert.ok(result.notes.startsWith(body));
    assert.doesNotMatch(result.install, /early|production.ready|certified/i);
    for (const doc of ["SUPPORT", "DEPLOYMENT", "COOLIFY_UPGRADES"])
      assert.ok(result.install.includes(`/blob/v${version}/docs/${doc}.md`));
    assert.match(result.install, /latest stable release/);
    assert.match(result.install, /no response-time or uptime guarantee/);
    assert.match(result.install, /first installation/i);
    assert.match(result.install, /database and uploads/);
    assert.ok(result.install.includes(`docker pull ${image}@${digest}`));
    assert.ok(
      result.install.includes(`little-hint-${version}-linux-amd64.tar.gz`),
    );
    assert.ok(
      result.install.includes(`/releases/download/v${version}/SHA256SUMS`),
    );
    assert.equal(
      result.image,
      `${image}@${digest}\nversion=${version}\nrevision=${revision}\n`,
    );
    assert.equal(result.notes.split(marker)[1], `\n${result.install}`);
  });
}

test("retry replaces only generated download instructions and preserves reviewed notes", (t) => {
  const body =
    "# Release highlights\n\nOperator action: keep your recovery key.\n";
  const first = generate(t, "1.0.0", `${body}\n${marker}\nStale instructions`);
  const retry = generate(t, "1.0.0", first.notes);
  assert.equal(retry.notes, first.notes);
  assert.ok(retry.notes.startsWith(body));
  assert.equal(retry.notes.split(marker).length, 2);
  assert.doesNotMatch(retry.notes, /Stale instructions/);
});
