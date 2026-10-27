import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { stamp } from "./domain";
import { transact } from "./db";

export const mediaDir = () =>
  path.resolve(process.env.UPLOAD_DIR ?? ".local/uploads");
const thumbnails = new Map<string, Promise<string>>();
let active = 0;
const waiting: Array<() => void> = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

/** Call only after authorizing access to the underlying media record. */
export async function cardImage(file: string): Promise<string> {
  const original = path.join(mediaDir(), file);
  const target = `${original}.card-v1.webp`;
  try {
    await access(target);
    return target;
  } catch {
    /* Generate lazily. */
  }
  const prior = thumbnails.get(target);
  if (prior) return prior;
  const task = limited(async () => {
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      const buffer = await sharp(original, {
        limitInputPixels: 20_000_000,
        animated: false,
      })
        .resize({
          width: 480,
          height: 480,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
      await writeFile(temporary, buffer, { mode: 0o600 });
      await rename(temporary, target);
      return target;
    } catch {
      return original;
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  });
  thumbnails.set(target, task);
  try {
    return await task;
  } finally {
    thumbnails.delete(target);
  }
}

export async function saveImage(buffer: Buffer, userId: string) {
  const out = await sharp(buffer, {
    limitInputPixels: 20_000_000,
    animated: false,
  })
    .rotate()
    .resize({
      width: 1200,
      height: 1200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();
  const media = { ...stamp(), userId, file: `${randomUUID()}.webp` };
  await mkdir(mediaDir(), { recursive: true });
  const original = path.join(mediaDir(), media.file);
  await writeFile(original, out, { mode: 0o600 });
  try {
    await transact((s) => s.media.push(media));
  } catch (error) {
    await rm(original, { force: true });
    throw error;
  }
  await cardImage(media.file);
  return `/api/v1/media/${media.id}`;
}
