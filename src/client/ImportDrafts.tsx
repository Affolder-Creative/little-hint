import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import type { ImportJob } from "../shared/model";
import { api } from "./api";
import { useApp } from "./context";
import { GiftForm } from "./forms";
import { RunButton } from "./Management";

export function ImportDrafts({ listId }: { listId?: string }) {
  const { world, open } = useApp();
  const [params, setParams] = useSearchParams();
  const rows = world.imports.filter(
    (j) =>
      j.draft?.state === "active" && (!listId || j.draft.listId === listId),
  );
  const requested = params.get("draft");
  useEffect(() => {
    const draft = rows.find((j) => j.id === requested);
    if (draft) {
      open("Review your draft", <GiftForm importDraft={draft} />);
      const next = new URLSearchParams(params);
      next.delete("draft");
      setParams(next, { replace: true });
    }
  }, [requested]);
  if (!rows.length) return null;
  return (
    <section className="import-drafts" aria-label="Your drafts">
      <h2>Your drafts</h2>
      <p>
        Only you can see these. Review an item before adding it to your wish
        list.
      </p>
      {rows.map((j) => (
        <DraftRow key={j.id} initial={j} />
      ))}
    </section>
  );
}
function DraftRow({ initial }: { initial: ImportJob }) {
  const { world, open, mutate } = useApp();
  const query = useQuery({
    queryKey: ["import", world.me.id, initial.id],
    queryFn: () => api<ImportJob>(`imports/${initial.id}`),
    initialData: initial,
    refetchInterval: (q) =>
      ["pending", "running"].includes(q.state.data?.status ?? "")
        ? 2000
        : false,
  });
  const job = query.data;
  if (job.draft?.state !== "active") return null;
  const busy = ["pending", "running"].includes(job.status);
  const title = String(
    job.draft.fields.title ||
      job.result?.title ||
      `Item from ${new URL(job.url).hostname}`,
  );
  return (
    <div className="draft-row">
      <div>
        <strong>{title}</strong>
        <p role="status">
          {busy
            ? "Finding details…"
            : job.status === "complete"
              ? "Ready to review"
              : "Needs details"}
        </p>
        {query.error && (
          <p>Could not check progress. Your saved draft is still available.</p>
        )}
      </div>
      <div className="actions">
        <button
          className="button secondary"
          onClick={() =>
            open("Review your draft", <GiftForm importDraft={job} />)
          }
        >
          {busy ? "Open draft" : "Review and add"}
        </button>
        {world.productLookupEnabled !== false && job.status === "failed" && (
          <RunButton
            run={async () => {
              await mutate("imports/retry", { id: job.id });
              await query.refetch();
            }}
          >
            Try again
          </RunButton>
        )}
        <RunButton
          run={async () => {
            await mutate("imports/discard", { id: job.id });
            await query.refetch();
          }}
        >
          Remove
        </RunButton>
      </div>
    </div>
  );
}
