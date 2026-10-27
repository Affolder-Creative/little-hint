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
export async function readState(): Promise<State> {
  const rows = await db.select().from(schema.records);
  const state = emptyState();
  for (const row of rows) {
    if (kinds.includes(row.kind as Kind))
      (state[row.kind as Kind] as unknown[]).push(row.data);
  }
  return state;
}
// A single transaction lock coordinates domain writes across app and worker processes.
// This deliberately favors correctness for a private family installation over write throughput.
export async function transact<T>(
  fn: (s: State) => T | Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(742903118)`);
    const rows = await tx.select().from(schema.records);
    const state = emptyState();
    const before = new Map(rows.map((r) => [r.id, JSON.stringify(r.data)]));
    for (const row of rows) {
      if (kinds.includes(row.kind as Kind))
        (state[row.kind as Kind] as unknown[]).push(row.data);
    }
    const result = await fn(state);
    const after = new Set<string>();
    for (const kind of kinds)
      for (const record of state[kind]) {
        after.add(record.id);
        if (before.get(record.id) !== JSON.stringify(record))
          await tx
            .insert(schema.records)
            .values({ id: record.id, kind, data: record })
            .onConflictDoUpdate({
              target: schema.records.id,
              set: { data: record, kind },
            });
      }
    for (const id of before.keys())
      if (!after.has(id))
        await tx.delete(schema.records).where(eq(schema.records.id, id));
    return result;
  });
}
export async function migrate(databasePool = pool) {
  const client = await databasePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(742903119)");
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migration (version integer primary key, applied_at timestamptz not null default now());`,
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
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
