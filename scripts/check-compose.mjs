import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Exercise Docker Compose itself: a build must parse without runtime secrets,
// while starting the stack must still reject each missing required secret.
const root = fileURLToPath(new URL("../", import.meta.url));
const emptyFile = process.platform === "win32" ? "NUL" : "/dev/null";
const env = Object.fromEntries(
  ["PATH", "HOME", "USERPROFILE", "SystemRoot", "DOCKER_CONFIG"]
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);
const required = {
  POSTGRES_PASSWORD: "compose-check-only",
  BETTER_AUTH_SECRET: "compose-check-auth-only",
  SETTINGS_ENCRYPTION_KEY: "compose-check-encryption-only",
};
function config(file, variables = {}, interpolate = true) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      emptyFile,
      ...[file].flat().flatMap((name) => ["-f", name]),
      "config",
      ...(!interpolate ? ["--no-interpolate", "--no-env-resolution"] : []),
      "--format",
      "json",
    ],
    { cwd: root, env: { ...env, ...variables }, encoding: "utf8" },
  );
  if (result.error) throw result.error;
  return result;
}
const buildResult = config("compose.build.yaml");
assert.equal(
  buildResult.status,
  0,
  "Build definition must parse without secrets.",
);
const build = JSON.parse(buildResult.stdout);
assert.deepEqual(Object.keys(build.services), ["app"]);
const image = build.services.app;
assert.ok(image.build, "The build definition must build the image.");
assert.equal(
  image.environment,
  undefined,
  "Build service must not receive runtime variables.",
);
assert.equal(
  image.env_file,
  undefined,
  "Build must not load a runtime env file.",
);
assert.equal(
  image.build.args,
  undefined,
  "Build must not pass deployment settings as arguments.",
);
assert.equal(
  image.build.secrets,
  undefined,
  "This image needs no build secrets.",
);

for (const missing of Object.keys(required)) {
  for (const value of [undefined, ""]) {
    const variables = { ...required };
    if (value === undefined) delete variables[missing];
    else variables[missing] = value;
    const result = config("compose.yaml", variables);
    assert.notEqual(
      result.status,
      0,
      `Runtime must reject missing or empty ${missing}.`,
    );
    assert.ok(
      result.stderr.includes(missing),
      `Error must identify ${missing}.`,
    );
  }
}
const discoveryOverrides =
  '{"account-id":{"weeklyLimit":"unlimited","bypassMonthlyLimit":true}}';
const runtimeResult = config("compose.yaml", {
  ...required,
  GIFT_DISCOVERY_USER_OVERRIDES: discoveryOverrides,
});
assert.equal(
  runtimeResult.status,
  0,
  "Runtime definition must accept supplied settings.",
);
const runtime = JSON.parse(runtimeResult.stdout);
for (const name of ["app", "worker"]) {
  assert.equal(
    runtime.services[name].image,
    image.image,
    `${name} must use the built image.`,
  );
  assert.equal(
    runtime.services[name].build,
    undefined,
    "Runtime must not rebuild an image.",
  );
  assert.equal(
    runtime.services[name].pull_policy,
    "never",
    "Use the local image, not a registry fallback.",
  );
  assert.equal(
    runtime.services[name].environment.BETTER_AUTH_SECRET,
    required.BETTER_AUTH_SECRET,
  );
  assert.equal(
    runtime.services[name].environment.GIFT_DISCOVERY_USER_OVERRIDES,
    discoveryOverrides,
  );
}
assert.equal(
  runtime.services.db.environment.POSTGRES_PASSWORD,
  required.POSTGRES_PASSWORD,
);
const registryFiles = ["compose.yaml", "compose.ghcr.yaml"];
assert.notEqual(
  config(registryFiles, required).status,
  0,
  "Registry deployment must require an explicit image.",
);
const registryImage =
  "ghcr.io/affolder-creative/little-hint@sha256:" + "a".repeat(64);
