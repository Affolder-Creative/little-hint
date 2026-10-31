import { useEffect, useLayoutEffect } from "react";
import type { World } from "../shared/model";
import {
  cancelImagePrefetch,
  canPrefetchImages,
  configureProductImages,
  prefetchProductImage,
} from "./image-store";

export function useProductImages(
  world: World | null | undefined,
  route: string,
  refresh: () => void,
) {
  useLayoutEffect(() => configureProductImages(world), [world]);
  useEffect(() => {
    const changed = () => refresh();
    window.addEventListener("product-images-cleared", changed);
    return () => window.removeEventListener("product-images-cleared", changed);
  }, [refresh]);
  useEffect(() => {
    if (
      !world?.imageDelivery?.prefetchEnabled ||
      !world.imageDelivery.cacheEnabled
    )
      return;
    let finished = false;
    const timer = window.setInterval(() => {
      if (finished || !canPrefetchImages()) return;
      const images = [
        ...document.querySelectorAll<HTMLImageElement>(
          ".gift-card img[data-product-image]",
        ),
      ].filter((img) => {
        const bounds = img.getBoundingClientRect();
        return (
          bounds.top < innerHeight &&
          bounds.bottom > 0 &&
          bounds.left < innerWidth &&
          bounds.right > 0
        );
      });
      if (
        !images.length ||
        images.some((img) => !img.complete || !img.naturalWidth)
      )
        return;
      finished = true;
      // Yield after visible content has decoded. The queue remains sequential.
      for (const image of images.slice(0, 2))
        prefetchProductImage(image.dataset.productImage!);
    }, 750);
    return () => {
      clearInterval(timer);
      cancelImagePrefetch();
    };
  }, [
    route,
    world?.me.id,
    world?.imageDelivery?.prefetchEnabled,
    world?.imageDelivery?.cacheEnabled,
  ]);
}
