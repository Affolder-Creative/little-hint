import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, copyFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer, request } from "node:http";

const suite = process.argv[2];
if (
  ![
    "e2e",
    "sign-in",
    "list-features",
    "group-events",
    "polish",
    "pwa",
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
const backendPort = await freePort();
const env = {
  ...process.env,
  NODE_ENV: "test",
  APP_URL: `http://localhost:${port}`,
  PORT: backendPort,
  E2E_BASE_URL: `http://localhost:${port}`,
  E2E_BUILT: "1",
  CI: "true",
  SMTP_HOST: "",
  TELEGRAM_BOT_TOKEN: "",
  OPENAI_API_KEY: "",
};
await mkdir("test-results", { recursive: true });
await mkdir(".local/ci-logs", { recursive: true });
const children = [];
// Built pages serve static assets through Fastify's real IP rate limiter.
// Pace the test client instead of weakening or disabling production limits.
let nextRequest = 0;
const proxy = createHttpServer((incoming, response) => {
  const scheduled = Math.max(Date.now(), nextRequest);
  nextRequest = scheduled + 600; // At most 100 requests/minute, below the real 150.
  const timer = setTimeout(() => {
    if (incoming.destroyed) return;
    const upstream = request(
      {
        hostname: "127.0.0.1",
        port: backendPort,
        path: incoming.url,
        method: incoming.method,
        headers: incoming.headers,
      },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      },
    );
    upstream.on("error", () => {
      response.writeHead(502);
      response.end();
    });
    incoming.pipe(upstream);
  }, scheduled - Date.now());
  incoming.once("error", () => clearTimeout(timer));
});
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
  await new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(Number(port), "127.0.0.1", resolve);
  });
  await run("node", ["dist/server/cli.js", "demo"]).done;
  for (const service of ["index", "worker"]) {
    const log = createWriteStream(`.local/ci-logs/${suite}-${service}.log`);
    const process = run("node", [`dist/server/${service}.js`], {
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
      ready = (await fetch(`http://127.0.0.1:${backendPort}/api/health`)).ok;
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
  proxy.closeAllConnections();
  await new Promise((resolve) => proxy.close(resolve));
  await mkdir("test-results", { recursive: true });
  for (const service of ["index", "worker"]) {
    await copyFile(
      `.local/ci-logs/${suite}-${service}.log`,
      `test-results/${service}.log`,
    ).catch(() => {});
  }
}
