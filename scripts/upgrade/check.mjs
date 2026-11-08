// Runs inside the disposable app container, using that image's dependencies.
import assert from "node:assert/strict";
import { assertPreserved } from "./assertions.mjs";
import { createRequire } from "node:module";
import { createHmac, createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const { Client } = createRequire("/app/package.json")("pg");
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const mode = process.argv[2];
const file = "/data/uploads/.upgrade-check.json";
const kinds = [
  "people",
  "groups",
  "lists",
  "items",
  "reservations",
  "contributions",
  "exchanges",
  "groupEvents",
  "spendingRecords",
  "spendingSettings",
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const query = async (sql, args) => (await db.query(sql, args)).rows;
const schemaVersion = async () =>
  Number(
    (await query("SELECT max(version) AS version FROM schema_migration"))[0]
      .version,
  );
const records = () =>
  query(
    "SELECT id,kind,data FROM app_record WHERE kind = ANY($1) ORDER BY kind,id",
    [kinds],
  );
const users = () =>
  query('SELECT id,name,email,email_verified FROM "user" ORDER BY id');
const barrier = () =>
  query("SELECT id_hash FROM closed_account ORDER BY id_hash");
const cookie = (token) => {
  const sig = createHmac("sha256", process.env.BETTER_AUTH_SECRET)
    .update(token)
    .digest("base64");
  return `better-auth.session_token=${encodeURIComponent(token + "." + sig)}`;
};
async function request(path, token, body) {
  return fetch("http://localhost:3000/api/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      cookie: cookie(token),
      origin: process.env.APP_URL,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function views(sessions) {
  const result = {};
  for (const { email, token } of sessions) {
    const response = await request("world", token);
    assert.equal(response.status, 200, `Authenticated world for ${email}`);
    const world = await response.json();
    result[email] = Object.fromEntries(
      [
        "people",
        "groups",
        "lists",
        "items",
        "buying",
        "contributionHistory",
        "exchanges",
      ].map((key) => [key, world[key]]),
    );
  }
  const recipient = result["alex@example.test"].items.find(
    (i) => i.title === "Ceramic pour-over set",
  );
  const buyer = result["sam@example.test"].items.find(
    (i) => i.title === "Ceramic pour-over set",
  );
  assert.ok(recipient && buyer, "privacy fixture must be visible");
  assert.equal(
    recipient.reservations,
    undefined,
    "surprise recipient must not see reservations",
  );
  assert.ok(
    buyer.reservations?.length,
    "positive control: buyer sees reservations",
  );
  assert.ok(
    result["jamie@example.test"].buying.some((r) => r.purchased > 0),
    "purchased gift fixture",
  );
  return result;
}
try {
  if (mode === "prepare") {
    const sessions = [];
    for (const user of await users()) {
      const token = randomUUID();
      await db.query(
        "INSERT INTO session(id,token,user_id,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",
        [randomUUID(), token, user.id],
      );
      sessions.push({ email: user.email, token });
    }
    assert.equal(sessions.length, 5, "released synthetic fixture accounts");
    await db.query(
      "INSERT INTO verification(id,identifier,value,expires_at) VALUES($1,'upgrade-fixture','synthetic',now()+interval '1 day')",
      [randomUUID()],
    );
    await db.query("INSERT INTO closed_account(id_hash) VALUES($1)", [
      hash("synthetic-closed-account"),
    ]);
    await writeFile(
      "/data/uploads/upgrade-fixture.txt",
      "Synthetic private upload\n",
    );
    await writeFile(file, JSON.stringify({ sessions }));
  } else {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (mode === "capture") {
      for (const session of saved.sessions) {
        const response = await request("spending/settings", session.token, {
          enabled: true,
          summaries: true,
        });
        assert.equal(response.status, 200, await response.text());
      }
      saved.views = await views(saved.sessions);
      saved.records = await records();
      saved.schemaVersion = await schemaVersion();
      for (const kind of kinds)
        assert.ok(
          saved.records.some((r) => r.kind === kind),
          `nonempty ${kind}`,
        );
      saved.users = await users();
      saved.barrier = await barrier();
      saved.uploadHash = hash(
        await readFile("/data/uploads/upgrade-fixture.txt"),
      );
      await writeFile(file, JSON.stringify(saved));
    } else if (mode === "queue") {
      const { PgBoss } = await import(
        createRequire("/app/package.json").resolve("pg-boss")
      );
      const boss = new PgBoss(process.env.DATABASE_URL);
      boss.on("error", () => {});
      await boss.start();
      try {
        // A removed import is deliberately acknowledged without external I/O.
        saved.jobId = await boss.send("product-import", { id: randomUUID() });
        assert.ok(saved.jobId, "persisted queue probe");
        await writeFile(file, JSON.stringify(saved));
      } finally {
        await boss.stop();
      }
    } else if (mode === "write") {
      const actor = saved.sessions.find((s) => s.email === "alex@example.test");
      const list = saved.views[actor.email].lists.find(
        (l) => l.name === "Alex's wishes",
      );
      const response = await request("items", actor.token, {
        listId: list.id,
        title: "Post-upgrade write probe",
        quantity: 1,
        priceCents: 1234,
      });
      assert.equal(response.status, 200, await response.text());
      assert.ok(
        (await records()).some(
          (r) =>
            r.kind === "items" &&
            r.data.title === "Post-upgrade write probe" &&
            r.data.priceCents === 1234,
        ),
      );
    } else if (mode === "verify") {
      assert.ok(saved.jobId, "queue probe must exist");
      let completed = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const jobs = await query(
          "SELECT state FROM pgboss.job WHERE id=$1 AND name='product-import'",
          [saved.jobId],
        );
        if (jobs[0]?.state === "completed") {
          completed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      assert.ok(
        completed,
        "worker must acknowledge the job persisted before shutdown",
      );
      assertPreserved(
        {
          views: await views(saved.sessions),
          records: await records(),
          schemaVersion: await schemaVersion(),
          users: await users(),
          barrier: await barrier(),
          uploadHash: hash(await readFile("/data/uploads/upgrade-fixture.txt")),
        },
        saved,
      );
    } else if (mode === "invalidated") {
      assert.equal((await query("SELECT * FROM session")).length, 0);
      assert.equal((await query("SELECT * FROM verification")).length, 0);
      for (const session of saved.sessions)
        assert.equal(
          (await request("world", session.token)).status,
          401,
          "restored sessions rejected",
        );
      assert.deepEqual(
        await users(),
        saved.users,
        "invalidation preserves accounts",
      );
      assert.deepEqual(await barrier(), saved.barrier);
      assert.deepEqual(
        await records(),
        saved.records,
        "invalidation preserves financial and gift history",
      );
      assert.equal(
        hash(await readFile("/data/uploads/upgrade-fixture.txt")),
        saved.uploadHash,
      );
      const invites = await query(
        "SELECT data FROM app_record WHERE kind='invitations'",
      );
      assert.ok(invites.length);
      assert.ok(
        invites.every((r) => r.data.revoked),
        "restored invitations revoked",
      );
    } else throw new Error("Unknown check mode");
  }
  console.log(`Upgrade check: ${mode} passed.`);
} finally {
  await db.end();
}
