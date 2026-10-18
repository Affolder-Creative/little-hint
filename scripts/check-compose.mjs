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
function config(file, variables = {}) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      emptyFile,
      ...[file].flat().flatMap((name) => ["-f", name]),
      "config",
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
const registryImage = "ghcr.io/kaffolder7/little-hint@sha256:" + "a".repeat(64);
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
