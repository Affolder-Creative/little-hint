import test from "node:test";
import assert from "node:assert/strict";
import { acceptancePassed } from "./acceptance-result.mjs";
const complete = { expected: 102, unexpected: 0, flaky: 0, skipped: 0 };
test("acceptance requires a complete passing run", () => {
  assert.equal(acceptancePassed(0, complete), true);
});
for (const [name, code, stats] of [
  ["failed process", 1, complete],
  ["interrupted process", null, complete],
  ["missing report", 0, undefined],
  ["empty run", 0, { ...complete, expected: 0 }],
  ["failed tests", 0, { ...complete, unexpected: 1 }],
  ["skipped tests", 0, { ...complete, skipped: 1 }],
  ["flaky tests", 0, { ...complete, flaky: 1 }],
])
  test(`acceptance rejects ${name}`, () =>
    assert.equal(acceptancePassed(code, stats), false));
