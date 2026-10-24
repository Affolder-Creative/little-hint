// Only an opaque device binding and badge metadata are stored here. API responses,
// note text, titles, people, and other private application data are never cached.
function pushDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("little-hint-push", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("settings");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function pushBinding(value) {
  const db = await pushDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "settings",
        value === undefined ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("settings");
      const request =
        value === undefined
          ? store.get("binding")
          : store.put(value, "binding");
      let result;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => resolve(value === undefined ? result : value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function updateAppBadge(count) {
  try {
    if (count > 0) await self.navigator.setAppBadge?.(count);
    else await self.navigator.clearAppBadge?.();
  } catch {
    /* Device settings can disable badging independently. */
  }
}
let pushTasks = Promise.resolve();
function serializePush(task) {
  const result = pushTasks.then(task);
  pushTasks = result.catch(() => {});
  return result;
}
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!["BIND_PUSH", "CLEAR_PUSH", "UPDATE_BADGE"].includes(data?.type)) return;
  if (
    !event.source?.url ||
    new URL(event.source.url).origin !== self.location.origin
  )
    return;
  event.waitUntil(
    serializePush(async () => {
      const binding = (await pushBinding()) || {};
      if (data.type === "CLEAR_PUSH") {
        await pushBinding({});
        for (const notification of await self.registration.getNotifications())
          notification.close();
        await updateAppBadge(0);
      } else if (
        data.type === "BIND_PUSH" &&
        typeof data.deviceId === "string"
      ) {
        if (binding.deviceId !== data.deviceId)
          await pushBinding({ deviceId: data.deviceId, timestamp: 0 });
      } else if (
        data.type === "UPDATE_BADGE" &&
        Number.isSafeInteger(data.count) &&
        data.count >= 0 &&
        Number.isFinite(data.timestamp)
      ) {
        if (data.deviceId !== (binding.deviceId ?? null)) return;
        if (data.timestamp < (binding.timestamp || 0)) return;
        await pushBinding({ ...binding, timestamp: data.timestamp });
        await updateAppBadge(data.count);
      }
    }),
  );
});
self.addEventListener("push", (event) => {
  event.waitUntil(
    serializePush(async () => {
      let data;
      try {
        data = event.data?.json();
      } catch {
        return;
      }
      const binding = await pushBinding();
      // A delayed delivery must not revive another account's notification or badge.
      if (!binding?.deviceId || data?.deviceId !== binding.deviceId) return;
      const validId =
        typeof data.notificationId === "string" &&
        /^[0-9a-f-]{36}$/i.test(data.notificationId);
      await self.registration.showNotification("Little Hint", {
        body: data.test
          ? "Push notifications are ready on this device."
          : "A new update is waiting. Open Little Hint to see it.",
        icon: "/brand/little-hint/icons/little-hint-app-color-192.png",
        tag: typeof data.tag === "string" ? data.tag : "little-hint-update",
        data: {
          path: validId
            ? `/notifications/${data.notificationId}`
            : "/notifications",
          deviceId: binding.deviceId,
        },
      });
      if (
        Number.isSafeInteger(data.unreadCount) &&
        data.unreadCount >= 0 &&
        Number.isFinite(data.timestamp) &&
        data.timestamp >= (binding.timestamp || 0)
      ) {
        await pushBinding({ ...binding, timestamp: data.timestamp });
        await updateAppBadge(data.unreadCount);
      }
      for (const client of await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      }))
        client.postMessage({ type: "NOTIFICATION_UPDATE" });
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    serializePush(async () => {
      const binding = await pushBinding();
      if (binding?.deviceId !== event.notification.data?.deviceId) return;
      const path = event.notification.data?.path;
      const safePath =
        typeof path === "string" &&
        /^\/notifications(?:\/[0-9a-f-]{36})?$/i.test(path)
          ? path
          : "/notifications";
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = clients.find(
        (c) => new URL(c.url).origin === self.location.origin,
      );
      if (client) {
        await client.navigate(safePath);
        await client.focus();
      } else await self.clients.openWindow(safePath);
    }),
  );
});
