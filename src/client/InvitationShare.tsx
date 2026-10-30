import { useState } from "react";
import { Share2, Copy } from "lucide-react";
import { Field, Form } from "./components";
import { useApp } from "./context";

export function InvitationShare({ invitationId }: { invitationId?: string }) {
  const { toast } = useApp();
  const [fallback, setFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const url = new URL(
    invitationId ? `/invite/${encodeURIComponent(invitationId)}` : "/",
    location.origin,
  ).href;
  const native = typeof navigator.share === "function" && !fallback;
  return (
    <div className="invitation-share">
      <button
        className="button secondary small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            if (native)
              await navigator.share({
                title: "Little Hint",
                text: "You're invited to Little Hint. Sign in with the email address I invited.",
                url,
              });
            else {
              await navigator.clipboard.writeText(url);
              toast("Sign-in link copied.");
            }
          } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError"))
              setFallback(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {native ? <Share2 size={16} /> : <Copy size={16} />}
        {native ? "Share sign-in link" : "Copy sign-in link"}
      </button>
      {fallback && (
        <Field label="Sign-in link" hint="Copy this link to share it.">
          <input
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
        </Field>
      )}
    </div>
  );
}

export function InviteDialog({
  groupId,
  explanation,
}: {
  groupId?: string;
  explanation?: string;
}) {
  const { mutate, close } = useApp();
  const [created, setCreated] = useState<{ id: string; email: string } | null>(
    null,
  );
  return created ? (
    <div className="invitation-share">
      <p role="status">
        Your invitation to {created.email} is waiting to be emailed.
      </p>
      <p>
        You can share a sign-in link now. They must use the invited email
        address.
      </p>
      <InvitationShare invitationId={groupId ? created.id : undefined} />
      <button className="button" onClick={close}>
        Done
      </button>
    </div>
  ) : (
    <Form
      submit="Send invitation"
      onSubmit={async (data) => {
        const email = String(data.get("email") ?? "").trim();
        const invitation = await mutate<{ id: string }>(
          groupId ? "groups/invite" : "invitations",
          { email, ...(groupId ? { groupId } : {}) },
        );
        setCreated({ id: invitation.id, email });
      }}
    >
      <Field label="Email address">
        <input type="email" name="email" autoComplete="email" required />
      </Field>
      {explanation && <p>{explanation}</p>}
      <p>The invitation is tied to this address and expires in seven days.</p>
    </Form>
  );
}
