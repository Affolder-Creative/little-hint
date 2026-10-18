export type EmailMessage =
  | { kind: "sign-in"; code: string }
  | { kind: "invitation" | "update"; text: string; actionPath: string };

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );

export function renderEmail(message: EmailMessage, appUrl: string) {
  const url = new URL(appUrl);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid app URL.");
  if (message.kind !== "sign-in") {
    if (
      !message.actionPath.startsWith("/") ||
      message.actionPath.startsWith("//")
    )
      throw new Error("Invalid email action path.");
    const action = new URL(message.actionPath, url);
    if (action.origin !== url.origin)
      throw new Error("Invalid email action origin.");
    url.href = action.href;
  }
  const isCode = message.kind === "sign-in";
  const invitation = message.kind === "invitation";
  const subject = isCode
    ? "Your Little Hint sign-in code"
    : invitation
      ? "Your Little Hint invitation"
      : "An update in Little Hint";
  const heading = isCode
    ? "Your sign-in code"
    : invitation
      ? "You're invited."
      : "A little update for you.";
  const preview = isCode
    ? "Use this code to sign in to Little Hint. It is valid for 10 minutes."
    : invitation
      ? "Your invitation is ready in Little Hint."
      : "Open Little Hint to see what's new.";
  const text = isCode
    ? `Your Little Hint sign-in code is ${message.code}. It expires in 10 minutes. If you did not request it, ignore this email.`
    : `${message.text} ${url.href}`;
  const content = isCode
    ? `<p style="margin:0 0 24px">Enter this code on the sign-in page to come on in.</p>
      <div style="background:#f4e4da;border:1px solid #e6d9cf;border-radius:8px;padding:20px 12px;text-align:center;margin:0 0 20px">
        <span style="font-size:32px;line-height:1.3;font-weight:600;letter-spacing:6px;color:#2b201d">${escapeHtml(message.code)}</span>
      </div>
      <p style="margin:0 0 8px;font-weight:600">Valid for 10 minutes</p>
      <p style="margin:0;color:#746057;font-size:14px">If you didn't request this code, you can ignore this email.</p>`
    : `<p style="margin:0 0 24px;white-space:pre-line">${escapeHtml(message.text)}</p>
      <table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#aa4d37" style="border-radius:8px;text-align:center">
        <a href="${escapeHtml(url.href)}" style="display:inline-block;padding:14px 22px;border:1px solid #aa4d37;border-radius:8px;font-weight:600;font-size:16px;line-height:1.4;color:#fff8f0;text-decoration:none">${invitation ? "View invitation" : "Open Little Hint"}</a>
      </td></tr></table>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#fff8f0;color:#2b201d;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#fff8f0"><tr><td align="center" style="padding:32px 16px">
    <!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
      <tr><td style="padding:0 8px 24px"><img src="cid:little-hint-logo" width="180" alt="Little Hint" style="display:block;width:180px;max-width:100%;height:auto;border:0"></td></tr>
      <tr><td bgcolor="#fffdf9" style="padding:28px 24px;border:1px solid #e6d9cf;border-radius:12px;font-size:16px;line-height:1.6;overflow-wrap:anywhere">
        <h1 style="margin:0 0 16px;color:#2b201d;font-size:26px;line-height:1.25;font-weight:600">${heading}</h1>
        ${content}
      </td></tr>
      <tr><td style="padding:20px 8px 0;color:#746057;font-size:13px;line-height:1.6">Little Hint<br>Gift ideas, shared thoughtfully.</td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table>
</body></html>`;
  return { subject, text, html };
}
