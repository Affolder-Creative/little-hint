import { useId, useLayoutEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import type { List } from "../shared/model";
import { Privacy } from "./components";
import { RevealPolicy } from "./ListFeatures";
import "./privacy-details.css";

export function PrivacyDetails({
  list,
}: {
  list: Pick<
    List,
    "mode" | "revealAfter" | "timeZone" | "revealExchangeGivers"
  >;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const bounds = panel.current.getBoundingClientRect();
      const inset = 16;
      const left = Math.max(
        inset,
        Math.min(anchor.left, innerWidth - bounds.width - inset),
      );
      const below = anchor.bottom + 8;
      const top =
        below + bounds.height <= innerHeight - inset
          ? below
          : Math.max(inset, anchor.top - bounds.height - 8);
      panel.current.style.left = `${left}px`;
      panel.current.style.top = `${top}px`;
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    const observer = new ResizeObserver(position);
    observer.observe(panel.current!);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      observer.disconnect();
    };
  }, [open]);

  return (
    <div className="list-privacy">
      <button
        ref={trigger}
        type="button"
        className="privacy-trigger"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
      >
        <Privacy mode={list.mode} />
        <Info size={16} aria-hidden="true" />
        <span className="sr-only">Privacy details</span>
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        className="privacy-popover"
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <div className="privacy-popover-heading">
          <h2 id={`${id}-title`}>Gift privacy</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close privacy details"
            onClick={() => {
              panel.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            }}
            autoFocus
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div id={`${id}-body`}>
          <RevealPolicy list={list} />
        </div>
      </div>
    </div>
  );
}
