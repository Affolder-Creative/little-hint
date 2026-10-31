import { useState } from "react";
import type { AdminJob } from "../shared/admin-jobs";
import { Action } from "./Action";
export function AdminJobFailures({
  title,
  jobs,
  retry,
}: {
  title: string;
  jobs: AdminJob[];
  retry?: (id: string) => Promise<unknown>;
}) {
  const [limit, setLimit] = useState(10);
  const failed = jobs
    .filter((j) => j.status === "failed")
    .sort(
      (a, b) =>
        (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
        a.id.localeCompare(b.id),
    );
  if (!failed.length) return null;
  return (
    <details className="usage-details admin-job-failures">
      <summary>
        {title} ({failed.length})
      </summary>
      {failed.slice(0, limit).map((job) => (
        <div className="setting-row admin-job-row" key={job.id}>
          <div>
            <p className="job-message">
              {job.error || "The job could not finish."}
            </p>
            {job.createdAt && Number.isFinite(Date.parse(job.createdAt)) ? (
              <p>
                Queued{" "}
                <time dateTime={job.createdAt}>
                  {new Intl.DateTimeFormat(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  }).format(new Date(job.createdAt))}
                </time>
              </p>
            ) : (
              <p>Queue time unavailable</p>
            )}
            {job.diagnostic && (
              <p className="job-diagnostic">
                {job.diagnostic.stage}: {job.diagnostic.reason}
              </p>
            )}
            {job.attempts !== undefined && <p>{job.attempts} attempts</p>}
          </div>
          {retry && (
            <Action secondary onClick={() => retry(job.id)}>
              Retry
            </Action>
          )}
        </div>
      ))}
      {failed.length > limit && (
        <button className="text-button" onClick={() => setLimit((n) => n + 10)}>
          Show 10 more
        </button>
      )}
    </details>
  );
}
