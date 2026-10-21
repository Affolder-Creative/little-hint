import "dotenv/config";
import { randomUUID } from "node:crypto";
import { pool, migrate, transact } from "./db";
import { stamp, command, activateAccount } from "./domain";
import type { Actor } from "../shared/model";
import { assertStagingSeed, assertStagingDatabase } from "./deployment";
import { seedStaging } from "./staging-seed";
const cmd = process.argv[2];
try {
  if (process.env.APP_ENV === "staging") assertStagingDatabase();
  if (cmd === "migrate") {
    await migrate();
    console.log("Database migrations applied.");
  } else if (cmd === "seed-staging") {
    assertStagingSeed();
    await migrate();
    const emails = await seedStaging(pool);
    console.log(
      `Synthetic staging data created. Retrieve sign-in codes from Mailpit: ${emails.join(", ")}`,
    );
  } else if (cmd === "bootstrap") {
    const email = process.argv[3]?.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      throw new Error("Usage: npm run bootstrap -- admin@example.com");
    await transact((s) => {
      if (
        s.people.some((p) => p.admin) ||
        s.invitations.some((i) => i.bootstrap && !i.revoked)
      )
        throw new Error("Administrator bootstrap already exists.");
      s.invitations.push({
        ...stamp(),
        email,
        bootstrap: true,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      });
    });
    console.log(
      "Administrator invitation created for 24 hours. Sign in with the specified email.",
    );
  } else if (cmd === "demo") {
    if (process.env.NODE_ENV === "production")
      throw new Error("Demo data is disabled in production.");
    await migrate();
    const actors: Actor[] = [
      { id: randomUUID(), name: "Alex Morgan", email: "alex@example.test" },
      { id: randomUUID(), name: "Sam Morgan", email: "sam@example.test" },
      { id: randomUUID(), name: "Jamie Chen", email: "jamie@example.test" },
      { id: randomUUID(), name: "Riley Morgan", email: "riley@example.test" },
    ];
    const count = await pool.query('SELECT count(*) FROM "user"');
    if (Number(count.rows[0].count))
      throw new Error("Demo requires an empty development database.");
    for (const a of actors)
      await pool.query(
        'INSERT INTO "user"(id,name,email,email_verified) VALUES($1,$2,$3,true)',
        [a.id, a.name, a.email],
      );
    await transact((s) => {
      actors.forEach((a, n) => {
        s.invitations.push({
          ...stamp(),
          email: a.email,
          bootstrap: n === 0,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        });
        activateAccount(s, a);
      });
      const g = command(s, actors[0], "groups.create", {
        name: "The Morgan circle",
      }) as any;
      g.memberIds = actors.map((a) => a.id);
      const gifts = [
        [
          "A slower Sunday",
          "A ceramic pour-over set",
          "For slow mornings and a really good cup of coffee.",
          4800,
          ["Kitchen", "Coffee"],
        ],
        [
          "Everyday favorites",
          "A little room for ideas",
          "A linen-bound journal for all the things worth keeping.",
          2400,
          ["Creative", "Journaling"],
        ],
        [
          "Outside, together",
          "A weekend on the trail",
          "A lightweight daypack for the next little adventure.",
          8500,
          ["Outdoors", "Travel"],
        ],
        [
          "Things I would love",
          "Music for a quiet evening",
          "A record to add to the Sunday listening stack.",
          3200,
          ["Music", "Vinyl"],
        ],
      ];
      actors.forEach((a, n) => {
        const l = command(s, a, "lists.create", {
          name: gifts[n][0],
          ownerIds: [s.people.find((p) => p.userId === a.id)!.id],
          groupIds: [g.id],
          mode: "surprise",
          description: "Illustrative development data.",
        }) as any;
        command(s, a, "items.create", {
          listId: l.id,
          title: gifts[n][1],
          description: gifts[n][2],
          priceCents: gifts[n][3],
          tags: gifts[n][4],
          quantity: 1,
        });
      });
    });
    console.log(
      "Illustrative demo data created. Sign in as alex@example.test; development email is saved under .local/mail.",
    );
  } else if (cmd === "invalidate-sessions") {
    await pool.query("DELETE FROM session");
    await pool.query("DELETE FROM verification");
    await transact((s) => {
      s.invitations.forEach((i) => {
        i.revoked = true;
      });
      s.links.forEach((l) => {
        l.consumed = true;
      });
      s.notices
        .filter((n) => n.status === "pending")
        .forEach((n) => {
          n.status = "failed";
          n.error = "Restored backup: reconcile delivery before retry.";
        });
      s.imports
        .filter((j) => j.status === "running")
        .forEach((j) => {
          j.status = "failed";
          j.error = "Restored backup: restart this import if needed.";
        });
    });
    console.log(
      "Sessions, verification codes, invitations and pending links invalidated.",
    );
  } else
    throw new Error(
      "Commands: migrate, bootstrap <email>, demo, seed-staging, invalidate-sessions",
    );
} finally {
  await pool.end();
}
