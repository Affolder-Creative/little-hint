import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preview } from "vite";
import { chromium, firefox, webkit } from "@playwright/test";
import { acceptancePassed } from "./acceptance-result.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const startedAt = new Date().toISOString();
const artifacts = path.join(
  root,
  ".local/acceptance",
  startedAt.replaceAll(":", "-"),
);
await mkdir(artifacts, { recursive: true });
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const status = git("status", "--porcelain", "--untracked-files=all");
const evidence = {
  startedAt,
  source: { commit: git("rev-parse", "HEAD"), clean: status === "", status },
  scope:
    "Production frontend with synthetic API fixtures; no deployed-service, real-device, provider, or screen-reader certification.",
  browsers: {},
  passed: false,
};
function run(script, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}
let server;
try {
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch(
      name === "chromium" ? { channel: "chromium" } : {},
    );
    try {
      evidence.browsers[name] = browser.version();
    } finally {
      await browser.close();
    }
  }
  if (
    (await run(path.join(root, "node_modules/vite/bin/vite.js"), ["build"])) !==
    0
  )
    throw new Error("Production frontend build failed.");
  server = await preview({
    root,
    preview: { host: "127.0.0.1", port: 0, strictPort: true, proxy: {} },
  });
  const port = server.httpServer.address().port;
  const code = await run(
    path.join(root, "node_modules/@playwright/test/cli.js"),
    ["test", "--config=playwright.acceptance.config.ts"],
    {
      E2E_BASE_URL: `http://127.0.0.1:${port}`,
      E2E_BUILT: "1",
      ACCEPTANCE_ARTIFACT_DIR: artifacts,
    },
  );
  const report = JSON.parse(
    await readFile(path.join(artifacts, "results.json"), "utf8"),
  );
  evidence.stats = report.stats;
  evidence.passed = acceptancePassed(code, report.stats);
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
} finally {
  if (server) {
    await new Promise((resolve) =>
      server.httpServer.close((error) => {
        if (error) {
          evidence.error = `Preview shutdown failed: ${error.message}`;
          evidence.passed = false;
        }
        resolve();
      }),
    );
  }
  evidence.finishedAt = new Date().toISOString();
  await writeFile(
    path.join(artifacts, "evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(`Acceptance evidence: ${artifacts}`);
  if (!evidence.passed) {
    console.error(
      evidence.error ??
        "Acceptance checks failed, skipped, or were incomplete. See results.json.",
    );
    process.exitCode = 1;
  }
}
