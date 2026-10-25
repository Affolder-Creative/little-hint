import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  benchmarkPlan,
  benchmarkReport,
  EXPECTED_JOBS_PER_PROVIDER,
} from "./runner-benchmark.mjs";

const config = {
  sha: "a".repeat(40),
  providers: "both",
  cacheKey: "pilot-1",
  enabled: "true",
};
test("benchmark cannot schedule Blacksmith until installation is acknowledged", () => {
  assert.throws(
    () => benchmarkPlan({ ...config, enabled: "" }),
    /BLACKSMITH_ENABLED/,
  );
  const github = benchmarkPlan({ ...config, providers: "github", enabled: "" });
  assert.deepEqual(github["browser-runners"], [
    { name: "github", runner: "ubuntu-24.04" },
  ]);
  const both = benchmarkPlan(config);
  assert.equal(both["docker-runners"].length, 4);
  assert.ok(
    both["docker-runners"].some(
      (entry) =>
        entry.name === "blacksmith" &&
        entry.arch === "arm64" &&
        entry.runner.endsWith("2404-arm"),
    ),
  );
  for (const override of [
    { sha: "main" },
    { cacheKey: "../../ci" },
    { cacheKey: "bad\nkey" },
    { providers: "arbitrary-runner" },
  ])
    assert.throws(() => benchmarkPlan({ ...config, ...override }));
});

const time = (seconds) =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
const job = (name, start, end, conclusion = "success") => ({
  name,
  started_at: time(start),
  completed_at: time(end),
  conclusion,
});
test("report separates parallel compute time from completion latency across API pages", () => {
  const report = benchmarkReport(
    [
      { jobs: [job("prepare", 0, 5), job("docker / github / amd64", 10, 40)] },
      {
        jobs: [
          job("browser / github / e2e", 10, 30),
          job("docker / blacksmith / amd64", 7, 20),
          job("browser / blacksmith / e2e", 8, 25),
        ],
      },
    ],
    { ...config, layerCache: "false", expectedJobs: 2 },
  );
  assert.match(report, /github \| passed \| 35s \| 50s/);
  assert.match(report, /blacksmith \| passed \| 20s \| 30s/);
});

test("failed and missing jobs are not reported as successful benchmark samples", () => {
  const report = benchmarkReport(
    [
      {
        jobs: [
          job("prepare", 0, 5),
          job("docker / github / amd64", 10, 12, "failure"),
        ],
      },
    ],
    config,
  );
  assert.match(report, /github \| incomplete or failed/);
  assert.match(report, /blacksmith \| incomplete or failed \| unavailable/);
  assert.doesNotMatch(report, /\| passed \|/);
});

test("benchmark preserves current browser suites and application verification commands", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const benchmark = readFileSync(
    ".github/workflows/runner-benchmark.yml",
    "utf8",
  );
  const browser = (text) =>
    text.split("  browser:\n")[1].split("  containers:\n")[0];
  const suites = (text) =>
    browser(text)
      .match(/suite:\s*\[([^\]]+)\]/)[1]
      .split(",")
      .map((suite) => suite.trim())
      .filter(Boolean);
  assert.deepEqual(suites(benchmark), suites(ci));
  assert.equal(suites(benchmark).length + 2, EXPECTED_JOBS_PER_PROVIDER);
  const commands = (text) =>
    [...text.matchAll(/(?:- )?run: (.+)/g)]
      .map((match) => match[1])
      .filter((command) => command !== "|");
  assert.deepEqual(commands(browser(benchmark)), commands(browser(ci)));
  for (const step of [
    "Verify image architecture",
    "Container smoke test",
    "Staging stack smoke test",
    "Verify corresponding-source bundles against the actual image",
  ])
    assert.ok(
      benchmark.includes(
        ci
          .slice(ci.indexOf(`      - name: ${step}`))
          .split(/\n      - |\n  gate:/)[0],
      ),
      `${step} differs from CI`,
    );
  assert.ok(benchmark.includes("aquasecurity/trivy-action@"));
  assert.doesNotMatch(benchmark, /pull_request:|push:\n|secrets\./);
});
