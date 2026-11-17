import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

test("publisher restores a locked bundle omitted from the runtime inventory", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const block = workflow.match(
    /      - name: Restore shared source archives expected by the tagged publisher\n        run: \|\n([\s\S]*?)(?=      - )/,
  );
  assert.ok(
    block,
    "release workflow must restore omitted shared source archives",
  );
  const command = block[1]
    .split("\n")
    .map((line) => line.replace(/^          /, ""))
    .join("\n");
  const root = mkdtempSync(path.join(tmpdir(), "release-sources-"));
  try {
    for (const dir of [
      "compliance",
      "scripts",
      ".local/artifacts/release-amd64",
    ])
      mkdirSync(path.join(root, dir), { recursive: true });
    copyFileSync(
      new URL("./bundle-sources.py", import.meta.url),
      path.join(root, "scripts/bundle-sources.py"),
    );
    const artifact = {
      file: "build-only-sources.tar.gz",
      inputs: [],
      localFiles: [],
      covers: ["npm:build-only@1"],
      review: "fixture",
    };
    writeFileSync(
      path.join(root, "compliance/source-materials.json"),
      JSON.stringify({ artifacts: [artifact] }),
    );
    writeFileSync(path.join(root, "plan.json"), JSON.stringify([artifact]));
    execFileSync(
      "python3",
      ["scripts/bundle-sources.py", "plan.json", "expected"],
      { cwd: root },
    );
    const locked = readFileSync(path.join(root, "expected/BUNDLES.json"));
    writeFileSync(
      path.join(root, "compliance/source-bundles.lock.json"),
      locked,
    );
    execFileSync("bash", ["-eu", "-c", command], { cwd: root });
    assert.deepEqual(
      readFileSync(
        path.join(root, ".local/artifacts/release-amd64", artifact.file),
      ),
      readFileSync(path.join(root, "expected", artifact.file)),
    );
    // Already-present bundles must be retained, not rebuilt or overwritten.
    writeFileSync(
      path.join(root, "compliance/source-materials.json"),
      JSON.stringify({ artifacts: [] }),
    );
    execFileSync("bash", ["-eu", "-c", command], { cwd: root });
    assert.deepEqual(
      readFileSync(
        path.join(root, ".local/artifacts/release-amd64", artifact.file),
      ),
      readFileSync(path.join(root, "expected", artifact.file)),
    );
    // A rebuilt archive with unreviewed bytes must stop publication.
    rmSync(path.join(root, ".local/artifacts/release-amd64", artifact.file));
    writeFileSync(
      path.join(root, "compliance/source-materials.json"),
      JSON.stringify({ artifacts: [artifact] }),
    );
    const badLock = JSON.parse(locked);
    badLock[0].sha256 = "0".repeat(64);
    writeFileSync(
      path.join(root, "compliance/source-bundles.lock.json"),
      JSON.stringify(badLock),
    );
    assert.throws(
      () =>
        execFileSync("bash", ["-eu", "-c", command], {
          cwd: root,
          stdio: "pipe",
        }),
      /Restored source bundle differs from reviewed bytes/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("draft retry selector has the contents permission required to read drafts", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const selector = workflow.split("  select:\n")[1].split("  prepare:\n")[0];
  assert.match(selector, /permissions:\n      contents: write/);
});
