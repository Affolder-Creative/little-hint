import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { State, PushDevice } from "../src/shared/model";
import { stamp, command } from "../src/server/domain";
import { wishlistFixture } from "./wishlist-fixture";
const mock = vi.hoisted(() => ({
  state: null as State | null,
  email: vi.fn(),
  telegram: vi.fn(),
  push: vi.fn(),
  active: vi.fn(),
  configured: true,
}));
vi.mock("../src/server/db", () => ({
  readState: async () => mock.state,
  transact: async (fn: any) => fn(mock.state),
  pool: {
    query: async () => ({
      rows: [{ email: "reader@example.test", name: "Reader" }],
    }),
  },
}));
vi.mock("../src/server/notifications", () => ({
  sendEmail: (...a: any[]) => mock.email(...a),
  telegramCall: (...a: any[]) => mock.telegram(...a),
}));
vi.mock("../src/server/push", () => ({
  sendPush: (...a: any[]) => mock.push(...a),
  activePushDevice: (...a: any[]) => mock.active(...a),
  pushConfiguration: () => (mock.configured ? {} : null),
  removePushDevice: async (id: string) => {
    mock.state!.pushDevices = mock.state!.pushDevices.filter(
      (d) => d.id !== id,
    );
  },
  PushResponseError: class extends Error {
    constructor(public status: number) {
      super("Push failed");
    }
  },
}));
import {
  deliverWishlistBatch,
  pendingWishlistBatches,
  retryWishlistBatch,
} from "../src/server/wishlist-delivery";
import { PushResponseError } from "../src/server/push";

