import { Action } from "./Action";
import { api } from "./api";
export function AccountExport() {
  return (
    <section
      className="settings-section"
      aria-labelledby="account-export-title"
    >
      <h2 id="account-export-title">Export your data</h2>
      <p>
        Download your profiles, wish lists, items, private ideas, drafts, and
        your own buying and spending records as JSON.
      </p>
      <p className="muted">
        Other people's private activity and sign-in credentials are excluded.
        Photos are listed as signed-in download links, not bundled files.
        Personal drafts stored only on this device are not included.
      </p>
      <Action
        secondary
        onClick={async () => {
          const data = await api("account/export", {});
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "little-hint-personal-data.json";
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Download my data
      </Action>
    </section>
  );
}
