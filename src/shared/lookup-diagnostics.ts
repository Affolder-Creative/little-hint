export interface LookupDiagnostic {
  stage: string;
  reason: string;
  status?: number;
  code?: string;
  retryable?: boolean;
  elapsedMs?: number;
  attempt?: number;
}
