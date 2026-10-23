import { Link, useSearchParams } from "react-router-dom";
import { Field } from "./components";

export const settingsSections = [
  { id: "profile", label: "Profile & appearance" },
  { id: "groups", label: "Family groups" },
  { id: "notifications", label: "Notifications" },
  { id: "device", label: "Device & drafts" },
  { id: "security", label: "Sign-in & security" },
  { id: "admin", label: "Administration" },
] as const;

export function SettingsNavigation({
  section,
  admin,
  pendingRequests,
}: {
  section: string;
  admin: boolean;
  pendingRequests: number;
}) {
  const [params, setParams] = useSearchParams();
  const sections = settingsSections.filter((s) => admin || s.id !== "admin");
  const label = (s: (typeof settingsSections)[number]) =>
    s.id === "groups" && pendingRequests
      ? `${s.label} · ${pendingRequests} pending`
      : s.label;
  const destination = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("section", id);
    return next;
  };
  return (
    <div className="settings-navigation">
      <nav className="settings-nav" aria-label="Settings sections">
        {sections.map((s) => (
          <Link
            key={s.id}
            to={`?${destination(s.id)}`}
            aria-current={section === s.id ? "page" : undefined}
          >
            {label(s)}
          </Link>
        ))}
      </nav>
      <div className="settings-mobile-navigation">
        <Field label="Settings section">
          <select
            value={section}
            onChange={(e) => setParams(destination(e.target.value))}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {label(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
