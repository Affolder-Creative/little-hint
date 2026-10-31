import { smsInfo } from "./sms-provider";

export function channelFlag(value: string | undefined, name: string): boolean {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${name} must be true, false, or empty.`);
}

export function telegramInfo(cfg: Record<string, string>) {
  return {
    available:
      cfg.TELEGRAM_ENABLED === "true" &&
      !!cfg.TELEGRAM_BOT_TOKEN &&
      !!cfg.TELEGRAM_BOT_NAME,
  };
}

export function unavailableChannels(
  cfg: Record<string, string>,
): Array<"sms" | "telegram"> {
  return [
    ...(!smsInfo(cfg).available ? ["sms" as const] : []),
    ...(!telegramInfo(cfg).available ? ["telegram" as const] : []),
  ];
}
