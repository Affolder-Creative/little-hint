export interface AdminJob {
  id: string;
  createdAt?: string;
  status: string;
  error?: string;
  diagnostic?: { stage: string; reason: string };
  attempts?: number;
}
export interface AdminJobs {
  workerLastSeen: number | null;
  backupProvider: string;
  imports: AdminJob[];
  notifications: AdminJob[];
}
