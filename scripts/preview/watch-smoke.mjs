// Build and exercise a disposable checkout; never mutate the developer's source/data.
import { mkdtemp, cp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkoutIdentity, dockerEnvironment } from "./config.mjs";
const source = fileURLToPath(new URL("../../", import.meta.url));
const root = await realpath(
  await mkdtemp(join(tmpdir(), "little-hint-watch-check-")),
);
const project = checkoutIdentity(root);
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env: dockerEnvironment(),
    stdio: "inherit",
    timeout: 20 * 60_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited with ${result.status}`);
}
try {
  for (const name of [
    "package.json",
    "package-lock.json",
    "Dockerfile",
    "Dockerfile.preview-watch",
    ".dockerignore",
    "compose.preview.yaml",
    "compose.preview-watch.yaml",
    "tsconfig.json",
    "vite.config.ts",
    "index.html",
    "LICENSE",
    "src",
    "scripts",
    "public",
    "compliance",
  ]) {
    await cp(join(source, name), join(root, name), { recursive: true });
  }
  run(process.execPath, [
    "scripts/preview.mjs",
    "start",
    "--watch",
    ...(process.argv.includes("--share") ? ["--share"] : []),
  ]);
  run(
    process.execPath,
    [join(source, "scripts/preview/watch-browser.mjs"), root],
    source,
  );
} finally {
  try {
    run("docker", [
      "compose",
      "--env-file",
      ".local/preview/compose.env",
      "-p",
      project,
      "-f",
      "compose.preview.yaml",
      "-f",
      "compose.preview-watch.yaml",
      "--profile",
      "share",
      "--profile",
      "tools",
      "down",
      "--volumes",
      "--remove-orphans",
    ]);
    await rm(root, { recursive: true, force: true });
  } catch (error) {
    console.error(
      `Disposable preview cleanup failed at ${root}: ${error.message}`,
    );
    process.exitCode = 1;
  }
}
