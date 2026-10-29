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
