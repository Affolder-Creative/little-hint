import { createECDH } from "node:crypto";
import webPush from "web-push";
import { Agent, fetch as request } from "undici";
import { lookup } from "node:dns/promises";
import { z } from "zod";
import { pool, readState, transact } from "./db";
import { deploymentEnvironment } from "./deployment";
import { publicAddress, validateUrl } from "./imports";
import { stamp, fail } from "./domain";
import {
  activityAllowed,
  inbox,
  topicEnabled,
  watchesItem,
  wishlistEligible,
} from "./activity";
import type { Actor, Notice, PushDevice, State } from "../shared/model";

export function pushConfiguration() {
  if (["staging", "preview", "test"].includes(deploymentEnvironment()))
    return null;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  try {
    const url = new URL(subject);
    if (!["mailto:", "https:"].includes(url.protocol)) return null;
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (!pair.getPublicKey().equals(Buffer.from(publicKey, "base64url")))
      return null;
  } catch {
    return null;
  }
  return { publicKey, privateKey, subject };
}
const dispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { all: true }).then(
        (addresses) => {
          if (
            !addresses.length ||
            addresses.some((a) => !publicAddress(a.address))
          )
            return callback(
              new Error("Private network destination blocked."),
              [],
              0,
            );
          if ((options as { all?: boolean }).all)
            (callback as Function)(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
        () =>
          callback(new Error("Push hostname could not be resolved."), [], 0),
      );
    },
  },
});
export async function validatePushEndpoint(endpoint: string) {
  const u = new URL(endpoint);
  if (
    u.protocol !== "https:" ||
    u.hash ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    fail(400, "Use a valid browser push subscription.");
  await validateUrl(endpoint);
}
export async function subscribePush(
  a: Actor,
  sessionId: string,
  raw: unknown,
  agent = "",
) {
  if (!pushConfiguration())
    fail(409, "Push notifications are not configured on this installation.");
  const p = z
    .object({
      endpoint: z.url().max(4096),
      keys: z.object({
        p256dh: z
          .string()
          .regex(/^[\w-]+={0,2}$/)
          .refine((v) => Buffer.from(v, "base64url").length === 65),
        auth: z
          .string()
          .regex(/^[\w-]+={0,2}$/)
          .refine((v) => Buffer.from(v, "base64url").length === 16),
      }),
    })
    .parse(raw);
  await validatePushEndpoint(p.endpoint);
  return transact((s) => {
    const old = s.pushDevices.find((d) => d.endpoint === p.endpoint);
    const current = old?.userId === a.id && old.sessionId === sessionId;
    s.pushDevices = s.pushDevices.filter((d) => d.endpoint !== p.endpoint);
    const label = /iPhone|iPad/.test(agent)
      ? "iPhone / iPad"
      : /Android/.test(agent)
        ? "Android"
        : /Firefox/.test(agent)
          ? "Firefox"
          : /Edg/.test(agent)
            ? "Edge"
            : /Chrome/.test(agent)
              ? "Chrome"
              : /Safari/.test(agent)
                ? "Safari"
                : "Browser";
    const device: PushDevice = {
      ...(current ? old : stamp()),
      userId: a.id,
      sessionId,
      ...p,
      label,
    };
    s.pushDevices.push(device);
    return { id: device.id, label };
  });
}
export async function activePushDevice(d: PushDevice) {
  const result = await pool.query(
    "SELECT id FROM session WHERE id=$1 AND user_id=$2 AND expires_at > now()",
    [d.sessionId, d.userId],
  );
  return result.rows.length > 0;
}
export async function removePushDevice(id: string, userId?: string) {
  await transact((s) => {
    s.pushDevices = s.pushDevices.filter(
      (d) => d.id !== id || (userId !== undefined && d.userId !== userId),
    );
  });
}
export class PushResponseError extends Error {
  constructor(public status: number) {
    super("Push delivery unavailable.");
  }
}
type PushPayload = {
  deviceId: string;
  notificationId?: string;
  batchId?: string;
  wishlistPreview?: { version: 1; body: string };
  category?: Notice["event"] | "ownership-request";
  test?: boolean;
  unreadCount: number;
  timestamp: number;
  tag: string;
};
export async function sendPush(
  d: PushDevice,
  payload: PushPayload,
  topic: string,
) {
  const vapidDetails = pushConfiguration();
  if (!vapidDetails) throw new Error("Push is not configured.");
  await validatePushEndpoint(d.endpoint);
  const details = webPush.generateRequestDetails(
    { endpoint: d.endpoint, keys: d.keys },
    JSON.stringify(payload),
    {
      vapidDetails,
      TTL: 3600,
      urgency: "normal",
      topic: topic.replace(/[^\w-]/g, "").slice(0, 32),
    },
  );
  const response = await request(details.endpoint, {
    method: "POST",
    headers: details.headers as Record<string, string>,
    body: new Uint8Array(details.body!),
    dispatcher,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new PushResponseError(response.status);
}
function eligible(s: State, n: Notice) {
  if (n.event === "wishlist") return wishlistEligible(s, n, "push");
  if (n.readAt || !activityAllowed(s, n) || !topicEnabled(s, n, "push"))
    return false;
  if (n.event === "discussion" && n.itemId)
    return watchesItem(s, n.userId, n.itemId);
  return true;
}
export function pendingPushBatches(s: State) {
  const groups = new Map<string, Notice[]>();
  for (const n of s.notices) {
    if (
      n.batchId ||
      !n.inbox ||
      n.pushComplete ||
      (n.pushDueAt && Date.parse(n.pushDueAt) > Date.now())
    )
      continue;
    const key =
      n.event === "wishlist" ? `${n.userId}:${n.listId}:${n.pushDueAt}` : n.id;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return [...groups.values()].map((ns) =>
    ns.sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    ),
  );
}
export async function deliverPushBatch(ids: string[]) {
  if (!pushConfiguration()) return;
  let s = await readState();
  let notices = ids.flatMap((id) => s.notices.filter((n) => n.id === id));
  if (!notices.length || notices.every((n) => n.pushComplete)) return;
  const lead = notices[0];
  const devices = s.pushDevices.filter((d) => d.userId === lead.userId);
  let complete = true;
  for (const device of devices) {
    const timestamp = Date.now();
    s = await readState();
    notices = ids.flatMap((id) => s.notices.filter((n) => n.id === id));
    const source = notices.find(
      (n) => n.createdAt >= device.createdAt && eligible(s, n),
    );
    const current = s.pushDevices.find(
      (d) => d.id === device.id && d.sessionId === device.sessionId,
    );
    const receipt = notices[0]?.pushDeliveries?.[device.id];
    if (
      !source ||
      !current ||
      receipt?.status === "sent" ||
      (receipt?.attempts ?? 0) >= 5
    )
      continue;
    if (
      receipt?.nextAttemptAt &&
      Date.parse(receipt.nextAttemptAt) > Date.now()
    ) {
      complete = false;
      continue;
    }
    if (!(await activePushDevice(current))) {
      await removePushDevice(current.id);
      continue;
    }
    try {
      await sendPush(
        current,
        {
          deviceId: current.id,
          notificationId: source.id,
          category:
            source.event === "invitation" &&
            source.action === "ownership-request"
              ? "ownership-request"
              : source.event,
          unreadCount: inbox(s, { id: source.userId, email: "", name: "" })
            .unreadCount,
          timestamp,
          tag: lead.id,
        },
        lead.id,
      );
      await transact((s) => {
        const n = s.notices.find((n) => n.id === lead.id);
        if (n)
          (n.pushDeliveries ??= {})[current.id] = {
            status: "sent",
            attempts: (receipt?.attempts ?? 0) + 1,
          };
      });
    } catch (error) {
      if (
        error instanceof PushResponseError &&
        [404, 410].includes(error.status)
      ) {
        await removePushDevice(current.id);
        continue;
      }
      const attempts = (receipt?.attempts ?? 0) + 1;
      if (attempts < 5) complete = false;
      await transact((s) => {
        const n = s.notices.find((n) => n.id === lead.id);
        if (n)
          (n.pushDeliveries ??= {})[current.id] = {
            status: "failed",
            attempts,
            nextAttemptAt: new Date(
              Date.now() + Math.min(3600, 60 * 2 ** (attempts - 1)) * 1000,
            ).toISOString(),
          };
      });
    }
  }
  if (complete)
    await transact((s) => {
      for (const n of s.notices.filter((n) => ids.includes(n.id)))
        n.pushComplete = true;
    });
}
