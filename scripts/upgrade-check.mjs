import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  openSync,
  closeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export const baseline =
  "ghcr.io/affolder-creative/little-hint@sha256:ce0b5c074127e8a95cf80d61e57a8a2345fe50db03969f1a6a2ea52d9088ef4c";
export function configuration(image, checks) {
  if (!image || image.startsWith("-") || /\s/.test(image))
    throw new Error("Supply LITTLE_HINT_IMAGE with a candidate image.");
  const environment = {
    NODE_ENV: "production",
    APP_ENV: "production",
    APP_URL: "http://localhost:3000",
    PORT: "3000",
    DATABASE_URL:
      "postgresql://little_hint_staging:upgrade-test-only@db:5432/little_hint_staging",
    UPLOAD_DIR: "/data/uploads",
    BETTER_AUTH_SECRET: "upgrade-test-secret-at-least-32-characters",
    SETTINGS_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    AI_ENABLED: "false",
    GIFT_DISCOVERY_MODE: "off",
    SCRAPING_PROVIDER: "none",
    PAID_DAILY_LIMIT: "0",
    SMS_ENABLED: "false",
    TELEGRAM_ENABLED: "false",
    PRICE_CHECK_ENABLED: "false",
  };
  const app = {
    image,
    environment,
    volumes: ["uploads:/data/uploads", `${checks}:/checks:ro`],
    read_only: true,
    tmpfs: ["/tmp"],
    cap_drop: ["ALL"],
    security_opt: ["no-new-privileges:true"],
  };
  const health = (test) => ({
    test: ["CMD", "node", "-e", test],
    interval: "2s",
    timeout: "5s",
    retries: 60,
  });
  return {
    services: {
      db: {
        image: "postgres:18-alpine",
        environment: {
          POSTGRES_USER: "little_hint_staging",
          POSTGRES_DB: "little_hint_staging",
          POSTGRES_PASSWORD: "upgrade-test-only",
        },
        volumes: ["database:/var/lib/postgresql"],
        healthcheck: {
          test: ["CMD", "pg_isready", "-U", "little_hint_staging"],
          interval: "2s",
          timeout: "5s",
          retries: 60,
        },
      },
      app: {
        ...app,
        command: [
          "sh",
          "-c",
          "node dist/server/cli.js migrate && exec node dist/server/index.js",
        ],
        depends_on: { db: { condition: "service_healthy" } },
        healthcheck: health(
          "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ),
      },
      worker: {
        ...app,
        command: ["node", "dist/server/worker.js"],
        depends_on: { app: { condition: "service_healthy" } },
        healthcheck: health(
          "const fs=require('node:fs');try{process.exit(Date.now()-Number(fs.readFileSync('/tmp/little-hint-worker-heartbeat','utf8'))<60000?0:1)}catch{process.exit(1)}",
        ),
      },
    },
    volumes: { database: {}, uploads: {} },
    networks: { default: { internal: true } },
  };
}
export function run(candidate) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  // No operator env, Compose defaults, provider keys, database URLs or volume names enter the stack.
  const candidateConfig = configuration(candidate, path.join(root, "upgrade"));
  const directory = mkdtempSync(path.join(tmpdir(), "little-hint-upgrade-"));
  const id = "little-hint-upgrade-" + randomUUID();
  const projects = [id, id + "-restore"];
  const files = [
    path.join(directory, "baseline.json"),
    path.join(directory, "candidate.json"),
  ];
  writeFileSync(
    files[0],
    JSON.stringify(configuration(baseline, path.join(root, "upgrade"))),
  );
  writeFileSync(files[1], JSON.stringify(candidateConfig));
  const env = Object.fromEntries(
    [
      "PATH",
      "HOME",
      "DOCKER_HOST",
      "DOCKER_CONTEXT",
      "DOCKER_CONFIG",
      "DOCKER_TLS_VERIFY",
      "DOCKER_CERT_PATH",
    ]
      .filter((k) => process.env[k])
      .map((k) => [k, process.env[k]]),
  );
  function docker(args, options = {}) {
    const result = spawnSync("docker", args, {
      env,
      stdio: "inherit",
      timeout: 600000,
      ...options,
    });
    if (result.error || result.status !== 0)
      throw new Error(
        `Docker ${args[0]} failed (${result.status}): ${result.error?.message || ""}`,
      );
    return result.stdout;
  }
  const compose = (project, file, ...args) =>
    docker([
      "compose",
      "--env-file",
      "/dev/null",
      "-p",
      project,
      "-f",
      file,
      ...args,
    ]);
  const check = (project, file, mode) =>
    compose(
      project,
      file,
      "exec",
      "-T",
      "app",
      "node",
      "/checks/check.mjs",
      mode,
    );
  const cli = (project, file, command) =>
    compose(
      project,
      file,
      "run",
      "--rm",
      "--no-deps",
      "app",
      "node",
      "dist/server/cli.js",
      command,
    );
  const transfer = (project, file, args, filename, restore = false) => {
    const fd = openSync(filename, restore ? "r" : "w", 0o600);
    try {
      docker(
        [
          "compose",
          "--env-file",
          "/dev/null",
          "-p",
          project,
          "-f",
          file,
          ...args,
        ],
        {
          stdio: restore
            ? [fd, "inherit", "inherit"]
            : ["ignore", fd, "inherit"],
        },
      );
    } finally {
      closeSync(fd);
    }
  };
  try {
    docker(["pull", baseline]);
    compose(id, files[0], "up", "-d", "--wait", "db");
    cli(id, files[0], "migrate");
    compose(
      id,
      files[0],
      "run",
      "--rm",
      "--no-deps",
      "-e",
      "APP_ENV=staging",
      "-e",
      "ALLOW_SYNTHETIC_DATA=1",
      "app",
      "node",
      "dist/server/cli.js",
      "seed-staging",
    );
    compose(
      id,
      files[0],
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      "180",
      "app",
      "worker",
    );
    check(id, files[0], "prepare");
    check(id, files[0], "capture");
    compose(id, files[0], "stop", "worker", "app");
    compose(
      id,
      files[0],
      "run",
      "--rm",
      "--no-deps",
      "app",
      "node",
      "/checks/check.mjs",
      "queue",
    );
    transfer(
      id,
      files[0],
      [
        "exec",
        "-T",
        "db",
        "pg_dump",
        "-U",
        "little_hint_staging",
        "-Fc",
        "little_hint_staging",
      ],
      path.join(directory, "database.dump"),
    );
    transfer(
      id,
      files[0],
      [
        "run",
        "--rm",
        "--no-deps",
        "-T",
        "app",
        "tar",
        "-C",
        "/data/uploads",
        "-cf",
        "-",
        ".",
      ],
      path.join(directory, "uploads.tar"),
    );
    compose(
      id,
      files[1],
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      "180",
      "app",
      "worker",
    );
    cli(id, files[1], "migrate");
    cli(id, files[1], "migrate");
    check(id, files[1], "verify");
    compose(
      id,
      files[1],
      "up",
      "-d",
      "--force-recreate",
      "--wait",
      "--wait-timeout",
      "180",
      "app",
      "worker",
    );
    check(id, files[1], "verify");
    check(id, files[1], "write");
    const restored = projects[1];
    compose(restored, files[0], "up", "-d", "--wait", "db");
    transfer(
      restored,
      files[0],
      [
        "exec",
        "-T",
        "db",
        "pg_restore",
        "-U",
        "little_hint_staging",
        "-d",
        "little_hint_staging",
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
      ],
      path.join(directory, "database.dump"),
      true,
    );
    transfer(
      restored,
      files[0],
      [
        "run",
        "--rm",
        "--no-deps",
        "-T",
        "app",
        "tar",
        "-C",
        "/data/uploads",
        "-xf",
        "-",
      ],
      path.join(directory, "uploads.tar"),
      true,
    );
    compose(
      restored,
      files[0],
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      "180",
      "app",
      "worker",
    );
    check(restored, files[0], "verify");
    compose(restored, files[0], "stop", "worker", "app");
    cli(restored, files[0], "invalidate-sessions");
    compose(
      restored,
      files[0],
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      "180",
      "app",
      "worker",
    );
    check(restored, files[0], "invalidated");
    console.log(
      `PASS: 0.19.4 -> ${candidate}; recreation, isolated restore and revoked sessions verified.`,
    );
  } finally {
    let failed = false;
    for (const project of projects) {
      try {
        compose(project, files[1], "down", "--volumes", "--remove-orphans");
      } catch {
        failed = true;
      }
    }
    rmSync(directory, { recursive: true, force: true });
    if (failed)
      throw new Error(
        `Disposable cleanup failed; inspect only projects ${projects.join(", ")}.`,
      );
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  run(process.env.LITTLE_HINT_IMAGE);
