import { config } from "./settings";
import { telegramInfo } from "./channel-availability";
import type {
  BatchDelivery,
  NotificationChannel,
  NotificationBatch,
  State,
} from "../shared/model";
import { readState, transact, pool } from "./db";
import { preferences } from "./domain";
import {
  batchNotices,
  inbox,
  wishlistEligible,
  wishlistMessage,
} from "./activity";
import { sendEmail, telegramCall } from "./notifications";
import {
  activePushDevice,
  pushConfiguration,
  PushResponseError,
  removePushDevice,
  sendPush,
} from "./push";

export function pendingWishlistBatches(s: State) {
  return s.notificationBatches.filter(
    (b) => b.status === "pending" && Date.parse(b.dueAt) <= Date.now(),
  );
}
const due = (d?: BatchDelivery) =>
  !d ||
  (d.status === "failed" &&
    d.attempts < 5 &&
    (!d.nextAttemptAt || Date.parse(d.nextAttemptAt) <= Date.now()));
async function receipt(
  id: string,
  destination: string,
  status: BatchDelivery["status"],
) {
  await transact((s) => {
    const batch = s.notificationBatches.find((b) => b.id === id);
    if (!batch) return;
    const attempts =
      (batch.deliveries[destination]?.attempts ?? 0) +
      (status === "skipped" ? 0 : 1);
    batch.deliveries[destination] = {
      status,
      attempts,
      ...(status === "failed"
        ? {
            nextAttemptAt: new Date(
              Date.now() + Math.min(3600, 60 * 2 ** (attempts - 1)) * 1000,
            ).toISOString(),
          }
        : {}),
    };
    batch.revision++;
  });
}
export function batchJob(batch: NotificationBatch) {
  const deliveries = Object.values(batch.deliveries);
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    status: batch.status,
    attempts: Math.max(0, ...deliveries.map((d) => d.attempts)),
    error:
      batch.status === "failed"
        ? "A notification channel could not deliver this summary. Check connected services and retry."
        : undefined,
  };
}
export function retryWishlistBatch(s: State, id: string) {
  const b = s.notificationBatches.find(
    (b) => b.id === id && b.status === "failed",
  );
  if (!b) return false;
  for (const d of Object.values(b.deliveries))
    if (d.status === "failed") {
      d.attempts = 0;
      delete d.nextAttemptAt;
    }
  b.status = "pending";
  b.revision++;
  return true;
}

