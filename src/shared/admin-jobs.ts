import type { LookupDiagnostic } from "./lookup-diagnostics";
export interface PriceSummary {
  total: number;
  successful: number;
  waiting: number;
  failed: number;
  unverifiable: number;
  deferred: number;
  skipped: number;
}
export interface AdminJob {
  draftState?: "active" | "published" | "discarded";
  id: string;
  createdAt?: string;
  status: string;
  error?: string;
  diagnostic?: LookupDiagnostic;
  diagnostics?: LookupDiagnostic[];
  attempts?: number;
}
export interface AdminJobs {
  prices?: {
    report?: {
      latest: (PriceSummary & { day: string }) | null;
      history: PriceSummary;
      failures: AdminJob[];
    };
    providerUsage: Array<{ source: string; count: number }>;
    enabled: boolean;
    zone: string;
    time: string;
    daily: number;
    monthly: number;
    dailyUsed: number;
    monthlyUsed: number;
    pending: number;
    failed: number;
    lastRun: number;
  };
  workerLastSeen: number | null;
  backupProvider: string;
  imports: AdminJob[];
  notifications: AdminJob[];
}
