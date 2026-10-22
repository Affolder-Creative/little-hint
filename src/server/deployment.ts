export function deploymentEnvironment(env = process.env) {
  const value = env.APP_ENV || env.NODE_ENV || "development";
  if (!["production", "staging", "development", "test"].includes(value))
    throw new Error(
      "APP_ENV must be production, staging, development, or test.",
    );
  return value as "production" | "staging" | "development" | "test";
}

export function assertStagingDatabase(env = process.env) {
  if (env.APP_ENV !== "staging")
    throw new Error("This command requires APP_ENV=staging.");
  const url = new URL(env.DATABASE_URL || "postgresql://invalid/invalid");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    decodeURIComponent(url.pathname) !== "/little_hint_staging" ||
    decodeURIComponent(url.username) !== "little_hint_staging"
  )
    throw new Error("Use the dedicated little_hint_staging database and role.");
}

export function assertStagingSeed(env = process.env) {
  assertStagingDatabase(env);
  if (env.ALLOW_SYNTHETIC_DATA !== "1")
    throw new Error(
      "Seeding requires ALLOW_SYNTHETIC_DATA=1 for this command.",
    );
}

export function validateDeployment(env = process.env) {
  productPhotoOverride(env);
  if (deploymentEnvironment(env) !== "staging") return;
  assertStagingDatabase(env);
  if (env.NODE_ENV !== "production")
    throw new Error("Staging must run with NODE_ENV=production.");
  if (!env.APP_URL || new URL(env.APP_URL).protocol !== "https:")
    throw new Error("Staging requires an HTTPS APP_URL.");
  if (!env.NODE_EXTRA_CA_CERTS)
    throw new Error("Staging requires NODE_EXTRA_CA_CERTS for Mailpit TLS.");
}

// Empty Compose values leave the administrator preference editable.
export function productPhotoOverride(env = process.env): boolean | undefined {
  const value = env.AUTO_IMPORT_PRODUCT_PHOTOS;
  if (value === undefined || value === "") return undefined;
  if (value !== "true" && value !== "false")
    throw new Error(
      "AUTO_IMPORT_PRODUCT_PHOTOS must be true, false, or empty.",
    );
  return value === "true";
}
