import type { Group } from "../shared/model";
import { useApp } from "./context";
import { Form, Field } from "./components";
import { InviteDialog, InvitationShare } from "./InvitationShare";
import { Action } from "./Action";
export function GroupInvitationRequests({ group }: { group: Group }) {
  const { world, open, close, mutate, toast } = useApp();
  const owner = group.ownerId === world.me.id;
  const requests = (world.groupInviteRequests ?? []).filter(
    (r) => r.groupId === group.id,
  );
  return (
    <>
      {!owner && (
        <button
          className="button secondary"
          onClick={() =>
            world.memberInvitationsEnabled
              ? open(
                  `Invite someone to ${group.name}`,
                  <InviteDialog groupId={group.id} />,
                )
              : open(
                  "Request an invitation",
                  <Form
                    submit="Send request"
                    onSubmit={async (data) => {
                      await mutate("groups/request-invitation", {
                        groupId: group.id,
                        email: data.get("email"),
                      });
                      close();
                      toast("Invitation request sent to the group owner.");
                    }}
                  >
                    <Field label="Email address">
                      <input type="email" name="email" required />
                    </Field>
                    <p>
                      The group owner will review this request before an
                      invitation is sent.
                    </p>
                  </Form>,
                )
          }
        >
          {world.memberInvitationsEnabled
            ? "Invite someone"
            : "Request an invitation"}
        </button>
      )}
      {requests.map((r) => (
        <div className="invitation-row" key={r.id}>
          <div>
            <strong>{r.email}</strong>
            <p>Invitation request · {r.status}</p>
          </div>
          {r.status === "pending" && (
            <div className="invitation-actions">
              {owner ? (
                <>
                  <Action
                    onClick={() =>
                      mutate("groups/respond-invitation", {
                        id: r.id,
                        decision: "approve",
                      })
                    }
                  >
                    Approve and send
                  </Action>
                  <Action
                    secondary
                    onClick={() =>
                      mutate("groups/respond-invitation", {
                        id: r.id,
                        decision: "decline",
                      })
                    }
                  >
                    Decline
                  </Action>
                </>
              ) : (
                <Action
                  secondary
                  onClick={() =>
                    mutate("groups/respond-invitation", {
                      id: r.id,
                      decision: "withdraw",
                    })
                  }
                >
                  Withdraw request
                </Action>
              )}
            </div>
          )}
        </div>
      ))}
      {!owner &&
        world.invitations
          .filter(
            (i) => i.groupId === group.id && i.invitedById === world.me.id,
          )
          .map((i) => (
            <div className="invitation-row" key={i.id}>
              <div>{i.email} · Pending</div>
              <div className="invitation-actions">
                <InvitationShare invitationId={i.id} />
                <Action
                  secondary
                  onClick={() => mutate("invitations/revoke", { id: i.id })}
                >
                  Cancel invitation
                </Action>
              </div>
            </div>
          ))}
    </>
  );
}
