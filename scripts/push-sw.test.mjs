import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(
  new URL("../src/service-worker/push.js", import.meta.url),
  "utf8",
);
function harness() {
  const handlers = {},
    saved = new Map(),
    notifications = [],
    badges = [],
    navigations = [],
    messages = [];
  const windowClient = {
    url: "https://hint.example/",
    navigate: async (path) => navigations.push(path),
    focus: async () => {},
    postMessage: (data) => messages.push(data),
  };
  const self = {
    location: { origin: "https://hint.example" },
    navigator: {
      setAppBadge: async (n) => badges.push(n),
      clearAppBadge: async () => badges.push(0),
    },
    registration: {
      showNotification: async (title, options) =>
        notifications.push({ title, ...options }),
      getNotifications: async () => [],
    },
    clients: {
      matchAll: async () => [windowClient],
      openWindow: async (path) => navigations.push(path),
    },
    addEventListener: (event, handler) => (handlers[event] = handler),
  };
  const indexedDB = {
    open() {
      const request = {};
      const db = {
        close() {},
        transaction() {
          const tx = {
            objectStore: () => ({
              get: (key) => operation(() => saved.get(key)),
              put: (value, key) =>
                operation(() => {
                  saved.set(key, value);
                  return key;
                }),
            }),
          };
          function operation(fn) {
            const req = {};
            setImmediate(() => {
              req.result = fn();
              req.onsuccess?.();
              tx.oncomplete?.();
            });
            return req;
          }
          return tx;
        },
      };
      setImmediate(() => {
        request.result = db;
        request.onsuccess();
      });
      return request;
    },
  };
  vm.runInNewContext(source, { self, indexedDB, URL, Promise, Number });
  async function run(type, event) {
    let work;
    handlers[type]({ ...event, waitUntil: (promise) => (work = promise) });
    await work;
  }
  const message = (data) => run("message", { source: windowClient, data });
  const push = (data) => run("push", { data: { json: () => data } });
  return { run, message, push, notifications, badges, navigations, messages };
}
test("push shows generic copy, updates badges, and asks open clients to refresh", async () => {
  const h = harness();
  await h.message({ type: "BIND_PUSH", deviceId: "device" });
  await h.push({
    deviceId: "device",
    notificationId: "11111111-1111-1111-1111-111111111111",
    unreadCount: 3,
    timestamp: 10,
    title: "SECRET",
    body: "PRIVATE NOTE",
    url: "https://evil.test",
  });
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].title, "New activity");
  assert.equal(h.notifications[0].body, "Open Little Hint to see the details.");
  assert.equal(JSON.stringify(h.notifications).includes("SECRET"), false);
  assert.equal(JSON.stringify(h.notifications).includes("PRIVATE NOTE"), false);
  assert.deepEqual(h.badges, [3]);
  assert.equal(h.messages[0].type, "NOTIFICATION_UPDATE");
});
for (const [category, title] of Object.entries({
  invitation: "New invitation",
  "ownership-request": "Ownership request",
  mention: "You were mentioned",
  discussion: "New private note",
  contribution: "Contribution update",
  wishlist: "Wish list update",
  exchange: "Exchange update",
  access: "Gift plans updated",
  reservation: "Reservation update",
  purchase: "Purchase update",
})) {
  test(`${category} uses a fixed title without exposing payload copy`, async () => {
    const h = harness();
    await h.message({ type: "BIND_PUSH", deviceId: "device" });
    await h.push({
      deviceId: "device",
      category,
      notificationId: "11111111-1111-1111-1111-111111111111",
      title: "SECRET GIFT",
      body: "PRIVATE NOTE",
      name: "PRIVATE PERSON",
      amount: "PRIVATE AMOUNT",
    });
    assert.equal(h.notifications.length, 1);
    assert.equal(h.notifications[0].title, title);
    assert.equal(
      h.notifications[0].body,
      "Open Little Hint to see the details.",
    );
    assert.doesNotMatch(JSON.stringify(h.notifications), /SECRET|PRIVATE/);
    assert.equal(
      h.notifications[0].data.path,
      "/notifications/11111111-1111-1111-1111-111111111111",
    );
  });
}
test("unknown and malformed categories fall back to New activity", async () => {
  const h = harness();
  await h.message({ type: "BIND_PUSH", deviceId: "device" });
  for (const category of [
    undefined,
    null,
    "future-category",
    "__proto__",
    "constructor",
    "toString",
    1,
    {},
    ["mention"],
  ]) {
    await h.push({ deviceId: "device", category });
    assert.equal(h.notifications.at(-1).title, "New activity");
  }
});
test("test notifications use readiness copy regardless of category", async () => {
  const h = harness();
  await h.message({ type: "BIND_PUSH", deviceId: "device" });
  await h.push({ deviceId: "device", test: true, category: "purchase" });
  assert.equal(h.notifications[0].title, "Notifications are ready");
  assert.equal(
    h.notifications[0].body,
    "This test notification reached your device.",
  );
  assert.equal(h.notifications[0].data.path, "/notifications");
  await h.push({ deviceId: "device", test: "true", category: "mention" });
  assert.equal(h.notifications[1].title, "You were mentioned");
});
test("late messages cannot overwrite a newer badge count or revive a signed-out account", async () => {
  const h = harness();
  await h.message({ type: "BIND_PUSH", deviceId: "old" });
  await h.message({
    type: "UPDATE_BADGE",
    deviceId: "old",
    count: 0,
    timestamp: 20,
  });
  await h.push({ deviceId: "old", unreadCount: 5, timestamp: 10 });
  assert.deepEqual(h.badges, [0]);
  await h.message({ type: "CLEAR_PUSH" });
  await h.message({
    type: "UPDATE_BADGE",
    deviceId: "old",
    count: 7,
    timestamp: 30,
  });
  assert.deepEqual(h.badges, [0, 0]);
  await h.push({ deviceId: "old", unreadCount: 5, timestamp: 30 });
  assert.equal(h.notifications.length, 1);
  await h.message({ type: "BIND_PUSH", deviceId: "new" });
  await h.push({ deviceId: "old", unreadCount: 8, timestamp: 40 });
  assert.equal(h.notifications.length, 1);
});
test("notification clicks only navigate to local notification routes for the bound device", async () => {
  const h = harness();
  await h.message({ type: "BIND_PUSH", deviceId: "device" });
  await h.run("notificationclick", {
    notification: {
      close() {},
      data: { deviceId: "device", path: "https://evil.test" },
    },
  });
  assert.deepEqual(h.navigations, ["/notifications"]);
  await h.run("notificationclick", {
    notification: {
      close() {},
      data: { deviceId: "old", path: "/notifications" },
    },
  });
  assert.equal(h.navigations.length, 1);
});
test("a malformed push cannot change the badge or expose a notification", async () => {
  const h = harness();
  await h.message({ type: "BIND_PUSH", deviceId: "device" });
  await h.run("push", {
    data: {
      json() {
        throw new Error("bad JSON");
      },
    },
  });
  assert.equal(h.notifications.length, 0);
  assert.deepEqual(h.badges, []);
});
