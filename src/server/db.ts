import { lifecycleBaseline } from "./gift-lifecycle";
import { reconcilePrivacyReview } from "./privacy-review";
import { reconcileSpendingPrivacy } from "./spending-privacy";
import { rejectClosedAccountReferences } from "./closed-accounts";
import { databaseMetrics } from "./metrics";
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql, eq } from "drizzle-orm";
import * as schema from "./schema";
import {
  emptyState,
  kinds,
  type State,
  type Kind,
  type Setting,
  type ImportJob,
} from "../shared/model";
const supportedSchemaVersion = 9;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});
export const db = drizzle(pool, { schema });
export async function readSettings(): Promise<Setting[]> {
  const { rows } = await pool.query(
    "SELECT data FROM app_record WHERE kind = 'settings'",
  );
  return rows.map((row) => row.data as Setting);
}
export async function readImport(
  id: string,
  userId: string,
): Promise<ImportJob | undefined> {
  const { rows } = await pool.query(
    "SELECT data FROM app_record WHERE id = $1 AND kind = 'imports' AND data->>'userId' = $2",
    [id, userId],
  );
  return rows[0]?.data as ImportJob | undefined;
}
export function assertRecordCompatibility(rows: { kind: string }[]) {
  if (rows.some((row) => !kinds.includes(row.kind as Kind)))
    throw new Error(
      "Database contains unsupported record types. Upgrade app and worker together before continuing.",
    );
}
export async function assertDatabaseCompatibility() {
  const version = await pool.query(
    "SELECT max(version) AS version FROM schema_migration",
  );
  if (Number(version.rows[0]?.version ?? 0) > supportedSchemaVersion)
    throw new Error(
      "Database schema is newer than this application. Upgrade app and worker together.",
    );
  await readState();
}
export async function readState(): Promise<State> {
  const rows = await db.select().from(schema.records);
  assertRecordCompatibility(rows);
  const state = emptyState();
  for (const row of rows) {
    if (kinds.includes(row.kind as Kind))
      (state[row.kind as Kind] as unknown[]).push(row.data);
  }
  return state;
}
// A single transaction lock coordinates domain writes across app and worker processes.
// This deliberately favors correctness for a private family installation over write throughput.
export type DomainTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export async function transact<T>(
  fn: (s: State, tx: DomainTransaction) => T | Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await db.transaction(async (tx) => {
      const waiting = performance.now();
      await tx.execute(sql`select pg_advisory_xact_lock(742903118)`);
      databaseMetrics.lockWait.observe(performance.now() - waiting);
      const versions = await tx.execute(
        sql`SELECT max(version) AS version FROM schema_migration`,
      );
      if (Number(versions.rows[0]?.version ?? 0) > supportedSchemaVersion)
        throw new Error(
          "Database schema is newer than this application. Upgrade app and worker together.",
        );
      const rows = await tx.select().from(schema.records);
      assertRecordCompatibility(rows);
      const state = emptyState();
      const before = new Map(rows.map((r) => [r.id, JSON.stringify(r.data)]));
      for (const row of rows) {
        if (kinds.includes(row.kind as Kind))
          (state[row.kind as Kind] as unknown[]).push(row.data);
      }
      reconcilePrivacyReview(state);
      reconcileSpendingPrivacy(state);
      const result = await fn(state, tx);
      reconcilePrivacyReview(state);
      reconcileSpendingPrivacy(state);
      const closed = new Set(
        (await tx.execute(sql`SELECT id_hash FROM closed_account`)).rows.map(
          (r) => String(r.id_hash),
        ),
      );
      const after = new Set<string>();
      for (const kind of kinds)
        for (const record of state[kind]) {
          after.add(record.id);
          if (before.get(record.id) !== JSON.stringify(record)) {
            rejectClosedAccountReferences(record, closed);
            await tx
              .insert(schema.records)
              .values({ id: record.id, kind, data: record })
              .onConflictDoUpdate({
                target: schema.records.id,
                set: { data: record, kind },
              });
          }
        }
      for (const id of before.keys())
        if (!after.has(id))
          await tx.delete(schema.records).where(eq(schema.records.id, id));
      return result;
    });
  } finally {
    databaseMetrics.transactions.observe(performance.now() - started);
  }
}
export async function migrate(databasePool = pool) {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(742903119)");
    await client.query("SELECT pg_advisory_xact_lock(742903118)");
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migration (version integer primary key, applied_at timestamptz not null default now());`,
    );

    const version = await client.query(
      "SELECT max(version) AS version FROM schema_migration",
    );
    if (Number(version.rows[0]?.version ?? 0) > supportedSchemaVersion)
      throw new Error(
        "Database schema is newer than this application. Upgrade app and worker together.",
      );
    const done = await client.query(
      "SELECT 1 FROM schema_migration WHERE version=1",
    );
    if (!done.rowCount) {
      await client.query(`
CREATE TABLE "user" (id text PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,email_verified boolean NOT NULL DEFAULT false,image text,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
CREATE TABLE session (id text PRIMARY KEY,expires_at timestamp NOT NULL,token text NOT NULL UNIQUE,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now(),ip_address text,user_agent text,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
CREATE INDEX session_user_idx ON session(user_id);
CREATE TABLE account (id text PRIMARY KEY,account_id text NOT NULL,provider_id text NOT NULL,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,access_token text,refresh_token text,id_token text,access_token_expires_at timestamp,refresh_token_expires_at timestamp,scope text,password text,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
CREATE TABLE verification (id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,expires_at timestamp NOT NULL,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
CREATE INDEX verification_identifier_idx ON verification(identifier);
CREATE TABLE passkey (id text PRIMARY KEY,name text,public_key text NOT NULL,user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,credential_id text NOT NULL UNIQUE,counter integer NOT NULL,device_type text NOT NULL,backed_up boolean NOT NULL,transports text,created_at timestamp,aaguid text);
CREATE TABLE app_record(id text PRIMARY KEY,kind text NOT NULL,data jsonb NOT NULL CHECK (data->>'id'=id));
CREATE INDEX record_kind_idx ON app_record(kind);
INSERT INTO schema_migration(version) VALUES (1);`);
    }
    const cacheMigration = await client.query(
      "SELECT 1 FROM schema_migration WHERE version=2",
    );
    if (!cacheMigration.rowCount) {
      await client.query(`
CREATE TABLE product_import_cache (
  key text PRIMARY KEY,
  data jsonb NOT NULL CHECK (octet_length(data::text) <= 65536),
  checked_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX product_import_cache_expiry_idx ON product_import_cache(expires_at);
INSERT INTO schema_migration(version) VALUES (2);`);
    }
    await client.query(
      "INSERT INTO schema_migration(version) VALUES (3) ON CONFLICT DO NOTHING",
    );
    await client.query(
      "CREATE TABLE IF NOT EXISTS closed_account (id_hash text PRIMARY KEY)",
    );
    await client.query(
      "INSERT INTO schema_migration(version) VALUES (4) ON CONFLICT DO NOTHING",
    );
    await client.query(
      "INSERT INTO schema_migration(version) VALUES (5) ON CONFLICT DO NOTHING",
    );
    await client.query(
      "INSERT INTO schema_migration(version) VALUES (6) ON CONFLICT DO NOTHING",
    );
    await client.query(
      "CREATE TABLE IF NOT EXISTS admin_account_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_hash text NOT NULL, target_hash text NOT NULL, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())",
    );
    const profileMigration = await client.query(
      "SELECT 1 FROM schema_migration WHERE version=7",
    );
    if (!profileMigration.rowCount) {
      await client.query(
        `UPDATE app_record p SET data = jsonb_set(p.data, '{managedGroupIds}', COALESCE((SELECT jsonb_agg(g.id) FROM app_record g WHERE g.kind='groups' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.data->'guardians') guardian WHERE g.data->'memberIds' ? guardian)), '[]'::jsonb)) WHERE p.kind='people' AND p.data->>'userId' IS NULL AND NOT (p.data ? 'managedGroupIds')`,
      );
      await client.query("INSERT INTO schema_migration(version) VALUES (7)");
    }
    const ownershipMigration = await client.query(
      "SELECT 1 FROM schema_migration WHERE version=8",
    );
    if (!ownershipMigration.rowCount) {
      const rows = await client.query(
        "SELECT id,data FROM app_record WHERE kind='people'",
      );
      const active = new Set(
        rows.rows
          .filter((r) => r.data.userId && !r.data.mergedIntoId)
          .map((r) => r.data.userId),
      );
      for (const row of rows.rows) {
        const p = row.data;
        if (p.userId || p.mergedIntoId || !p.guardians?.length) continue;
        const owner =
          p.managedOwnerId ?? p.guardians.find((id: string) => active.has(id));
        if (!owner || !active.has(owner) || !p.guardians.includes(owner))
          throw new Error(
            `Managed profile ${row.id} has no valid owner. Repair its manager references before migrating.`,
          );
        await client.query(
          "UPDATE app_record SET data=jsonb_set(data,'{managedOwnerId}',to_jsonb($2::text)) WHERE id=$1",
          [row.id, owner],
        );
      }
      await client.query("INSERT INTO schema_migration(version) VALUES (8)");
    }
    const lifecycleMigration = await client.query(
      "SELECT 1 FROM schema_migration WHERE version=9",
    );
    if (!lifecycleMigration.rowCount) {
      const result = await client.query("SELECT kind,data FROM app_record");
      const state = emptyState();
      for (const row of result.rows)
        if (kinds.includes(row.kind))
          (state[row.kind as Kind] as unknown[]).push(row.data);
      lifecycleBaseline(state);
      for (const r of state.reservations)
        await client.query("UPDATE app_record SET data=$1 WHERE id=$2", [
          JSON.stringify(r),
          r.id,
        ]);
      await client.query("INSERT INTO schema_migration(version) VALUES (9)");
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** History needs only the actor's reservations/contributions and display names. */
export async function readBuyingState(userId: string): Promise<State> {
  const { rows } = await pool.query(
    `
    WITH relevant_reservations AS (
      SELECT r.data, r.id FROM app_record r WHERE r.kind = 'reservations' AND (
        r.data->>'buyerId' = $1 OR EXISTS (
          SELECT 1 FROM app_record c WHERE c.kind = 'contributions'
          AND c.data->>'userId' = $1 AND c.data->>'reservationId' = r.id
        )
      )
    )
    SELECT 'reservations' AS kind, data FROM relevant_reservations
    UNION ALL
    SELECT 'contributions', c.data FROM app_record c WHERE c.kind = 'contributions'
      AND (c.data->>'userId' = $1 OR c.data->>'reservationId' IN (
        SELECT id FROM relevant_reservations WHERE data->>'buyerId' = $1
      ))
    UNION ALL
    SELECT 'people', data FROM app_record WHERE kind = 'people'
    UNION ALL
    SELECT 'preferences', jsonb_build_object('userId', data->'userId', 'hideArchivedItems', data->'hideArchivedItems') FROM app_record WHERE kind='preferences'
    UNION ALL
    SELECT 'settings', data FROM app_record WHERE kind='settings'
    UNION ALL
    SELECT 'groups', data FROM app_record WHERE kind='groups'
    UNION ALL
    SELECT 'friendEntries', data FROM app_record WHERE kind='friendEntries'
    UNION ALL
    SELECT 'items', data FROM app_record WHERE kind='items' AND id IN (SELECT data->>'itemId' FROM relevant_reservations)
    UNION ALL
    SELECT 'lists', data FROM app_record WHERE kind='lists' AND id IN (SELECT data->>'listId' FROM app_record WHERE kind='items' AND id IN (SELECT data->>'itemId' FROM relevant_reservations))
  `,
    [userId],
  );
  const state = emptyState();
  for (const row of rows) (state[row.kind as Kind] as unknown[]).push(row.data);
  return state;
}

/** Read lightweight browse metadata; full descriptions and discussions are hydrated only on demand. */
export async function readCollectionState(): Promise<State> {
  const { rows } = await pool.query(`SELECT kind, CASE
    WHEN kind = 'items' THEN data - ARRAY['description','descriptionRich','productSources','purchaseOffers','recommendationEvidence']
    WHEN kind = 'comments' THEN data - ARRAY['body']
    WHEN kind = 'imports' AND data->'draft'->>'state' IS DISTINCT FROM 'active' AND data->>'status' NOT IN ('pending','running') THEN data - ARRAY['result','providerState','error']
    ELSE data END AS data FROM app_record
    WHERE kind NOT IN ('media','replays','usage','giftDiscoveryJobs','priceChecks','priceChanges','smsAttempts','smsChallenges')`);
  const state = emptyState();
  for (const row of rows)
    if (kinds.includes(row.kind))
      (state[row.kind as Kind] as unknown[]).push(row.data);
  return state;
}
export async function hydrateCollectionItems(
  state: State,
  ids: string[],
  details = false,
) {
  if (!ids.length) return;
  const { rows } = await pool.query(
    `SELECT kind, data FROM app_record WHERE
    (kind = 'items' AND id = ANY($1::text[])) OR
    ($2 AND kind = 'comments' AND data->>'itemId' = ANY($1::text[]))`,
    [ids, details],
  );
  const items = new Map(state.items.map((i) => [i.id, i]));
  for (const row of rows) {
    if (row.kind === "items") items.set(row.data.id, row.data);
    else {
      state.comments = state.comments.filter((c) => c.id !== row.data.id);
      state.comments.push(row.data);
    }
  }
  state.items = [...items.values()];
}
