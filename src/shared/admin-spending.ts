export type SpendingEnableScope =
  { scope: "all" } | { scope: "group"; groupId: string };
export interface SpendingEligibility {
  total: number;
  eligible: number;
  alreadyEnabled: number;
  optedOut: number;
}
export interface AdminSpending {
  available: boolean;
  overall: SpendingEligibility;
  groups: Array<SpendingEligibility & { id: string; name: string }>;
}
export interface SpendingEnableResult {
  total: number;
  enabled: number;
  alreadyEnabled: number;
  optedOut: number;
  replayed?: boolean;
}
