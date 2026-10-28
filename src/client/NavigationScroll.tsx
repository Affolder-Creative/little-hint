import { useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

type Position = { url: string; x: number; y: number };
const storageKey = "little-hint:scroll";
const limit = 100;

function readPositions(account: string): Map<string, Position> {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (saved?.account === account && Array.isArray(saved.entries))
      return new Map(
        saved.entries
          .filter(
            (entry: unknown): entry is [string, Position] =>
              Array.isArray(entry) &&
              typeof entry[0] === "string" &&
              typeof entry[1]?.url === "string" &&
              Number.isFinite(entry[1]?.x) &&
              entry[1].x >= 0 &&
              Number.isFinite(entry[1]?.y) &&
              entry[1].y >= 0,
          )
          .slice(-limit),
      );
  } catch {
    // History navigation still works in memory when storage is unavailable.
  }
  return new Map();
}

/** Each history entry owns its position, including repeated visits to one URL. */
export function NavigationScroll({ account }: { account: string }) {
  const location = useLocation();
  const navigation = useNavigationType();
  const [positions] = useState(() => readPositions(account));
  const current = useRef<Position | null>(null);
  const url = location.pathname + location.search + location.hash;

  useLayoutEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  useLayoutEffect(() => {
    const saved =
      navigation === "POP" ? positions.get(location.key) : undefined;
    const restore = saved?.url === url ? saved : undefined;
    let fragment = "";
    try {
      fragment = decodeURIComponent(location.hash.slice(1));
    } catch {
      // A malformed fragment should behave like a missing target.
    }
    const target = restore ?? { url, x: 0, y: 0 };
    current.current = target;
    let pending = true;
    let frame = 0;
    let timeout = 0;
    const main = document.getElementById("main");
    const read = () => ({ url, x: window.scrollX, y: window.scrollY });
    const remember = () => {
      if (pending && !restore) return;
      positions.delete(location.key);
      positions.set(location.key, current.current ?? read());
      if (positions.size > limit)
        positions.delete(positions.keys().next().value!);
    };
    const persist = () => {
      remember();
      try {
        // Sign-out clears this marker before unloading the signed-in shell.
        if (localStorage.getItem("little-hint:last-account") !== account)
          return;
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ account, entries: [...positions] }),
        );
      } catch {
        // Storage restrictions must not interrupt navigation or sign-out.
      }
    };
    const finish = () => {
      pending = false;
      current.current = read();
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      resize.disconnect();
      changes.disconnect();
    };
    const attempt = () => {
      if (!pending) return;
      if (!restore && fragment) {
        const element = document.getElementById(fragment);
        if (!element || !main?.contains(element)) return;
        element.scrollIntoView({
          block: /^(note|exchange)-/.test(fragment) ? "center" : "start",
          behavior: "instant",
        });
        // Exchange sections and other anchor targets may not be focusable yet.
        if (!element.hasAttribute("tabindex")) element.tabIndex = -1;
        element.focus({ preventScroll: true });
        finish();
        return;
      }
      window.scrollTo({ left: target.x, top: target.y, behavior: "instant" });
      if (
        Math.abs(window.scrollY - target.y) < 2 &&
        Math.abs(window.scrollX - target.x) < 2
      )
        finish();
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(attempt);
    };
    // A lazy route or query can initially be shorter than its saved position.
    const resize = new ResizeObserver(schedule);
    const changes = new MutationObserver(schedule);
    resize.observe(document.body);
    if (main) changes.observe(main, { childList: true, subtree: true });
    const onScroll = () => {
      if (!pending) current.current = read();
    };
    const interrupt = () => {
      if (pending) finish();
    };
    const onKey = (event: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
          "Tab",
        ].includes(event.key)
      )
        interrupt();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persist);
    window.addEventListener("wheel", interrupt, { passive: true });
    window.addEventListener("touchstart", interrupt, { passive: true });
    window.addEventListener("pointerdown", interrupt, { passive: true });
    window.addEventListener("keydown", onKey);
    // Missing targets and removed content must not keep controlling the viewport.
    timeout = window.setTimeout(finish, 10000);
    main?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    // Apply available coordinates before paint; defer fragment focus until
    // route effects settle. Observers retry when lazy content increases height.
    if (!restore && fragment) schedule();
    else attempt();
    return () => {
      // Use the last observed position; route DOM changes can clamp scrollY
      // before cleanup. While waiting, keep the intended restoration position.
      remember();
      finish();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("wheel", interrupt);
      window.removeEventListener("touchstart", interrupt);
      window.removeEventListener("pointerdown", interrupt);
      window.removeEventListener("keydown", onKey);
    };
  }, [account, location.key, location.hash, navigation, positions, url]);

  return null;
}
