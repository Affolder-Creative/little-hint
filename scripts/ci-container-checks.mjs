import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { finished } from "node:stream/promises";

export function checkLanes(arch) {
  if (!["amd64", "arm64"].includes(arch))
    throw new Error("Supply amd64 or arm64.");
  const lanes = [
    [
      {
        name: "image-smoke",
        command: "bash",
        args: ["scripts/smoke-image.sh"],
      },
      { name: "upgrade", command: "node", args: ["scripts/upgrade-check.mjs"] },
    ],
  ];
  if (arch === "amd64")
    lanes.push([
      {
        name: "staging-smoke",
        command: "bash",
        args: ["scripts/smoke-staging.sh"],
      },
      {
        name: "preview-smoke",
        command: "node",
        args: ["scripts/preview/smoke.mjs"],
      },
    ]);
  return lanes;
}

// Each check owns its Compose projects. Their names are recorded before startup
// so cancellation can also clean up synchronous Node scripts and descendants.
export async function cleanupProjects(registry, docker = spawnSync) {
  const projects = new Set(
    (
      await readFile(registry, "utf8").catch((error) => {
        if (error.code === "ENOENT") return "";
        throw error;
      })
    )
      .split("\n")
      .filter(Boolean),
  );
  for (const project of projects) {
    if (!/^[a-z0-9][a-z0-9_-]+$/.test(project))
      throw new Error("Invalid disposable Compose project.");
    for (const [kind, list, remove] of [
      ["container", ["ps", "-aq"], ["rm", "-f"]],
      ["volume", ["volume", "ls", "-q"], ["volume", "rm"]],
      ["network", ["network", "ls", "-q"], ["network", "rm"]],
    ]) {
      const found = docker(
        "docker",
        [...list, "--filter", `label=com.docker.compose.project=${project}`],
        { encoding: "utf8", timeout: 30_000 },
      );
      if (found.error || found.status !== 0)
        throw new Error(`Cannot list ${kind}s for ${project}.`);
      const ids = found.stdout.trim().split(/\s+/).filter(Boolean);
      if (ids.length) {
        const removed = docker("docker", [...remove, ...ids], {
          encoding: "utf8",
          timeout: 60_000,
        });
        if (removed.error || removed.status !== 0)
          throw new Error(`Cannot clean ${kind}s for ${project}.`);
      }
    }
  }
}

export async function runLanes(
  lanes,
  { logDir, env = process.env, signal } = {},
) {
  await mkdir(logDir, { recursive: true });
  const children = new Set();
  const timers = new Map();
  const kill = (child, signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const cancel = () => {
    for (const child of children) {
      kill(child, "SIGTERM");
      // Kill remaining descendants even if the group leader exits first.
      timers.set(
        child,
        setTimeout(() => kill(child, "SIGKILL"), 10_000),
      );
    }
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const results = [];
  try {
    await Promise.all(
      lanes.map(async (lane) => {
        for (const { name, command, args } of lane) {
          if (signal?.aborted) break;
          const started = performance.now();
          const log = createWriteStream(resolve(logDir, `${name}.log`));
          console.log(`Starting ${name}`);
          const child = spawn(command, args, {
            env,
            detached: true,
            stdio: ["ignore", "pipe", "pipe"],
          });
          children.add(child);
          child.stdout.pipe(log, { end: false });
          child.stderr.pipe(log, { end: false });
          const code = await new Promise((resolve) => {
            child.once("error", (error) => {
              log.write(`${error.message}\n`);
              resolve(1);
            });
            child.once("close", (code) => resolve(code ?? 1));
          });
          log.end();
          await finished(log);
          if (timers.has(child)) {
            clearTimeout(timers.get(child));
            kill(child, "SIGKILL");
            timers.delete(child);
          }
          children.delete(child);
          const result = {
            name,
            code,
            seconds: Math.round((performance.now() - started) / 100) / 10,
          };
          results.push(result);
          console.log(
            `${code === 0 ? "PASS" : "FAIL"} ${name} (${result.seconds}s). Log: ${logDir}/${name}.log`,
          );
          if (code !== 0) {
            console.error(
              (await readFile(resolve(logDir, `${name}.log`), "utf8")).slice(
                -8000,
              ),
            );
            break;
          }
        }
      }),
    );
  } finally {
    signal?.removeEventListener("abort", cancel);
  }
  return {
    results,
    code: signal?.aborted
      ? 130
      : results.some((result) => result.code !== 0)
        ? 1
        : 0,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const lanes = checkLanes(process.argv[2]);
  const logDir = resolve(".local/ci-logs/containers");
  await mkdir(logDir, { recursive: true });
  const registry = resolve(logDir, "projects.txt");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const { results, code } = await runLanes(lanes, {
      logDir,
      signal: controller.signal,
      env: { ...process.env, CI_CONTAINER_PROJECTS_FILE: registry },
    });
    process.exitCode = code;
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(
        process.env.GITHUB_STEP_SUMMARY,
        `\n| Container check | Seconds | Result |\n| --- | ---: | --- |\n${results.map(({ name, seconds, code }) => `| ${name} | ${seconds} | ${code === 0 ? "passed" : "failed"} |\n`).join("")}`,
      );
  } finally {
    await cleanupProjects(registry);
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}
