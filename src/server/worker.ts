import { ImportPending, BrightDataFailure } from "./brightdata";
import { pollSmsStatus, alertLowSmsCredit } from "./sms";
import {
  deliverWishlistBatch,
  pendingWishlistBatches,
} from "./wishlist-delivery";
import { processDiscovery } from "./gift-discovery-worker";
import { pruneDiscovery } from "./gift-discovery";
import { discoveryConfigForState, effectiveConfig } from "./settings";
import { removeDeletedMedia } from "./media";
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
import { lookupDisabledMessage } from "../shared/product-lookup";
import { importProduct } from "./imports";
import { pruneImportCache } from "./import-cache";
import { deliverNotice, pollTelegram } from "./notifications";
import { validateDeployment } from "./deployment";
validateDeployment();
effectiveConfig();
const boss = new PgBoss(process.env.DATABASE_URL!);
boss.on("error", () => console.error("Background queue error."));
await boss.start();
await boss.createQueue("gift-discovery", {
  policy: "exclusive",
  retryLimit: 0,
  expireInSeconds: 240,
});
await boss.work<{ id: string }>(
  "gift-discovery",
  { batchSize: 1 },
  async (jobs) => {
    for (const job of jobs) await processDiscovery(job.data.id);
  },
);
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
await boss.createQueue("wishlist-notification", {
  policy: "exclusive",
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 300,
});
await boss.work<{ id: string }>(
  "wishlist-notification",
  { batchSize: 1 },
  async (jobs) => {
    for (const job of jobs) await deliverWishlistBatch(job.data.id);
  },
);
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
      if (
        !j ||
        (j.draft && j.draft.state !== "active") ||
        j.status === "complete" ||
        j.status === "failed"
      )
        continue;
      await transact((s) => {
        s.imports.find((i) => i.id === j.id)!.status = "running";
      });
      try {
        const result = await importProduct(
          j.url,
          j.userId,
          j.forceRefresh,
          j.id,
        );
        await transact((s) => {
          const row = s.imports.find((i) => i.id === j.id)!;
          row.status = "complete";
          row.result = result;
          if (
            row.draft?.state === "active" &&
            !s.notices.some((n) => n.importId === row.id)
          )
            s.notices.push({
              ...stamp(),
              userId: row.userId,
              event: "import",
              importId: row.id,
              inbox: true,
              status: "sent",
              attempts: 0,
              delivered: [],
              deliveryChannels: [],
              pushComplete: true,
            });
          row.revision++;
        });
      } catch (error) {
        if (error instanceof ImportPending) continue;
        await transact((s) => {
          const row = s.imports.find((i) => i.id === j.id)!;
          row.status = "failed";
          row.diagnostic ??=
            error instanceof BrightDataFailure
              ? { stage: error.stage, reason: error.message }
              : {
                  stage: "lookup",
                  reason:
                    error instanceof Error &&
                    /^(Bright Data HTTP \d{3}|Collection timed out|Collection failed|Submission outcome uncertain; do not automatically resubmit)$/.test(
                      error.message,
                    )
                      ? error.message
                      : "No usable product details",
                };
          row.error =
            error instanceof Error && error.message === lookupDisabledMessage
              ? lookupDisabledMessage
              : "We could not get details from that shop. You can still enter them yourself.";
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
let lastCachePrune = 0;
async function dispatch() {
  if (busy) return;
  busy = true;
  try {
    if (Date.now() - lastCachePrune >= 3600000) {
      await pruneImportCache();
      await removeDeletedMedia();
      lastCachePrune = Date.now();
    }
    await writeFile("/tmp/little-hint-worker-heartbeat", String(Date.now()));
    await transact((s) => {
      pruneDiscovery(s, discoveryConfigForState(s));
      archiveDueLists(s);
      let row = s.usage.find((u) => u.key === "worker-heartbeat");
      if (!row) {
        row = { ...stamp(), key: "worker-heartbeat", count: 0 };
        s.usage.push(row);
      }
      row.count = Date.now();
    });
    const s = await readState();
    for (const j of s.giftDiscoveryJobs.filter(
      (j) => j.status === "pending" || j.status === "reviewing",
    ))
      await boss.send("gift-discovery", { id: j.id }, { singletonKey: j.id });
    for (const j of s.imports.filter(
      (j) =>
        (!j.draft || j.draft.state === "active") &&
        (j.status === "pending" || j.status === "running") &&
        (!j.providerState?.nextPollAt ||
          Date.parse(j.providerState.nextPollAt) <= Date.now()),
    ))
      await boss.send("product-import", { id: j.id }, { singletonKey: j.id });
    for (const n of s.notices.filter(
      (n) => !n.batchId && n.status === "pending",
    ))
      await boss.send("notification", { id: n.id }, { singletonKey: n.id });
    for (const batch of pushConfiguration() ? pendingPushBatches(s) : [])
      await boss.send(
        "web-push",
        { ids: batch.map((n) => n.id) },
        { singletonKey: batch[0].id },
      );
    for (const batch of pendingWishlistBatches(s))
      await boss.send(
        "wishlist-notification",
        { id: batch.id },
        { singletonKey: batch.id },
      );
    await pollSmsStatus();
    await alertLowSmsCredit();
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
