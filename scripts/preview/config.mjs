import { createHash, randomBytes } from "node:crypto";

export function parseArgs(args) {
  const [command = "start", ...flags] = args;
  if (
    !["start", "status", "logs", "stop", "reset"].includes(command) ||
    flags.some(
      (f) =>
        !(command === "start" && f === "--share") &&
        !(command === "reset" && f === "--yes"),
    ) ||
    new Set(flags).size !== flags.length
  )
    throw new Error(
      "Usage: preview [start [--share] | status | logs | stop | reset [--yes]]",
    );
  return {
    command,
    share: flags.includes("--share"),
    yes: flags.includes("--yes"),
  };
}

export function checkoutIdentity(realRoot) {
  return (
    "little-hint-preview-" +
    createHash("sha256").update(realRoot).digest("hex").slice(0, 16)
  );
}

// No spread of process.env: Compose must never see application/provider values,
// COMPOSE_FILE, interpolation overrides, NODE_OPTIONS, or npm's injected settings.
export function dockerEnvironment(env = process.env) {
  return Object.fromEntries(
    [
      "PATH",
      "HOME",
      "USERPROFILE",
      "SystemRoot",
      "TMPDIR",
      "TMP",
      "TEMP",
      "DOCKER_HOST",
      "DOCKER_CONTEXT",
      "DOCKER_CONFIG",
      "DOCKER_CERT_PATH",
      "DOCKER_TLS_VERIFY",
      "DOCKER_API_VERSION",
      "SSH_AUTH_SOCK",
    ]
      .filter((k) => env[k] !== undefined)
      .map((k) => [k, env[k]]),
  );
}

export function newState(root) {
  return {
    schema: 1,
    root,
    project: checkoutIdentity(root),
    databasePassword: randomBytes(24).toString("hex"),
    authSecret: randomBytes(48).toString("hex"),
    encryptionKey: randomBytes(32).toString("base64"),
  };
}

export function validateState(state, root) {
  if (
    state.schema !== 1 ||
    state.root !== root ||
    state.project !== checkoutIdentity(root) ||
    !/^[a-f0-9]{48}$/.test(state.databasePassword) ||
    !/^[a-f0-9]{96}$/.test(state.authSecret) ||
    !/^[A-Za-z0-9+/]{43}=$/.test(state.encryptionKey)
  )
    throw new Error(
      "Preview configuration does not match this checkout or is damaged. Restore its original .local/preview/state.json or run npm run preview:reset.",
    );
  return state;
}

export function runtimeConfiguration(state, origin) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" && url.hostname === "localhost")
    )
  )
    throw new Error("Expected an HTTPS origin or localhost HTTP origin.");
  return {
    NODE_ENV: "production",
    APP_ENV: "preview",
    APP_URL: origin,
    DATABASE_URL: `postgresql://little_hint_preview:${state.databasePassword}@db:5432/little_hint_preview`,
    BETTER_AUTH_SECRET: state.authSecret,
    SETTINGS_ENCRYPTION_KEY: state.encryptionKey,
    NODE_EXTRA_CA_CERTS: "/run/mailpit-ca.crt",
    PORT: "3000",
    UPLOAD_DIR: "/data/uploads",
    CLOUDFLARE_WEB_ANALYTICS: "false",
    AUTO_IMPORT_PRODUCT_PHOTOS: "false",
  };
}

export function envFile(values) {
  return Object.entries(values)
    .map(([k, v]) => {
      if (/[\r\n'$]/.test(String(v)))
        throw new Error("Invalid generated configuration value.");
      return `${k}='${v}'\n`;
    })
    .join("");
}

export function publishedPort(output) {
  const match = output.trim().match(/^127\.0\.0\.1:(\d+)$/);
  const port = Number(match?.[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Docker did not publish a loopback gateway port.");
  return port;
}

export function tunnelURL(log) {
  return log.match(
    /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com(?=[\s|"/]|$)/,
  )?.[0];
}

export function gatewayConfiguration(origin) {
  const host = origin ? new URL(origin).hostname : null;
  return `{
  auto_https off
  admin localhost:2019
}
:8080 {
  route {
  respond /__preview/health "ok" 200
  ${host ? `@other not host ${host}\n  redir @other ${origin}{uri} 307` : ""}
  redir /__preview/inbox /__preview/inbox/ 308
  handle /__preview/inbox/* {
    header Cache-Control "no-store"
    reverse_proxy mailpit:8025
  }
  handle {
    reverse_proxy app:3000
  }
  }
  handle_errors {
    header Retry-After "3"
    header Cache-Control "no-store"
    respond "Little Hint preview is starting. Refresh in a few seconds." 503
  }
}
`;
}

export const dataVolumes = (project) =>
  ["database", "uploads", "mail"].map((v) => `${project}_${v}`);
export const newContainers = (before, after) =>
  after.filter((id) => !before.includes(id));
