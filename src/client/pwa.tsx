import { hasPendingWrites } from "./api";
import { useEffect, useState, useRef } from "react";
import {
  Download,
  Share,
  SquarePlus,
  Ellipsis,
  ArrowUpRight,
  Check,
  X,
  RefreshCw,
} from "lucide-react";
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let availablePrompt: InstallEvent | null = null;
const subs = new Set<() => void>();
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  availablePrompt = e as InstallEvent;
  subs.forEach((f) => f());
});
window.addEventListener("appinstalled", () => {
  availablePrompt = null;
  localStorage.setItem("little-hint:install", "never");
  subs.forEach((f) => f());
});
const installed = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
export function Install({
  manual = false,
  onClose,
}: {
  manual?: boolean;
  onClose?: () => void;
}) {
  const [, refresh] = useState(0);
  const [guide, setGuide] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => refresh((v) => v + 1);
    subs.add(update);
    return () => {
      subs.delete(update);
    };
  }, []);
  const dismiss = (forever = false) => {
    localStorage.setItem(
      "little-hint:install",
      forever ? "never" : String(Date.now() + 30 * 86400000),
    );
    refresh((v) => v + 1);
    onClose?.();
  };
  const value = localStorage.getItem("little-hint:install");
  const hidden = value === "never" || Number(value) > Date.now();
  if (installed())
    return manual ? (
      <p className="notice">
        <Check size={18} /> You’re using the installed Little Hint app.
      </p>
    ) : null;
  if (!manual && (hidden || !localStorage.getItem("little-hint:engaged")))
    return null;
  async function install() {
    if (!availablePrompt) {
      setGuide(true);
      return;
    }
    try {
      const e = availablePrompt;
      availablePrompt = null;
      await e.prompt();
      const choice = await e.userChoice;
      if (choice.outcome === "dismissed") dismiss();
      else {
        localStorage.setItem(
          "little-hint:install",
          String(Date.now() + 30 * 86400000),
        );
        refresh((v) => v + 1);
      }
    } catch {
      setGuide(true);
    }
  }
  const apple =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    <section
      className={`install ${manual ? "manual" : ""}`}
      aria-label="Install Little Hint"
    >
      <img
        src="/brand/little-hint/icons/little-hint-app-color-64.png"
        alt=""
        width="48"
        height="48"
      />
      <div>
        <h3>Keep Little Hint handy</h3>
        <p>
          Keep your wish lists a tap away. Add Little Hint to your Home Screen.
        </p>
        {guide && (
          <div className="install-guide">
            <ol>
              {apple ? (
                <>
                  <li>
                    <Share size={18} /> Open your browser’s Share menu. In
                    Safari, it may be inside the page menu.
                  </li>
                  <li>
                    <SquarePlus size={18} /> Choose Add to Home Screen. Check
                    More or Edit Actions if it’s missing.
                  </li>
                  <li>
                    <Check size={18} /> Keep Open as Web App enabled if shown,
                    then tap Add.
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <Ellipsis size={18} /> Open your browser’s menu.
                  </li>
                  <li>
                    <Download size={18} /> Choose Install app or Add to Home
                    Screen, if available.
                  </li>
                  <li>
                    <Check size={18} /> Confirm, then open Little Hint from its
                    new icon.
                  </li>
                </>
              )}
            </ol>
            <p className="muted">
              Opened this link inside another app? Open it in Safari on
              iPhone/iPad or a supporting browser such as Chrome on Android.
            </p>
            <button
              className="text-button"
              onClick={() =>
                navigator.clipboard
                  .writeText(location.origin)
                  .then(() => setError("Link copied."))
                  .catch(() =>
                    setError(
                      `Could not copy the link. Copy this address instead: ${location.origin}`,
                    ),
                  )
              }
            >
              Copy Little Hint link <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        {error && <p role="status">{error}</p>}
        <div className="actions">
          <button className="button small" onClick={install}>
            <Download size={16} />
            {availablePrompt ? "Install Little Hint" : "Show me how"}
          </button>
          {!manual && (
            <>
              <button className="text-button" onClick={() => dismiss()}>
                Not now
              </button>
              <button
                className="text-button muted"
                onClick={() => dismiss(true)}
              >
                Don’t remind me
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
export function UpdateNotice() {
  const requested = useRef(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let reloading = false;
    const changed = () => {
      if (reloading || !requested.current) return;
      reloading = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller)
              setWaiting(sw);
          });
        });
      })
      .catch(() => {});
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
  }, []);
  return waiting ? (
    <div className="update-banner" role="status">
      <RefreshCw size={17} />
      <span>{message || "A new version of Little Hint is ready."}</span>
      <button
        onClick={() => {
          if (
            hasPendingWrites() ||
            document.querySelector('dialog[open],form[data-dirty="true"]')
          ) {
            setMessage("Finish saving or close your form before updating.");
            return;
          }
          requested.current = true;
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        Update now
      </button>
      <button aria-label="Dismiss update" onClick={() => setWaiting(null)}>
        <X size={16} />
      </button>
    </div>
  ) : null;
}
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