// pg-boss dispatches one exclusive job per batch. Receipts survive worker
// restarts; a crash between provider acceptance and receipt remains at-least-once.
export async function deliverWishlistBatch(id: string) {
  const telegramAvailable = telegramInfo(await config()).available;
  if (!telegramAvailable) {
    await transact((s) => {
      const batch = s.notificationBatches.find((b) => b.id === id);
      if (!batch || batch.status !== "pending") return;
      for (const notice of batchNotices(s, batch)) {
        notice.suppressedChannels = [
          ...new Set([
            ...(notice.suppressedChannels ?? []),
            "telegram" as const,
          ]),
        ];
        notice.revision++;
      }
    });
  }
  await transact((s) => {
    const b = s.notificationBatches.find((b) => b.id === id);
    if (
      !b ||
      b.status !== "pending" ||
      Date.parse(b.dueAt) > Date.now() ||
      b.destinations
    )
      return;
    b.destinations = [
      "email",
      "telegram",
      ...s.pushDevices
        .filter((d) => d.userId === b.userId && d.createdAt < b.dueAt)
        .map((d) => `push:${d.id}`),
    ];
    b.revision++;
  });
  const initial = (await readState()).notificationBatches.find(
    (b) => b.id === id,
  );
  if (
    !initial ||
    initial.status !== "pending" ||
    !initial.destinations ||
    Date.parse(initial.dueAt) > Date.now()
  )
    return;
  for (const destination of initial.destinations) {
    let s = await readState();
    let b = s.notificationBatches.find((b) => b.id === id);
    if (!b || b.status !== "pending") return;
    if (
      destination === "telegram" &&
      !telegramAvailable &&
      b.deliveries[destination]?.status !== "sent"
    ) {
      await receipt(id, destination, "skipped");
      continue;
    }
    if (!due(b.deliveries[destination])) continue;
    const channel = destination.startsWith("push:")
      ? "push"
      : (destination as Exclude<NotificationChannel, "sms">);
    const deviceId = channel === "push" ? destination.slice(5) : undefined;
    let device = deviceId
      ? s.pushDevices.find((d) => d.id === deviceId && d.userId === b!.userId)
      : undefined;
    try {
      if (
        channel === "push" &&
        (!device || !pushConfiguration() || !(await activePushDevice(device)))
      ) {
        if (device && pushConfiguration()) await removePushDevice(device.id);
        await receipt(id, destination, "skipped");
        continue;
      }
      const user =
        channel === "push"
          ? { email: "", name: "" }
          : (
              await pool.query('SELECT email,name FROM "user" WHERE id=$1', [
                b.userId,
              ])
            ).rows[0];
      // Re-read after asynchronous session/account checks, immediately before
      // building content, so revoked access cannot leak into a later channel.
      s = await readState();
      b = s.notificationBatches.find((b) => b.id === id);
      if (!b || b.status !== "pending") return;
      device = deviceId
        ? s.pushDevices.find(
            (d) =>
              d.id === deviceId &&
              d.userId === b!.userId &&
              d.sessionId === device?.sessionId,
          )
        : undefined;
      const notices = batchNotices(s, b).filter(
        (n) =>
          wishlistEligible(s, n, channel) &&
          (channel !== "push" || (!!device && n.createdAt >= device.createdAt)),
      );
      if (!user || !notices.length) {
        await receipt(id, destination, "skipped");
        continue;
      }
      const prefs = preferences(s, {
        id: b.userId,
        email: user.email,
        name: user.name,
      });
      const detailed = prefs.notificationDetails?.[channel] === true;
      const text = detailed
        ? wishlistMessage(s, notices)
        : "A little update is waiting for you. Open Little Hint to see it.";
      const actionPath = `/notifications/batches/${b.id}`;
      const link = new URL(
        actionPath,
        process.env.APP_URL ?? "http://localhost:5173",
      ).href;
      if (channel === "email")
        await sendEmail(user.email, {
          kind: "update",
          text,
          actionPath,
          ...(detailed ? { wishlistPreview: text } : {}),
        });
      if (channel === "telegram")
        await telegramCall("sendMessage", {
          chat_id: prefs.chatId!,
          text: `${text} ${link}`,
          disable_web_page_preview: true,
        });
      if (channel === "push" && device)
        await sendPush(
          device,
          {
            deviceId: device.id,
            batchId: b.id,
            category: "wishlist",
            ...(detailed
              ? { wishlistPreview: { version: 1, body: text } }
              : {}),
            unreadCount: inbox(s, { id: b.userId, email: "", name: "" })
              .unreadCount,
            timestamp: Date.now(),
            tag: b.id,
          },
          b.id,
        );
      await receipt(id, destination, "sent");
    } catch (error) {
      if (
        deviceId &&
        error instanceof PushResponseError &&
        [404, 410].includes(error.status)
      ) {
        await removePushDevice(deviceId);
        await receipt(id, destination, "skipped");
      } else await receipt(id, destination, "failed");
    }
  }
  await transact((s) => {
    const b = s.notificationBatches.find((b) => b.id === id);
    if (!b || !b.destinations) return;
    const receipts = b.destinations.map((d) => b.deliveries[d]);
    if (
      receipts.every((d) => d && (d.status !== "failed" || d.attempts >= 5))
    ) {
      b.status = receipts.some((d) => d.status === "failed")
        ? "failed"
        : "sent";
      b.revision++;
      for (const n of batchNotices(s, b)) {
        n.status = b.status;
        n.pushComplete = true;
        n.revision++;
      }
    }
  });
}
