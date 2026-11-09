import { useEffect, useState, type ComponentType } from "react";
import type { GiftView } from "../shared/model";
import { itemPhotos } from "../shared/item-photos";
import { GiftPhoto } from "./components";

export function ItemPhotoDetail({ gift }: { gift: GiftView }) {
  const multiple = itemPhotos(gift).length > 1;
  const [Gallery, setGallery] = useState<ComponentType<{ gift: GiftView }>>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!multiple) return;
    let live = true;
    setFailed(false);
    void import("./ItemPhotoGallery")
      .then((module) => {
        if (live) setGallery(() => module.default);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [multiple, attempt]);
  if (!multiple) return <GiftPhoto gift={gift} size="full" />;
  if (Gallery) return <Gallery key={`${gift.id}|${gift.image}`} gift={gift} />;
  return (
    <div>
      <GiftPhoto gift={gift} size="full" />
      {failed && (
        <p role="status">
          More photos couldn't load.{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry photos
          </button>
        </p>
      )}
    </div>
  );
}
