import type { World } from "../shared/model";

const DB = "little-hint-product-images-v1";
const SIGNAL = "little-hint:image-clear";
const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(SIGNAL)
    : undefined;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 200;
const AGE = 30 * 86400000;
type Usage = {
  key: string;
  account: string;
  url: string;
  used: number;
  size: number;
};
type StoredEntry = Usage & { bytes: ArrayBuffer; type: string };
async function entries() {
  return transaction<Usage[]>("readonly", (store) => store.getAll(), "usage");
}
let account = "";
let allowed = new Set<string>();
let enabled = false;
let prefetchEnabled = false;
let generation = 0;
let prefetchEpoch = 0;
let database: Promise<IDBDatabase> | undefined;
const memory = new Map<string, Blob>();
const pending = new Map<
  string,
  { promise: Promise<Blob>; controller: AbortController; speculative: boolean }
>();
let writes: Promise<unknown> = Promise.resolve();

function db() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("images", { keyPath: "key" });
      request.result.createObjectStore("usage", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Image storage unavailable"));
  }));
}
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  name = "images",
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(name, mode);
    const request = run(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
async function updateStores(
  run: (images: IDBObjectStore, usage: IDBObjectStore) => void,
) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(["images", "usage"], "readwrite");
    run(tx.objectStore("images"), tx.objectStore("usage"));
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
const removeEntry = (key: string) =>
  updateStores((images, usage) => {
    images.delete(key);
    usage.delete(key);
  });
function write(run: () => Promise<unknown>) {
  writes = writes
    .catch(() => {})
    .then(run)
    .catch(() => {});
  return writes;
}
export function imageCacheKey(owner: string, url: string) {
  return `${owner}|v1|${url}`;
}
export function retainedImages<T extends { used: number; size: number }>(
  entries: T[],
  now = Date.now(),
) {
  let bytes = 0;
  return entries
    .sort((a, b) => b.used - a.used)
    .filter((entry, index) => {
      bytes += entry.size;
      return (
        index < MAX_ENTRIES && bytes <= MAX_BYTES && now - entry.used < AGE
      );
    });
}
function remember(url: string, blob: Blob) {
  memory.delete(url);
  memory.set(url, blob);
  let bytes = [...memory.values()].reduce((sum, b) => sum + b.size, 0);
  while (memory.size > 20 || bytes > 10 * 1024 * 1024) {
    const key = memory.keys().next().value!;
    bytes -= memory.get(key)!.size;
    memory.delete(key);
  }
}
function cancel(speculativeOnly = false) {
  for (const [url, task] of pending) {
    if (!speculativeOnly || task.speculative) {
      task.controller.abort();
      pending.delete(url);
    }
  }
}
export async function clearProductImages(broadcast = true) {
  generation++;
  prefetchEpoch++;
  account = "";
  enabled = prefetchEnabled = false;
  allowed.clear();
  memory.clear();
  cancel();
  if (broadcast) {
    try {
      if (channel) channel.postMessage("clear");
      else localStorage.setItem(SIGNAL, `${Date.now()}-${Math.random()}`);
    } catch {
      /* Storage can be unavailable. */
    }
  }
  window.dispatchEvent(new Event("product-images-cleared"));
  await write(() =>
    updateStores((images, usage) => {
      images.clear();
      usage.clear();
    }),
  );
}
if (channel)
  channel.onmessage = () => {
    void clearProductImages(false);
  };
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === SIGNAL) void clearProductImages(false);
  });
if (typeof window !== "undefined")
  window.addEventListener("offline", () => cancelImagePrefetch());
if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelImagePrefetch();
  });

