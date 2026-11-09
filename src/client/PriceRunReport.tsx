import type { AdminJobs, PriceSummary } from "../shared/admin-jobs";
import { AdminJobFailures } from "./AdminJobFailures";
function Summary({ summary }: { summary: PriceSummary }) {
  return (
    <dl className="admin-job-facts">
      {(
        [
          ["Product URLs", summary.total],
          ["Successful", summary.successful],
          ["Waiting", summary.waiting],
          ["Failed", summary.failed],
          ["Price not verifiable", summary.unverifiable],
          ["Allowance deferred", summary.deferred],
          ["Skipped after changes", summary.skipped],
        ] as const
      ).map(([label, count]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{count}</dd>
        </div>
      ))}
    </dl>
  );
}
export function PriceRunReport({
  report,
}: {
  report: NonNullable<NonNullable<AdminJobs["prices"]>["report"]>;
}) {
  return (
    <>
      {report.latest ? (
        <>
          <h5 className="admin-run-title">Latest run · {report.latest.day}</h5>
          <Summary summary={report.latest} />
        </>
      ) : (
        <p>No price checks have run yet.</p>
      )}
      <details className="admin-provider-details">
        <summary>Last seven days</summary>
        <p className="muted">
          Repeated checks of the same product count separately. Unverified
          prices keep their previous value.
        </p>
        <Summary summary={report.history} />
        <AdminJobFailures title="Unsuccessful checks" jobs={report.failures} />
      </details>
    </>
  );
}
