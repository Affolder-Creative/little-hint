import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GiftView } from "../shared/model";
import { galleryPhotos } from "../shared/item-photos";
import { GiftPhoto } from "./components";
import "./item-photo-gallery.css";

export default function ItemPhotoGallery({ gift }: { gift: GiftView }) {
  const photos = galleryPhotos(gift);
  const [selected, setSelected] = useState(photos[0]);
  const index = Math.max(0, photos.indexOf(selected));
  const start = useRef<{ x: number; y: number } | null>(null);
  const move = (direction: number) =>
    setSelected(
      photos[Math.max(0, Math.min(photos.length - 1, index + direction))],
    );
  return (
    <section
      className="item-photo-gallery"
      aria-label={`${gift.title} photos`}
      aria-roledescription="carousel"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        move(event.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <div
        className="item-photo-slide"
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          start.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
        onPointerUp={(event) => {
          const previous = start.current;
          start.current = null;
          if (!previous) return;
          const dx = event.clientX - previous.x,
            dy = event.clientY - previous.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5)
            move(dx < 0 ? 1 : -1);
        }}
      >
        <GiftPhoto
          key={photos[index]}
          gift={{
            ...gift,
            image: photos[index],
            title: `${gift.title}, photo ${index + 1} of ${photos.length}`,
          }}
          size="full"
        />
      </div>
      <div className="item-photo-navigation">
        <button
          type="button"
          className="button secondary"
          aria-label="Previous photo"
          disabled={index === 0}
          onClick={() => move(-1)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span role="status" aria-live="polite" aria-atomic="true">
          Photo {index + 1} of {photos.length}
        </span>
        <button
          type="button"
          className="button secondary"
          aria-label="Next photo"
          disabled={index === photos.length - 1}
          onClick={() => move(1)}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