const registryResult = config(registryFiles, {
  ...required,
  LITTLE_HINT_IMAGE: registryImage,
});
assert.equal(registryResult.status, 0, registryResult.stderr);
const registry = JSON.parse(registryResult.stdout);
for (const name of ["app", "worker"]) {
  assert.equal(registry.services[name].image, registryImage);
  assert.equal(registry.services[name].pull_policy, "missing");
  assert.equal(registry.services[name].build, undefined);
  assert.equal(registry.services[name].user, runtime.services[name].user);
  assert.deepEqual(
    registry.services[name].volumes,
    runtime.services[name].volumes,
  );
}
console.log(
  "Compose checks passed: secret-free build, required runtime secrets, and shared local/registry app-worker images.",
);

const productionVars = {
  ...required,
  APP_URL: "https://production.example.test",
  LITTLE_HINT_IMAGE: registryImage,
};
for (const missing of Object.keys(productionVars)) {
  for (const value of [undefined, ""]) {
    const variables = { ...productionVars };
    if (value === undefined) delete variables[missing];
    else variables[missing] = value;
    const result = config("compose.production.yaml", variables);
    assert.notEqual(result.status, 0, `Production must require ${missing}.`);
    assert.ok(result.stderr.includes(missing));
  }
}
// Compare fully resolved definitions, including backup-profile services and
// actual Compose volume names. Only the explicit production marker differs.
for (const profiles of ["", "backup"]) {
  const variables = {
    ...productionVars,
    COMPOSE_PROFILES: profiles,
    GIFT_DISCOVERY_USER_OVERRIDES: discoveryOverrides,
  };
  const productionResult = config("compose.production.yaml", variables);
  const legacyResult = config(registryFiles, variables);
  assert.equal(productionResult.status, 0, productionResult.stderr);
  assert.equal(legacyResult.status, 0, legacyResult.stderr);
  const production = JSON.parse(productionResult.stdout);
  const legacy = JSON.parse(legacyResult.stdout);
  // Extensions are YAML templates, not runtime configuration. The legacy
  // overlay overrides services without rewriting the base x-app template.
  for (const definition of [production, legacy])
    for (const key of Object.keys(definition))
      if (key.startsWith("x-")) delete definition[key];
  for (const name of ["app", "worker"])
    legacy.services[name].environment.APP_ENV = "production";
  assert.deepEqual(
    production,
    legacy,
    "Production must preserve the existing stack and storage identities.",
  );
  assert.equal(Boolean(production.services.backup), profiles === "backup");
  for (const service of Object.values(production.services)) {
    assert.equal(
      service.ports,
      undefined,
      "Production must not publish host ports.",
    );
    assert.equal(service.build, undefined, "Production uses prebuilt images.");
  }
}
console.log(
  "Production checks passed: required image/origin, legacy configuration and volume parity, optional backups.",
);

