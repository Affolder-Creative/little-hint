import { opendir, lstat } from "node:fs/promises";
import path from "node:path";
export async function uploadStorage(directory: string) {
  let files = 0,
    bytes = 0;
  try {
    const entries = await opendir(directory);
    for await (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        const stat = await lstat(path.join(directory, entry.name));
        if (stat.isFile()) {
          files++;
          bytes += stat.size;
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return { files, bytes };
}
/** Share concurrent probes and avoid scanning storage on every dashboard request. */
export function cachedProbe<T>(
  read: () => Promise<T>,
  ttlMs = 60000,
  now = Date.now,
) {
  let current: Promise<T> | undefined,
    expires = 0;
  return () => {
    if (!current || now() >= expires) {
      expires = Infinity;
      current = read().then(
        (value) => {
          expires = now() + ttlMs;
          return value;
        },
        (error) => {
          current = undefined;
          expires = 0;
          throw error;
        },
      );
    }
    return current;
  };
}
