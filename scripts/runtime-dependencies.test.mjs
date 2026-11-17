import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runtimeManifest,
  assertLockedPackages,
} from "./runtime-dependencies.mjs";

test("runtime roots omit development tools but preserve runtime and native optional dependencies", () => {
  const source = {
    dependencies: { auth: "1.0.0" },
    optionalDependencies: { native: "1.0.0" },
    devDependencies: { testRunner: "1.0.0" },
    overrides: { transitive: "2.0.0" },
  };
  assert.deepEqual(runtimeManifest(source), {
    dependencies: source.dependencies,
    optionalDependencies: source.optionalDependencies,
    overrides: source.overrides,
  });
  assert.ok(source.devDependencies);
});

test("runtime lock may prune packages but cannot add or change locked artifacts", () => {
  const record = {
    version: "1.0.0",
    resolved: "https://example.test/pkg.tgz",
    integrity: "sha512-fixture",
  };
  const source = {
    packages: {
      "": {},
      "node_modules/runtime": record,
      "node_modules/dev": record,
    },
  };
  const runtime = {
    packages: { "": {}, "node_modules/runtime": { ...record } },
  };
  assert.doesNotThrow(() => assertLockedPackages(source, runtime));
  assert.throws(
    () =>
      assertLockedPackages(source, {
        packages: { "node_modules/new": record },
      }),
    /Runtime dependency changed/,
  );
  for (const key of ["version", "resolved", "integrity"]) {
    assert.throws(
      () =>
        assertLockedPackages(source, {
          packages: { "node_modules/runtime": { ...record, [key]: "changed" } },
        }),
      /Runtime dependency changed/,
    );
  }
});