// Retain literal bind sources for compatibility with the original Coolify setup.
const unexpandedStaging = config("compose.staging.yaml", {}, false);
assert.equal(unexpandedStaging.status, 0, unexpandedStaging.stderr);
for (const service of Object.values(
  JSON.parse(unexpandedStaging.stdout).services,
)) {
  for (const volume of service.volumes ?? []) {
    if (volume.type !== "bind") continue;
    assert.match(
      volume.source,
      /^\/data\/little-hint-staging\/tls\/(ca\.crt|mailpit\.crt|mailpit\.key)$/,
      "Coolify requires a literal staging certificate bind source.",
    );
    assert.equal(
      volume.read_only,
      true,
      "Certificate mounts must stay read-only.",
    );
  }
}
const stagingVars = {
  LITTLE_HINT_STAGING_IMAGE:
    "ghcr.io/example/little-hint-staging@sha256:" + "b".repeat(64),
  STAGING_APP_URL: "https://staging.example.test",
  STAGING_POSTGRES_PASSWORD: "staging-only",
  STAGING_AUTH_SECRET: "staging-auth-only",
  STAGING_ENCRYPTION_KEY: "staging-encryption-only",
  STAGING_MAILPIT_UI_AUTH: "tester:staging-only",
};
for (const missing of Object.keys(stagingVars)) {
  for (const value of [undefined, ""]) {
    const variables = { ...stagingVars };
    if (value === undefined) delete variables[missing];
    else variables[missing] = value;
    const result = config("compose.staging.yaml", variables);
    assert.notEqual(result.status, 0, `Staging must require ${missing}.`);
    assert.ok(result.stderr.includes(missing));
  }
}
const stagingAI = {
  STAGING_OPENAI_API_KEY: "compose-staging-key-only",
  STAGING_OPENAI_MODEL: "test-model",
  STAGING_GIFT_DISCOVERY_MODE: "both",
  STAGING_GIFT_DISCOVERY_MODEL: "test-discovery-model",
  STAGING_GIFT_DISCOVERY_USER_WEEKLY_LIMIT: "2",
  STAGING_GIFT_DISCOVERY_MONTHLY_LIMIT: "15",
  STAGING_PAID_DAILY_LIMIT: "8",
};
const stagingAIResult = config("compose.staging.yaml", {
  ...stagingVars,
  ...stagingAI,
});
assert.equal(stagingAIResult.status, 0, stagingAIResult.stderr);
for (const name of ["app", "worker"]) {
  const environment = JSON.parse(stagingAIResult.stdout).services[name]
    .environment;
  for (const [key, value] of Object.entries(stagingAI))
    assert.equal(environment[key], value);
  assert.equal(environment.OPENAI_API_KEY, undefined);
}
const stagingResult = config("compose.staging.yaml", stagingVars);
assert.equal(stagingResult.status, 0, stagingResult.stderr);
const staging = JSON.parse(stagingResult.stdout);
assert.deepEqual(Object.keys(staging.services).sort(), [
  "app",
  "db",
  "mailpit",
  "worker",
]);
for (const [name, service] of Object.entries(staging.services)) {
  assert.equal(
    service.ports,
    undefined,
    `${name} must not publish host ports.`,
  );
  assert.equal(service.build, undefined, "Staging pulls a prebuilt image.");
  assert.ok(service.mem_limit > 0, `${name} needs a memory limit.`);
  for (const volume of service.volumes ?? [])
    if (volume.type === "volume")
      assert.ok(volume.source.startsWith("staging-"));
}
for (const name of ["app", "worker"]) {
  const service = staging.services[name];
  assert.equal(service.image, stagingVars.LITTLE_HINT_STAGING_IMAGE);
  assert.equal(service.environment.NODE_ENV, "production");
  assert.equal(service.environment.APP_ENV, "staging");
  assert.equal(service.environment.ALLOW_SYNTHETIC_DATA, undefined);
  assert.equal(
    service.environment.DATABASE_URL,
    "postgresql://little_hint_staging:staging-only@db:5432/little_hint_staging",
  );
  assert.equal(service.environment.NODE_EXTRA_CA_CERTS, "/run/mailpit-ca.crt");
  assert.ok(
    !service.volumes.some((v) => v.target.endsWith(".key")),
    "App must not receive private SMTP keys.",
  );
  assert.equal(service.environment.SMTP_PASS, undefined);
  assert.equal(service.environment.RESTIC_PASSWORD, undefined);
}
assert.equal(
  staging.services.mailpit.environment.MP_SMTP_REQUIRE_STARTTLS,
  "true",
);
assert.equal(
  staging.services.mailpit.environment.MP_UI_AUTH,
  stagingVars.STAGING_MAILPIT_UI_AUTH,
);
assert.equal(
  staging.services.mailpit.environment.MP_SMTP_RELAY_CONFIG,
  undefined,
);
assert.equal(
  staging.services.mailpit.environment.MP_SMTP_FORWARD_CONFIG,
  undefined,
);
console.log(
  "Staging checks passed: dedicated data, fixed mail capture, bounded memory, no build or published ports.",
);

