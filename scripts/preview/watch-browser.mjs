// Acceptance against a disposable watch checkout. Never pass a working checkout.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, rename, rm, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
const root = await realpath(resolve(process.argv[2] || ""));
assert.ok(
  root.startsWith((await realpath(tmpdir())) + "/little-hint-watch-check-"),
);
const session = JSON.parse(
  await readFile(resolve(root, ".local/preview/session.json"), "utf8"),
);
assert.equal(session.watch, true);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const originals = new Map();
async function edit(file, transform) {
  const path = resolve(root, file);
  const source = await readFile(path, "utf8");
  if (!originals.has(path)) originals.set(path, source);
  await writeFile(path + ".edit", transform(source));
  await rename(path + ".edit", path);
}
async function until(probe) {
  for (let n = 0; n < 100; n++) {
    if (await probe().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Live update timed out");
}
try {
  await page.goto(session.origin);
  await page
    .getByRole("button", { name: "Send me a code", exact: true })
    .waitFor();
  await edit("src/client/Login.tsx", (s) =>
    s.replace('"Send me a code"', '"Watch update verified"'),
  );
  await page
    .getByRole("button", { name: "Watch update verified", exact: true })
    .waitFor();
  await edit(
    "src/client/style.css",
    (s) => s + "\nbody { --watch-test: updated; }\n",
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.body)
        .getPropertyValue("--watch-test")
        .trim() === "updated",
  );
  await edit("src/server/app.ts", (s) =>
    s.replace(
      'status: "ok", app: "little-hint"',
      'status: "watch-verified", app: "little-hint"',
    ),
  );
  await until(
    async () =>
      (await (await fetch(session.origin + "/api/health")).json()).status ===
      "watch-verified",
  );
  await edit("src/client/Login.tsx", (s) => s + "\nconst = syntax error;\n");
  await page.locator("vite-error-overlay").waitFor();
  await edit("src/client/Login.tsx", () =>
    originals.get(resolve(root, "src/client/Login.tsx")),
  );
  await page
    .getByRole("button", { name: "Send me a code", exact: true })
    .waitFor();
  await page.locator("vite-error-overlay").waitFor({ state: "detached" });
  await edit("src/server/worker.ts", (s) =>
    s.replace("Little Hint worker ready.", "Watch worker verified."),
  );
  await until(async () =>
    execFileSync("docker", ["logs", `${session.project}-worker-1`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).includes("Watch worker verified."),
  );
  const asset = resolve(root, "public/watch-check.txt");
  await writeFile(asset, "live asset");
  try {
    await until(
      async () =>
        (await (await fetch(session.origin + "/watch-check.txt")).text()) ===
        "live asset",
    );
  } finally {
    await rm(asset);
  }
  for (const path of [
    "/.env",
    "/src/server/app.ts",
    "/@fs/app/.local/preview/runtime.env",
  ]) {
    const body = await (await fetch(session.origin + path)).text();
    assert.ok(
      !body.includes("BETTER_AUTH_SECRET") &&
        !body.includes('from "./deployment"'),
    );
  }
  assert.equal(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((r) => r.length),
    ),
    0,
  );
  assert.equal(
    JSON.parse(
      await readFile(resolve(root, ".local/preview/session.json"), "utf8"),
    ).origin,
    session.origin,
  );
  console.log(
    "Passed: React/CSS HMR, atomic saves, API/worker restart, syntax recovery, public assets, source isolation, no service worker, stable origin.",
  );
} finally {
  for (const [path, source] of originals) await writeFile(path, source);
  await browser.close();
}