function fixture() {
  const f = wishlistFixture();
  mock.state = f.s;
  f.follow("group", f.group.id);
  const device: PushDevice = {
    ...stamp(),
    createdAt: "2026-10-27T11:00:00.000Z",
    userId: f.reader.id,
    sessionId: "reader-session",
    label: "Browser",
    endpoint: "https://push.example.test",
    keys: { auth: "a", p256dh: "b" },
  };
  f.s.pushDevices.push(device);
  const item = f.add("most-wanted");
  const batch = f.s.notificationBatches[0];
  return { ...f, device, item, batch };
}
beforeEach(() => {
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("TELEGRAM_ENABLED", "true");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
  vi.stubEnv("TELEGRAM_BOT_NAME", "test-bot");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
  for (const fn of [mock.email, mock.telegram, mock.push])
    fn.mockReset().mockResolvedValue({});
  mock.active.mockReset().mockResolvedValue(true);
  mock.configured = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const closeWindow = () => vi.advanceTimersByTime(15 * 60_000);

describe("cross-channel wish-list summary delivery", () => {
  it("retries only the failed push device and preserves completed destinations", async () => {
    const f = fixture();
    const second = { ...f.device, id: stamp().id, sessionId: "second-session" };
    f.s.pushDevices.push(second);
    let failed = false;
    mock.push.mockImplementation(async (device: PushDevice) => {
      if (device.id === second.id && !failed) {
        failed = true;
        throw new Error("temporarily unavailable");
      }
    });
    closeWindow();
    await deliverWishlistBatch(f.batch.id);
    expect(f.batch.status).toBe("pending");
    vi.advanceTimersByTime(60_000);
    await deliverWishlistBatch(f.batch.id);
    expect(f.batch.status).toBe("sent");
    expect(
      mock.push.mock.calls.filter(([d]) => d.id === f.device.id),
    ).toHaveLength(1);
    expect(
      mock.push.mock.calls.filter(([d]) => d.id === second.id),
    ).toHaveLength(2);
    expect(mock.email).toHaveBeenCalledOnce();
  });
  it("sends one summary per channel and device after a fixed window, and never resends successes", async () => {
    const f = fixture();
    await deliverWishlistBatch(f.batch.id);
    expect(mock.email).not.toHaveBeenCalled();
    vi.advanceTimersByTime(6 * 60_000);
    f.add();
    vi.advanceTimersByTime(5 * 60_000);
    f.add("would-love");
    expect(pendingWishlistBatches(f.s)).toHaveLength(0);
    vi.advanceTimersByTime(4 * 60_000);
    await deliverWishlistBatch(f.batch.id);
    await deliverWishlistBatch(f.batch.id);
    for (const fn of [mock.email, mock.telegram, mock.push])
      expect(fn).toHaveBeenCalledOnce();
    const text =
      'John added 3 items to "Birthday", including 1 marked Most wanted.';
    expect(mock.email.mock.calls[0][1]).toMatchObject({
      text,
      wishlistPreview: text,
      actionPath: `/notifications/batches/${f.batch.id}`,
    });
    expect(mock.push.mock.calls[0][1]).toMatchObject({
      wishlistPreview: { version: 1, body: text },
      batchId: f.batch.id,
      unreadCount: 3,
    });
    expect(f.batch.destinations).not.toContain("sms");
    expect(f.batch.deliveries).not.toHaveProperty("sms");
    expect(
      JSON.stringify([
        mock.email.mock.calls,
        mock.telegram.mock.calls,
        mock.push.mock.calls,
      ]),
    ).not.toContain("Private item");
    expect(f.batch.status).toBe("sent");
  });
  it("uses generic previews by default and respects each channel's detail preference", async () => {
    const f = fixture();
    f.prefs.notificationDetails = {
      push: false,
      email: false,
      sms: false,
      telegram: true,
    };
    closeWindow();
    await deliverWishlistBatch(f.batch.id);
    expect(mock.email.mock.calls[0][1].wishlistPreview).toBeUndefined();
    expect(mock.push.mock.calls[0][1].wishlistPreview).toBeUndefined();
    expect(mock.telegram.mock.calls[0][1].text).toContain("John");
  });
  it("filters read, archived and deleted additions and freezes event-time priority", async () => {
    const f = fixture();
    f.item.priority = null;
    f.add().archived = true;
    f.add().deletedAt = new Date().toISOString();
    f.add();
    f.s.notices.at(-1)!.readAt = new Date().toISOString();
    closeWindow();
    await deliverWishlistBatch(f.batch.id);
    expect(mock.email.mock.calls[0][1].text).toBe(
      'John added a most-wanted item to "Birthday".',
    );
    expect(mock.push.mock.calls[0][1].wishlistPreview.body).not.toContain(
      "4 items",
    );
  });
  it.each([
    "mute",
    "unfollow",
    "leave",
    "archive",
    "delete",
    "read",
    "household",
    "stop-sms",
  ])("rechecks queued eligibility after %s", async (change) => {
    const f = fixture();
    if (change === "mute")
      f.follow("list", f.list.id, { following: false, muted: true });
    if (change === "unfollow")
      f.follow("group", f.group.id, { following: false });
    if (change === "leave") f.group.memberIds = [f.john.id];
    if (change === "archive") f.list.archived = true;
    if (change === "delete") f.list.deletedAt = new Date().toISOString();
    if (change === "read")
      command(f.s, f.reader, "notifications.read", {
        ids: [f.s.notices[0].id],
        read: true,
      });
    if (change === "household") {
      f.follow("group", f.group.id, { following: false });
      f.follow("household", f.household.id);
      f.s.householdMemberships = [];
    }
    if (change === "stop-sms") {
      f.follow("list", f.list.id, { channels: ["sms"] });
      f.prefs.smsOptOut = true;
    }
    closeWindow();
    await deliverWishlistBatch(f.batch.id);
    for (const fn of [mock.email, mock.telegram, mock.push])
      expect(fn).not.toHaveBeenCalled();
    expect(f.batch.status).toBe("sent");
  });
  it("rechecks access between channels", async () => {
    const f = fixture();
    mock.email.mockImplementation(async () => {
      f.group.memberIds = [f.john.id];
    });
    closeWindow();
    await deliverWishlistBatch(f.batch.id);
    expect(mock.email).toHaveBeenCalledOnce();
    for (const fn of [mock.telegram, mock.push])
      expect(fn).not.toHaveBeenCalled();
  });
  it("honors a push-only override without bypassing globally disabled channels", async () => {
    const f = fixture();
    f.follow("list", f.list.id, { channels: ["push", "email"] });
    f.prefs.email = false;
    closeWindow();
    await deliverWishlistBatch(f.batch.id);
    expect(mock.push).toHaveBeenCalledOnce();
    for (const fn of [mock.email, mock.telegram])
      expect(fn).not.toHaveBeenCalled();
  });
  it("does not backfill channels or new devices, and filters device-specific summary counts", async () => {
    const f = fixture();
    f.s.notices[0].deliveryChannels = ["push"];
    f.device.createdAt = "2026-10-27T12:01:00.000Z";
    vi.advanceTimersByTime(2 * 60_000);
    f.add();
    closeWindow();
    const late = {
      ...f.device,
      id: stamp().id,
      createdAt: new Date().toISOString(),
    };
    f.s.pushDevices.push(late);
    await deliverWishlistBatch(f.batch.id);
    expect(mock.push).toHaveBeenCalledOnce();
    expect(mock.push.mock.calls[0][1].wishlistPreview.body).toBe(
      'John added something to "Birthday".',
    );
    expect(mock.email.mock.calls[0][1].text).toBe(
      'John added something to "Birthday".',
    );
  });
  it("retries failures independently and re-evaluates preview opt-out", async () => {
    const f = fixture();
    mock.email.mockRejectedValueOnce(new Error("offline"));
    closeWindow();
    await deliverWishlistBatch(f.batch.id);
    expect(f.batch.status).toBe("pending");
    await deliverWishlistBatch(f.batch.id);
    expect(mock.email).toHaveBeenCalledOnce();
    f.prefs.notificationDetails!.email = false;
    vi.advanceTimersByTime(60_000);
    await deliverWishlistBatch(f.batch.id);
    expect(mock.email).toHaveBeenCalledTimes(2);
    expect(mock.email.mock.calls[1][1].wishlistPreview).toBeUndefined();
    for (const fn of [mock.telegram, mock.push])
      expect(fn).toHaveBeenCalledOnce();
    expect(f.batch.status).toBe("sent");
  });
  it("stops at five failed attempts and admin retry preserves successful channels", async () => {
    const f = fixture();
    mock.telegram.mockRejectedValue(new Error("offline"));
    closeWindow();
    for (let i = 0; i < 5; i++) {
      await deliverWishlistBatch(f.batch.id);
      vi.advanceTimersByTime(3600_000);
    }
    expect(f.batch.status).toBe("failed");
    expect(mock.telegram).toHaveBeenCalledTimes(5);
    expect(retryWishlistBatch(f.s, f.batch.id)).toBe(true);
    mock.telegram.mockResolvedValue({});
    await deliverWishlistBatch(f.batch.id);
    expect(mock.email).toHaveBeenCalledOnce();
    expect(mock.push).toHaveBeenCalledOnce();
    expect(f.batch.status).toBe("sent");
  });
  it("removes expired devices and suppresses revoked sessions", async () => {
    const f = fixture();
    mock.push.mockRejectedValueOnce(new PushResponseError(410));
    closeWindow();
    await deliverWishlistBatch(f.batch.id);
    expect(f.s.pushDevices).toHaveLength(0);
    const next = fixture();
    mock.push.mockClear();
    mock.active.mockResolvedValue(false);
    closeWindow();
    await deliverWishlistBatch(next.batch.id);
    expect(mock.push).not.toHaveBeenCalled();
    expect(next.s.pushDevices).toHaveLength(0);
  });
  it("does not send real push when installation delivery is disabled", async () => {
    const f = fixture();
    mock.configured = false;
    closeWindow();
    await deliverWishlistBatch(f.batch.id);
    expect(mock.push).not.toHaveBeenCalled();
    expect(f.s.pushDevices).toHaveLength(1);
  });
});

it("does not catch up on Telegram notices created while disabled, including mixed batches", async () => {
  vi.stubEnv("TELEGRAM_ENABLED", "false");
  const f = fixture();
  const disabledItem = f.item;
  vi.stubEnv("TELEGRAM_ENABLED", "true");
  const enabledItem = f.add();
  await closeWindow();
  await deliverWishlistBatch(f.batch.id);
  expect(mock.telegram).toHaveBeenCalledOnce();
  const text = mock.telegram.mock.calls[0][1].text;
  expect(text).toContain('John added something to "Birthday".');
  expect(text).not.toContain("Most wanted");
  expect(
    f.s.notices.find((n) => n.itemId === disabledItem.id)?.suppressedChannels,
  ).toContain("telegram");
  expect(
    f.s.notices.find((n) => n.itemId === enabledItem.id)?.suppressedChannels,
  ).not.toContain("telegram");
});

it("skips disabled Telegram without retrying it after the service returns", async () => {
  const f = fixture();
  vi.stubEnv("TELEGRAM_ENABLED", "false");
  await closeWindow();
  await deliverWishlistBatch(f.batch.id);
  expect(mock.telegram).not.toHaveBeenCalled();
  expect(f.batch.deliveries.telegram.status).toBe("skipped");
  vi.stubEnv("TELEGRAM_ENABLED", "true");
  retryWishlistBatch(f.s, f.batch.id);
  await deliverWishlistBatch(f.batch.id);
  expect(mock.telegram).not.toHaveBeenCalled();
});
