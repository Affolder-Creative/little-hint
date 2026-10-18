import test from "node:test";
import assert from "node:assert/strict";
import { approved, matches, inventory } from "./licenses.mjs";
import { missingSources, sourceRequirements } from "./release-sources.mjs";
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { aliases } from "./release-aliases.mjs";
import { validateIdentity } from "./release-ref.mjs";
const policy = JSON.parse(readFileSync("compliance/policy.json"));
test("publication requires the checked commit and matching stable version", () => {
  const sha = "a".repeat(40),
    ref = { type: "commit", sha };
  assert.doesNotThrow(() => validateIdentity(ref, "v0.1.0", "0.1.0", sha));
  assert.throws(
    () => validateIdentity(ref, "v0.1.0", "0.1.0", "b".repeat(40)),
    /exact commit/,
  );
  assert.throws(
    () => validateIdentity({ ...ref, type: "tag" }, "v0.1.0", "0.1.0", sha),
    /exact commit/,
  );
  assert.throws(
    () => validateIdentity(ref, "v0.1.0", "0.2.0", sha),
    /versions disagree/,
  );
  assert.throws(
    () => validateIdentity(ref, "v01.1.0", "01.1.0", sha),
    /stable/,
  );
  assert.throws(
    () => validateIdentity(ref, "v0.1.0-rc.1", "0.1.0-rc.1", sha),
    /stable/,
  );
});
test("a permissive SPDX label does not substitute for license text", () => {
  const root = mkdtempSync(path.join(tmpdir(), "little-hint-notices-"));
  try {
    const pkg = { name: "fixture", version: "1.0.0", license: "MIT" };
    mkdirSync(path.join(root, "node_modules/fixture"), { recursive: true });
    writeFileSync(
      path.join(root, "package-lock.json"),
      JSON.stringify({ packages: { "node_modules/fixture": pkg } }),
    );
    writeFileSync(
      path.join(root, "node_modules/fixture/package.json"),
      JSON.stringify(pkg),
    );
    assert.deepEqual(inventory(root, policy).errors, [
      "Missing license text: fixture@1.0.0",
    ]);
    const devPolicy = {
      ...policy,
      developmentNoticeGaps: { "fixture@1.0.0": "Documented build-tool gap" },
    };
    assert.deepEqual(inventory(root, devPolicy).errors, [
      "Missing license text: fixture@1.0.0",
    ]);
    writeFileSync(
      path.join(root, "package-lock.json"),
      JSON.stringify({
        packages: { "node_modules/fixture": { ...pkg, dev: true } },
      }),
    );
    assert.deepEqual(inventory(root, devPolicy).errors, []);
    assert.equal(
      inventory(root, devPolicy).packages[0].noticeGap,
      "Documented build-tool gap",
    );
    assert.deepEqual(
      inventory(root, {
        ...devPolicy,
        developmentNoticeGaps: { "fixture@2.0.0": "Different version" },
      }).errors,
      ["Missing license text: fixture@1.0.0"],
    );
    writeFileSync(
      path.join(root, "node_modules/fixture/LICENSE"),
      "A preserved upstream notice",
    );
    assert.deepEqual(inventory(root, policy).errors, []);
    writeFileSync(
      path.join(root, "node_modules/fixture/package.json"),
      JSON.stringify({ ...pkg, version: "2.0.0" }),
    );
    assert.deepEqual(inventory(root, policy).errors, [
      "Installed package differs from lockfile: node_modules/fixture",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("license review is scoped to package, version and expression", () => {
  assert.ok(approved("react", "19.3.1", "MIT", policy));
  assert.ok(
    approved("lightningcss-linux-x64-musl", "1.33.0", "MPL-2.0", policy),
  );
  assert.equal(
    approved("lightningcss-linux-x64-musl", "2.0.0", "MPL-2.0", policy),
    false,
  );
  assert.equal(approved("other", "1.33.0", "MPL-2.0", policy), false);
  assert.equal(approved("react", "19.3.1", undefined, policy), false);
  assert.equal(
    matches("lightningcss-*@1.33.0", "lightningcss-x@1x33x0"),
    false,
  );
});
test("source gate includes native dependencies and OS source revisions", () => {
  const required = sourceRequirements(
    [
      {
        name: "vips-wrapper",
        version: "1",
        license: "LGPL-3.0-or-later",
        nativeLibraries: { vips: "8.18.7" },
      },
    ],
    "P:busybox\nV:1\nL:GPL-2.0-only\nc:abc\n\nP:zlib\nV:2\nL:Zlib\n",
  );
  assert.deepEqual(required, [
    "apk:busybox@1#abc",
    "native:vips@8.18.7",
    "npm:vips-wrapper@1",
  ]);
  assert.deepEqual(missingSources(required, []), required);
  const artifact = {
    file: "sources.tar.gz",
    covers: required,
    url: "https://example.test/source",
    sha256: "a".repeat(64),
    review: "Exact sources, patches and build inputs reviewed.",
  };
  assert.deepEqual(missingSources(required, [artifact]), []);
  assert.deepEqual(
    missingSources(required, [{ ...artifact, sha256: "" }]),
    required,
  );
  assert.deepEqual(
    missingSources(required, [{ ...artifact, file: "../sources.tar.gz" }]),
    required,
  );
});
test("retrying an older release cannot roll aliases backward", () => {
  assert.deepEqual(aliases(["0.1.0", "sha-abc"], "0.1.0"), ["0.1", "latest"]);
  assert.deepEqual(aliases(["0.1.1"], "0.1.0"), []);
  assert.deepEqual(aliases(["1.0.0"], "0.1.0"), ["0.1"]);
  assert.deepEqual(aliases(["0.1.9", "0.1.10"], "0.1.10"), ["0.1", "latest"]);
  assert.throws(() => aliases([], "v0.1.0"));
});
