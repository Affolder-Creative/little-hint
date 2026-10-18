import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import nodemailer from "nodemailer";
import { existsSync } from "node:fs";
import path from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import {
  randomUUID,
  createHash,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { config, spend } from "./settings";
import { pool, readState, transact } from "./db";
import { noticeAllowed, preferences, stamp, fail } from "./domain";
import type { Actor } from "../shared/model";
import { renderEmail, type EmailMessage } from "./email";
const origin = () => process.env.APP_URL ?? "http://localhost:5173";
export async function sendEmail(to: string, message: EmailMessage) {
  const { subject, text, html } = renderEmail(message, origin());
  const c = await config();
  if (!c.SMTP_HOST) {
    if (process.env.NODE_ENV === "production")
      throw new Error("SMTP is not configured.");
    await mkdir(".local/mail", { recursive: true });
    await writeFile(
      `.local/mail/${Date.now()}-${randomUUID()}.json`,
      JSON.stringify({ to, subject, text, html }),
      { mode: 0o600 },
    );
    return;
  }
  const transport = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: Number(c.SMTP_PORT),
    secure: c.SMTP_PORT === "465",
    requireTLS: c.SMTP_PORT !== "465",
    auth: c.SMTP_USER ? { user: c.SMTP_USER, pass: c.SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  const root = existsSync("dist/client/brand/little-hint")
    ? "dist/client"
    : "public";
  const logo = await readFile(
    path.resolve(
      root,
      "brand/little-hint/logos/png/little-hint-horizontal-color.png",
    ),
  );
  await transport.sendMail({
    from: c.SMTP_FROM,
    to,
    subject,
    text,
    html,
    attachments: [
      { filename: "little-hint.png", content: logo, cid: "little-hint-logo" },
    ],
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  transport.close();
}
export async function telegramCall(
  method: string,
  body: Record<string, unknown>,
) {
  const c = await config();
  if (!c.TELEGRAM_BOT_TOKEN) throw new Error("Telegram is not configured.");
  const r = await fetch(
    `https://api.telegram.org/bot${c.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    },
  );
  const json = (await r.json()) as { ok: boolean; result: any };
  if (!r.ok || !json.ok) throw new Error("Telegram delivery failed.");
  return json.result;
}
export async function twilioCall(
  route: string,
  body: Record<string, string>,
  verify = false,
) {
  const c = await config();
  if (!c.TWILIO_ACCOUNT_SID || !c.TWILIO_AUTH_TOKEN)
    throw new Error("SMS is not configured.");
  await spend("sms");
  const host = verify ? "verify.twilio.com" : "api.twilio.com";
  const r = await fetch(`https://${host}${route}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.TWILIO_ACCOUNT_SID}:${c.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("SMS provider could not complete this request.");
  return r.json() as Promise<Record<string, string>>;
}
export async function deliverNotice(id: string) {
  let s = await readState();
  let n = s.notices.find((n) => n.id === id);
  if (!n || n.status === "sent") return;
  if (!noticeAllowed(s, n)) {
    await transact((s) => {
      const n = s.notices.find((n) => n.id === id)!;
      n.status = "sent";
      n.error = "No longer authorized.";
    });
    return;
  }
  const inv = n.invitationId
    ? s.invitations.find((i) => i.id === n!.invitationId)
    : undefined;
  const user = inv
    ? { email: inv.email, name: "" }
    : (
        await pool.query('SELECT email,name FROM "user" WHERE id=$1', [
          n.userId,
        ])
      ).rows[0];
  if (!user) return;
  const prefs = inv
    ? {
        email: true,
        telegram: false,
        sms: false,
        events: ["invitation"],
        chatId: undefined,
        phone: undefined,
        phoneVerified: false,
        smsOptOut: false,
      }
    : preferences(s, { id: n.userId, email: user.email, name: user.name });
  if (!prefs.events.includes(n.event)) {
    await transact((s) => {
      s.notices.find((n) => n.id === id)!.status = "sent";
    });
    return;
  }
  const actionPath = inv
    ? `/invite/${inv.id}`
    : n.exchangeId
      ? "/exchanges"
      : n.itemId
        ? `/gift/${n.itemId}`
        : "/settings";
  const link = new URL(actionPath, origin()).href;
  const message = inv
    ? `You've been invited to Little Hint. Sign in with this email address and accept your invitation: ${link}`
    : `You have an update in Little Hint. Sign in to view it: ${link}`;
  try {
    for (const channel of ["email", "telegram", "sms"] as const) {
      s = await readState();
      n = s.notices.find((n) => n.id === id)!;
      if (!noticeAllowed(s, n)) break;
      const current = inv
        ? prefs
        : preferences(s, { id: n.userId, email: user.email, name: user.name });
      if (
        !current[channel] ||
        !current.events.includes(n.event) ||
        n.delivered.includes(channel)
      )
        continue;
      if (channel === "email")
        await sendEmail(user.email, {
          kind: inv ? "invitation" : "update",
          text: inv
            ? "You've been invited to Little Hint. Sign in with this email address and accept your invitation."
            : "You have an update in Little Hint. Sign in to view it.",
          actionPath,
        });
      if (channel === "telegram" && current.chatId)
        await telegramCall("sendMessage", {
          chat_id: current.chatId,
          text: message,
          disable_web_page_preview: true,
        });
      if (
        channel === "sms" &&
        current.phoneVerified &&
        !current.smsOptOut &&
        current.phone
      ) {
        const c = await config();
        await twilioCall(
          `/2010-04-01/Accounts/${c.TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            To: current.phone,
            From: c.TWILIO_FROM,
            Body: `${message} Reply STOP to unsubscribe.`,
            StatusCallback: `${origin()}/api/hooks/twilio/status?notice=${id}`,
          },
        );
      }
      await transact((s) => {
        const n = s.notices.find((n) => n.id === id)!;
        n.delivered = [...new Set([...n.delivered, channel])];
        n.revision++;
      });
    }
    await transact((s) => {
      const n = s.notices.find((n) => n.id === id)!;
      n.status = "sent";
      n.error = undefined;
      n.revision++;
    });
  } catch {
    await transact((s) => {
      const n = s.notices.find((n) => n.id === id)!;
      n.attempts++;
      n.error = "Provider unavailable. Check integration settings.";
      if (n.attempts >= 5) n.status = "failed";
      n.revision++;
    });
    throw new Error("Notification provider unavailable.");
  }
}
export async function linkTelegram(a: Actor) {
  const c = await config();
  if (!c.TELEGRAM_BOT_NAME || !c.TELEGRAM_BOT_TOKEN)
    fail(400, "Telegram has not been configured by the administrator.");
  const token = randomBytes(24).toString("base64url");
  await transact((s) => {
    s.links = s.links.filter((l) => l.userId !== a.id || l.kind !== "telegram");
    s.links.push({
      ...stamp(),
      kind: "telegram",
      userId: a.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
      consumed: false,
    });
  });
  return { url: `https://t.me/${c.TELEGRAM_BOT_NAME}?start=${token}` };
}
export async function pollTelegram() {
  const c = await config();
  if (!c.TELEGRAM_BOT_TOKEN) return;
  const s = await readState();
  const offset = s.usage.find((u) => u.key === "telegram-offset")?.count ?? 0;
  const updates = await telegramCall("getUpdates", {
    offset,
    timeout: 0,
    allowed_updates: ["message"],
  });
  for (const update of updates) {
    const msg = update.message;
    if (msg?.chat?.type === "private" && typeof msg.text === "string") {
      const token = msg.text.match(/^\/start\s+([\w-]+)$/)?.[1];
      if (token) {
        const hash = createHash("sha256").update(token).digest("hex");
        await transact((s) => {
          const link = s.links.find(
            (l) =>
              l.kind === "telegram" &&
              l.tokenHash === hash &&
              !l.consumed &&
              Date.parse(l.expiresAt) > Date.now(),
          );
          if (!link) return;
          const prefs = preferences(s, {
            id: link.userId,
            email: "",
            name: "",
          });
          prefs.chatId = String(msg.chat.id);
          prefs.telegram = true;
          if (!s.preferences.some((p) => p.id === prefs.id))
            s.preferences.push(prefs);
          link.consumed = true;
          link.revision++;
        });
      }
      if (/^\/stop\b/i.test(msg.text))
        await transact((s) => {
          for (const p of s.preferences.filter(
            (p) => p.chatId === String(msg.chat.id),
          )) {
            p.telegram = false;
            p.chatId = undefined;
            p.revision++;
          }
        });
    }
    await transact((s) => {
      let u = s.usage.find((u) => u.key === "telegram-offset");
      if (!u) {
        u = { ...stamp(), key: "telegram-offset", count: 0 };
        s.usage.push(u);
      }
      u.count = Math.max(u.count, update.update_id + 1);
    });
  }
}
export function isUSPhone(phone: string): boolean {
  const parsed = parsePhoneNumberFromString(phone);
  return (
    !!parsed &&
    parsed.country === "US" &&
    parsed.isValid() &&
    parsed.number === phone
  );
}
export async function smsStart(a: Actor, phone: string, consent: boolean) {
  if (!consent || !isUSPhone(phone))
    fail(400, "Use a US phone number beginning with +1 and consent to SMS.");
  const c = await config();
  if (!c.TWILIO_VERIFY_SERVICE_SID)
    fail(400, "SMS verification is not configured.");
  await twilioCall(
    `/v2/Services/${c.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
    { To: phone, Channel: "sms" },
    true,
  );
  await transact((s) => {
    const p = preferences(s, a);
    p.phone = phone;
    p.phoneVerified = false;
    p.sms = false;
    if (!s.preferences.some((x) => x.id === p.id)) s.preferences.push(p);
  });
}
export async function smsVerify(a: Actor, code: string) {
  if (!/^\d{4,10}$/.test(code)) fail(400, "Enter the verification code.");
  const s = await readState(),
    p = preferences(s, a);
  if (!p.phone) fail(400, "Request a verification code first.");
  const c = await config();
  const response = await twilioCall(
    `/v2/Services/${c.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
    { To: p.phone, Code: code },
    true,
  );
  if (response.status !== "approved")
    fail(400, "The code was not accepted. Request a new code.");
  await transact((s) => {
    const current = preferences(s, a);
    if (current.phone !== p.phone)
      fail(409, "The phone number changed. Try again.");
    current.phoneVerified = true;
    current.sms = true;
    current.smsOptOut = false;
    current.revision++;
  });
}
export async function verifyTwilio(
  url: string,
  body: Record<string, string>,
  signature: string,
) {
  const c = await config();
  if (!c.TWILIO_AUTH_TOKEN) return false;
  const input =
    url +
    Object.keys(body)
      .sort()
      .map((k) => k + body[k])
      .join("");
  const expected = createHmac("sha1", c.TWILIO_AUTH_TOKEN)
    .update(input)
    .digest("base64");
  return (
    expected.length === signature.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}