for (const [file, variables] of [
  ["compose.production.yaml", productionVars],
  ["compose.staging.yaml", stagingVars],
]) {
  const result = config(file, variables);
  assert.equal(result.status, 0, result.stderr);
  const { services } = JSON.parse(result.stdout);
  assert.equal(services.app.depends_on.db.condition, "service_healthy");
  assert.equal(services.worker.depends_on.app.condition, "service_healthy");
  assert.deepEqual(services.app.healthcheck.test.slice(0, 3), [
    "CMD",
    "node",
    "-e",
  ]);
  assert.match(
    services.app.healthcheck.test[3],
    /http:\/\/127\.0\.0\.1:3000\/api\/health/,
  );
  assert.match(
    services.worker.healthcheck.test[3],
    /little-hint-worker-heartbeat/,
  );
  assert.ok(services.db.healthcheck.test.join(" ").includes("pg_isready"));
}

// Blank leaves UI control available; explicit false must reach both processes.
for (const [file, variables] of [
  ["compose.yaml", required],
  ["compose.production.yaml", productionVars],
  ["compose.staging.yaml", stagingVars],
]) {
  for (const value of ["", "true", "false"]) {
    const parsed = config(file, {
      ...variables,
      AUTO_IMPORT_PRODUCT_PHOTOS: value,
      CLOUDFLARE_WEB_ANALYTICS: value,
    });
    assert.equal(parsed.status, 0, parsed.stderr);
    const services = JSON.parse(parsed.stdout).services;
    for (const name of ["app", "worker"])
      assert.equal(
        services[name].environment.AUTO_IMPORT_PRODUCT_PHOTOS,
        value,
      );
    for (const name of ["app", "worker"])
      assert.equal(
        services[name].environment.CLOUDFLARE_WEB_ANALYTICS,
        value || "false",
      );
  }
}

// Group policy overrides reach both processes; blank preserves the UI setting.
for (const [file, variables] of [
  ["compose.yaml", required],
  ["compose.production.yaml", productionVars],
  ["compose.staging.yaml", stagingVars],
]) {
  for (const value of ["", "everyone", "admins"]) {
    const parsed = config(file, { ...variables, FAMILY_GROUP_CREATION: value });
    assert.equal(parsed.status, 0, parsed.stderr);
    for (const name of ["app", "worker"])
      assert.equal(
        JSON.parse(parsed.stdout).services[name].environment
          .FAMILY_GROUP_CREATION,
        value,
      );
  }
}

// Preview never uses .env, publishes only a Docker-assigned loopback gateway,
// and keeps the database, inbox SMTP, app, and worker on an internal network.
const preview = config("compose.preview.yaml", {}, false);
assert.equal(preview.status, 0, preview.stderr);
const previewConfig = JSON.parse(preview.stdout);
for (const [name, service] of Object.entries(previewConfig.services)) {
  if (name !== "gateway") assert.equal(service.ports, undefined);
  if (name !== "app" && name !== "worker")
    assert.match(service.image, /(?:@sha256:[a-f0-9]{64}|:[0-9v][0-9.]+)$/);
}
const gateway = previewConfig.services.gateway;
assert.equal(gateway.ports.length, 1);
assert.equal(gateway.ports[0].host_ip, "127.0.0.1");
assert.equal(gateway.ports[0].published, "0");
assert.equal(previewConfig.networks.private.internal, true);
for (const name of ["db", "mailpit", "app", "worker"])
  assert.deepEqual(Object.keys(previewConfig.services[name].networks), [
    "private",
  ]);
assert.deepEqual(previewConfig.services.tunnel.profiles, ["share"]);
assert.equal(
  previewConfig.services.mailpit.environment.MP_WEBROOT,
  "/__preview/inbox/",
);
assert.equal(
  previewConfig.services.mailpit.environment.MP_SMTP_REQUIRE_STARTTLS,
  "true",
);
assert.ok(
  !previewConfig.services.mailpit.volumes.some((v) =>
    v.target.includes("ca.key"),
  ),
);
assert.deepEqual(Object.keys(previewConfig.volumes).sort(), [
  "database",
  "mail",
  "uploads",
]);
console.log(
  "Preview Compose checks passed: isolated network/data, pinned tools, optional tunnel, and loopback gateway only.",
);
