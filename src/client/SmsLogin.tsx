import { useEffect, useState } from "react";
import { Field, Form } from "./components";
import { Action } from "./Action";
async function authRequest(path: string, body: unknown) {
  const r = await fetch(`/api/auth/sms/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(
      r.status === 429
        ? "Too many requests. Wait a minute, then try again."
        : "The code was not accepted or SMS is unavailable. Use email or a passkey, or request a new code.",
    );
  return data;
}
export function SmsLogin({
  onSuccess,
  online,
  onBack,
}: {
  onSuccess: () => unknown;
  online: boolean;
  onBack: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState("");
  const [requestedAt, setRequestedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function send() {
    const data = await authRequest("send-code", { phone });
    setChallenge(data.challenge);
    setRequestedAt(Date.now());
    setNow(Date.now());
  }
  return (
    <>
      <h2>Sign in by text</h2>
      <p>
        Use a US mobile number you already verified and enabled for SMS sign-in
        in Settings. New accounts still need an email invitation.
      </p>
      <Form
        key={challenge || "phone"}
        submit={challenge ? "Sign in" : "Send sign-in code"}
        onSubmit={async (f) => {
          if (!online) throw new Error("Reconnect to send or check a code.");
          if (!challenge) await send();
          else {
            await authRequest("sign-in", {
              challenge,
              code: String(f.get("code")),
            });
            await onSuccess();
          }
        }}
      >
        {challenge ? (
          <>
            <p role="status">
              If {phone} has SMS sign-in enabled, a code is on its way. Codes
              expire in 5 minutes.
            </p>
            <Field label="Six-digit text code">
              <input
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
              />
            </Field>
            {now - requestedAt >= 300000 && (
              <p role="status">This code has expired. Request a new one.</p>
            )}
          </>
        ) : (
          <Field label="US mobile number">
            <input
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        )}
      </Form>
      {challenge && (
        <div className="actions">
          <Action
            secondary
            disabled={!online || now - requestedAt < 60000}
            onClick={send}
          >
            Resend text code
            {now - requestedAt < 60000
              ? ` in ${Math.ceil((60000 - now + requestedAt) / 1000)}s`
              : ""}
          </Action>
          <button className="text-button" onClick={() => setChallenge("")}>
            Change number
          </button>
        </div>
      )}
      <p className="muted">
        Message and data rates may apply. If you replied STOP, reply START to
        the sender before requesting another code.
      </p>
      <button className="text-button" onClick={onBack}>
        Use email or a passkey
      </button>
    </>
  );
}
