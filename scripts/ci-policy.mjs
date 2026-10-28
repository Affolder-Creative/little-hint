import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const checks = ["integration", "browser", "containers", "brand"];
const selection = (enabled) =>
  Object.fromEntries(checks.map((check) => [check, enabled]));

export function classifyPaths(paths) {
  const selected = selection(false);
  for (const file of paths) {
    // Shared tooling can change how any check behaves. Unknown files also run
    // everything, so new inputs cannot silently escape validation.
    if (
      file === ".github/workflows/ci.yml" ||
      /^(package(?:-lock)?\.json|tsconfig\.json|vite\.config\.ts)$/.test(
        file,
      ) ||
      /^scripts\/(ci.*|build(?:-sw)?\.mjs|tooling\.test\.mjs)$/.test(file)
    )
      return selection(true);

    // These workflows/settings do not execute the application. Quality still
    // validates workflow syntax; the Pages workflow validates its own site.
    if (
      [
        ".github/workflows/pages.yml",
        ".github/workflows/pr-title.yml",
        ".github/dependabot.yml",
        ".github/rulesets/main.json",
      ].includes(file)
    )
      continue;
    if (
      /^\.github\/workflows\/(?:release|staging|security|migrate-release-images)\.yml$/.test(
        file,
      )
    ) {
      selected.containers = true;
      continue;
    }

    if (
      /^(docs|marketing|design|\.impeccable)\//.test(file) ||
      /^[^/]+\.md$/.test(file) ||
      /^scripts\/(?:check-marketing|test-marketing|preview-marketing|capture-marketing-social)\.mjs$/.test(
        file,
      ) ||
      file === "scripts/capture-marketing.ts"
    )
      continue;
    if (file.startsWith("brand/") || file === "scripts/audit-brand.py") {
      selected.brand = true;
      continue;
    }
    if (file.startsWith("compliance/") || file === "scripts/licenses.mjs") {
      selected.containers = selected.brand = true;
      continue;
    }
    if (
      /^(Dockerfile|\.dockerignore|LICENSE|compose(?:\.[\w-]+)?\.ya?ml|\.env(?:\.production)?\.example|release-please-config\.json|\.release-please-manifest\.json)$/.test(
        file,
      ) ||
      /^scripts\/(?:release-[\w-]+\.mjs|publish-release\.sh|release-image\.sh|smoke-image\.sh|registry-tags\.mjs|bundle-sources\.py|test_bundle_sources\.py|vendor-source-crates\.py)$/.test(
        file,
      )
    ) {
      selected.containers = true;
      continue;
    }
    if (/^src\/(server|shared)\//.test(file)) {
      selected.integration = selected.browser = true;
      if (/^src\/server\/(index|worker|cli)\.ts$/.test(file))
        selected.containers = true;
      continue;
    }
    if (
      /^(src\/client|public)\//.test(file) ||
      file === "index.html" ||
      file === "playwright.config.ts" ||
      file === "tests/browser-server.ts" ||
      /^tests\/.*\.spec\.ts$/.test(file) ||
      file === "tests/browser-helpers.ts"
    ) {
      selected.browser = true;
      continue;
    }
    if (
      /^tests\/(?:integration|staging-seed\.integration|preview-seed\.integration)\.test\.ts$/.test(
        file,
      )
    ) {
      selected.integration = true;
      continue;
    }
    // Unit tests still run in the unconditional quality job.
    if (/^tests\/.*\.test\.ts$/.test(file)) continue;
    return selection(true);
  }
  return selected;
}

export function changedPaths(base, head, cwd = process.cwd()) {
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha ?? "")))
    throw new Error("A complete PR base and head SHA are required.");
  // No rename detection: both old and new paths affect selection. NUL
  // delimiters preserve spaces/newlines; no GitHub API pagination/path limit.
  return execFileSync(
    "git",
    ["diff", "--name-only", "--no-renames", "-z", `${base}...${head}`, "--"],
    {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
    .split("\0")
    .filter(Boolean);
}

export function selectChecks(
  { eventName, ref, base, head },
  diff = changedPaths,
) {
  if (eventName !== "pull_request" || ref)
    return {
      selected: selection(true),
      reason: "Full validation for a manual or reusable CI run.",
    };
  try {
    return {
      selected: classifyPaths(diff(base, head)),
      reason: "Selected from the complete PR diff.",
    };
  } catch {
    return {
      selected: selection(true),
      reason: "PR diff unavailable; running full validation.",
    };
  }
}

export function gateErrors(jobs) {
  const errors = [];
  for (const name of ["changes", "quality"])
    if (jobs?.[name]?.result !== "success")
      errors.push(`${name} must succeed.`);
  for (const name of checks) {
    const enabled = jobs?.changes?.outputs?.[name];
    if (enabled !== "true" && enabled !== "false") {
      errors.push(`Missing or invalid selection for ${name}.`);
      continue;
    }
    const result =
      name === "brand" ? jobs?.quality?.outputs?.brand : jobs?.[name]?.result;
    if (result !== "success" && !(enabled === "false" && result === "skipped"))
      errors.push(`${name}: ${result ?? "missing"}; selected=${enabled}.`);
  }
  return errors;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === "select") {
    const { selected, reason } = selectChecks({
      eventName: process.env.CI_EVENT_NAME,
      ref: process.env.CI_REF,
      base: process.env.PR_BASE_SHA,
      head: process.env.PR_HEAD_SHA,
    });
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      checks.map((name) => `${name}=${selected[name]}\n`).join(""),
    );
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${reason}\n\n| Check | Selected |\n| --- | --- |\n${checks.map((name) => `| ${name} | ${selected[name]} |\n`).join("")}`,
    );
  } else if (process.argv[2] === "gate") {
    const errors = gateErrors(JSON.parse(process.env.RESULTS));
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    }
  } else {
    throw new Error("Use select or gate.");
  }
}
