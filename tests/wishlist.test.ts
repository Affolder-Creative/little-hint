import { describe, it, expect, vi, afterEach } from "vitest";
import { command, stamp, world } from "../src/server/domain";
import {
  wishlistFollowing,
  inbox,
  wishlistMessage,
  notificationBatchEntry,
} from "../src/server/activity";
import { wishlistCopy } from "../src/shared/wishlist-copy";
import { wishlistFixture } from "./wishlist-fixture";
import type { List } from "../src/shared/model";

afterEach(() => vi.useRealTimers());
describe("wish-list subscriptions and copy", () => {
  it("resolves precedence, tied channel unions, empty overrides and absolute list mutes", () => {
    const f = wishlistFixture();
    f.follow("group", f.group.id, { channels: ["email"] });
    f.follow("household", f.household.id, { channels: ["telegram"] });
    expect(
      wishlistFollowing(f.s, f.reader.id, { listId: f.list.id }).channels,
    ).toEqual(["telegram"]);
    const second = { ...stamp(), groupId: f.group.id, name: "Home" };
    f.s.households.push(second);
    f.s.householdMemberships.push({
      ...stamp(),
      householdId: second.id,
      personId: f.people[0].id,
    });
    f.follow("household", second.id, { channels: ["sms"] });
    expect(
      wishlistFollowing(f.s, f.reader.id, { listId: f.list.id }).channels,
    ).toEqual(["telegram", "sms"]);
    f.follow("person", f.people[0].id, { channels: ["push"] });
    f.follow("list", f.list.id, { channels: [] });
    expect(
      wishlistFollowing(f.s, f.reader.id, { listId: f.list.id }),
    ).toMatchObject({ following: true, channels: [] });
    f.add();
    expect(inbox(f.s, f.reader).entries).toHaveLength(1);
    f.follow("list", f.list.id, { following: false, muted: true });
    f.add();
    expect(inbox(f.s, f.reader).entries).toHaveLength(1);
    expect(
      wishlistFollowing(f.s, f.reader.id, { listId: f.list.id }),
    ).toMatchObject({ muted: true, channels: [] });
    f.follow("list", f.list.id, { following: false });
    expect(
      wishlistFollowing(f.s, f.reader.id, { listId: f.list.id }).channels,
    ).toEqual(["push"]);
    f.follow("person", f.people[0].id, { channels: null });
    expect(
      wishlistFollowing(f.s, f.reader.id, { listId: f.list.id }).channels,
    ).toEqual(["telegram", "sms"]);
  });
  it("follows future shared lists without granting access or notifying the actor", () => {
    const f = wishlistFixture();
    f.follow("household", f.household.id);
    const make = (groupIds: string[]) =>
      command(f.s, f.john, "lists.create", {
        name: "Future",
        ownerIds: [f.people[0].id],
        groupIds,
        mode: "surprise",
      }) as List;
    f.add(undefined, make([]).id);
    f.add(undefined, make([f.group.id]).id);
    expect(f.s.notices).toHaveLength(1);
    expect(inbox(f.s, f.john).entries).toHaveLength(0);
    f.group.memberIds = [f.john.id];
    expect(inbox(f.s, f.reader).entries).toHaveLength(0);
    expect(world(f.s, f.reader).follows).toHaveLength(0);
    expect(() => f.follow("group", f.group.id)).toThrow("not available");
  });
  it("households cover managed and joint owners, but not lists shared only elsewhere", () => {
    const f = wishlistFixture();
    const child = { ...stamp(), name: "Child", guardians: [f.john.id] };
    f.s.people.push(child as (typeof f.people)[0]);
    f.s.householdMemberships.push({
      ...stamp(),
      householdId: f.household.id,
      personId: child.id,
    });
    f.follow("household", f.household.id);
    const managed = command(f.s, f.john, "lists.create", {
      name: "Child wishes",
      ownerIds: [child.id],
      groupIds: [f.group.id],
      mode: "surprise",
    }) as List;
    f.add("would-love", managed.id);
    expect(wishlistMessage(f.s, f.s.notices)).toBe(
      '"Child wishes" has a new item marked Would love.',
    );
    f.list.ownerIds.push(child.id);
    f.add("most-wanted");
    expect(wishlistMessage(f.s, [f.s.notices[1]])).toBe(
      '"Birthday" has a new item marked Most wanted.',
    );
    f.list.groupIds = [];
    expect(
      wishlistFollowing(f.s, f.reader.id, { listId: f.list.id }).following,
    ).toBe(false);
  });
  it("uses fixed windows, captures priorities and channel eligibility, and authorizes batch links", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const f = wishlistFixture();
    f.follow("group", f.group.id);
    f.follow("list", f.list.id);
    const item = f.add("most-wanted");
    item.priority = null;
    vi.advanceTimersByTime(6 * 60_000);
    f.add("nice-to-have");
    vi.advanceTimersByTime(5 * 60_000);
    f.add();
    expect(f.s.notificationBatches).toHaveLength(1);
    const batch = f.s.notificationBatches[0];
    expect(batch.dueAt).toBe("2026-10-27T12:15:00.000Z");
    expect(batch.noticeIds).toHaveLength(3);
    expect(f.s.notices[0].prioritySnapshot).toBe("most-wanted");
    expect(f.s.notices[0].deliveryChannels).toEqual([
      "push",
      "email",
      "telegram",
      "sms",
    ]);
    expect(wishlistMessage(f.s, f.s.notices)).toBe(
      'John added 3 items to "Birthday", including 1 marked Most wanted.',
    );
    expect(notificationBatchEntry(f.s, f.reader, batch.id)).toEqual({
      ids: batch.noticeIds,
      href: `/lists/${f.list.id}`,
    });
    expect(() => notificationBatchEntry(f.s, f.sarah, batch.id)).toThrow(
      "no longer available",
    );
    vi.advanceTimersByTime(9 * 60_000);
    f.add();
    expect(f.s.notificationBatches).toHaveLength(2);
  });
  it("keeps copy bounded and factual with every priority and mixed actors", () => {
    expect(wishlistCopy("Wishlist", "John", [null])).toBe(
      "John added something to their wish list.",
    );
    expect(wishlistCopy("Birthday", "John", ["would-love"])).toContain(
      "something they'd love",
    );
    expect(wishlistCopy("Birthday", "John", ["nice-to-have"])).toContain(
      "a nice-to-have",
    );
    const f = wishlistFixture();
    f.follow("list", f.list.id);
    f.add();
    f.people[0].guardians.push(f.sarah.id);
    f.add("most-wanted", f.list.id, f.sarah);
    expect(wishlistMessage(f.s, f.s.notices)).toBe(
      '"Birthday" has 2 new items, including 1 marked Most wanted.',
    );
    expect(
      wishlistCopy("x".repeat(1000), "y".repeat(1000), ["most-wanted"]).length,
    ).toBeLessThan(400);
    expect(wishlistCopy("\nBirthday\u202e", "John", [null])).not.toMatch(
      /[\n\u202e]/,
    );
  });
});
