import "./account-closure.css";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, clearPersonalData } from "./api";
import { clearPushBinding } from "./Notifications";
import { useApp } from "./context";
import { Action } from "./Action";
import { Form, Field } from "./components";
import { Confirm } from "./Confirm";

type Review = {
  blockers: {
    kind: string;
    id: string;
    title: string;
    detail: string;
    href: string;
  }[];
  candidates: { id: string; name: string }[];
  requests: {
    id: string;
    kind: string;
    name: string;
    from: string;
    to: string;
    incoming: boolean;
  }[];
};
const useReview = () =>
  useQuery({
    queryKey: ["account-closure"],
    queryFn: () => api<Review>("account/closure"),
  });
export function AccountClosure() {
  const { open, toast } = useApp();
  const client = useQueryClient(),
    review = useReview();
  return (
    <section
      className="settings-account-closure"
      aria-labelledby="account-closure-title"
    >
      <h2 id="account-closure-title">Close your account</h2>
      <p>
        Permanently remove your account and private data. Shared gift history
        will show “Former member”. You will review the details before
        confirming.
      </p>
      {review.data?.requests.map((r) => (
        <div className="setting-row" key={r.id}>
          <div>
            <strong>{r.name}</strong>
            <p>
              {r.incoming
                ? `${r.from} asks you to take responsibility. Only accept if you have agreed to manage this.`
                : `Waiting for ${r.to}. Ask them to open Settings → Sign-in & security to accept. Requests expire after 24 hours.`}
            </p>
          </div>
          {r.incoming && (
            <button
              className="button secondary"
              onClick={() =>
                open(
                  "Accept this responsibility?",
                  <Confirm
                    label="Accept responsibility"
                    onConfirm={async () => {
                      await api("account/handoff/respond", {
                        id: r.id,
                        accept: true,
                      });
                      await client.invalidateQueries();
                      toast("Responsibility transferred.");
                    }}
                  >
                    {r.kind === "admin"
                      ? "You will become an app administrator. This allows you to manage application settings."
                      : `You will manage ${r.name}'s profile and wish lists.`}{" "}
                    {r.from} will no longer hold this responsibility.
                  </Confirm>,
                )
              }
            >
              Review handoff
            </button>
          )}
          <Action
            secondary
            onClick={async () => {
              await api("account/handoff/respond", { id: r.id, accept: false });
              await client.invalidateQueries({ queryKey: ["account-closure"] });
            }}
          >
            {r.incoming ? "Decline" : "Cancel handoff"}
          </Action>
        </div>
      ))}
      <button
        className="button secondary danger"
        onClick={() => open("Review account closure", <ClosureReview />)}
      >
        Close account
      </button>
    </section>
  );
}
function ClosureReview() {
  const { world, open, close } = useApp();
  const review = useReview(),
    client = useQueryClient();
  const [challenge, setChallenge] = useState("");
  const [confirmation, setConfirmation] = useState(""),
    [code, setCode] = useState("");
  if (review.isPending)
    return (
      <p role="status">Checking your responsibilities and gift commitments…</p>
    );
  if (review.isError)
    return (
      <>
        <p role="alert">
          We could not check your account. Try again before continuing.
        </p>
        <Action onClick={() => review.refetch()}>Retry account review</Action>
      </>
    );
  const { blockers, candidates } = review.data;
  return (
    <Form
      key={challenge || "review"}
      dirty={false}
      dialogLayout
      className="account-closure-form"
      submit={challenge ? "Permanently close my account" : "Send closure code"}
      busyLabel={challenge ? "Closing account…" : "Sending code…"}
      cancel={close}
      secondaryActionsPosition="after-cancel"
      secondaryActions={
        challenge
          ? (busy) => (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setChallenge("");
                  setCode("");
                  setConfirmation("");
                }}
              >
                Request a new closure code
              </button>
            )
          : undefined
      }
      disabled={
        blockers.length > 0 ||
        (!!challenge && (confirmation !== "DELETE" || !/^\d{6}$/.test(code)))
      }
      onSubmit={async () => {
        if (!challenge) {
          const r = await api<{ challenge: string }>(
            "account/closure/start",
            {},
          );
          setChallenge(r.challenge);
          return;
        }
        await api("account/closure/confirm", { challenge, code, confirmation });
        await clearPushBinding().catch(() => {});
        await clearPersonalData();
        client.clear();
        location.assign("/");
      }}
    >
      <p>
        <strong>This is permanent and cannot be undone.</strong>
      </p>
      {!challenge ? (
        <>
          <ul className="closure-consequences">
            <li>
              Your sign-in methods, private ideas, personal wish lists, drafts,
              preferences, uploads, and personal spending records will be
              removed. All devices will be signed out.
            </li>
            <li>
              Joint lists stay with their remaining owners. Past purchases,
              settled contributions, and exchange history remain with your
              identity replaced by “Former member”. Your discussion text is
              removed. Other people’s records and shared content may still
              contain text they entered.
            </li>
            <li>
              Spending connections end. Your local drafts and cached photos on
              this device are cleared. Deleted uploads are queued for removal
              from storage. Installation backups expire under the operator’s
              retention policy.
            </li>
          </ul>
          <p>
            Export any data you want to keep before continuing. A new invitation
            would be needed to create another account.
          </p>
        </>
      ) : (
        <p>
          Closing your account removes private data and signs out every device.
          Shared gift history remains anonymized.
        </p>
      )}
      {blockers.length > 0 ? (
        <>
          <h3>Resolve these first</h3>
          {blockers.map((b) => (
            <div className="closure-blocker" key={`${b.kind}:${b.id}`}>
              <strong>{b.title}</strong>
              <p>{b.detail}</p>
              {["admin", "guardian"].includes(b.kind) ? (
                candidates.length ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() =>
                      open(
                        "Request a handoff",
                        <Form
                          dialogLayout
                          className="account-closure-form"
                          submit="Request handoff"
                          cancel={close}
                          onSubmit={async (data) => {
                            await api("account/handoff", {
                              kind: b.kind,
                              personId: b.id,
                              userId: data.get("userId"),
                            });
                            await client.invalidateQueries();
                            close();
                          }}
                        >
                          <p>
                            {b.title}. The other person must accept in Settings
                            → Sign-in & security. This does not close your
                            account.
                          </p>
                          <Field label="Trusted member">
                            <select name="userId" required defaultValue="">
                              <option value="" disabled>
                                Choose a member
                              </option>
                              {candidates.map((p) => (
                                <option value={p.id} key={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </Form>,
                      )
                    }
                  >
                    Choose someone to take over
                  </button>
                ) : (
                  <p>
                    Invite a trusted person and connect through a family group
                    first, then return here.
                  </p>
                )
              ) : (
                <Link to={b.href} onClick={close}>
                  Review this in the app
                </Link>
              )}
            </div>
          ))}
          <Action secondary onClick={() => review.refetch()}>
            Refresh account review
          </Action>
        </>
      ) : challenge ? (
        <>
          <p role="status">
            A closure code was sent to {world.me.email}. It expires in 10
            minutes and only works on this device.
          </p>
          <Field label="Account closure code">
            <input
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
            />
          </Field>
          <Field label="Type DELETE to confirm">
            <input
              name="confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </Field>
        </>
      ) : (
        <p>
          No unresolved responsibilities or gift commitments were found. We will
          check again before closing your account.
        </p>
      )}
    </Form>
  );
}
