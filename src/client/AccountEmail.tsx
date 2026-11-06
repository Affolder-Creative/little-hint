import "./account-email.css";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authClient, clearPersonalData } from "./api";
import { clearPushBinding } from "./Notifications";
import { useApp } from "./context";
import { Field, Form } from "./components";

export function AccountEmail() {
  const { world, open } = useApp();
  return (
    <div className="setting-row">
      <div>
        <strong>Email address</strong>
        <p>{world.me.email}</p>
      </div>
      <button
        className="button secondary"
        onClick={() => open("Change email address", <EmailChange />)}
      >
        Change email
      </button>
    </div>
  );
}
function EmailChange() {
  const { world, close } = useApp();
  const client = useQueryClient();
  const [step, setStep] = useState<"address" | "current" | "new">("address");
  const [email, setEmail] = useState("");
  const activeField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    activeField.current?.focus();
  }, [step]);
  const check = (result: {
    error?: { message?: string; code?: string } | null;
  }) => {
    if (result.error)
      throw new Error(
        result.error.code === "SESSION_NOT_FRESH"
          ? "Sign out and sign in again, then retry changing your email."
          : (result.error.message ??
              "We could not verify this code. Request a new one and try again."),
      );
  };
  return (
    <Form
      key={step}
      className="account-email-form"
      secondaryActionsPosition="after-cancel"
      dialogLayout
      submit={
        step === "address"
          ? "Send current email code"
          : step === "current"
            ? "Verify current email"
            : "Confirm new email"
      }
      busyLabel="Verifying…"
      cancel={close}
      onSubmit={async (data) => {
        const otp = String(data.get("code") ?? "").trim();
        if (step === "address") {
          const target = String(data.get("email")).trim().toLowerCase();
          if (target === world.me.email.toLowerCase())
            throw new Error("Enter a different email address.");
          check(
            await authClient.emailOtp.sendVerificationOtp({
              email: world.me.email,
              type: "email-verification",
            }),
          );
          setEmail(target);
          setStep("current");
        } else if (step === "current") {
          check(
            await authClient.emailOtp.requestEmailChange({
              newEmail: email,
              otp,
            }),
          );
          setStep("new");
        } else {
          check(
            await authClient.emailOtp.changeEmail({ newEmail: email, otp }),
          );
          await clearPushBinding().catch(() => {});
          await clearPersonalData();
          client.clear();
          location.assign("/");
        }
      }}
      secondaryActions={
        step === "address"
          ? undefined
          : (busy) => (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => setStep("address")}
              >
                Start over or request a new code
              </button>
            )
      }
    >
      <p>
        Your lists, memberships, and history stay with your account. Verify both
        addresses to change your sign-in email. Afterwards, sign in again on
        each device and re-enable push notifications. Local drafts and cached
        photos on this device will be cleared.
      </p>
      {step === "address" ? (
        <>
          <p>
            Current email: <strong>{world.me.email}</strong>
          </p>
          <Field label="New email address">
            <input
              name="email"
              type="email"
              autoComplete="email"
              ref={activeField}
              required
              maxLength={254}
              defaultValue={email}
            />
          </Field>
        </>
      ) : (
        <>
          <p role="status">
            {step === "current"
              ? `Enter the code sent to ${world.me.email}.`
              : `Enter the code sent to ${email}. If it does not arrive, check spam or choose an address that is not already used by another account.`}{" "}
            Codes expire after 10 minutes.
          </p>
          <Field
            label={step === "current" ? "Current email code" : "New email code"}
          >
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              ref={activeField}
            />
          </Field>
        </>
      )}
    </Form>
  );
}
