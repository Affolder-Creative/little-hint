import type { Pool } from "pg";
import { kinds } from "../shared/model";
import { assertStagingSeed } from "./deployment";
import { stagingFixtures } from "./staging-fixtures";

export async function seedStaging(pool: Pool, env = process.env) {
  assertStagingSeed(env);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(742903118)");
    // Serialize auth writes too: an empty check must hold until commit.
    await client.query(
      'LOCK TABLE "user", session, account, verification, passkey, app_record IN ACCESS EXCLUSIVE MODE',
    );
    const existing = await client.query(`SELECT EXISTS (
      SELECT 1 FROM "user" UNION ALL SELECT 1 FROM app_record
      WHERE NOT (kind = 'usage' AND COALESCE(data->>'key', '') = 'worker-heartbeat')
      UNION ALL SELECT 1 FROM session UNION ALL SELECT 1 FROM account
      UNION ALL SELECT 1 FROM verification UNION ALL SELECT 1 FROM passkey
    ) AS occupied`);
    if (existing.rows[0].occupied)
      throw new Error(
        "Staging seeding requires an empty database; reset it explicitly first.",
      );
    const { actors, state } = stagingFixtures();
    for (const a of actors)
      await client.query(
        'INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,$2,$3,true)',
        [a.id, a.name, a.email],
      );
    for (const kind of kinds)
      for (const record of state[kind])
        await client.query(
          "INSERT INTO app_record (id,kind,data) VALUES ($1,$2,$3)",
          [record.id, kind, JSON.stringify(record)],
        );
    await client.query("COMMIT");
    return actors.map((a) => a.email);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
