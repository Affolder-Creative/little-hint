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
      ...(!interpolate ? ["--no-interpolate"] : []),
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
const runtimeResult = config("compose.yaml", required);
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

// Coolify validates bind sources before Docker interpolates environment values.
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
  const variables = { ...stagingVars };
  delete variables[missing];
  assert.notEqual(
    config("compose.staging.yaml", variables).status,
    0,
    `Staging must require ${missing}.`,
  );
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

// Blank leaves UI control available; explicit false must reach both processes.
for (const [file, variables] of [
  ["compose.yaml", required],
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
