import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useApp } from "./context";
import { Form, Field } from "./components";
import { Action } from "./Action";
import { smsLoginConsent, smsVerificationConsent } from "../shared/sms";

export function SmsSettings() {
  const { world, close, toast } = useApp();
  const cache = useQueryClient();
  const [step, setStep] = useState<
    "email" | "email-code" | "manage" | "phone" | "phone-code"
  >("email");
  const [challenge, setChallenge] = useState("");
  const [phone, setPhone] = useState("");
  const [linked, setLinked] = useState(!!world.preferences.phoneVerified);
  const [login, setLogin] = useState(!!world.preferences.smsLogin);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState("");
  async function changed(message: string) {
    await cache.invalidateQueries({ queryKey: ["world"] });
    toast(message);
  }
  if (step === "email")
    return (
      <>
        <p>
          Confirm access to {world.me.email} before changing your phone or SMS
          sign-in. Your confirmation lasts 10 minutes in this session.
        </p>
        <Action
          onClick={async () => {
            const r = await api("channels/sms/reauth/start", {});
            setChallenge(r.challenge);
            setStep("email-code");
          }}
        >
          Send email confirmation code
        </Action>
      </>
    );
  if (removing)
    return (
      <section className="sms-settings">
        <h3
          tabIndex={-1}
          ref={(el) => {
            el?.focus();
          }}
        >
          Remove phone number?
        </h3>
        <p>
          SMS sign-in and recurring text updates will turn off. Email and
          passkeys remain available.
        </p>
        <div className="actions">
          <button
            className="button secondary"
            onClick={() => setRemoving(false)}
          >
            Keep phone number
          </button>
          <Action
            danger
            onClick={async () => {
              await api("channels/sms/login", { enabled: false, remove: true });
              await changed(
                "Phone removed. SMS sign-in and text updates are off.",
              );
              close();
            }}
          >
            Remove phone number
          </Action>
        </div>
      </section>
    );
  if (step === "manage")
    return (
      <section className="sms-settings">
        <p>
          {notice ||
            (linked
              ? "Your phone is verified. Choose whether to allow requested sign-in codes."
              : "Link your US mobile number to use optional text messages.")}
        </p>
        {linked && (
          <Form
            submit="Save SMS sign-in choice"
            onSubmit={async (f) => {
              const enabled = f.get("login") === "on";
              await api("channels/sms/login", { enabled, consent: enabled });
              setLogin(enabled);
              await changed(
                enabled ? "SMS sign-in enabled." : "SMS sign-in disabled.",
              );
              close();
            }}
          >
            <label className="check">
              <input
                type="checkbox"
                name="login"
                checked={login}
                onChange={(e) => setLogin(e.target.checked)}
              />
              {smsLoginConsent}
            </label>
            <p className="muted">
              Recurring text updates are a separate choice in Notifications. If
              you replied STOP, reply START to the sender before requesting more
              codes.
            </p>
          </Form>
        )}
        <div className="sms-number-actions">
          <button className="button secondary" onClick={() => setStep("phone")}>
            {linked ? "Replace phone number" : "Link phone number"}
          </button>
          {linked && (
            <button
              className="text-button danger"
              onClick={() => setRemoving(true)}
            >
              Remove phone number
            </button>
          )}
        </div>
      </section>
    );
  const emailStep = step === "email-code",
    codeStep = emailStep || step === "phone-code";
  return (
    <Form
      key={step}
      className="sms-settings"
      submit={codeStep ? "Verify code" : "Send verification code"}
      onSubmit={async (f) => {
        if (emailStep) {
          await api("channels/sms/reauth/verify", {
            challenge,
            code: String(f.get("code")),
          });
          setStep("manage");
        } else if (step === "phone-code") {
          await api("channels/sms/verify", {
            challenge,
            code: String(f.get("code")),
          });
          setLinked(true);
          setLogin(false);
          setNotice(
            "Phone verified. SMS sign-in and recurring text updates are still off. Choose SMS sign-in below, or close this window and enable text updates in Notifications.",
          );
          await changed("Phone verified.");
          setStep("manage");
        } else {
          const value = String(f.get("phone"));
          const r = await api("channels/sms/start", {
            phone: value,
            consent: f.get("consent") === "on",
          });
          setPhone(value);
          setChallenge(r.challenge);
          setStep("phone-code");
        }
      }}
    >
      {codeStep ? (
        <>
          <p role="status">
            Enter the code sent to {emailStep ? world.me.email : phone}. It
            expires in 5 minutes. Use the latest code.
          </p>
          <Field label="Six-digit code">
            <input
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              autoComplete="one-time-code"
              required
              autoFocus
            />
          </Field>
          <p className="muted">
            Need another code? Wait at least 60 seconds. Up to 3 codes per hour
            are available.
          </p>
          <Action
            secondary
            onClick={async () => {
              const r = emailStep
                ? await api("channels/sms/reauth/start", {})
                : await api("channels/sms/start", { phone, consent: true });
              setChallenge(r.challenge);
              setNotice("A new code was sent. Use the latest code.");
            }}
          >
            Resend code
          </Action>
          {notice && <p role="status">{notice}</p>}
          {!emailStep && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setChallenge("");
                setNotice("");
                setStep("phone");
              }}
            >
              Change number
            </button>
          )}
        </>
      ) : (
        <>
          <Field label="US mobile number" hint="For example, +1 202 555 0123.">
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              defaultValue={phone}
            />
          </Field>
          <label className="check">
            <input name="consent" type="checkbox" required />
            {smsVerificationConsent}
          </label>
          {linked && (
            <p>
              Your existing number stays linked until you verify its
              replacement.
            </p>
          )}
        </>
      )}
    </Form>
  );
}
