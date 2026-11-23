import test from "node:test";
import assert from "node:assert/strict";
import { runners } from "./ci-runners.mjs";

test("GitHub stays the default and both providers retain native architecture builds", () => {
  assert.deepEqual(runners(), runners("github"));
  assert.equal(runners().browser, "ubuntu-24.04");
  assert.deepEqual(
    runners().containers.include.map(({ runner }) => runner),
    ["ubuntu-24.04", "ubuntu-24.04-arm"],
  );
  assert.equal(runners("blacksmith").browser, "blacksmith-4vcpu-ubuntu-2404");
  assert.deepEqual(
    runners("blacksmith").containers.include.map(({ runner }) => runner),
    ["blacksmith-4vcpu-ubuntu-2404", "blacksmith-4vcpu-ubuntu-2404-arm"],
  );
  for (const provider of ["", "self-hosted", "toString"])
    assert.throws(() => runners(provider), /Runner provider/);
});
