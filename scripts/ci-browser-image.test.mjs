import test from "node:test";
import assert from "node:assert/strict";
import { browserImage } from "./ci-browser-image.mjs";

const lock = (version) => ({
  packages: Object.fromEntries(
    ["@playwright/test", "playwright", "playwright-core"].map((name) => [
      `node_modules/${name}`,
      { version },
    ]),
  ),
});

test("browser image follows the exact locked version, including dependency updates", () => {
  for (const version of ["1.64.1", "1.65.0"])
    assert.equal(
      browserImage(lock(version)),
      `mcr.microsoft.com/playwright:v${version}-noble`,
    );
});

test("missing, mismatched and non-stable browser versions fail closed", () => {
  for (const value of [
    {},
    lock(undefined),
    lock("1.64.1-beta"),
    lock("latest"),
  ])
    assert.throws(() => browserImage(value), /locked stable version/);
  const mismatched = lock("1.64.1");
  mismatched.packages["node_modules/playwright-core"].version = "1.65.0";
  assert.throws(() => browserImage(mismatched), /locked stable version/);
});
