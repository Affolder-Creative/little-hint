import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { FriendEntry } from "../shared/model";
import { useApp } from "./context";
import { Field, Form } from "./components";
import { Action } from "./Action";
import { Confirm } from "./Confirm";
import { InvitationShare } from "./InvitationShare";

export function AddFriend() {
  const { mutate, close, toast } = useApp();
  const navigate = useNavigate();
  return (
    <Form
      submit="Add friend"
      cancel={close}
      onSubmit={async (data) => {
        const friend = await mutate<FriendEntry>("friends", {
          name: String(data.get("name") ?? "").trim(),
        });
        close();
        navigate(`/people/${friend.personId}?tab=ideas`);
        toast("Friend added. Your gift ideas start private.");
      }}
    >
      <p>
        Save gift ideas for someone who hasn't joined. No email or account is
        needed.
      </p>
      <Field label="Friend's name">
        <input name="name" required maxLength={160} autoComplete="off" />
      </Field>
      <p className="muted">
        Only you can see this entry. You can share it with a group or invite
        your friend later.
      </p>
    </Form>
  );
}

function FriendEditor({ entry }: { entry: FriendEntry }) {
  const { world, mutate, close } = useApp();
  return (
    <Form
      submit="Save friend"
      cancel={close}
      review={(data) => {
        const groups = data.getAll("groupIds").map(String);
        if (
          groups.length === entry.groupIds.length &&
          groups.every((id) => entry.groupIds.includes(id))
        )
          return null;
        return (
          <>
            <h3>Review who can plan gifts</h3>
            <p>
              {groups.length
                ? `Members of ${world.groups
                    .filter((g) => groups.includes(g.id))
                    .map((g) => g.name)
                    .join(", ")} can see this friend and add their own ideas.`
                : "This friend entry will be private."}
            </p>
            <p>
              Your private ideas stay private. Each author chooses which ideas
              to share.
            </p>
            <p>
              Removing a group also removes its access to ideas shared through
              this entry. Authors keep their ideas and buyers keep purchase
              history.
            </p>
          </>
        );
      }}
      onSubmit={async (data) => {
        await mutate("friends/update", {
          id: entry.id,
          revision: entry.revision,
          name: String(data.get("name") ?? "").trim(),
          groupIds: data.getAll("groupIds").map(String),
          confirmSharing: true,
        });
        close();
      }}
    >
      <Field
        label={entry.connectedAt ? "Your name for this entry" : "Friend's name"}
      >
        <input name="name" defaultValue={entry.name} required maxLength={160} />
      </Field>
      <fieldset className="choice-group">
        <legend>Share this friend with groups</legend>
        {world.groups.map((g) => (
          <label className="check" key={g.id}>
            <input
              name="groupIds"
              value={g.id}
              type="checkbox"
              defaultChecked={entry.groupIds.includes(g.id)}
            />
            {g.name}
          </label>
        ))}
        {!world.groups.length && (
          <p>
            You can keep planning privately.{" "}
            <Link to="/settings?section=groups" onClick={close}>
              Manage family groups
            </Link>{" "}
            to plan together.
          </p>
        )}
      </fieldset>
      <p className="muted">
        Sharing a friend doesn't share private ideas. Choose groups that do not
        include the intended recipient until their account is connected.
      </p>
    </Form>
  );
}

function FriendInvitation({ entry }: { entry: FriendEntry }) {
  const { mutate, close } = useApp();
  const [invitation, setInvitation] = useState<{
    id: string;
    email: string;
  } | null>(null);
  return invitation ? (
    <div className="text-stack">
      <p role="status">
        Your invitation to {invitation.email} is waiting to be emailed.
      </p>
      <p>
        They must sign in with this email and accept the connection. Your gift
        ideas stay hidden, and no group invitations are sent.
      </p>
      <InvitationShare invitationId={invitation.id} />
      <button className="button" onClick={close}>
        Done
      </button>
    </div>
  ) : (
    <Form
      submit="Send connection invitation"
      cancel={close}
      onSubmit={async (data) =>
        setInvitation(
          await mutate("friends/invite", {
            id: entry.id,
            email: String(data.get("email") ?? "").trim(),
          }),
        )
      }
    >
      <Field label="Email address">
        <input name="email" type="email" autoComplete="email" required />
      </Field>
      <p>
        They can create an account or sign in to an existing one, then accept to
        connect. Your ideas remain yours and stay hidden from them.
      </p>
      <p className="muted">
        This invitation expires in seven days. Invite them to family groups
        separately in Settings.
      </p>
    </Form>
  );
}

export function FriendManagement({ personId }: { personId: string }) {
  const { world, open, mutate, toast } = useApp();
  const entries = (world.friendEntries ?? []).filter(
    (f) => f.personId === personId,
  );
  if (!entries.length) return null;
  return (
    <section aria-label="Friend planning" className="friend-management">
      {entries.map((entry) => (
        <div key={entry.id} className="text-stack">
          <p className="muted">
            {entry.archived
              ? "Archived planning entry"
              : entry.connectedAt
                ? "Connected to their account"
                : entry.groupIds.length
                  ? `Shared for gift planning with ${entry.groupIds
                      .map((id) => world.groups.find((g) => g.id === id)?.name)
                      .filter(Boolean)
                      .join(", ")}`
                  : "Private friend entry"}
            {entries.length > 1 ? ` · ${entry.name}` : ""}
          </p>
          {entry.canManage && (
            <>
              <div className="friend-actions">
                {!entry.archived && (
                  <button
                    className="button secondary small"
                    onClick={() =>
                      open("Manage friend", <FriendEditor entry={entry} />)
                    }
                  >
                    Manage friend
                  </button>
                )}
                {!entry.archived && !entry.connectedAt && (
                  <button
                    className="button secondary small"
                    onClick={() =>
                      open(
                        `Connect with ${entry.name}`,
                        <FriendInvitation entry={entry} />,
                      )
                    }
                  >
                    Invite to connect
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    open(
                      entry.archived
                        ? "Restore this friend?"
                        : "Archive this friend?",
                      <Confirm
                        label={
                          entry.archived ? "Restore friend" : "Archive friend"
                        }
                        onConfirm={async () => {
                          await mutate("friends/archive", {
                            id: entry.id,
                            revision: entry.revision,
                            archived: !entry.archived,
                          });
                          toast(
                            entry.archived
                              ? "Friend restored privately."
                              : "Friend archived. Your ideas are saved.",
                          );
                        }}
                      >
                        {entry.archived
                          ? "Restore this entry privately. Previously shared ideas will not be shared again automatically."
                          : "Stop sharing this entry and its ideas with groups and cancel pending connection invitations. Authors keep their own ideas and buyers keep purchase history."}
                      </Confirm>,
                    )
                  }
                >
                  {entry.archived ? "Restore friend" : "Archive friend"}
                </button>
              </div>
              {world.invitations
                .filter((i) => i.friendEntryId === entry.id)
                .map((i) => (
                  <div className="setting-row" key={i.id}>
                    <div>
                      <strong>Connection invitation pending</strong>
                      <p>
                        {i.email} · Expires{" "}
                        {new Date(i.expiresAt).toLocaleDateString()}
                      </p>
                      <InvitationShare invitationId={i.id} />
                    </div>
                    <Action
                      secondary
                      onClick={async () => {
                        await mutate("invitations/revoke", { id: i.id });
                        toast("Connection invitation cancelled.");
                      }}
                    >
                      Cancel invitation
                    </Action>
                  </div>
                ))}
            </>
          )}
        </div>
      ))}
    </section>
  );
}
