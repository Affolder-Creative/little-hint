import { accountExport } from "../src/server/account-export";
import { describe, expect, it } from "vitest";
import { command, giftView, stamp } from "../src/server/domain";
import {
  discussionAudience,
  noteVisible,
} from "../src/server/discussion-access";
import {
  mentionCandidates,
  inbox,
  activityAllowed,
} from "../src/server/activity";
import {
  emptyState,
  type Item,
  type List,
  type Exchange,
} from "../src/shared/model";

function fixture(mode: "surprise" | "transparent" = "surprise") {
  const s = emptyState();
  const actors = ["Denny", "Kyle", "Melanie", "Other"].map((name) => ({
    id: stamp().id,
    name,
    email: `${name}@example.test`,
  }));
  const people = actors.map((a) => ({
    ...stamp(),
    userId: a.id as string | undefined,
    name: a.name,
    guardians: [] as string[],
    admin: false,
  }));
  s.people.push(...people);
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[1].id,
    memberIds: actors.map((a) => a.id),
  };
  s.groups.push(group);
  const list = command(s, actors[0], "lists.create", {
    name: "Wishes",
    ownerIds: [people[0].id],
    groupIds: [group.id],
    mode,
  }) as List;
  const created = command(s, actors[0], "items.create", {
    title: "Bike",
    listId: list.id,
  }) as Item;
  const item = s.items.find((i) => i.id === created.id)!;
  const idea = (visibility: "hidden" | "visible" | "private") => {
    const created = command(s, actors[1], "items.create", {
      title: `Gift idea ${s.items.length}`,
      recipientIds: [people[0].id],
      groupIds: visibility === "private" ? [] : [group.id],
      visibility,
    }) as Item;
    return s.items.find((i) => i.id === created.id)!;
  };
  const post = (
    target: Item,
    who = actors[1],
    body = "A note",
    mentions: Array<{ userId: string; start: number; end: number }> = [],
  ) => {
    command(s, who, "comments.create", {
      itemId: target.id,
      body,
      mentions,
      audienceToken: discussionAudience(s, who, target.id).token,
    });
    return s.comments.at(-1)!;
  };
  const visibility = (target: Item, value: "hidden" | "visible" | "private") =>
    command(s, actors[1], "items.update", {
      ...target,
      id: target.id,
      revision: target.revision,
      visibility: value,
      groupIds: value === "private" ? [] : [group.id],
    });
  return { s, actors, people, group, list, item, idea, post, visibility };
}

