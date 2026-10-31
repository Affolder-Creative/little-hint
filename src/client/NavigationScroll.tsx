import {
  createContext,
  useContext,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigationType } from "react-router-dom";

type ViewValue = string | boolean | string[];
type Position = {
  url: string;
  x: number;
  y: number;
  view?: Record<string, ViewValue>;
  focus?: string;
};
const storageKey = "little-hint:scroll";
const limit = 100;
const HistoryContext = createContext<Map<string, Position> | null>(null);

function rememberEntry(
  entries: Map<string, Position>,
  key: string,
  entry: Position,
) {
  entries.delete(key);
  entries.set(key, entry);
  if (entries.size > limit) entries.delete(entries.keys().next().value!);
}

/** View choices belong to an entry, so a fresh visit never inherits old filters. */
export function useNavigationState<T extends ViewValue>(
  name: string,
  initial: T,
) {
  const entries = useContext(HistoryContext);
  const location = useLocation();
  const [, render] = useReducer((version: number) => version + 1, 0);
  if (!entries) throw new Error("Navigation history is unavailable");
  const url = location.pathname + location.search + location.hash;
  const entry = entries.get(location.key);
  const value = entry?.url === url ? entry.view?.[name] : undefined;
  return [
    (
      Array.isArray(initial)
        ? Array.isArray(value) && value.every((id) => typeof id === "string")
        : typeof value === typeof initial
    )
      ? (value as T)
      : initial,
    (next: T) => {
      const previous = entries.get(location.key);
      const current = previous?.url === url ? previous : { url, x: 0, y: 0 };
      rememberEntry(entries, location.key, {
        ...current,
        view: { ...current.view, [name]: next },
      });
      render();
    },
  ] as const;
}

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
export function NavigationScroll({
  account,
  children,
}: {
  account: string;
  children: ReactNode;
}) {
  const [positions] = useState(() => readPositions(account));
  return (
    <HistoryContext.Provider value={positions}>
      <RestoreNavigation account={account} />
      {children}
    </HistoryContext.Provider>
  );
}

function RestoreNavigation({ account }: { account: string }) {
  const location = useLocation();
  const navigation = useNavigationType();
  const positions = useContext(HistoryContext)!;
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
    current.current = { url, x: target.x, y: target.y };
    let pending = true;
    let frame = 0;
    let timeout = 0;
    const main = document.getElementById("main");
    let focused =
      typeof restore?.focus === "string" ? restore.focus : undefined;
    const read = () => ({ url, x: window.scrollX, y: window.scrollY });
    const remember = () => {
      if (pending && !restore) return;
      const previous = positions.get(location.key);
      rememberEntry(positions, location.key, {
        // Full document navigations can reuse the router's default key.
        // Never carry another URL's view choices into this entry on unload.
        ...(previous?.url === url ? previous : undefined),
        ...(current.current ?? read()),
        focus: focused,
      });
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
      ) {
        if (typeof restore?.focus === "string") {
          main
            ?.querySelector<HTMLElement>(
              `[data-navigation-focus="${CSS.escape(restore.focus)}"]`,
            )
            ?.focus({ preventScroll: true });
        }
        finish();
      }
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
    // Capture before route DOM is removed, including browsers where tapping a
    // link does not focus it. Stable keys survive sorting and refreshed data.
    const onFocus = (event: Event) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-navigation-focus]")
          : null;
      focused =
        element && main?.contains(element)
          ? element.dataset.navigationFocus
          : undefined;
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
    document.addEventListener("focusin", onFocus);
    document.addEventListener("click", onFocus, true);
    // Missing targets and removed content must not keep controlling the viewport.
    timeout = window.setTimeout(finish, 10000);
    main?.focus({ preventScroll: true });
    if (!restore) {
      if (navigation !== "POP")
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
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
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("click", onFocus, true);
    };
  }, [account, location.key, location.hash, navigation, positions, url]);

  return null;
}
