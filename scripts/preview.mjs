#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  realpath,
} from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  parseArgs,
  checkoutIdentity,
  dockerEnvironment,
  newState,
  validateState,
  runtimeConfiguration,
  envFile,
  publishedPort,
  tunnelURL,
  gatewayConfiguration,
  dataVolumes,
  newContainers,
} from "./preview/config.mjs";

export async function acquireLock(directory) {
  const lock = resolve(directory, "operation.lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(
      `Another preview operation holds ${lock}. If its process is no longer running, remove this lock directory and retry.`,
    );
  }
  await writeFile(
    resolve(lock, "owner.json"),
    JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
  );
  return () => rm(lock, { recursive: true, force: true });
}

async function json(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function atomicWrite(file, contents, mode = 0o600) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { mode });
  await rename(temporary, file);
}

export async function waitFor(label, probe, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await probe();
    if (result) return result;
    await delay(1000);
  } while (Date.now() < deadline);
  throw new Error(
    `Timed out waiting for ${label}. Run npm run preview:status and npm run preview:logs.`,
  );
}

export async function main(args = process.argv.slice(2)) {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Preview requires Node.js 24 or newer.");
  const options = parseArgs(args);
  const root = await realpath(fileURLToPath(new URL("../", import.meta.url)));
  const directory = resolve(root, ".local/preview");
  const project = checkoutIdentity(root);
  const env = dockerEnvironment();
  let state;
  let child;
  let interrupted = false;
  const redact = (text) =>
    [state?.databasePassword, state?.authSecret, state?.encryptionKey]
      .filter(Boolean)
      .reduce((s, secret) => s.replaceAll(secret, "[redacted]"), text);
  function killChild(proc, signal) {
    if (!proc?.pid) return;
    try {
      if (process.platform === "win32") proc.kill(signal);
      else process.kill(-proc.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  const onSignal = () => {
    interrupted = true;
    const current = child;
    killChild(current, "SIGTERM");
    const timer = setTimeout(() => {
      if (child === current) killChild(current, "SIGKILL");
    }, 3000);
    timer.unref();
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  async function docker(
    args,
    { timeout = 120_000, live = false, allowInterrupted = false } = {},
  ) {
    if (interrupted && !allowInterrupted)
      throw new Error("Preview operation interrupted.");
    return new Promise((accept, reject) => {
      const proc = spawn("docker", args, {
        cwd: root,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      child = proc;
      let output = "";
      let pending = "";
      let timedOut = false;
      const timer = Number.isFinite(timeout)
        ? setTimeout(() => {
            timedOut = true;
            killChild(proc, "SIGKILL");
          }, timeout)
        : null;
      const capture = (bytes) => {
        const text = bytes.toString();
        output = (output + text).slice(-2_000_000);
        if (live) {
          pending += text;
          const end = pending.lastIndexOf("\n");
          if (end >= 0) {
            process.stdout.write(redact(pending.slice(0, end + 1)));
            pending = pending.slice(end + 1);
          }
        }
      };
      proc.stdout.on("data", capture);
      proc.stderr.on("data", capture);
      proc.on("error", (error) => {
        clearTimeout(timer);
        reject(
          new Error(
            `Cannot run Docker: ${error.message}. Install Docker with Compose and start it.`,
          ),
        );
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (child === proc) child = null;
        if (live && pending) process.stdout.write(redact(pending));
        if (code === 0 && (!interrupted || allowInterrupted)) accept(output);
        else
          reject(
            new Error(
              `${timedOut ? "Timed out" : "Failed"}: docker ${args.slice(0, 2).join(" ")}\n${redact(output.slice(-4000))}`,
            ),
          );
      });
    });
  }
  const compose = (args, settings) =>
    docker(
      [
        "compose",
        "--project-directory",
        root,
        "--env-file",
        resolve(directory, "compose.env"),
        "--project-name",
        project,
        "-f",
        resolve(root, "compose.preview.yaml"),
        "--profile",
        "share",
        "--profile",
        "tools",
        ...args,
      ],
      settings,
    );
  const containers = async () =>
    (
      await docker(
        [
          "ps",
          "-aq",
          "--filter",
          `label=com.docker.compose.project=${project}`,
        ],
        { allowInterrupted: true },
      )
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const removeContainers = async (ids) => {
    if (ids.length) {
      await docker(["stop", "--time", "10", ...ids], {
        allowInterrupted: true,
      });
      await docker(["rm", "-fv", ...ids], { allowInterrupted: true });
    }
  };
  const networks = async () =>
    (
      await docker(
        [
          "network",
          "ls",
          "-q",
          "--filter",
          `label=com.docker.compose.project=${project}`,
        ],
        { allowInterrupted: true },
      )
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const removeNetworks = async (ids) => {
    if (ids.length)
      await docker(["network", "rm", ...ids], { allowInterrupted: true });
  };
  const inspectVolumes = async () =>
    (
      await docker([
        "volume",
        "ls",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${project}`,
      ])
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  const saveMetadata = (value) =>
    atomicWrite(
      resolve(directory, "session.json"),
      JSON.stringify(value, null, 2) + "\n",
    );
  const writeRuntime = (origin) =>
    atomicWrite(
      resolve(directory, "runtime.env"),
      envFile(runtimeConfiguration(state, origin)),
    );
  const writeGateway = (origin) =>
    atomicWrite(
      resolve(directory, "gateway/Caddyfile"),
      gatewayConfiguration(origin),
      0o644,
    );
  const healthyRoute = async (origin, route, expected) => {
    if (interrupted) throw new Error("Preview operation interrupted.");
    try {
      const response = await fetch(origin + route, {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      return response.ok && (await response.text()).includes(expected);
    } catch {
      return false;
    }
  };
  const summary = (metadata) => {
    console.log(
      `\nLittle Hint synthetic preview · ${metadata?.mode || "stopped"} · ${project}`,
    );
    if (metadata?.origin) {
      console.log(
        `App:   ${metadata.origin}\nInbox: ${metadata.origin}/__preview/inbox/`,
      );
      console.log(
        "Sign in as alex@example.test or sam@example.test. Request an email code, then open the inbox to retrieve it.",
      );
      console.log(
        "Also available: jamie@example.test, riley@example.test, taylor@example.test.",
      );
    }
    console.log(
      `Version: ${metadata?.version || "unknown"} · Revision: ${metadata?.revision || "unknown"} · State: ${metadata?.status || "stopped"}`,
    );
    console.log(
      "npm run preview:stop | preview:reset | preview:status | preview:logs",
    );
    console.log(
      "Keep this Mac and Docker running. Shared links and the test inbox are public; use synthetic data only.",
    );
  };
  let release;
  try {
    await docker(["info", "--format", "{{.ServerVersion}}"], {
      timeout: 20_000,
    });
    await docker(["compose", "version"], { timeout: 20_000 });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (["start", "reset", "stop"].includes(options.command))
      release = await acquireLock(directory);
    if (options.command === "stop") {
      // Label-scoped removal also works when configuration was lost. Data stays.
      await removeContainers(await containers());
      await removeNetworks(await networks());
      const metadata = await json(resolve(directory, "session.json"));
      await saveMetadata({ ...metadata, status: "stopped", origin: null });
      console.log(
        `Stopped ${project}, including its public tunnel. Data retained.`,
      );
      return;
    }
    try {
      state = await json(resolve(directory, "state.json"));
    } catch {
      if (options.command !== "reset")
        throw new Error(
          "Preview configuration is damaged. Restore .local/preview/state.json or run npm run preview:reset.",
        );
    }
    if (options.command === "status") {
      const metadata = await json(resolve(directory, "session.json"));
      summary(metadata);
      const ids = await containers();
      if (!ids.length) console.log("Services: stopped. Run npm run preview.");
      else {
        const entries = JSON.parse(await docker(["inspect", ...ids]));
        for (const entry of entries)
          console.log(
            `${entry.Config.Labels["com.docker.compose.service"]}: ${entry.State.Status} / ${entry.State.Health?.Status || "no healthcheck"}`,
          );
        if (metadata?.origin)
          console.log(
            `App route: ${(await healthyRoute(metadata.origin, "/api/health", "little-hint")) ? "healthy" : "unreachable"}`,
          );
      }
      if (!state && (await inspectVolumes()).length)
        console.log(
          "Configuration missing. Restore .local/preview/state.json from this checkout, or run npm run preview:reset.",
        );
      return;
    }
    if (options.command === "logs") {
      if (!state)
        throw new Error(
          "No preview configuration. Run npm run preview first, or restore .local/preview/state.json.",
        );
      validateState(state, root);
      try {
        await compose(["logs", "--follow", "--tail", "100"], {
          timeout: Infinity,
          live: true,
        });
      } catch (error) {
        if (!interrupted) throw error;
      }
      return;
    }
    const ownedVolumes = await inspectVolumes();
    const namedVolumes = (
      await docker(["volume", "ls", "-q", "--filter", `name=${project}_`])
    )
      .trim()
      .split(/\s+/);
    if (
      dataVolumes(project).some(
        (v) => namedVolumes.includes(v) && !ownedVolumes.includes(v),
      )
    )
      throw new Error(
        "A reserved preview volume name belongs to another project. Refusing to attach or reset it.",
      );
    if (options.command === "reset") {
      console.log(
        `Reset preview ${project}\nCheckout: ${root}\nRemove only: ${dataVolumes(project).join(", ")}`,
      );
      if (!options.yes) {
        if (!process.stdin.isTTY)
          throw new Error(
            "Reset needs confirmation. Use --yes for automation.",
          );
        const prompt = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        let answer;
        try {
          answer = await prompt.question(
            "Delete this preview’s database, uploads, and captured mail? Type yes: ",
          );
        } finally {
          prompt.close();
        }
        if (answer !== "yes") {
          console.log("Reset cancelled.");
          return;
        }
      }
      await removeContainers(await containers());
      const owned = await inspectVolumes();
      const volumes = dataVolumes(project).filter((v) => owned.includes(v));
      if (volumes.length) await docker(["volume", "rm", ...volumes]);
      // Recovery may replace lost/damaged secrets only after the data is removed.
      state = newState(root);
      await atomicWrite(
        resolve(directory, "state.json"),
        JSON.stringify(state, null, 2) + "\n",
      );
    }
    if (state) validateState(state, root);
    else {
      if ((await inspectVolumes()).length || (await containers()).length)
        throw new Error(
          "Preview data exists but configuration is missing. Restore this checkout’s .local/preview/state.json or run npm run preview:reset. Refusing to generate incompatible secrets.",
        );
      state = newState(root);
      await atomicWrite(
        resolve(directory, "state.json"),
        JSON.stringify(state, null, 2) + "\n",
      );
    }
    let revision = "unknown";
    try {
      revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
        cwd: root,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      }).trim();
      if (
        execFileSync("git", ["status", "--porcelain"], {
          cwd: root,
          env,
          encoding: "utf8",
          timeout: 5000,
        }).trim()
      )
        revision += "-dirty";
    } catch {
      /* Source archives have no Git metadata. */
    }
    const version = JSON.parse(
      await readFile(resolve(root, "package.json"), "utf8"),
    ).version;
    await mkdir(resolve(directory, "gateway"), { recursive: true });
    await mkdir(resolve(directory, "tls"), { recursive: true });
    await atomicWrite(
      resolve(directory, "compose.env"),
      envFile({
        PREVIEW_PROJECT: project,
        PREVIEW_DB_PASSWORD: state.databasePassword,
        PREVIEW_VERSION: version,
        PREVIEW_REVISION: revision,
      }),
    );
    // Compose validates env_file even for build. Existing containers keep their
    // original environment until recreated after the final origin is known.
    try {
      await readFile(resolve(directory, "runtime.env"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await writeRuntime("http://localhost:1");
    }
    const before = await containers();
    const beforeNetworks = await networks();
    let touched = false;
    try {
      console.log(`Building current checkout for ${project}...`);
      await compose(["build", "app"], { timeout: 20 * 60_000, live: true });
      touched = true;
      // Fresh sharing session every start; never reconnect an old hostname.
      await compose(["rm", "--stop", "--force", "tunnel", "app", "worker"]);
      await writeGateway(null);
      const tls = await compose([
        "run",
        "--rm",
        "--no-deps",
        "--name",
        `${project}-tls`,
        "tls",
      ]);
      if (tls.includes("SMTP certificates renewed"))
        await compose(["rm", "--stop", "--force", "mailpit"]);
      await compose(
        [
          "up",
          "-d",
          "--wait",
          "--wait-timeout",
          "180",
          "db",
          "mailpit",
          "gateway",
        ],
        { timeout: 240_000 },
      );
      const port = publishedPort(await compose(["port", "gateway", "8080"]));
      let origin = `http://localhost:${port}`;
      if (options.share) {
        console.log("Opening a fresh Cloudflare Quick Tunnel...");
        await compose(["up", "-d", "tunnel"]);
        origin = await waitFor(
          "a new Cloudflare HTTPS URL",
          async () => {
            const info = await compose([
              "ps",
              "--all",
              "--format",
              "json",
              "tunnel",
            ]);
            if (info.includes('"State":"exited"'))
              throw new Error(
                "Cloudflare tunnel exited. Check npm run preview:logs.",
              );
            return tunnelURL(await compose(["logs", "--no-color", "tunnel"]));
          },
          90_000,
        );
      }
      await writeRuntime(origin);
      await writeGateway(origin);
      await compose([
        "exec",
        "-T",
        "gateway",
        "caddy",
        "reload",
        "--config",
        "/etc/caddy/Caddyfile",
      ]);
      console.log("Migrating and checking synthetic fixtures...");
      await compose(
        [
          "run",
          "--rm",
          "--no-deps",
          "--name",
          `${project}-init`,
          "-e",
          "ALLOW_SYNTHETIC_DATA=1",
          "app",
          "node",
          "dist/server/cli.js",
          "ensure-preview",
        ],
        { live: true },
      );
      await compose(
        [
          "up",
          "-d",
          "--force-recreate",
          "--wait",
          "--wait-timeout",
          "180",
          "app",
          "worker",
        ],
        { timeout: 240_000 },
      );
      await waitFor("the app through its canonical origin", () =>
        healthyRoute(origin, "/api/health", "little-hint"),
      );
      await waitFor("the inbox through the gateway", () =>
        healthyRoute(origin, "/__preview/inbox/", "Mailpit"),
      );
      const metadata = {
        project,
        origin,
        port,
        mode: options.share ? "shared" : "local",
        version,
        revision,
        status: "healthy",
        started: new Date().toISOString(),
      };
      await saveMetadata(metadata);
      summary(metadata);
    } catch (error) {
      // Do not touch pre-existing containers on a build failure. Once runtime
      // changes begin, remove only containers created/recreated by this attempt.
      if (touched) {
        try {
          console.error(
            redact(
              await compose(["logs", "--no-color", "--tail", "20"], {
                allowInterrupted: true,
              }),
            ),
          );
        } catch {
          /* Diagnostics must not prevent cleanup. */
        }
        try {
          await removeContainers(newContainers(before, await containers()));
          await removeNetworks(newContainers(beforeNetworks, await networks()));
        } catch {
          console.error(
            `Cleanup failed for ${project}. Start Docker and run npm run preview:stop.`,
          );
        }
        await saveMetadata({ project, status: "failed", origin: null });
      }
      throw error;
    }
  } finally {
    await release?.();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
