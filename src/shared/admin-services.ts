export interface AdminServiceStatus {
  id: string;
  label: string;
  status: "Configured" | "Not configured" | "Off" | "Direct lookup only";
  detail?: string;
}
