import { productLookupEnabled } from "../shared/product-lookup";
import { telegramInfo } from "./channel-availability";
import { smsInfo } from "./sms-provider";
import type { AdminServiceStatus } from "../shared/admin-services";
import {
  selectedScrapingProvider,
  scrapingProviders,
} from "../shared/scraping-providers";
import { discoveryConfiguration } from "./settings";

export function serviceStatuses(
  cfg: Record<string, string>,
  push: boolean,
): AdminServiceStatus[] {
  const configured = (ready: unknown): AdminServiceStatus["status"] =>
    ready ? "Configured" : "Not configured";
  const discovery = discoveryConfiguration(cfg);
  const provider = selectedScrapingProvider(cfg);
  return [
    {
      id: "email",
      label: "Email",
      status: configured(cfg.SMTP_HOST && (!cfg.SMTP_USER || cfg.SMTP_PASS)),
    },
    {
      id: "telegram",
      label: "Telegram",
      status:
        cfg.TELEGRAM_ENABLED !== "true"
          ? "Off"
          : configured(telegramInfo(cfg).available),
      detail:
        cfg.TELEGRAM_ENABLED !== "true"
          ? "Enable Telegram in the deployment environment to offer it to users."
          : !telegramInfo(cfg).available
            ? "Telegram requires both a bot token and bot name."
            : undefined,
    },
    {
      id: "sms",
      label: "Text messages",
      status:
        cfg.SMS_ENABLED !== "true" ? "Off" : configured(smsInfo(cfg).available),
      detail:
        cfg.SMS_ENABLED !== "true"
          ? "Enable SMS in the deployment environment to offer it to users."
          : !smsInfo(cfg).available
            ? `Provider: ${smsInfo(cfg).provider}. Select a provider, supply its required credentials, and set a positive paid-request limit.`
            : `Provider: ${smsInfo(cfg).provider}. SMS sign-in and recurring notifications require separate opt-ins.`,
    },
    { id: "push", label: "Browser push", status: configured(push) },
    {
      id: "shops",
      label: "Shop lookups",
      status: !productLookupEnabled(cfg)
        ? "Off"
        : provider && Number(cfg.PAID_DAILY_LIMIT) > 0
          ? "Configured"
          : "Direct lookup only",
      ...(provider && Number(cfg.PAID_DAILY_LIMIT) > 0
        ? { detail: scrapingProviders.find((p) => p.id === provider)!.name }
        : cfg.SCRAPING_PROVIDER === "brightdata"
          ? {
              detail:
                "Bright Data requires an API key, Web Unlocker zone, and positive daily allowance.",
            }
          : {}),
    },
    {
      id: "product-ai",
      label: "AI product details",
      status:
        !productLookupEnabled(cfg) || Number(cfg.PAID_DAILY_LIMIT) === 0
          ? "Off"
          : configured(cfg.OPENAI_API_KEY),
    },
    {
      id: "suggestions",
      label: "AI gift suggestions",
      status:
        discovery.mode === "off" ? "Off" : configured(discovery.available),
      ...(discovery.available
        ? {
            detail: `${discovery.mode === "givers" ? "For others" : discovery.mode === "receivers" ? "For own lists" : "For others and own lists"}. ${discovery.weeklyLimit} new searches per account each week; ${discovery.monthlyLimit} shared each month. Server-managed exceptions may apply.`,
          }
        : {}),
    },
  ];
}
