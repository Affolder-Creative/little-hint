import { useLayoutEffect, type RefObject } from "react";

/** Keep the modal inside the keyboard-adjusted viewport without moving focus. */
export function useDialogViewport(ref: RefObject<HTMLDialogElement | null>) {
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    let frame = 0;
    const measure = () => {
      // Let users magnify the existing layout rather than reflowing under a pinch.
      if (viewport && viewport.scale !== 1) return;
      dialog.style.setProperty(
        "--dialog-viewport-height",
        `${viewport?.height ?? innerHeight}px`,
      );
      dialog.style.setProperty(
        "--dialog-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root.style.overflow = previousOverflow;
    };
  }, [ref]);
}
