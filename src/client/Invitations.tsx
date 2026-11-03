import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Mail } from "lucide-react";
import { useApp } from "./context";
import { Action } from "./Action";
export function Invitations() {
  const { world, mutate, toast } = useApp();
  const { id } = useParams();
  const [outcome, setOutcome] = useState<"accepted" | "declined" | null>(null);
  const mine = world.invitations.filter(
    (i) =>
      (!!i.groupId || !!i.friendEntryId) &&
      i.email === world.me.email.toLowerCase() &&
      (!id || i.id === id),
  );
  return (
    <section className="invitations">
      {id && (
        <h1>
          {mine[0]?.friendEntryId || outcome
            ? "Friend connection invitation"
            : "Family group invitation"}
        </h1>
      )}
      {outcome ? (
        <div role="status">
          <h2>
            {outcome === "accepted"
              ? "You're connected"
              : "Connection declined"}
          </h2>
          <p>
            {outcome === "accepted"
              ? "Your account is connected. Your wish-list sharing and group memberships have not changed."
              : "The invitation was declined. Your account and sharing have not changed."}
          </p>
          <Link className="button secondary" to="/">
            Go to Home
          </Link>
        </div>
      ) : mine.length ? (
        mine.map((i) => (
          <div className="invitation" key={i.id}>
            <Mail size={22} />
            <div>
              <h3>
                {i.friendEntryId
                  ? `Connect with ${i.inviterName ?? "your friend"}`
                  : `Join ${i.groupName ?? "your family group"}`}
              </h3>
              <p>
                {i.friendEntryId
                  ? `${i.inviterName ?? "Your friend"} saved an entry for ${i.friendName ?? "you"}. Accept to connect it to your account. Their gift ideas stay private or hidden from you. This does not share wish lists or add you to any groups.`
                  : `${i.inviterName ? `${i.inviterName} invited you. ` : ""}Accept to see lists shared with this family group.`}
              </p>
              <p className="muted">
                For {i.email} · Expires{" "}
                {new Date(i.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <Action
              onClick={async () => {
                await mutate("invitations/accept", { id: i.id });
                if (i.friendEntryId && id) setOutcome("accepted");
                toast(
                  i.friendEntryId
                    ? "Accounts connected. Your wish-list sharing is unchanged."
                    : "You’re in. Welcome to the family group.",
                );
              }}
            >
              {i.friendEntryId ? "Accept connection" : "Accept invitation"}
            </Action>
            {i.friendEntryId && (
              <Action
                secondary
                onClick={async () => {
                  await mutate("invitations/decline", { id: i.id });
                  if (id) setOutcome("declined");
                  toast("Connection invitation declined.");
                }}
              >
                Decline
              </Action>
            )}
          </div>
        ))
      ) : (
        <div>
          <p>No pending invitations for {world.me.email}.</p>
          <p>
            This invitation may have expired, been accepted, or be for another
            email. Ask the inviter for a new invitation, or sign out in Settings
            and use the invited email.
          </p>
          <Link className="button secondary" to="/settings">
            Open Settings
          </Link>
        </div>
      )}
    </section>
  );
}
