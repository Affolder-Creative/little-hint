/** Upload order is independent of the selected cover. Legacy items have one photo. */
export function itemPhotos(item: {
  image?: unknown;
  images?: unknown;
}): string[] {
  const images = Array.isArray(item.images)
    ? item.images.filter((v): v is string => typeof v === "string" && !!v)
    : [];
  const cover = typeof item.image === "string" ? item.image : "";
  return [...new Set([...images, ...(cover ? [cover] : [])])];
}
export function galleryPhotos(item: {
  image?: unknown;
  images?: unknown;
}): string[] {
  const images = itemPhotos(item);
  return typeof item.image === "string" && images.includes(item.image)
    ? [item.image, ...images.filter((url) => url !== item.image)]
    : images;
}
export function removeItemPhoto(
  item: { image?: unknown; images?: unknown },
  url: string,
) {
  item.images = itemPhotos(item).filter((photo) => photo !== url);
  if (item.image === url) item.image = (item.images as string[])[0] ?? "";
}