describe("discussion audiences", () => {
  it("lets Melanie discuss and receive a mention for Denny through her own shared-group access", () => {
    const f = fixture();
    f.people[0].userId = undefined;
    f.people[0].guardians = [f.actors[2].id];
    const idea = f.idea("hidden");
    expect(
      mentionCandidates(f.s, f.actors[1], idea.id).map((p) => p.userId),
    ).toContain(f.actors[2].id);
    expect(
      mentionCandidates(f.s, f.actors[1], idea.id).map((p) => p.userId),
    ).not.toContain(f.actors[0].id);
    const note = f.post(idea, f.actors[1], "@Melanie", [
      { userId: f.actors[2].id, start: 0, end: 8 },
    ]);
    expect(giftView(f.s, f.actors[2], idea).comments?.[0].id).toBe(note.id);
    expect(
      inbox(f.s, f.actors[2]).entries.some((n) => n.event === "mention"),
    ).toBe(true);
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[2].id);
    expect(noteVisible(f.s, f.actors[2], idea, undefined, note)).toBe(false);
    expect(inbox(f.s, f.actors[2]).entries).toEqual([]);
    expect(
      f.s.notices
        .filter((n) => n.commentId === note.id)
        .every((n) => !activityAllowed(f.s, n)),
    ).toBe(true);
  });

  it.each(["list", "idea"])(
    "allows recipient participation and mentions on a visible %s",
    (kind) => {
      const f = fixture("transparent");
      const item = kind === "list" ? f.item : f.idea("visible");
      expect(
        mentionCandidates(f.s, f.actors[1], item.id).map((p) => p.userId),
      ).toContain(f.actors[0].id);
      f.post(item, f.actors[1], "@Denny", [
        { userId: f.actors[0].id, start: 0, end: 6 },
      ]);
      f.post(item, f.actors[0], "Thank you");
      expect(giftView(f.s, f.actors[0], item).comments).toHaveLength(2);
      expect(
        inbox(f.s, f.actors[0]).entries.some((n) => n.event === "mention"),
      ).toBe(true);
    },
  );

  it("retains surprise history through visibility changes and edits", () => {
    const f = fixture();
    const item = f.idea("hidden");
    const secret = f.post(item, f.actors[1], "Already bought");
    f.visibility(item, "visible");
    const shared = f.post(item, f.actors[1], "Which size?");
    expect(giftView(f.s, f.actors[0], item).comments?.map((c) => c.id)).toEqual(
      [shared.id],
    );
    expect(
      giftView(f.s, f.actors[1], item).comments?.find((c) => c.id === secret.id)
        ?.protectedHistory,
    ).toBe(true);
    command(f.s, f.actors[1], "comments.update", {
      id: secret.id,
      revision: secret.revision,
      body: "Still private",
      audienceToken: discussionAudience(f.s, f.actors[1], item.id, secret.id)
        .token,
    });
    expect(noteVisible(f.s, f.actors[0], item, undefined, secret)).toBe(false);
    f.visibility(item, "hidden");
    expect(noteVisible(f.s, f.actors[0], item, undefined, shared)).toBe(false);
    f.visibility(item, "visible");
    expect(noteVisible(f.s, f.actors[0], item, undefined, shared)).toBe(true);
    expect(noteVisible(f.s, f.actors[0], item, undefined, secret)).toBe(false);
  });

  it("keeps Only me history author-only after sharing and disallows forged mentions", () => {
    const f = fixture();
    const item = f.idea("private");
    expect(mentionCandidates(f.s, f.actors[1], item.id)).toEqual([]);
    const note = f.post(item);
    f.visibility(item, "visible");
    expect(giftView(f.s, f.actors[2], item).comments).toEqual([]);
    expect(mentionCandidates(f.s, f.actors[1], item.id, "", note.id)).toEqual(
      [],
    );
    expect(() =>
      command(f.s, f.actors[1], "comments.update", {
        id: note.id,
        revision: note.revision,
        body: "@Melanie",
        mentions: [{ userId: f.actors[2].id, start: 0, end: 8 }],
        audienceToken: discussionAudience(f.s, f.actors[1], item.id, note.id)
          .token,
      }),
    ).toThrow("can no longer read");
    f.post(item);
    expect(giftView(f.s, f.actors[2], item).comments).toHaveLength(1);
  });

  it("requires review when visibility or membership changes, even without mentions", () => {
    const f = fixture();
    const item = f.idea("hidden");
    const before = discussionAudience(f.s, f.actors[1], item.id).token;
    f.visibility(item, "visible");
    const payload = {
      itemId: item.id,
      body: "Private draft",
      audienceToken: before,
    };
    expect(() => command(f.s, f.actors[1], "comments.create", payload)).toThrow(
      "audience changed",
    );
    payload.audienceToken = discussionAudience(f.s, f.actors[1], item.id).token;
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[3].id);
    expect(() => command(f.s, f.actors[1], "comments.create", payload)).toThrow(
      "audience changed",
    );
    expect(() =>
      command(f.s, f.actors[1], "comments.create", {
        itemId: item.id,
        body: "Missing token",
      }),
    ).toThrow("audience changed");
    expect(f.s.comments).toHaveLength(0);
    f.post(item);
    expect(f.s.comments).toHaveLength(1);
  });

  it("applies recipient exclusions to joint recipients and claimed identities despite authorship", () => {
    const f = fixture();
    f.people[0].guardians = [f.actors[2].id];
    const note = f.post(f.item, f.actors[2]);
    f.item.recipientIds.push(f.people[2].id);
    expect(accountExport(f.s, f.actors[2]).comments).toEqual([]);
    expect(noteVisible(f.s, f.actors[2], f.item, undefined, note)).toBe(false);
    expect(
      mentionCandidates(f.s, f.actors[1], f.item.id).map((p) => p.userId),
    ).not.toContain(f.actors[2].id);
    f.item.recipientIds = [f.people[0].id];
    f.people[0].userId = f.actors[2].id;
    f.people[0].guardians = [];
    expect(noteVisible(f.s, f.actors[2], f.item, undefined, note)).toBe(false);
  });

  it("allows co-managers outside selected groups on their lists, but not standalone ideas", () => {
    const f = fixture();
    const grant = command(f.s, f.actors[0], "co-management.request", {
      personId: f.people[0].id,
      helperId: f.actors[2].id,
    }) as { id: string };
    command(f.s, f.actors[2], "co-management.respond", {
      id: grant.id,
      accept: true,
    });
    const idea = f.idea("hidden");
    f.group.memberIds = f.group.memberIds.filter((id) => id !== f.actors[2].id);
    expect(
      mentionCandidates(f.s, f.actors[1], f.item.id).map((p) => p.userId),
    ).toContain(f.actors[2].id);
    expect(
      mentionCandidates(f.s, f.actors[1], idea.id).map((p) => p.userId),
    ).not.toContain(f.actors[2].id);
    f.post(f.item, f.actors[2]);
    expect(() => f.post(idea, f.actors[2])).toThrow("not available");
  });

  it("rejects recipient authors in exchange audiences and ignores forged protection fields", () => {
    const f = fixture();
    const item = f.idea("visible");
    f.people[1].guardians = [f.actors[0].id];
    const exchange: Exchange = {
      ...stamp(),
      name: "Exchange",
      groupId: f.group.id,
      organizerId: f.actors[1].id,
      participantIds: [f.people[0].id, f.people[1].id],
      count: 1,
      excludeHousehold: false,
      exclusions: [],
      status: "drawn",
      assignments: [[f.people[1].id, f.people[0].id]],
    };
    f.s.exchanges.push(exchange);
    const context = {
      exchangeId: exchange.id,
      giverId: f.people[1].id,
      exchangeRecipientId: f.people[0].id,
    };
    expect(() =>
      discussionAudience(f.s, f.actors[0], item.id, undefined, context),
    ).toThrow("cannot participate");
    expect(() =>
      mentionCandidates(f.s, f.actors[0], item.id, "", undefined, context),
    ).toThrow("cannot participate");
    const hidden = f.idea("hidden");
    const audienceToken = discussionAudience(
      f.s,
      f.actors[1],
      hidden.id,
      undefined,
      { ordinary: true },
    ).token;
    command(f.s, f.actors[1], "comments.create", {
      itemId: hidden.id,
      ordinary: true,
      body: "Secret",
      excludeRecipients: false,
      audienceToken,
    });
    expect(f.s.comments.at(-1)?.excludeRecipients).toBe(true);
  });

  it("keeps review-pending notes author-only and excludes closed accounts", () => {
    const f = fixture("transparent");
    const note = f.post(f.item);
    note.privacyReview = true;
    expect(noteVisible(f.s, f.actors[0], f.item, undefined, note)).toBe(false);
    expect(noteVisible(f.s, f.actors[1], f.item, undefined, note)).toBe(true);
    expect(mentionCandidates(f.s, f.actors[1], f.item.id, "", note.id)).toEqual(
      [],
    );
    f.people[2].userId = undefined;
    expect(
      mentionCandidates(f.s, f.actors[1], f.item.id).map((p) => p.userId),
    ).not.toContain(f.actors[2].id);
  });
});
