import { useState } from "react";
import type { GiftView, Mode } from "../shared/model";
import { api, ApiError } from "./api";

type Gift = Pick<GiftView, "id"> & Partial<Pick<GiftView, "listId" | "mode">>;

/** Keep the audience the giver saw, even while their open form refreshes. */
export function useGiftingModeReview(gift?: Gift) {
  const [reviewed, setReviewed] = useState<{ id: string; mode?: Mode }>();
  const [pending, setPending] = useState<{ id: string; mode: Mode }>();
  const snapshot =
    reviewed?.id === gift?.id
      ? reviewed
      : gift
        ? { id: gift.id, mode: gift.mode }
        : undefined;
  if (snapshot !== reviewed) setReviewed(snapshot);
  const changed = pending?.id === gift?.id ? pending : undefined;
  return {
    blocked: !!changed,
    async run<T>(submit: (expectedListMode?: Mode) => Promise<T>): Promise<T> {
      if (changed)
        throw new Error("Review the updated gifting mode before continuing.");
      try {
        return await submit(gift?.listId ? snapshot?.mode : undefined);
      } catch (error) {
        if (
          gift?.listId &&
          error instanceof ApiError &&
          error.status === 409 &&
          error.message.startsWith("Gifting settings changed.")
        ) {
          const latest = await api<GiftView>(`items/${gift.id}`);
          setPending({ id: gift.id, mode: latest.mode });
        }
        throw error;
      }
    },
    notice: changed ? (
      <div className="notice gifting-mode-review" role="status">
        <p>
          <strong>
            Gifting mode changed to{" "}
            {changed.mode === "surprise"
              ? "Keep it a surprise"
              : "See the plans"}
            .
          </strong>
        </p>
        <p>
          {changed.mode === "surprise"
            ? "Your gift plans stay hidden from recipients."
            : "Recipients can see who reserves or purchases their gifts."}{" "}
          Your entries are kept. Review this setting before saving again.
        </p>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setReviewed(changed);
            setPending(undefined);
          }}
        >
          Use this gifting mode
        </button>
      </div>
    ) : null,
  };
}
