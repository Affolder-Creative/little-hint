import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Info, X } from "lucide-react";
import "./info-help.css";

/** Tap and keyboard help that stays above scrolling dialogs without moving fields. */
export function InfoHelp({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
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
      const viewport = window.visualViewport;
      const top = (viewport?.offsetTop ?? 0) + 12;
      const left = (viewport?.offsetLeft ?? 0) + 12;
      const right = left + (viewport?.width ?? innerWidth) - 24;
      const bottom = top + (viewport?.height ?? innerHeight) - 24;
      panel.current.style.left = `${Math.max(left, Math.min(anchor.left, right - bounds.width))}px`;
      panel.current.style.top = `${anchor.bottom + 8 + bounds.height <= bottom ? anchor.bottom + 8 : Math.max(top, anchor.top - bounds.height - 8)}px`;
      panel.current.style.maxHeight = `${bottom - top}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel.current!);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open]);
  return (
    <div className="info-help">
      <button
        ref={trigger}
        type="button"
        className="info-help-trigger"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`About ${title.toLowerCase()}`}
        onClick={(event) => event.currentTarget.focus({ preventScroll: true })}
      >
        <Info size={15} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        className="info-help-panel"
        style={{ visibility: open ? "visible" : "hidden" }}
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <div className="info-help-heading">
          <strong id={`${id}-title`}>{title}</strong>
          <button
            type="button"
            className="icon-button"
            aria-label="Close help"
            onClick={() => {
              panel.current?.hidePopover();
              trigger.current?.focus({ preventScroll: true });
            }}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="info-help-copy">{children}</div>
      </div>
    </div>
  );
}
