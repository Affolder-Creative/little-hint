import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { seedStaging } from "../src/server/staging-seed";
const url = process.env.STAGING_TEST_DATABASE_URL;
describe.skipIf(!url)("staging seeding transactions", () => {
  let pool: Pool;
  const env = {
    APP_ENV: "staging",
    ALLOW_SYNTHETIC_DATA: "1",
    DATABASE_URL: url,
  };
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.pathname !== "/little_hint_staging"
    )
      throw new Error(
        "Use a disposable local little_hint_staging database for these destructive tests.",
      );
    pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
    const storage = await import("../src/server/db");
    await storage.migrate(pool);
  });
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE "user",session,account,verification,passkey,app_record CASCADE',
    );
  });
  afterAll(async () => {
    await pool?.end();
  });
  it("allows and preserves the running worker's operational heartbeat", async () => {
    await pool.query(
      "INSERT INTO app_record (id,kind,data) VALUES ('heartbeat','usage',$1)",
      [JSON.stringify({ id: "heartbeat", key: "worker-heartbeat", count: 1 })],
    );
    expect(await seedStaging(pool, env)).toHaveLength(5);
    expect(
      (await pool.query("SELECT data FROM app_record WHERE id='heartbeat'"))
        .rows[0].data.count,
    ).toBe(1);
  });
  it("seeds once and refuses to overwrite existing data", async () => {
    expect(await seedStaging(pool, env)).toHaveLength(5);
    await expect(seedStaging(pool, env)).rejects.toThrow("empty database");
    expect(
      (await pool.query('SELECT count(*) FROM "user"')).rows[0].count,
    ).toBe("5");
  });
  it("allows and preserves SMS provider and quota metadata from the worker", async () => {
    const records = [
      {
        id: "sms-provider",
        account: "active-provider",
        activeAccount: "test-account",
      },
      {
        id: "sms-quota",
        account: "test-account",
        remaining: 100,
        checkedAt: new Date().toISOString(),
      },
    ];
    for (const record of records)
      await pool.query(
        "INSERT INTO app_record (id,kind,data) VALUES ($1,'smsQuotas',$2)",
        [record.id, JSON.stringify(record)],
      );
    expect(await seedStaging(pool, env)).toHaveLength(5);
    expect(
      (
        await pool.query(
          "SELECT data FROM app_record WHERE kind='smsQuotas' ORDER BY id",
        )
      ).rows.map((row) => row.data),
    ).toEqual(records);
    await expect(seedStaging(pool, env)).rejects.toThrow("empty database");
  });
  it.each([
    "smsAttempts",
    "smsConsents",
    "smsChallenges",
    "smsGrants",
    "usage",
  ])(
    "refuses a database containing %s records even without users",
    async (kind) => {
      const record = { id: "existing", key: "sms-submission", count: 1 };
      await pool.query(
        "INSERT INTO app_record (id,kind,data) VALUES ('existing',$1,$2)",
        [kind, JSON.stringify(record)],
      );
      await expect(seedStaging(pool, env)).rejects.toThrow("empty database");
      expect(
        (await pool.query("SELECT data FROM app_record WHERE id='existing'"))
          .rows[0].data,
      ).toEqual(record);
    },
  );
  it("rolls back auth and domain records together after a write failure", async () => {
    const failingPool = {
      connect: async () => {
        const client = await pool.connect();
        return {
          query: (sql: string, values?: unknown[]) => {
            if (sql.startsWith("INSERT INTO app_record"))
              throw new Error("Injected domain write failure");
            return client.query(sql, values);
          },
          release: () => client.release(),
        };
      },
    } as unknown as Pool;
    await expect(seedStaging(failingPool, env)).rejects.toThrow(
      "Injected domain write failure",
    );
    expect(
      (await pool.query('SELECT count(*) FROM "user"')).rows[0].count,
    ).toBe("0");
    expect(
      (await pool.query("SELECT count(*) FROM app_record")).rows[0].count,
    ).toBe("0");
  });
  it("serializes simultaneous seed requests", async () => {
    const results = await Promise.allSettled([
      seedStaging(pool, env),
      seedStaging(pool, env),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await pool.query('SELECT count(*) FROM "user"')).rows[0].count,
    ).toBe("5");
  });
  it("refuses databases containing only pending authentication records", async () => {
    await pool.query(
      "INSERT INTO verification (id,identifier,value,expires_at) VALUES ('test','synthetic','hashed',now())",
    );
    await expect(seedStaging(pool, env)).rejects.toThrow("empty database");
  });
});
