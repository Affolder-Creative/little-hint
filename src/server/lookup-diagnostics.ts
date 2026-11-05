import type { ImportJob } from "../shared/model";
import type { LookupDiagnostic } from "../shared/lookup-diagnostics";

export function recordLookupDiagnostic(
  job: ImportJob,
  diagnostic: LookupDiagnostic,
) {
  const history = job.diagnostics?.length
    ? job.diagnostics
    : job.diagnostic
      ? [job.diagnostic]
      : [];
  job.diagnostic = diagnostic;
  job.diagnostics = [...history, diagnostic].slice(-8);
}

const codes: Record<string, [string, boolean]> = {
  client_10000: ["Provider credentials rejected", false],
  client_10001: ["Provider credentials rejected", false],
  client_10002: ["Provider zone unavailable", false],
  client_10010: ["Provider credentials missing", false],
  client_10020: ["Provider account suspended", false],
  client_10030: ["Provider IP access restriction", false],
  client_10040: ["Provider account verification required", false],
  client_10100: ["Provider zone usage limit reached", false],
  client_10110: ["Provider rate limit reached", false],
  client_10120: ["Provider routing restricted", false],
  policy_20070: ["Destination restricted in selected country", false],
  target_40020: ["Destination connection timed out", true],
  target_40021: ["Destination connection timed out", true],
  internal_50010: ["Provider internal error", true],
  internal_50020: ["Provider automatic failover failed", true],
};

/** Only fixed descriptions and documented code-shaped identifiers may escape. */
export function unlockerDiagnostic(
  status: number,
  envelope: any,
  headers: Headers,
): LookupDiagnostic {
  const inner = envelope && typeof envelope === "object" ? envelope : {};
  const nested =
    inner.headers && typeof inner.headers === "object" ? inner.headers : {};
  const header = (name: string) =>
    headers.get(name) ??
    Object.entries(nested).find(([k]) => k.toLowerCase() === name)?.[1];
  const raw = [
    inner.error_code,
    header("x-brd-err-code"),
    header("proxy-status"),
  ]
    .filter((v) => typeof v === "string")
    .join(" ");
  const code = raw.match(
    /\b(?:client|policy|target|peer|internal)_\d{5}\b/,
  )?.[0];
  const known = code ? codes[code] : undefined;
  const reason =
    known?.[0] ??
    (code?.startsWith("policy_")
      ? "Provider policy restriction"
      : code?.startsWith("client_")
        ? "Provider account or request restriction"
        : status === 401 || status === 407
          ? "Provider credentials rejected"
          : status === 402
            ? "Provider billing restriction"
            : status === 403
              ? "Provider access restricted"
              : status === 429
                ? "Provider rate or quota limit"
                : status === 400
                  ? "Provider request rejected"
                  : "Provider returned an unclassified failure");
  return {
    stage: "brightdata-unlocker",
    status,
    ...(code ? { code } : {}),
    reason,
    retryable: known?.[1] === true && status >= 500 && status <= 599,
  };
}

export class RecoveryFailure extends Error {
  constructor(public diagnostic: LookupDiagnostic) {
    super(diagnostic.reason);
  }
}

export async function recoveryApiFailure(
  response: Response,
): Promise<RecoveryFailure> {
  let code: string | undefined;
  // Read a small bounded error body; never retain its arbitrary message text.
  try {
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 16384) break;
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
    }
    if (size <= 16384) {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"))?.error
        ?.code;
      if (
        [
          "invalid_api_key",
          "insufficient_quota",
          "rate_limit_exceeded",
          "model_not_found",
          "unsupported_parameter",
          "invalid_parameter",
          "invalid_request_error",
        ].includes(value)
      )
        code = value;
    }
  } catch {
    /* Status alone remains useful. */
  }
  const status = response.status;
  const reason =
    status === 401
      ? "AI credentials rejected"
      : status === 403
        ? "AI access restricted"
        : code === "insufficient_quota"
          ? "AI quota exhausted"
          : status === 429
            ? "AI rate or quota limit"
            : status >= 500
              ? "AI service unavailable"
              : "AI request rejected";
  return new RecoveryFailure({
    stage: "ai",
    reason,
    status,
    ...(code ? { code } : {}),
  });
}

export function recoveryDiagnostic(
  error: unknown,
  stage: string,
  elapsedMs: number,
): LookupDiagnostic {
  if (error instanceof RecoveryFailure)
    return { ...error.diagnostic, stage, elapsedMs };
  const reasons: Record<string, string> = {
    "Incomplete recovery": "AI response incomplete",
    "Unverified identity": "Product identity or evidence did not match",
    "Unsupported extraction": "Extraction evidence was not present on the page",
    "Missing source": "AI response lacked a matching source citation",
    "Product name mismatch": "Recovered product name did not match",
  };
  const reason =
    error instanceof Error && /timeout|abort/i.test(error.name)
      ? "AI recovery timed out"
      : error instanceof Error && reasons[error.message]
        ? reasons[error.message]
        : error instanceof SyntaxError ||
            (error instanceof Error && error.name === "ZodError")
          ? "AI returned invalid structured output"
          : "AI recovery failed unexpectedly";
  return { stage, reason, elapsedMs };
}
