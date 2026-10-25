import { describe, expect, it } from "vitest";
import {
  emptyState,
  type Actor,
  type Group,
  type Invitation,
  type List,
} from "../src/shared/model";
import { isAccountInvitation } from "../src/shared/invitations";
import {
  activateAccount,
  command,
  idempotent,
  noticeAllowed,
  signupAllowed,
  stamp,
  world,
} from "../src/server/domain";

function fixture() {
  const state = emptyState();
  const sender = { id: "sender", name: "Sender", email: "sender@example.test" };
  const other = { id: "other", name: "Other", email: "other@example.test" };
  const friend = { id: "friend", name: "Friend", email: "friend@example.test" };
  for (const actor of [sender, other])
    state.people.push({
      ...stamp(),
      userId: actor.id,
      name: actor.name,
      guardians: [],
    });
  const invite = (actor: Actor = sender, email = friend.email) =>
    command(state, actor, "invitations.create", { email }) as Invitation;
  return { state, sender, other, friend, invite };
}

describe("standalone invitations", () => {
  it("lets an ordinary user without groups invite a normalized email without sharing access", () => {
    const { state, sender, other, friend, invite } = fixture();
    const invitation = invite(sender, "  Friend@EXAMPLE.test  ");
    expect(invitation).toMatchObject({
      email: friend.email,
      invitedById: sender.id,
    });
    expect(invitation).not.toHaveProperty("groupId");
    expect(invitation).not.toHaveProperty("bootstrap");
    expect(Date.parse(invitation.expiresAt) - Date.now()).toBeGreaterThan(
      6.99 * 86400000,
    );
    expect(signupAllowed(state, friend.email)).toBe(true);
    expect(world(state, sender).invitations).toHaveLength(1);
    expect(world(state, other).invitations).toHaveLength(0);
    expect(noticeAllowed(state, state.notices[0])).toBe(true);

    const person = activateAccount(state, friend);
    expect(person.admin).toBe(false);
    expect(invitation.acceptedBy).toBe(friend.id);
    expect(noticeAllowed(state, state.notices[0])).toBe(false);
    expect(signupAllowed(state, friend.email)).toBe(false);
    expect(world(state, sender).invitations).toHaveLength(0);
    expect(world(state, friend).groups).toEqual([]);
    expect(world(state, friend).households).toEqual([]);
    expect(world(state, friend).people.map((p) => p.id)).toEqual([person.id]);
    expect(world(state, sender).people.some((p) => p.id === person.id)).toBe(
      false,
    );
    expect(activateAccount(state, friend).id).toBe(person.id);
  });

  it("requires an account and rejects attempts to grant membership or administrator status", () => {
    const { state, friend, sender, invite } = fixture();
    expect(() => invite(friend)).toThrow("Sign in");
    for (const extras of [
      { bootstrap: true },
      { groupId: stamp().id },
      { invitedById: friend.id },
    ])
      expect(() =>
        command(state, sender, "invitations.create", {
          email: friend.email,
          ...extras,
        }),
      ).toThrow();
    expect(state.invitations).toEqual([]);
    expect(() => invite(sender, "not-an-email")).toThrow();
  });

  it("rejects duplicate pending sends but replays the same mutation once", () => {
    const { state, sender, friend, invite } = fixture();
    const input = { email: friend.email };
    idempotent(
      state,
      sender,
      "account_invite_retry_01",
      "invitations.create",
      input,
    );
    expect(
      idempotent(
        state,
        sender,
        "account_invite_retry_01",
        "invitations.create",
        input,
      ),
    ).toEqual({ ok: true, replayed: true });
    expect(() => invite(sender, "FRIEND@example.test")).toThrow(
      "already have a pending invitation",
    );
    expect(state.invitations).toHaveLength(1);
    expect(state.notices).toHaveLength(1);
  });

  it.each(["cancelled", "expired"])(
    "prevents signup and delivery with a %s invitation and allows a replacement",
    (reason) => {
      const { state, sender, other, friend, invite } = fixture();
      const invitation = invite();
      expect(() =>
        command(state, other, "invitations.revoke", { id: invitation.id }),
      ).toThrow("not found");
      expect(() =>
        command(state, friend, "invitations.revoke", { id: invitation.id }),
      ).toThrow("not found");
      if (reason === "cancelled")
        command(state, sender, "invitations.revoke", { id: invitation.id });
      else invitation.expiresAt = new Date(Date.now() - 1).toISOString();
      expect(signupAllowed(state, friend.email)).toBe(false);
      expect(() => activateAccount(state, friend)).toThrow("active invitation");
      expect(noticeAllowed(state, state.notices[0])).toBe(false);
      expect(world(state, sender).invitations).toHaveLength(0);
      expect(invite().id).not.toBe(invitation.id);
    },
  );

  it("consumes all matching account invitations, including for an existing account, without accepting groups", () => {
    const { state, sender, other, friend, invite } = fixture();
    const first = invite();
    const second = invite(other);
    const group = command(state, sender, "groups.create", {
      name: "Friends",
    }) as Group;
    const groupInvitation = command(state, sender, "groups.invite", {
      groupId: group.id,
      email: friend.email,
    }) as Invitation;
    const person = activateAccount(state, friend);
    expect([first.acceptedBy, second.acceptedBy]).toEqual([
      friend.id,
      friend.id,
    ]);
    expect(groupInvitation.acceptedBy).toBeUndefined();
    const another = invite();
    const count = state.people.length;
    expect(activateAccount(state, friend).id).toBe(person.id);
    expect(another.acceptedBy).toBe(friend.id);
    expect(state.people).toHaveLength(count);
    expect(world(state, friend).groups).toHaveLength(0);
  });

  it("allows later membership in multiple groups without sharing existing private lists", () => {
    const { state, sender, friend, invite } = fixture();
    invite();
    const person = activateAccount(state, friend);
    const privateList = command(state, friend, "lists.create", {
      name: "Private wishes",
      ownerIds: [person.id],
      groupIds: [],
      mode: "surprise",
    }) as List;
    for (const name of ["Friends", "Birthday circle"]) {
      const group = command(state, sender, "groups.create", { name }) as Group;
      const shared = command(state, sender, "lists.create", {
        name,
        ownerIds: [state.people[0].id],
        groupIds: [group.id],
        mode: "surprise",
      }) as List;
      const invitation = command(state, sender, "groups.invite", {
        email: friend.email,
        groupId: group.id,
      }) as Invitation;
      expect(world(state, friend).lists.some((l) => l.id === shared.id)).toBe(
        false,
      );
      command(state, friend, "invitations.accept", { id: invitation.id });
      expect(world(state, friend).lists.some((l) => l.id === shared.id)).toBe(
        true,
      );
    }
    expect(world(state, friend).groups).toHaveLength(2);
    expect(world(state, friend).me.id).toBe(friend.id);
    expect(privateList.groupIds).toEqual([]);
    expect(
      world(state, sender).lists.some((l) => l.id === privateList.id),
    ).toBe(false);
  });

  it("preserves bootstrap activation and does not treat it as a standalone email invitation", () => {
    const { state, friend } = fixture();
    const bootstrap = {
      ...stamp(),
      email: friend.email,
      bootstrap: true,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    state.invitations.push(bootstrap);
    expect(isAccountInvitation(bootstrap)).toBe(false);
    expect(activateAccount(state, friend).admin).toBe(true);
    expect(state.invitations[0].acceptedBy).toBe(friend.id);
  });
});
