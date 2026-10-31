import { useEffect, useRef, useState } from "react";
import { useApp } from "./context";
import {
  cachedProductImage,
  forgetProductImage,
  loadProductImage,
} from "./image-store";

export function ProductImage({
  url,
  title,
  full,
  onError,
}: {
  url: string;
  title: string;
  full: boolean;
  onError: () => void;
}) {
  const { world } = useApp();
  const ref = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState<{ key: string; src: string }>();
  const [near, setNear] = useState(full);
  const key = `${world.me.id}|${url}|${full}|${world.imageDelivery?.cacheEnabled}`;
  const cache = world.imageDelivery?.cacheEnabled === true;
  useEffect(() => {
    const element = ref.current;
    if (!element || full) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [full]);
  useEffect(() => {
    if (!cache || !near) return;
    let live = true;
    const urls: string[] = [];
    const show = async (blob: Blob) => {
      if (!live) return;
      const src = URL.createObjectURL(blob);
      urls.push(src);
      const image = new Image();
      image.src = src;
      await image.decode();
      if (live) setReady({ key, src });
      else URL.revokeObjectURL(src);
    };
    const thumbnail = cachedProductImage(`${url}?size=card`);
    const task = async () => {
      let showingThumbnail = false;
      if (full && thumbnail)
        await show(thumbnail)
          .then(() => {
            showingThumbnail = true;
          })
          .catch(() => forgetProductImage(`${url}?size=card`));
      try {
        await show(await loadProductImage(full ? url : `${url}?size=card`));
      } catch {
        if (live) {
          void forgetProductImage(full ? url : `${url}?size=card`);
          if (!showingThumbnail)
            setReady({ key, src: full ? url : `${url}?size=card` });
        }
      }
    };
    void task().catch(() => {
      if (live) onError();
    });
    const clear = () => {
      live = false;
      setReady(undefined);
    };
    window.addEventListener("product-images-cleared", clear);
    return () => {
      live = false;
      window.removeEventListener("product-images-cleared", clear);
      for (const src of urls) URL.revokeObjectURL(src);
    };
  }, [key, near, cache, url, full]);
  return (
    <img
      ref={ref}
      src={
        cache
          ? ready?.key === key
            ? ready.src
            : undefined
          : full
            ? url
            : `${url}?size=card`
      }
      alt={title}
      loading={full || near ? "eager" : "lazy"}
      fetchPriority={full ? "high" : "auto"}
      onError={onError}
      data-product-image={url}
      data-image-size={full ? "full" : "card"}
      data-image-ready={!!(ready?.key === key) || !cache}
    />
  );
}
