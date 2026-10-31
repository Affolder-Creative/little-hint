import { dismissActionMenu } from "./menu-dismiss";
import { useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useOnline } from "./pwa";
import { actionError } from "./copy";
export function Action({
  onClick,
  children,
  secondary = false,
  danger = false,
  label,
  disabled = false,
}: {
  label?: string;
  disabled?: boolean;
  onClick: () => Promise<unknown>;
  children: ReactNode;
  secondary?: boolean;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const online = useOnline();
  return (
    <span className="action-wrap">
      <button
        className={`button small ${secondary ? "secondary" : ""} ${danger ? "danger secondary" : ""}`}
        type="button"
        aria-label={label}
        title={!online ? "Reconnect to complete this action" : undefined}
        disabled={disabled || busy || !online}
        aria-busy={busy}
        onClick={async (event) => {
          const button = event.currentTarget;
          setBusy(true);
          setError("");
          try {
            await onClick();
            dismissActionMenu(button);
          } catch (e) {
            setError(actionError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle size={16} className="spin" /> : null}
        {children}
      </button>
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </span>
  );
}