export function configureProductImages(world: World | null | undefined) {
  if (!world) {
    if (account) void clearProductImages();
    return;
  }
  const nextEnabled = world.imageDelivery?.cacheEnabled === true;
  if ((account && account !== world.me.id) || (enabled && !nextEnabled))
    void clearProductImages();
  account = world.me.id;
  enabled = nextEnabled;
  prefetchEnabled = enabled && world.imageDelivery?.prefetchEnabled === true;
  const next = new Set(world.items.map((item) => item.image).filter(Boolean));
  allowed = next;
  if (!prefetchEnabled) cancelImagePrefetch();
  for (const url of memory.keys()) if (!permitted(url)) memory.delete(url);
  for (const [url, task] of pending)
    if (!permitted(url)) {
      task.controller.abort();
      pending.delete(url);
    }
  const owner = account;
  void write(async () => {
    const records = await entries();
    const keep = new Set(
      retainedImages(
        records.filter(
          (e) =>
            enabled && e.account === owner && next.has(e.url.split("?")[0]),
        ),
      ).map((e) => e.key),
    );
    for (const entry of records)
      if (!keep.has(entry.key)) await removeEntry(entry.key);
  });
}
function permitted(url: string) {
  return (
    enabled &&
    /^\/api\/v1\/media\/[^/?]+(?:\?size=card)?$/.test(url) &&
    allowed.has(url.split("?")[0])
  );
}
export function cachedProductImage(url: string) {
  return permitted(url) ? memory.get(url) : undefined;
}
export function canPrefetchImages() {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return (
    prefetchEnabled &&
    ![...pending.values()].some((task) => !task.speculative) &&
    navigator.onLine &&
    !document.hidden &&
    !connection?.saveData &&
    !["slow-2g", "2g", "3g"].includes(connection?.effectiveType ?? "")
  );
}
export async function loadProductImage(
  url: string,
  speculative = false,
): Promise<Blob> {
  if (!permitted(url) || (speculative && !canPrefetchImages()))
    throw new Error("Image cache unavailable");
  if (!speculative) {
    // A requested detail image adopts its prefetch; unrelated speculative work yields.
    const own = pending.get(url);
    if (own) own.speculative = false;
    cancel(true);
  }
  const cached = memory.get(url);
  if (cached) {
    remember(url, cached);
    return cached;
  }
  const prior = pending.get(url);
  if (prior) return prior.promise;
  const epoch = generation,
    owner = account;
  const key = imageCacheKey(owner, url);
  const controller = new AbortController();
  const valid = () =>
    generation === epoch &&
    account === owner &&
    permitted(url) &&
    !controller.signal.aborted;
  const promise = (async () => {
    let blob: Blob | undefined;
    try {
      const entry = await transaction<StoredEntry | undefined>(
        "readonly",
        (store) => store.get(key),
      );
      if (entry && Date.now() - entry.used < AGE)
        blob = new Blob([entry.bytes], { type: entry.type });
    } catch {
      /* Use the network when storage is unavailable. */
    }
    if (!valid()) throw new Error("Image access changed");
    if (!blob) {
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
        priority: speculative ? "low" : "high",
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/")
      )
        throw new Error("Photo unavailable");
      blob = await response.blob();
    }
    if (!valid()) throw new Error("Image access changed");
    remember(url, blob);
    const saved = blob;
    void write(async () => {
      if (!valid()) return;
      const bytes = await saved.arrayBuffer();
      if (!valid()) return;
      const usage: Usage = {
        key,
        account: owner,
        url,
        size: bytes.byteLength,
        used: Date.now(),
      };
      await updateStores((images, metadata) => {
        images.put({ ...usage, bytes, type: saved.type } satisfies StoredEntry);
        metadata.put(usage);
      });
      const records = await entries();
      const keep = new Set(retainedImages(records).map((e) => e.key));
      for (const entry of records)
        if (!keep.has(entry.key)) await removeEntry(entry.key);
    });
    return blob;
  })();
  pending.set(url, { promise, controller, speculative });
  try {
    return await promise;
  } finally {
    if (pending.get(url)?.promise === promise) pending.delete(url);
  }
}
const prefetchQueue: Array<{ url: string; epoch: number; batch: number }> = [];
let prefetchRunning = false;
export function prefetchProductImage(url: string, prioritize = false) {
  if (!canPrefetchImages() || memory.has(url) || pending.has(url)) return;
  const prior = prefetchQueue.findIndex((task) => task.url === url);
  if (prior >= 0) prefetchQueue.splice(prior, 1);
  const task = { url, epoch: generation, batch: prefetchEpoch };
  if (prioritize) prefetchQueue.unshift(task);
  else prefetchQueue.push(task);
  void drainPrefetch();
}
async function drainPrefetch() {
  if (prefetchRunning) return;
  prefetchRunning = true;
  try {
    while (prefetchQueue.length) {
      const task = prefetchQueue.shift()!;
      if (
        task.epoch === generation &&
        task.batch === prefetchEpoch &&
        canPrefetchImages()
      )
        await loadProductImage(task.url, true).catch(() => {});
    }
  } finally {
    prefetchRunning = false;
  }
}

export function cancelImagePrefetch() {
  prefetchQueue.length = 0;
  prefetchEpoch++;
  cancel(true);
}
export function forgetProductImage(url: string) {
  memory.delete(url);
  const key = imageCacheKey(account, url);
  return write(() => removeEntry(key));
}

/** Wait for pending persistence work when checking durable storage. */
export function flushImageWrites() {
  return writes;
}
