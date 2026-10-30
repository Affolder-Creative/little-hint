export interface AiUsage {
  enabled: boolean;
  requests: number;
  reported: number;
  unreported: number;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number | null;
  models: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    reported: number;
  }>;
}
export interface AdminUsage {
  sms: SmsUsage;
  visible: boolean;
  month: string;
  resetsAt: string;
  pricingAsOf: string;
  suggestions: AiUsage & {
    quotaSearches: number;
    exemptSearches: number;
    monthlyLimit: number;
    searchCalls: number;
  };
  productDetails: AiUsage;
  scraping: {
    enabled: boolean;
    requests: number;
    providers: Array<{
      id: string;
      name: string;
      requests: number;
      enabled: boolean;
    }>;
  };
}

export interface SmsUsage {
  enabled: boolean;
  provider: string;
  requests: number;
  history: number;
  signIn: number;
  verification: number;
  activity: number;
  monthlyLimit: number;
  reserve: number;
  balance: number | null;
  availableForNotifications: number | null;
  quotaState: "fresh" | "stale" | "unavailable" | "not-applicable";
  checkedAt?: string;
  outcomes: Array<{ status: string; count: number }>;
  skipped: Array<{ reason: string; count: number }>;
  providers: Array<{ provider: string; requests: number }>;
}
