export interface AdminJob {
  id: string;
  createdAt?: string;
  status: string;
  error?: string;
  diagnostic?: { stage: string; reason: string };
  attempts?: number;
}
export interface AdminJobs {
  prices?: {
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
