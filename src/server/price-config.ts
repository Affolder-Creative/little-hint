import { validTimeZone } from "../shared/list-dates";
export function priceConfig(env = process.env) {
  const zone = env.TZ?.trim() || "UTC";
  if (!validTimeZone(zone))
    throw new Error("TZ must be a valid IANA timezone.");
  const time = env.PRICE_CHECK_TIME || "08:00";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("PRICE_CHECK_TIME must be HH:mm.");
  const prefix = env.APP_ENV === "staging" ? "STAGING_" : "";
  const enabled = env[`${prefix}PRICE_CHECK_ENABLED`] || "false";
  if (!["true", "false"].includes(enabled))
    throw new Error(`${prefix}PRICE_CHECK_ENABLED must be true or false.`);
  const limit = (key: string, fallback: string) => {
    const v = env[`${prefix}${key}`] || (prefix ? "0" : fallback);
    if (!/^\d{1,6}$/.test(v)) throw new Error(`Invalid ${prefix}${key}.`);
    return Number(v);
  };
  return {
    zone,
    time,
    enabled: enabled === "true" && env.APP_ENV !== "preview",
    daily: limit("PRICE_CHECK_PAID_DAILY_LIMIT", "100"),
    monthly: limit("PRICE_CHECK_PAID_MONTHLY_LIMIT", "3000"),
  };
}
export function priceDay(now = new Date(), cfg = priceConfig()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: cfg.zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    due: `${get("hour")}:${get("minute")}` >= cfg.time,
  };
}
