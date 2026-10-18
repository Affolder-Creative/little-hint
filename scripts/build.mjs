import { spawnSync } from "node:child_process";
// A development .env must never disable production React or the service worker.
const env = { ...process.env, NODE_ENV: "production" };
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const args of [
  ["exec", "--", "tsc", "--noEmit"],
  ["exec", "--", "vite", "build"],
  ["exec", "--", "node", "scripts/build-sw.mjs"],
  [
    "exec",
    "--",
    "tsup",
    "src/server/index.ts",
    "src/server/worker.ts",
    "src/server/cli.ts",
    "--format",
    "esm",
    "--out-dir",
    "dist/server",
    "--external",
    "pg-native",
  ],
]) {
  const result = spawnSync(npm, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
