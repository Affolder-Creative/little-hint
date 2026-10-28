import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { seedPreview } from "../src/server/preview-seed";
const url = process.env.PREVIEW_TEST_DATABASE_URL;
describe.skipIf(!url)("preview seeding transactions", () => {
  let pool: Pool;
  const env = {
    APP_ENV: "preview",
    NODE_ENV: "production",
    ALLOW_SYNTHETIC_DATA: "1",
    DATABASE_URL: url,
  };
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.pathname !== "/little_hint_preview"
    )
      throw new Error(
        "Use a disposable local little_hint_preview database for these destructive tests.",
      );
    pool = new Pool({ connectionString: url, connectionTimeoutMillis: 3000 });
    const storage = await import("../src/server/db");
    await storage.migrate(pool);
  });
  beforeEach(async () => {
    await pool.query("DROP TABLE IF EXISTS preview_seed");
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
    expect(await seedPreview(pool, env)).toHaveLength(5);
    expect(
      (await pool.query("SELECT data FROM app_record WHERE id='heartbeat'"))
        .rows[0].data.count,
    ).toBe(1);
  });
  it("seeds once and refuses to overwrite existing data", async () => {
    expect(await seedPreview(pool, env)).toHaveLength(5);
    await expect(seedPreview(pool, env)).rejects.toThrow("empty database");
    expect(
      (await pool.query('SELECT count(*) FROM "user"')).rows[0].count,
    ).toBe("5");
  });
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
    await expect(seedPreview(failingPool, env)).rejects.toThrow(
      "Injected domain write failure",
    );
    expect(
      (await pool.query('SELECT count(*) FROM "user"')).rows[0].count,
    ).toBe("0");
    expect(
      (await pool.query("SELECT count(*) FROM app_record")).rows[0].count,
    ).toBe("0");
  });
  it("skips only a committed seed marker and preserves changes", async () => {
    await seedPreview(pool, env, true);
    await pool.query(
      `UPDATE "user" SET name='Edited Alex' WHERE email='alex@example.test'`,
    );
    expect(await seedPreview(pool, env, true)).toEqual([]);
    expect(
      (
        await pool.query(
          `SELECT name FROM "user" WHERE email='alex@example.test'`,
        )
      ).rows[0].name,
    ).toBe("Edited Alex");
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM app_record WHERE kind='households'",
        )
      ).rows[0].count,
    ).not.toBe("0");
  });
  it("rejects a connection whose actual role/database differs from the declared URL", async () => {
    const client = await pool.connect();
    const fake = {
      connect: async () => ({
        query: (sql: string, values?: unknown[]) =>
          sql.includes("current_database()")
            ? Promise.resolve({
                rows: [
                  { db: "little_hint_staging", role: "little_hint_staging" },
                ],
              })
            : client.query(sql, values),
        release: () => client.release(),
      }),
    } as unknown as Pool;
    await expect(seedPreview(fake, env)).rejects.toThrow(
      "Connected database and role",
    );
  });
  it("serializes simultaneous seed requests", async () => {
    const results = await Promise.allSettled([
      seedPreview(pool, env),
      seedPreview(pool, env),
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
    await expect(seedPreview(pool, env, true)).rejects.toThrow(
      "empty database",
    );
  });
});
