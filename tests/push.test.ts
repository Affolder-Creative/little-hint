import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  emptyState,
  type State,
  type Notice,
  type PushDevice,
  type List,
} from "../src/shared/model";
import { stamp, command } from "../src/server/domain";
import webPush from "web-push";
const mock = vi.hoisted(() => ({
  state: null as State | null,
  fetch: vi.fn(),
  active: true,
  addresses: [{ address: "8.8.8.8", family: 4 }],
}));
vi.mock("../src/server/db", () => ({
  readState: async () => mock.state,
  transact: async (fn: any) => fn(mock.state),
  pool: {
    query: async () => ({ rows: mock.active ? [{ id: "session" }] : [] }),
  },
}));
vi.mock("node:dns/promises", () => ({ lookup: async () => mock.addresses }));
vi.mock("undici", () => ({
  Agent: class {},
  fetch: (...args: any[]) => mock.fetch(...args),
}));
import {
  deliverPushBatch,
  pendingPushBatches,
  pushConfiguration,
  subscribePush,
  validatePushEndpoint,
} from "../src/server/push";
function fixture() {
  const s = emptyState();
  mock.state = s;
  const person = {
    ...stamp(),
    name: "Reader",
    userId: stamp().id,
    guardians: [],
  };
  s.people.push(person);
  // A test device with real, valid encryption keys.
  const keys = webPush.generateVAPIDKeys();
  const d: PushDevice = {
    ...stamp(),
    createdAt: "2026-01-01T00:00:00Z",
    userId: person.userId,
    sessionId: "session",
    endpoint: "https://push.example.test/send",
    keys: {
      p256dh: keys.publicKey,
      auth: Buffer.alloc(16, 1).toString("base64url"),
    },
    label: "Browser",
  };
  s.pushDevices.push(d);
  const n: Notice = {
    ...stamp(),
    userId: person.userId,
    event: "access",
    inbox: true,
    status: "pending",
    attempts: 0,
    delivered: [],
  };
  s.notices.push(n);
  return { s, n, d, person };
}
beforeEach(() => {
  const keys = webPush.generateVAPIDKeys();
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("VAPID_PUBLIC_KEY", keys.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", keys.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:admin@example.com");
  mock.fetch
    .mockReset()
    .mockImplementation(async () => new Response(null, { status: 201 }));
  mock.active = true;
  mock.addresses = [{ address: "8.8.8.8", family: 4 }];
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("web push delivery", () => {
  it("sends a category and delivery metadata without private content", async () => {
    const f = fixture();
    f.person.name = "PRIVATE PERSON";
    f.n.actorId = f.person.userId;
    const details = vi.spyOn(webPush, "generateRequestDetails");
    await deliverPushBatch([f.n.id]);
    expect(details).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(details.mock.calls[0][1]))).toEqual({
      deviceId: f.d.id,
      notificationId: f.n.id,
      category: "access",
      unreadCount: 1,
      timestamp: expect.any(Number),
      tag: f.n.id,
    });
  });
  it("takes the category from the eligible notice rather than the batch lead", async () => {
    const f = fixture();
    f.n.readAt = new Date().toISOString();
    const eligible: Notice = {
      ...stamp(),
      userId: f.person.userId,
      event: "mention",
      inbox: true,
      status: "pending",
      attempts: 0,
      delivered: [],
    };
    f.s.notices.push(eligible);
    const details = vi.spyOn(webPush, "generateRequestDetails");
    await deliverPushBatch([f.n.id, eligible.id]);
    expect(details).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(details.mock.calls[0][1]))).toMatchObject({
      notificationId: eligible.id,
      category: "mention",
      tag: f.n.id,
    });
  });
  it.each([false, true])(
    "distinguishes ownership requests from invitations: %s",
    async (ownership) => {
      const f = fixture();
      f.n.event = "invitation";
      if (ownership) {
        const list: List = {
          ...stamp(),
          name: "PRIVATE LIST",
          description: "PRIVATE DESCRIPTION",
          ownerIds: [],
          pendingOwnerIds: [f.person.id],
          groupIds: [],
          mode: "surprise",
          modeLocked: false,
          archived: false,
        };
        f.s.lists.push(list);
        f.n.listId = list.id;
        f.n.action = "ownership-request";
      }
      const details = vi.spyOn(webPush, "generateRequestDetails");
      await deliverPushBatch([f.n.id]);
      expect(details).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(details.mock.calls[0][1]))).toEqual({
        deviceId: f.d.id,
        notificationId: f.n.id,
        category: ownership ? "ownership-request" : "invitation",
        unreadCount: 1,
        timestamp: expect.any(Number),
        tag: f.n.id,
      });
    },
  );
  it("requires matching VAPID keys and disables real delivery in staging and tests", async () => {
    const f = fixture();
    expect(pushConfiguration()).not.toBeNull();
    vi.stubEnv("APP_ENV", "staging");
    expect(pushConfiguration()).toBeNull();
    await deliverPushBatch([f.n.id]);
    expect(mock.fetch).not.toHaveBeenCalled();
    vi.stubEnv("APP_ENV", "test");
    expect(pushConfiguration()).toBeNull();
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("VAPID_PRIVATE_KEY", webPush.generateVAPIDKeys().privateKey);
    expect(pushConfiguration()).toBeNull();
  });
  it("delivers once per device, independent of email status", async () => {
    const f = fixture();
    const second = {
      ...f.d,
      id: stamp().id,
      endpoint: "https://push.example.test/second",
    };
    f.s.pushDevices.push(second);
    f.n.status = "failed";
    await deliverPushBatch([f.n.id]);
    await deliverPushBatch([f.n.id]);
    expect(mock.fetch).toHaveBeenCalledTimes(2);
    expect(f.n.pushComplete).toBe(true);
    expect(f.n.status).toBe("failed");
    expect(
      Object.values(f.n.pushDeliveries!).every((d) => d.status === "sent"),
    ).toBe(true);
  });
  it("removes expired endpoints without blocking another device", async () => {
    const f = fixture();
    const second = {
      ...f.d,
      id: stamp().id,
      endpoint: "https://push.example.test/second",
    };
    f.s.pushDevices.push(second);
    mock.fetch.mockResolvedValueOnce(new Response(null, { status: 410 }));
    await deliverPushBatch([f.n.id]);
    expect(f.s.pushDevices.map((d) => d.id)).toEqual([second.id]);
    expect(f.n.pushComplete).toBe(true);
  });
  it("does not resend successful devices while retrying a failure with backoff", async () => {
    const f = fixture();
    const second = {
      ...f.d,
      id: stamp().id,
      endpoint: "https://push.example.test/second",
    };
    f.s.pushDevices.push(second);
    mock.fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await deliverPushBatch([f.n.id]);
    expect(f.n.pushComplete).not.toBe(true);
    await deliverPushBatch([f.n.id]);
    expect(mock.fetch).toHaveBeenCalledTimes(2);
    f.n.pushDeliveries![f.d.id].nextAttemptAt = new Date(0).toISOString();
    await deliverPushBatch([f.n.id]);
    expect(mock.fetch).toHaveBeenCalledTimes(3);
    expect(f.n.pushComplete).toBe(true);
  });
  it("stops delivery for revoked sessions, read entries, and disabled topics", async () => {
    const f = fixture();
    mock.active = false;
    await deliverPushBatch([f.n.id]);
    expect(mock.fetch).not.toHaveBeenCalled();
    expect(f.s.pushDevices).toHaveLength(0);
    mock.active = true;
    f.s.pushDevices.push(f.d);
    f.n.pushComplete = false;
    f.n.readAt = new Date().toISOString();
    await deliverPushBatch([f.n.id]);
    expect(mock.fetch).not.toHaveBeenCalled();
    delete f.n.readAt;
    f.n.pushComplete = false;
    f.s.preferences.push({
      ...stamp(),
      userId: f.n.userId,
      email: true,
      telegram: false,
      sms: false,
      recipientUpdates: false,
      events: ["access"],
      pushEvents: [],
    });
    await deliverPushBatch([f.n.id]);
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("does not backfill notifications to newly enabled devices", async () => {
    const f = fixture();
    f.d.createdAt = new Date(Date.parse(f.n.createdAt) + 1).toISOString();
    await deliverPushBatch([f.n.id]);
    expect(mock.fetch).not.toHaveBeenCalled();
    expect(f.n.pushComplete).toBe(true);
  });
  it("batches new wishes once, including devices enabled between additions", async () => {
    const f = fixture();
    const details = vi.spyOn(webPush, "generateRequestDetails");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    f.s.notices = [];
    const owner = {
      id: stamp().id,
      name: "Owner",
      email: "owner@example.test",
    };
    const person = {
      ...stamp(),
      name: owner.name,
      userId: owner.id,
      guardians: [],
    };
    f.s.people.push(person);
    const group = {
      ...stamp(),
      name: "Family",
      ownerId: owner.id,
      memberIds: [owner.id, f.person.userId],
    };
    f.s.groups.push(group);
    const list = command(f.s, owner, "lists.create", {
      name: "Wishes",
      ownerIds: [person.id],
      groupIds: [group.id],
      mode: "surprise",
    }) as List;
    const reader = {
      id: f.person.userId,
      name: "Reader",
      email: "reader@example.test",
    };
    command(f.s, reader, "follows.update", {
      target: "list",
      targetId: list.id,
      following: true,
    });
    command(f.s, owner, "items.create", { title: "First", listId: list.id });
    f.d.createdAt = "2026-10-24T12:01:00.000Z";
    vi.setSystemTime(new Date("2026-10-24T12:02:00Z"));
    command(f.s, owner, "items.create", { title: "Second", listId: list.id });
    expect(pendingPushBatches(f.s)).toEqual([]);
    vi.setSystemTime(new Date("2026-10-24T12:16:00Z"));
    const batches = pendingPushBatches(f.s);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    await deliverPushBatch(batches[0].map((n) => n.id));
    await deliverPushBatch(batches[0].map((n) => n.id));
    expect(mock.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(details.mock.calls[0][1]))).toMatchObject({
      category: "wishlist",
      notificationId: batches[0][1].id,
    });
    expect(pendingPushBatches(f.s)).toEqual([]);
    command(f.s, owner, "items.create", { title: "Third", listId: list.id });
    command(f.s, reader, "follows.update", {
      target: "list",
      targetId: list.id,
      following: false,
    });
    vi.setSystemTime(new Date("2026-10-24T12:32:00Z"));
    await deliverPushBatch(pendingPushBatches(f.s)[0].map((n) => n.id));
    expect(mock.fetch).toHaveBeenCalledTimes(1);
  });
  it("groups only due wishlist events and suppresses inaccessible batches", async () => {
    const f = fixture();
    f.n.event = "wishlist";
    f.n.listId = stamp().id;
    f.n.pushDueAt = new Date(Date.now() + 900000).toISOString();
    const second = { ...f.n, id: stamp().id };
    f.s.notices.push(second);
    expect(pendingPushBatches(f.s)).toEqual([]);
    f.n.pushDueAt = second.pushDueAt = new Date(0).toISOString();
    expect(pendingPushBatches(f.s)).toHaveLength(1);
    await deliverPushBatch([f.n.id, second.id]);
    expect(mock.fetch).not.toHaveBeenCalled();
    expect(f.n.pushComplete).toBe(true);
  });
  it("rebinds a browser endpoint to the current account without exposing another account's subscription", async () => {
    const f = fixture();
    const a = { id: stamp().id, email: "new@example.test", name: "New" };
    const saved = await subscribePush(a, "new-session", {
      endpoint: f.d.endpoint,
      keys: f.d.keys,
    });
    expect(saved.id).not.toBe(f.d.id);
    expect(f.s.pushDevices).toHaveLength(1);
    expect(f.s.pushDevices[0].userId).toBe(a.id);
  });
  it("rejects insecure, credential-bearing and private-network endpoints", async () => {
    fixture();
    for (const url of [
      "http://push.example.test",
      "https://user:password@push.example.test",
      "https://push.example.test:8443",
      "https://localhost/send",
    ])
      await expect(validatePushEndpoint(url)).rejects.toThrow();
    mock.addresses = [{ address: "127.0.0.1", family: 4 }];
    await expect(
      validatePushEndpoint("https://push.example.test/send"),
    ).rejects.toThrow("Private network");
  });
});
