import { it, expect } from "vitest";
import { stamp } from "../src/server/domain";
const url = process.env.TEST_DATABASE_URL;
it.skipIf(!url)(
  "migrates connected audiences once without reviving revoked sharing",
  async () => {
    if (!/little_hint_test(?:\?|$)/.test(url!))
      throw new Error("Use an isolated little_hint_test database.");
    process.env.DATABASE_URL = url;
    const db = await import("../src/server/db");
    try {
      await db.migrate();
      await db.pool.query("DELETE FROM app_record");
      const f = {
        ...stamp(),
        connectedAt: new Date().toISOString(),
        archived: false,
        groupIds: ["allowed"],
      };
      const archived = {
        ...stamp(),
        connectedAt: f.connectedAt,
        archived: true,
        groupIds: ["allowed"],
      };
      const item = {
        ...stamp(),
        friendEntryId: f.id,
        groupIds: ["allowed", "revoked"],
        visibility: "hidden",
        creatorId: "other-author",
      };
      const privateItem = {
        ...stamp(),
        friendEntryId: archived.id,
        groupIds: ["allowed"],
        visibility: "hidden",
      };
      const draft = {
        ...stamp(),
        draft: {
          revision: 1,
          friendEntryId: f.id,
          groupIds: ["revoked"],
          visibility: "hidden",
        },
      };
      for (const [kind, data] of [
        ["friendEntries", f],
        ["friendEntries", archived],
        ["items", item],
        ["items", privateItem],
        ["imports", draft],
      ] as const)
        await db.pool.query(
          "INSERT INTO app_record(id,kind,data) VALUES($1,$2,$3)",
          [data.id, kind, JSON.stringify(data)],
        );
      await db.pool.query("DELETE FROM schema_migration WHERE version=10");
      await db.migrate();
      const first = (
        await db.pool.query("SELECT data FROM app_record ORDER BY id")
      ).rows.map((r) => r.data);
      expect(first.find((r) => r.id === item.id)).toMatchObject({
        groupIds: ["allowed"],
        visibility: "hidden",
        creatorId: "other-author",
        friendEntryId: f.id,
      });
      expect(first.find((r) => r.id === privateItem.id)).toMatchObject({
        groupIds: [],
        visibility: "private",
      });
      expect(first.find((r) => r.id === draft.id).draft).toMatchObject({
        groupIds: [],
        visibility: "private",
        revision: 2,
      });
      await db.migrate();
      expect(
        (
          await db.pool.query("SELECT data FROM app_record ORDER BY id")
        ).rows.map((r) => r.data),
      ).toEqual(first);
    } finally {
      await db.pool.end();
    }
  },
);
