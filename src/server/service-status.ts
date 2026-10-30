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
      status: configured(cfg.TELEGRAM_BOT_TOKEN && cfg.TELEGRAM_BOT_NAME),
    },
    {
      id: "sms",
      label: "Text messages",
      status: configured(
        cfg.TWILIO_ACCOUNT_SID &&
          cfg.TWILIO_AUTH_TOKEN &&
          cfg.TWILIO_FROM &&
          cfg.TWILIO_VERIFY_SERVICE_SID,
      ),
    },
    { id: "push", label: "Browser push", status: configured(push) },
    {
      id: "shops",
      label: "Shop lookups",
      status:
        provider && Number(cfg.PAID_DAILY_LIMIT) > 0
          ? "Configured"
          : "Direct lookup only",
      ...(provider && Number(cfg.PAID_DAILY_LIMIT) > 0
        ? { detail: scrapingProviders.find((p) => p.id === provider)!.name }
        : {}),
    },
    {
      id: "product-ai",
      label: "AI product details",
      status:
        Number(cfg.PAID_DAILY_LIMIT) === 0
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
