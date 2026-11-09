import type { PriceCheck } from "../shared/model";
import type { LookupDiagnostic } from "../shared/lookup-diagnostics";
import { BrightDataFailure } from "./brightdata";

const verificationReasons = new Set([
  "Product cannot be verified",
  "Choose an exact product option",
  "Selected option cannot be verified",
  "Price cannot be verified",
  "Invalid price",
  "Seller cannot be verified",
  "Product redirected",
  "Product price cannot be verified",
  "Product identity mismatch",
  "Etsy listing identity could not be verified",
  "Etsy listing options cannot be verified",
  "In-stock availability cannot be verified",
  "Etsy product details or listing identity could not be verified",
  "Returned product does not match the requested product or selected option",
]);
export function priceFailure(
  error: unknown,
  stage: string,
): {
  outcome: NonNullable<PriceCheck["outcome"]>;
  diagnostic: LookupDiagnostic;
} {
  const message = error instanceof Error ? error.message : "";
  let outcome: NonNullable<PriceCheck["outcome"]> = "provider-error";
  let reason = "Lookup failed; provider or connection details unavailable.";
  if (message === "Check no longer eligible") {
    outcome = "skipped";
    reason = "Item changed or tracking is no longer eligible.";
  } else if (
    /allowance|budget|daily limit|Price-check allowance/.test(message)
  ) {
    outcome = "deferred";
    reason = "Provider request allowance exhausted.";
  } else if (verificationReasons.has(message)) {
    outcome = "unverifiable";
    reason = message;
  } else if (message === "Paid fallback unavailable") {
    outcome = "unverifiable";
    reason = "Direct price unavailable and no paid fallback configured.";
  }
  const diagnostic: LookupDiagnostic = { stage, reason };
  if (error instanceof BrightDataFailure) {
    diagnostic.stage = error.stage;
    diagnostic.status = error.status;
    if (outcome === "provider-error")
      diagnostic.reason =
        error.status === 401
          ? "Provider credentials rejected."
          : error.status === 403
            ? "Provider access restricted."
            : error.status === 429
              ? "Provider rate or quota limit."
              : "Provider collection or request failed.";
    // Provider diagnostics are created from fixed, sanitized descriptions.
    if (error.diagnostic) Object.assign(diagnostic, error.diagnostic);
  }
  return { outcome, diagnostic };
}
export function recordPriceFailure(
  job: PriceCheck,
  error: unknown,
  stage: string,
) {
  const result = priceFailure(error, stage);
  job.diagnostics = [...(job.diagnostics ?? []), result.diagnostic].slice(-8);
  return result.outcome;
}
