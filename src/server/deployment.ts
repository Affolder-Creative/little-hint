export function deploymentEnvironment(env = process.env) {
  const value = env.APP_ENV || env.NODE_ENV || "development";
  if (
    !["production", "staging", "preview", "development", "test"].includes(value)
  )
    throw new Error(
      "APP_ENV must be production, staging, preview, development, or test.",
    );
  return value as "production" | "staging" | "preview" | "development" | "test";
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
  cloudflareWebAnalyticsEnabled(env);
  productImportCacheEnabled(env);
  if (deploymentEnvironment(env) === "preview") {
    assertPreviewDatabase(env);
    if (env.NODE_ENV !== "production")
      throw new Error("Preview must run with NODE_ENV=production.");
    const origin = new URL(env.APP_URL || "http://invalid");
    if (
      origin.origin !== env.APP_URL ||
      origin.username ||
      origin.password ||
      !(
        origin.protocol === "https:" ||
        (origin.protocol === "http:" && origin.hostname === "localhost")
      )
    )
      throw new Error(
        "Preview requires an HTTPS origin or http://localhost:<port>.",
      );
    if (!env.NODE_EXTRA_CA_CERTS)
      throw new Error("Preview requires NODE_EXTRA_CA_CERTS for Mailpit TLS.");
    return;
  }
  if (deploymentEnvironment(env) !== "staging") return;
  assertStagingDatabase(env);
  if (env.NODE_ENV !== "production")
    throw new Error("Staging must run with NODE_ENV=production.");
  if (!env.APP_URL || new URL(env.APP_URL).protocol !== "https:")
    throw new Error("Staging requires an HTTPS APP_URL.");
  if (!env.NODE_EXTRA_CA_CERTS)
    throw new Error("Staging requires NODE_EXTRA_CA_CERTS for Mailpit TLS.");
}

export function productImportCacheEnabled(env = process.env): boolean {
  const value = env.PRODUCT_IMPORT_CACHE_ENABLED;
  if (value === undefined || value === "" || value === "true") return true;
  if (value === "false") return false;
  throw new Error(
    "PRODUCT_IMPORT_CACHE_ENABLED must be true, false, or empty.",
  );
}

export function cloudflareWebAnalyticsEnabled(env = process.env): boolean {
  if (env.APP_ENV === "preview") return false;
  const value = env.CLOUDFLARE_WEB_ANALYTICS;
  if (value === undefined || value === "" || value === "false") return false;
  if (value !== "true")
    throw new Error("CLOUDFLARE_WEB_ANALYTICS must be true, false, or empty.");
  return true;
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

export function syntheticEnvironment(env = process.env) {
  return ["staging", "preview"].includes(deploymentEnvironment(env));
}

export function assertPreviewDatabase(env = process.env) {
  if (env.APP_ENV !== "preview" || env.NODE_ENV !== "production")
    throw new Error(
      "This command requires APP_ENV=preview and NODE_ENV=production.",
    );
  const url = new URL(env.DATABASE_URL || "postgresql://invalid/invalid");
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    decodeURIComponent(url.pathname) !== "/little_hint_preview" ||
    decodeURIComponent(url.username) !== "little_hint_preview"
  )
    throw new Error("Use the dedicated little_hint_preview database and role.");
}

export function assertPreviewSeed(env = process.env) {
  assertPreviewDatabase(env);
  if (env.ALLOW_SYNTHETIC_DATA !== "1")
    throw new Error(
      "Seeding requires ALLOW_SYNTHETIC_DATA=1 for this command.",
    );
}
