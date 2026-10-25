import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Heart,
  Users,
  LockKeyhole,
  KeyRound,
  LoaderCircle,
} from "lucide-react";
import { authClient } from "./api";
import { Logo, Field } from "./components";
import {
  codeLifetime,
  readPendingSignIn,
  savePendingSignIn,
} from "./sign-in-state";

type SignInError = { code?: string; status?: number; message?: string };
function errorMessage(
  error: SignInError,
  action: "send" | "verify" | "passkey",
) {
  if (error.status === 429)
    return "Too many requests. Wait a minute, then try again.";
  if (error.code === "OTP_EXPIRED")
    return "That code has expired. Resend a code to continue.";
  if (error.code === "INVALID_OTP")
    return "That code wasn't accepted. Check the six digits in your latest email, or resend a code.";
  if (error.code === "TOO_MANY_ATTEMPTS")
    return "Too many attempts with that code. Resend a code to try again.";
  if (action === "passkey")
    return "Passkey sign-in wasn't completed. Try again or use an email code.";
  return action === "send"
    ? "We couldn't send a code. Check your connection and try again."
    : "We couldn't sign you in. Check your connection and try again.";
}

export function Login({
  dark,
  online,
  onSuccess,
}: {
  dark: boolean;
  online: boolean;
  onSuccess: () => unknown;
}) {
  const [pending, setPending] = useState(readPendingSignIn);
  const [email, setEmail] = useState(pending?.email ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | "passkey" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expired, setExpired] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const sent = pending !== null;

  useEffect(() => {
    if (busy) return;
    if (sent) codeInput.current?.focus();
    else emailInput.current?.focus();
  }, [sent, pending?.requestedAt, busy]);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(
      () => {
        setExpired(true);
        savePendingSignIn(null);
      },
      Math.max(0, pending.requestedAt + codeLifetime - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [pending]);

  async function finish() {
    savePendingSignIn(null);
    setCode("");
    await onSuccess();
  }
  async function requestCode() {
    const address = email.trim().toLowerCase();
    const result = await authClient.emailOtp.sendVerificationOtp({
      email: address,
      type: "sign-in",
    });
    if (result.error) throw new Error(errorMessage(result.error, "send"));
    const next = { email: address, requestedAt: Date.now() };
    savePendingSignIn(next);
    setEmail(address);
    setPending(next);
    setCode("");
    setExpired(false);
    setNotice(
      sent
        ? "If this address has an account or active invitation, we’ll email a new code. Use the latest code you receive."
        : "",
    );
  }
  async function run(
    action: "send" | "verify" | "passkey",
    task: () => Promise<void>,
  ) {
    if (busy) return;
    setBusy(action);
    setError("");
    setNotice("");
    try {
      await task();
    } catch (cause) {
      setError(
        cause instanceof Error && !(cause instanceof TypeError)
          ? cause.message
          : errorMessage({}, action),
      );
    } finally {
      setBusy(null);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sent) return run("send", requestCode);
    await run("verify", async () => {
      const result = await authClient.signIn.emailOtp({
        email: pending.email,
        otp: code,
        name: pending.email.split("@")[0],
      });
      if (result.error) {
        if (
          result.error.code === "OTP_EXPIRED" ||
          result.error.code === "TOO_MANY_ATTEMPTS"
        ) {
          setExpired(true);
          savePendingSignIn(null);
        }
        throw new Error(errorMessage(result.error, "verify"));
      }
      await finish();
    });
  }
  return (
    <div className="login-page">
      <div className="login-brand">
        <Logo tagline dark={dark} />
      </div>
      <main className="login-layout">
        <section className="login-story">
          <h1>
            The best gifts <br />
            start with <br />
            <em>a little hint.</em>
          </h1>
          <p>
            Save what you would love, share your wish lists, and help your
            people find a gift that feels like you.
          </p>
          <div className="story-notes">
            <div>
              <Heart size={22} />
              <span>Save a few things you would love.</span>
            </div>
            <div>
              <Users size={22} />
              <span>Share your wish lists with your people.</span>
            </div>
            <div>
              <LockKeyhole size={22} />
              <span>Keep the surprise a surprise.</span>
            </div>
          </div>
        </section>
        <section className="login-form-panel">
          <h2>{sent ? "Check for a sign-in code" : "Come on in"}</h2>
          <p>
            {sent
              ? `If ${email} has an account or active invitation, we’ll email a sign-in code. Enter it below.`
              : "Use your account email or the address on your invitation."}
          </p>
          {sent && (
            <p>
              No email? Check your spam folder and the address above. If you’re
              new, ask someone who uses Little Hint for an invitation. If your
              invitation has expired, ask them to send a new one.
            </p>
          )}
          {!online && (
            <p className="notice" role="status">
              You're offline. Reconnect to send or check a code.
            </p>
          )}
          <form
            className="form login-form"
            onSubmit={submit}
            aria-busy={!!busy}
            data-dirty={sent || !!email}
          >
            <fieldset disabled={!!busy}>
              {sent ? (
                <Field
                  key="code"
                  label="Six-digit code"
                  hint={
                    expired
                      ? "This code has expired. Resend a code below."
                      : "Your code is valid for 10 minutes."
                  }
                >
                  <input
                    ref={codeInput}
                    name="code"
                    className="code-input"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </Field>
              ) : (
                <Field key="email" label="Email address">
                  <input
                    ref={emailInput}
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
              )}
            </fieldset>
            <button
              className="button"
              type="submit"
              disabled={!!busy || !online || (sent && expired)}
            >
              {busy === "send" || busy === "verify" ? (
                <LoaderCircle className="spin" size={17} />
              ) : null}
              {busy === "send"
                ? "Sending code…"
                : busy === "verify"
                  ? "Signing in…"
                  : sent
                    ? "Sign in"
                    : "Send me a code"}
            </button>
          </form>
          {sent && (
            <div className="login-recovery">
              <button
                className="text-button"
                disabled={!!busy || !online}
                onClick={() => run("send", requestCode)}
              >
                Resend code
              </button>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() => {
                  savePendingSignIn(null);
                  setPending(null);
                  setCode("");
                  setExpired(false);
                  setError("");
                  setNotice("");
                }}
              >
                Change email
              </button>
            </div>
          )}
          {notice && (
            <p className="login-feedback" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="error login-feedback" role="alert">
              {error}
            </p>
          )}
          <div className="or">
            <span>or</span>
          </div>
          <button
            className="button secondary wide"
            disabled={!!busy || !online}
            onClick={() =>
              run("passkey", async () => {
                const result = await authClient.signIn.passkey();
                if (result.error)
                  throw new Error(errorMessage(result.error, "passkey"));
                await finish();
              })
            }
          >
            <KeyRound size={18} />
            {busy === "passkey" ? "Opening passkey…" : "Sign in with a passkey"}
          </button>
          <p className="login-footnote">
            Your circle stays private. An invitation is needed to create an
            account.
          </p>
        </section>
      </main>
      <footer className="login-footer">
        For birthdays, just-because days, and everything in between.
      </footer>
    </div>
  );
}
