import { Link, useParams } from "react-router-dom";
import { Mail } from "lucide-react";
import { useApp } from "./context";
import { Action } from "./Action";
export function Invitations() {
  const { world, mutate, toast } = useApp();
  const { id } = useParams();
  const mine = world.invitations.filter(
    (i) =>
      !!i.groupId &&
      i.email === world.me.email.toLowerCase() &&
      (!id || i.id === id),
  );
  return (
    <section className="invitations">
      {id && <h1>Family group invitation</h1>}
      {mine.length ? (
        mine.map((i) => (
          <div className="invitation" key={i.id}>
            <Mail size={22} />
            <div>
              <h3>Join {i.groupName ?? "your family group"}</h3>
              <p>
                {i.inviterName ? `${i.inviterName} invited you. ` : ""}Accept to
                see lists shared with this family group.
              </p>
              <p className="muted">
                For {i.email} · Expires{" "}
                {new Date(i.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <Action
              onClick={async () => {
                await mutate("invitations/accept", { id: i.id });
                toast("You’re in. Welcome to the family group.");
              }}
            >
              Accept invitation
            </Action>
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
