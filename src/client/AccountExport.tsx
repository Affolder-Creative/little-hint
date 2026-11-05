import { useState } from "react";
import { Field } from "./components";
import { Action } from "./Action";
import { api } from "./api";
export function AccountExport() {
  const [format, setFormat] = useState("json");
  const [table, setTable] = useState("wishes");
  return (
    <section
      className="settings-section settings-subsection"
      aria-labelledby="account-export-title"
    >
      <h2 id="account-export-title">Export your data</h2>
      <p>
        Download your profiles, wish lists, items, private ideas, drafts, and
        your own buying and spending records as JSON. For Excel or another
        spreadsheet, choose a CSV table.
      </p>
      <p className="muted">
        Other people's private activity and sign-in credentials are excluded.
        Photos are listed as signed-in download links, not bundled files.
        Personal drafts stored only on this device are not included.
      </p>
      <Field label="Export format">
        <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="json">JSON · All exportable data</option>
          <option value="csv">CSV · Spreadsheet table</option>
        </select>
      </Field>
      {format === "csv" && (
        <>
          <Field label="CSV table">
            <select
              aria-describedby="account-csv-help"
              value={table}
              onChange={(e) => setTable(e.target.value)}
            >
              <option value="wishes">Wishes &amp; ideas</option>
              <option value="buying">Buying history</option>
              <option value="spending">Spending records</option>
            </select>
          </Field>
          <p id="account-csv-help" className="account-export-help">
            One row per item or record, with names and dollar amounts. Download
            each table separately. Blank amounts mean no price was entered.
            Refunds are positive amounts marked as refunds. CSV tables include
            archived, deleted, or voided records with a status column. Use JSON
            for profiles, preferences, drafts, and other account data.
          </p>
        </>
      )}
      <Action
        secondary
        onClick={async () => {
          const data = await api("account/export", { format, table });
          const url = URL.createObjectURL(
            new Blob(
              [format === "csv" ? data.content : JSON.stringify(data, null, 2)],
              {
                type:
                  format === "csv"
                    ? "text/csv;charset=utf-8"
                    : "application/json",
              },
            ),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download =
            format === "csv" ? data.filename : "little-hint-personal-data.json";
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        {format === "csv" ? "Download CSV" : "Download my data"}
      </Action>
    </section>
  );
}
