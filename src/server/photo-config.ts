export function itemPhotoLimit() {
  const value = process.env.ITEM_PHOTO_LIMIT?.trim();
  if (!value) return 5;
  const limit = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1)
    throw new Error("Invalid ITEM_PHOTO_LIMIT. Use a positive integer.");
  return limit;
}
