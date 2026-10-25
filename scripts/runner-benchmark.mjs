import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Checked against the workflow matrices in runner-benchmark.test.mjs.
export const EXPECTED_JOBS_PER_PROVIDER = 10;

export function benchmarkPlan({ sha, providers, cacheKey, enabled }) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? ""))
    throw new Error(
      "Use a full lowercase commit SHA, not a moving branch or tag.",
    );
  if (!["github", "blacksmith", "both"].includes(providers))
    throw new Error("Choose github, blacksmith, or both.");
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(cacheKey ?? ""))
    throw new Error(
      "Cache key must contain 1–32 lowercase letters, digits, or hyphens.",
    );
  if (providers !== "github" && enabled !== "true")
    throw new Error(
      "Install Blacksmith for this repository, then set the repository Actions variable BLACKSMITH_ENABLED=true before selecting Blacksmith runners.",
    );
  const names = providers === "both" ? ["github", "blacksmith"] : [providers];
  const runner = (name) =>
    name === "github" ? "ubuntu-24.04" : "blacksmith-4vcpu-ubuntu-2404";
  return {
    sha,
    "browser-runners": names.map((name) => ({ name, runner: runner(name) })),
    "docker-runners": names.flatMap((name) =>
      ["amd64", "arm64"].map((arch) => ({
        name,
        arch,
        runner: runner(name) + (arch === "arm64" ? "-arm" : ""),
      })),
    ),
  };
}

const seconds = (start, end) => {
  const duration = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
};
const durationText = (value) => (value === null ? "unavailable" : `${value}s`);
const cell = (value) => String(value ?? "unknown").replace(/[|\r\n]/g, " ");

export function benchmarkReport(pages, metadata) {
  const jobs = pages.flatMap((page) => page.jobs ?? []);
  const workloads = jobs.filter((job) =>
    /^(browser|docker) \/ /.test(job.name),
  );
  const ready = jobs.find((job) => job.name === "prepare")?.completed_at;
  const names =
    metadata.providers === "both"
      ? ["github", "blacksmith"]
      : [metadata.providers];
  const lines = [
    "# Runner benchmark",
    "",
    `Commit: \`${cell(metadata.sha)}\`. Cache key: \`${cell(metadata.cacheKey)}\`. Blacksmith build-layer cache: ${cell(metadata.layerCache)}.`,
    "",
    "Times include setup and cleanup. Provider completion is measured from the shared prepare job finishing; summed job time is compute usage, not PR wait time.",
    "",
    "| Provider | Result | Completion after prepare | Summed job time |",
    "| --- | --- | --- | --- |",
  ];
  for (const name of names) {
    const selected = workloads.filter(
      (job) => job.name.split(" / ")[1] === name,
    );
    const durations = selected.map((job) =>
      seconds(job.started_at, job.completed_at),
    );
    const complete =
      selected.length ===
        (metadata.expectedJobs ?? EXPECTED_JOBS_PER_PROVIDER) &&
      durations.every((value) => value !== null);
    const passed =
      complete && selected.every((job) => job.conclusion === "success");
    const last = selected.map((job) => Date.parse(job.completed_at));
    const completion = complete
      ? seconds(ready, new Date(Math.max(...last)).toISOString())
      : null;
    lines.push(
      `| ${cell(name)} | ${passed ? "passed" : "incomplete or failed"} | ${durationText(completion)} | ${durationText(complete ? durations.reduce((a, b) => a + b, 0) : null)} |`,
    );
  }
  lines.push(
    "",
    "| Job | Result | Start after prepare | Elapsed |",
    "| --- | --- | --- | --- |",
  );
  for (const job of workloads) {
    lines.push(
      `| ${cell(job.name)} | ${cell(job.conclusion)} | ${durationText(seconds(ready, job.started_at))} | ${durationText(seconds(job.started_at, job.completed_at))} |`,
    );
  }
  lines.push(
    "",
    "## Step timings",
    "",
    "| Job | Step | Result | Elapsed |",
    "| --- | --- | --- | --- |",
  );
  for (const job of workloads) {
    for (const step of job.steps ?? []) {
      if (step.conclusion === "skipped") continue;
      lines.push(
        `| ${cell(job.name)} | ${cell(step.name)} | ${cell(step.conclusion)} | ${durationText(seconds(step.started_at, step.completed_at))} |`,
      );
    }
  }
  lines.push(
    "",
    "Use only passing, complete runs for speed comparisons. A new cache key resets the benchmark Docker build cache, not shared npm, source, registry, or Blacksmith container-image caches. Compare several runs of the same commit and configuration; do not label a run fully cold without checking those caches.",
    "",
  );
  return lines.join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const env = process.env;
  if (process.argv[2] === "plan") {
    const plan = benchmarkPlan({
      sha: env.BENCHMARK_SHA,
      providers: env.BENCHMARK_PROVIDERS,
      cacheKey: env.BENCHMARK_CACHE_KEY,
      enabled: env.BLACKSMITH_ENABLED,
    });
    appendFileSync(
      env.GITHUB_OUTPUT,
      Object.entries(plan)
        .map(
          ([key, value]) =>
            `${key}=${typeof value === "string" ? value : JSON.stringify(value)}\n`,
        )
        .join(""),
    );
  } else if (process.argv[2] === "report") {
    console.log(
      benchmarkReport(JSON.parse(readFileSync(process.argv[3], "utf8")), {
        sha: env.BENCHMARK_SHA,
        providers: env.BENCHMARK_PROVIDERS,
        cacheKey: env.BENCHMARK_CACHE_KEY,
        layerCache: env.BENCHMARK_LAYER_CACHE,
      }),
    );
  } else throw new Error("Use plan or report.");
}
