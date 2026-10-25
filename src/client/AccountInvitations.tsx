import { Mail } from "lucide-react";
import { isAccountInvitation } from "../shared/invitations";
import { useApp } from "./context";
import { Field, Form } from "./components";
import { Confirm } from "./Confirm";
import { value } from "./forms";

const explanation =
  "They can create their own wish lists. This invitation does not share your lists or add them to a family group.";

export function AccountInvitations() {
  const { world, open, close, mutate, toast } = useApp();
  const pending = world.invitations.filter(
    (invitation) =>
      isAccountInvitation(invitation) && invitation.invitedById === world.me.id,
  );
  return (
    <>
      <h2 id="settings-invitations-title">Invitations</h2>
      <p>{explanation}</p>
      <button
        className="button secondary"
        onClick={() =>
          open(
            "Invite someone to Little Hint",
            <Form
              submit="Send invitation"
              onSubmit={async (data) => {
                await mutate("invitations", {
                  email: value(data, "email").trim(),
                });
                close();
                toast("Your invitation is waiting to be emailed.");
              }}
            >
              <Field label="Email address">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                />
              </Field>
              <p>{explanation}</p>
              <p>
                The invitation is tied to this address and expires in seven
                days.
              </p>
            </Form>,
          )
        }
      >
        <Mail size={16} />
        Invite someone to Little Hint
      </button>
      <h3>Pending invitations</h3>
      {pending.length ? (
        pending.map((invitation) => (
          <div className="setting-row" key={invitation.id}>
            <div>
              <strong>{invitation.email}</strong>
              <p className="muted">
                Expires {new Date(invitation.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <button
              className="button secondary small"
              aria-label={`Cancel invitation to ${invitation.email}`}
              onClick={() =>
                open(
                  "Cancel this invitation?",
                  <Confirm
                    label="Cancel invitation"
                    onConfirm={async () => {
                      await mutate("invitations/revoke", { id: invitation.id });
                      toast("Invitation cancelled.");
                    }}
                  >
                    This invitation will no longer let {invitation.email} create
                    an account. If they already have an account, they can keep
                    using it.
                  </Confirm>,
                )
              }
            >
              Cancel invitation
            </button>
          </div>
        ))
      ) : (
        <p className="muted">You have no pending invitations to Little Hint.</p>
      )}
    </>
  );
}
