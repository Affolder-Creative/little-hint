import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, copyFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";

const suite = process.argv[2];
if (
  ![
    "e2e",
    "sign-in",
    "list-features",
    "group-events",
    "polish",
    "critique",
    "pwa",
    "notifications",
  ].includes(suite)
)
  throw new Error("Supply one known browser suite.");
if (new URL(process.env.DATABASE_URL).pathname !== "/little_hint_e2e")
  throw new Error("Browser CI requires an isolated little_hint_e2e database.");
// Pick a free port so a local app cannot accidentally satisfy CI readiness.
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(String(port))));
    });
  });
const port = await freePort();
const env = {
  ...process.env,
  NODE_ENV: "test",
  APP_ENV: "test",
  APP_URL: `http://localhost:${port}`,
  PORT: port,
  E2E_BASE_URL: `http://localhost:${port}`,
  E2E_BUILT: "1",
  E2E_BROWSER_TEST_SERVER: "1",
  CI: "true",
  SMTP_HOST: "",
  TELEGRAM_BOT_TOKEN: "",
  OPENAI_API_KEY: "",
};
await mkdir("test-results", { recursive: true });
await mkdir(".local/ci-logs", { recursive: true });
const children = [];
function run(command, args, options = {}) {
  const child = spawn(command, args, { env, stdio: "inherit", ...options });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited ${code ?? signal}`)),
    );
  });
  return { child, done };
}
async function stop() {
  for (const child of children) child.kill("SIGTERM");
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) return resolve();
          const timer = setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 5000);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        }),
    ),
  );
}
try {
  await run("npx", [
    "--no-install",
    "tsup",
    "tests/browser-server.ts",
    "--format",
    "esm",
    "--out-dir",
    ".local/browser-server",
    "--external",
    "pg-native",
  ]).done;
  await run("node", ["dist/server/cli.js", "demo"]).done;
  for (const service of ["index", "worker"]) {
    const log = createWriteStream(`.local/ci-logs/${suite}-${service}.log`);
    const entry =
      service === "index"
        ? ".local/browser-server/browser-server.js"
        : "dist/server/worker.js";
    const process = run("node", [entry], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.push(process.child);
    process.child.stdout.pipe(log);
    process.child.stderr.pipe(log);
    process.done.catch(() => {}); // Readiness and the browser command report failures.
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (children.some((child) => child.exitCode !== null))
      throw new Error("A browser test service exited. See test-results/*.log.");
    try {
      ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok;
    } catch {}
    if (ready) break;
    await delay(1000);
  }
  if (!ready) throw new Error("App did not become healthy.");
  await run("npx", [
    "--no-install",
    "playwright",
    "test",
    `tests/${suite}.spec.ts`,
  ]).done;
} finally {
  await stop();
  await mkdir("test-results", { recursive: true });
  for (const service of ["index", "worker"]) {
    await copyFile(
      `.local/ci-logs/${suite}-${service}.log`,
      `test-results/${service}.log`,
    ).catch(() => {});
  }
}
