import { transact } from "./db";
import { BrightDataFailure, ImportPending } from "./brightdata";
import { importCacheKey } from "./import-cache";
import { recordLookupDiagnostic } from "./lookup-diagnostics";
import type { LookupDiagnostic } from "../shared/lookup-diagnostics";

function failure(diagnostic?: LookupDiagnostic): BrightDataFailure {
  const d = diagnostic ?? {
    stage: "brightdata-unlocker",
    reason:
      "Previous request outcome uncertain; automatic resubmission stopped",
    retryable: false,
  };
  return new BrightDataFailure(d.stage, d.reason, d.status, d);
}

/** Reserve each dispatch durably. Only an explicit transient response allows a second. */
export async function retryableUnlock<T>(
  jobId: string | undefined,
  cfg: Record<string, string>,
  run: () => Promise<T>,
  allowRetry = true,
): Promise<T> {
  if (!jobId) return run();
  const configuration = importCacheKey("unlocker-retry", [
    cfg.SCRAPING_PROVIDER,
    cfg.BRIGHTDATA_API_KEY,
    cfg.BRIGHTDATA_UNLOCKER_ZONE,
  ]);
  const attempt = await transact((s) => {
    const job = s.imports.find((j) => j.id === jobId);
    if (
      !job ||
      job.status === "failed" ||
      job.status === "complete" ||
      (job.draft && job.draft.state !== "active")
    )
      throw failure({
        stage: "brightdata-unlocker",
        reason: "Import is no longer active",
      });
    const prior = job.unlockerRetry;
    if (prior) {
      if (prior.configuration !== configuration)
        throw failure({
          stage: "brightdata-unlocker",
          reason: "Lookup configuration changed; retry manually",
        });
      if (prior.status !== "scheduled" || prior.attempts >= 2)
        throw failure(prior.failure);
      if (Date.parse(prior.nextAttemptAt!) > Date.now())
        throw new ImportPending();
    }
    const attempts = (prior?.attempts ?? 0) + 1;
    job.unlockerRetry = { attempts, configuration, status: "dispatched" };
    return attempts;
  });
  try {
    const value = await run();
    await transact((s) => {
      const retry = s.imports.find((j) => j.id === jobId)?.unlockerRetry;
      if (retry) retry.status = "finished";
    });
    return value;
  } catch (error) {
    const diagnostic: LookupDiagnostic =
      error instanceof BrightDataFailure && error.diagnostic
        ? { ...error.diagnostic, attempt }
        : {
            stage: "brightdata-unlocker",
            reason:
              error instanceof Error &&
              /limit|allowance|budget/i.test(error.message)
                ? "Daily attempt allowance exhausted"
                : "Request outcome uncertain; automatic resubmission stopped",
            retryable: false,
            attempt,
          };
    const scheduled = await transact((s) => {
      const job = s.imports.find((j) => j.id === jobId);
      if (!job?.unlockerRetry) return false;
      job.unlockerRetry.failure = diagnostic;
      const active = !job.draft || job.draft.state === "active";
      if (
        allowRetry &&
        diagnostic.retryable &&
        attempt === 1 &&
        active &&
        job.status !== "failed" &&
        job.status !== "complete"
      ) {
        job.unlockerRetry.status = "scheduled";
        job.unlockerRetry.nextAttemptAt = new Date(
          Date.now() + 20000,
        ).toISOString();
        job.status = "pending";
        recordLookupDiagnostic(job, diagnostic);
        return true;
      }
      job.unlockerRetry.status = "finished";
      return false;
    });
    if (scheduled) throw new ImportPending();
    throw failure(diagnostic);
  }
}
