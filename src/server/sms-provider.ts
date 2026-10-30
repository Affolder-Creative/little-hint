import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { smsActivityMessage, type SmsInfo } from "../shared/sms";
export type SmsConfig = Record<string, string>;
export function smsInfo(c: SmsConfig): SmsInfo {
  const provider =
    c.SMS_PROVIDER === "textbelt" || c.SMS_PROVIDER === "twilio"
      ? c.SMS_PROVIDER
      : "none";
  return {
    provider,
    available:
      Number(c.PAID_DAILY_LIMIT) > 0 &&
      (provider === "textbelt"
        ? !!c.TEXTBELT_API_KEY
        : provider === "twilio" &&
          !!(
            c.TWILIO_ACCOUNT_SID &&
            c.TWILIO_AUTH_TOKEN &&
            c.TWILIO_FROM &&
            c.TWILIO_VERIFY_SERVICE_SID
          )),
    eligibleEvents: (c.SMS_ALLOWED_EVENTS ?? "exchange,access")
      .split(",")
      .filter(Boolean),
    monthlyLimit: Number(c.SMS_MONTHLY_LIMIT || 100),
    dailyLimit: Number(c.SMS_USER_DAILY_LIMIT || 2),
    reserve: Number(c.SMS_CREDIT_RESERVE || 20),
  };
}
export function smsAccount(c: SmsConfig) {
  return createHash("sha256")
    .update(
      `${c.SMS_PROVIDER}:${c.SMS_PROVIDER === "textbelt" ? c.TEXTBELT_API_KEY : `${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_VERIFY_SERVICE_SID}:${c.TWILIO_FROM}`}`,
    )
    .digest("hex");
}
export function normalizePhone(value: string) {
  const p = parsePhoneNumberFromString(value, "US");
  return p?.country === "US" && p.isValid() ? String(p.number) : undefined;
}
// Never propagate URLs, response bodies, or provider exceptions: OTP verification
// and quota URLs contain secrets. Only explicitly selected fields leave this file.
async function json(
  url: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  try {
    const r = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!r.ok) throw new Error();
    const data = await r.json();
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    throw new Error("SMS provider unavailable.");
  }
}
const quotaValue = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
export async function providerQuota(c: SmsConfig) {
  const data = await json(
    `https://textbelt.com/quota/${encodeURIComponent(c.TEXTBELT_API_KEY)}`,
  );
  const remaining = quotaValue(data.quotaRemaining);
  if (data.success !== true || remaining === undefined)
    throw new Error("SMS balance unavailable.");
  return remaining;
}
async function twilio(
  c: SmsConfig,
  route: string,
  body: Record<string, string>,
  verify = false,
) {
  return json(`https://${verify ? "verify" : "api"}.twilio.com${route}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
}
export async function providerSend(
  c: SmsConfig,
  phone: string,
  id: string,
  purpose: "activity" | "login" | "verification",
) {
  const origin = process.env.APP_URL ?? "http://localhost:5173";
  if (c.SMS_PROVIDER === "textbelt") {
    const data = await json(
      `https://textbelt.com/${purpose === "activity" ? "text" : "otp/generate"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: c.TEXTBELT_API_KEY,
          phone,
          sender: "Little Hint",
          ...(purpose === "activity"
            ? {
                message: smsActivityMessage,
                replyWebhookUrl: `${origin}/api/hooks/textbelt`,
                webhookData: id,
              }
            : {
                userid: id,
                length: 6,
                lifetime: 300,
                message: `Little Hint: Your ${purpose === "login" ? "sign-in" : "verification"} code is $OTP. It expires in 5 minutes. Do not share this code.`,
              }),
        }),
      },
    );
    if (typeof data.success !== "boolean")
      throw new Error("SMS provider unavailable.");
    const providerId =
      typeof data.textId === "string" || typeof data.textId === "number"
        ? String(data.textId)
        : undefined;
    if (data.success && !providerId)
      throw new Error("SMS provider unavailable.");
    return {
      accepted: data.success,
      providerId,
      remaining: quotaValue(data.quotaRemaining),
    };
  }
  if (c.SMS_PROVIDER !== "twilio") throw new Error("SMS is not configured.");
  const data =
    purpose === "activity"
      ? await twilio(
          c,
          `/2010-04-01/Accounts/${c.TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            To: phone,
            From: c.TWILIO_FROM,
            Body: smsActivityMessage,
            StatusCallback: `${origin}/api/hooks/twilio/status?sms=${id}`,
          },
        )
      : await twilio(
          c,
          `/v2/Services/${c.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
          { To: phone, Channel: "sms", Locale: "en" },
          true,
        );
  if (typeof data.sid !== "string")
    throw new Error("SMS provider unavailable.");
  return { accepted: true, providerId: data.sid, remaining: undefined };
}
export async function providerVerify(
  c: SmsConfig,
  phone: string,
  id: string,
  code: string,
) {
  if (c.SMS_PROVIDER === "textbelt") {
    const q = new URLSearchParams({
      key: c.TEXTBELT_API_KEY,
      userid: id,
      otp: code,
    });
    const data = await json(`https://textbelt.com/otp/verify?${q}`);
    return data.success === true && data.isValidOtp === true;
  }
  if (c.SMS_PROVIDER !== "twilio") return false;
  const data = await twilio(
    c,
    `/v2/Services/${c.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
    { To: phone, Code: code },
    true,
  );
  return data.status === "approved";
}
export async function providerStatus(id: string) {
  const data = await json(
    `https://textbelt.com/status/${encodeURIComponent(id)}`,
  );
  if (data.status === "DELIVERED") return "delivered" as const;
  if (data.status === "FAILED") return "failed" as const;
  if (data.status === "SENT" || data.status === "SENDING")
    return "accepted" as const;
  return "uncertain" as const;
}
export function verifyTextbelt(
  raw: string,
  timestamp: string,
  signature: string,
  key: string,
  now = Date.now(),
) {
  if (
    !key ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 900000 ||
    !/^[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = createHmac("sha256", key)
    .update(timestamp + raw)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
