import {
  deliverPushBatch,
  pendingPushBatches,
  pushConfiguration,
} from "./push";
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { stamp, archiveDueLists } from "./domain";
import { PgBoss } from "pg-boss";
import { readState, transact, pool } from "./db";
import { importProduct } from "./imports";
import { deliverNotice, pollTelegram } from "./notifications";
import { validateDeployment } from "./deployment";
validateDeployment();
const boss = new PgBoss(process.env.DATABASE_URL!);
boss.on("error", () => console.error("Background queue error."));
await boss.start();
await boss.createQueue("product-import", {
  policy: "exclusive",
  retryLimit: 2,
  retryDelay: 20,
  expireInSeconds: 180,
});
await boss.createQueue("notification", {
  policy: "exclusive",
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 120,
});
await boss.createQueue("web-push", {
  policy: "exclusive",
  retryLimit: 2,
  retryDelay: 60,
  expireInSeconds: 300,
});
await boss.work<{ ids: string[] }>(
  "web-push",
  { batchSize: 1 },
  async (jobs) => {
    for (const job of jobs) await deliverPushBatch(job.data.ids);
  },
);
await boss.work<{ id: string }>(
  "product-import",
  { batchSize: 1 },
  async (jobs) => {
    for (const job of jobs) {
      const s = await readState(),
        j = s.imports.find((i) => i.id === job.data.id);
      if (!j || j.status === "complete" || j.status === "failed") continue;
      await transact((s) => {
        s.imports.find((i) => i.id === j.id)!.status = "running";
      });
      try {
        const result = await importProduct(j.url, j.userId);
        await transact((s) => {
          const row = s.imports.find((i) => i.id === j.id)!;
          row.status = "complete";
          row.result = result;
          row.revision++;
        });
      } catch {
        await transact((s) => {
          const row = s.imports.find((i) => i.id === j.id)!;
          row.status = "failed";
          row.error =
            "We could not get details from that shop. You can still enter them yourself.";
          row.revision++;
        });
      }
    }
  },
);
await boss.work<{ id: string }>(
  "notification",
  { batchSize: 1 },
  async (jobs) => {
    for (const j of jobs) await deliverNotice(j.data.id);
  },
);
let busy = false;
async function dispatch() {
  if (busy) return;
  busy = true;
  try {
    await writeFile("/tmp/little-hint-worker-heartbeat", String(Date.now()));
    await transact((s) => {
      archiveDueLists(s);
      let row = s.usage.find((u) => u.key === "worker-heartbeat");
      if (!row) {
        row = { ...stamp(), key: "worker-heartbeat", count: 0 };
        s.usage.push(row);
      }
      row.count = Date.now();
    });
    const s = await readState();
    for (const j of s.imports.filter(
      (j) => j.status === "pending" || j.status === "running",
    ))
      await boss.send("product-import", { id: j.id }, { singletonKey: j.id });
    for (const n of s.notices.filter((n) => n.status === "pending"))
      await boss.send("notification", { id: n.id }, { singletonKey: n.id });
    for (const batch of pushConfiguration() ? pendingPushBatches(s) : [])
      await boss.send(
        "web-push",
        { ids: batch.map((n) => n.id) },
        { singletonKey: batch[0].id },
      );
    await pollTelegram();
  } catch {
    console.error("Background dispatch unavailable; will retry.");
  } finally {
    busy = false;
  }
}
await dispatch();
const timer = setInterval(dispatch, 10000);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(timer);
    await boss.stop();
    await pool.end();
    process.exit(0);
  });
console.log("Little Hint worker ready.");
