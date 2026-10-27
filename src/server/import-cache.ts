import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import { pool } from "./db";
import { productImportCacheEnabled } from "./deployment";

export const importCacheTtl = 6 * 60 * 60 * 1000;
export const importCacheLimit = 1000;
const maxBytes = 65536;
const queryKeys = new Set([
  "id",
  "pid",
  "product_id",
  "variant",
  "sku",
  "color",
  "colour",
  "size",
  "currency",
  "locale",
  "lang",
  "country",
  "th",
  "psc",
]);
const trackingKeys = new Set(["gclid", "fbclid", "msclkid"]);

/** Deliberately narrower than duplicate detection: markets and variants matter. */
export function productCacheUrl(value: string): string | undefined {
  try {
    const u = new URL(value);
    if (
      !/^https?:$/.test(u.protocol) ||
      u.username ||
      u.password ||
      (u.port && !["80", "443"].includes(u.port)) ||
      /\/(auth|login|account|checkout|cart|password|reset|invite|share)(\/|$)/i.test(
        u.pathname,
      )
    )
      return;
    u.hash = "";
    const amazon =
      /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|com\.au|co\.jp)$/.test(
        u.hostname,
      );
    for (const key of [...u.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (
        lower.startsWith("utm_") ||
        trackingKeys.has(lower) ||
        (amazon && ["tag", "ref"].includes(lower))
      )
        u.searchParams.delete(key);
      else if (!queryKeys.has(lower)) return;
    }
    // Preserve query order and path spelling rather than merging ambiguous URLs.
    return u.href;
  } catch {
    return;
  }
}

export function importCacheKey(stage: string, parts: unknown[]): string {
  return createHash("sha256")
    .update(JSON.stringify(["product-cache-v1", stage, ...parts]))
    .digest("hex");
}

type Computed<T> = { value: T; cacheable?: boolean };
const pending = new Map<string, Promise<Computed<unknown>>>();

export async function pruneImportCache() {
  if (!productImportCacheEnabled()) return;
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(742903120)");
      await client.query(
        "DELETE FROM product_import_cache WHERE expires_at <= now()",
      );
      await client.query(
        "DELETE FROM product_import_cache WHERE key IN (SELECT key FROM product_import_cache ORDER BY checked_at DESC, key OFFSET $1)",
        [importCacheLimit],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    /* Disposable cache maintenance must not interrupt jobs. */
  }
}

async function store(key: string, value: unknown, checkedAt: Date) {
  const json = JSON.stringify(value);
  // Leave room for JSONB's whitespace representation in the database constraint.
  if (Buffer.byteLength(json) > maxBytes - 1024) return;
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(742903120)");
      await client.query(
        `INSERT INTO product_import_cache(key, data, checked_at, expires_at)
        VALUES ($1, $2::jsonb, $3, $4)
        ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data, checked_at=EXCLUDED.checked_at, expires_at=EXCLUDED.expires_at
        WHERE product_import_cache.checked_at <= EXCLUDED.checked_at`,
        [key, json, checkedAt, new Date(checkedAt.getTime() + importCacheTtl)],
      );
      await client.query(
        "DELETE FROM product_import_cache WHERE expires_at <= now()",
      );
      await client.query(
        "DELETE FROM product_import_cache WHERE key IN (SELECT key FROM product_import_cache ORDER BY checked_at DESC, key OFFSET $1)",
        [importCacheLimit],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    /* Importing still works if the cache cannot be written. */
  }
}

export async function cachedImport<T>(
  key: string | undefined,
  schema: ZodType<T>,
  compute: () => Promise<Computed<T>>,
  forceRefresh = false,
): Promise<T> {
  if (!productImportCacheEnabled() || !key)
    return schema.parse((await compute()).value);
  if (!forceRefresh) {
    try {
      const { rows } = await pool.query(
        "SELECT data FROM product_import_cache WHERE key = $1 AND expires_at > now()",
        [key],
      );
      if (rows[0]) return schema.parse(rows[0].data);
    } catch {
      /* Treat unreadable or invalid entries as misses. */
    }
    const prior = pending.get(key);
    if (prior) {
      const result = await prior;
      // A redirect to a personalized URL must not be shared, even in memory.
      if (result.cacheable !== false)
        return schema.parse(structuredClone(result.value));
      return schema.parse((await compute()).value);
    }
  }
  const run = async (): Promise<Computed<T>> => {
    const checkedAt = new Date();
    const result = await compute();
    const value = schema.parse(result.value);
    if (result.cacheable !== false) await store(key, value, checkedAt);
    return { value, cacheable: result.cacheable };
  };
  const task = run();
  // Forced refreshes bypass older in-flight work as well as stored entries.
  if (!forceRefresh) pending.set(key, task);
  try {
    return schema.parse(structuredClone((await task).value));
  } finally {
    if (pending.get(key) === task) pending.delete(key);
  }
}
