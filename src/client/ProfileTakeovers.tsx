import { useApp } from "./context";
import { InvitationShare, InviteDialog } from "./InvitationShare";
import { Form, Field } from "./components";
import { Action } from "./Action";
export function ProfileTakeovers() {
  const { world, mutate, open, close } = useApp();
  if (!world.profileTakeovers?.length) return null;
  return (
    <section>
      <h3>Profile takeover invitations</h3>
      {world.profileTakeovers.map((request) => (
        <div className="invitation-row" key={request.id}>
          <div>
            <strong>{request.name}</strong>
            <p>
              {request.email} · {request.status}
            </p>
          </div>
          <div className="invitation-actions">
            {request.status === "pending" ? (
              <>
                <InvitationShare />
                <Action
                  secondary
                  onClick={() =>
                    mutate("people/cancel-link", { id: request.id })
                  }
                >
                  Cancel takeover invitation
                </Action>
              </>
            ) : request.status === "accepted" && !world.groups.length ? (
              <p className="muted">
                Join or create a family group in Settings to invite them.
              </p>
            ) : request.status === "accepted" ? (
              <button
                className="button secondary"
                onClick={() =>
                  open(
                    "Invite to a family group",
                    <Form
                      submit="Continue"
                      onSubmit={async (data) => {
                        const groupId = String(data.get("groupId"));
                        const group = world.groups.find(
                          (g) => g.id === groupId,
                        )!;
                        if (
                          group.ownerId === world.me.id ||
                          world.memberInvitationsEnabled
                        )
                          open(
                            `Invite to ${group.name}`,
                            <InviteDialog
                              groupId={groupId}
                              initialEmail={request.email}
                              explanation={`Invite ${request.email} to join this group.`}
                            />,
                          );
                        else {
                          await mutate("groups/request-invitation", {
                            groupId,
                            email: request.email,
                          });
                          close();
                        }
                      }}
                    >
                      <Field label="Family group">
                        <select name="groupId" required defaultValue="">
                          <option value="" disabled>
                            Choose a group
                          </option>
                          {world.groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <p>
                        Joining a group requires a separate accepted invitation.
                        Owners review requests when member invitations are
                        restricted.
                      </p>
                    </Form>,
                  )
                }
              >
                Invite to family group
              </button>
            ) : world.people.some(
                (p) =>
                  p.id === request.personId &&
                  !p.userId &&
                  p.guardians.includes(world.me.id),
              ) ? (
              <Action
                secondary
                onClick={() =>
                  mutate("people/link", {
                    id: request.personId,
                    email: request.email,
                  })
                }
              >
                Send new takeover invitation
              </Action>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
