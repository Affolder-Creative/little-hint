import {
  emptyState,
  type Follow,
  type List,
  type Item,
  type ItemPriority,
  type Preferences,
} from "../src/shared/model";
import { command, stamp } from "../src/server/domain";

export function wishlistFixture() {
  const s = emptyState();
  const [john, reader, sarah] = ["John", "Reader", "Sarah"].map((name) => ({
    id: stamp().id,
    name,
    email: `${name}@example.test`,
  }));
  const people = [john, reader, sarah].map((a) => ({
    ...stamp(),
    name: a.name,
    userId: a.id,
    guardians: [] as string[],
  }));
  s.people.push(...people);
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: john.id,
    memberIds: [john.id, reader.id, sarah.id],
  };
  s.groups.push(group);
  const household = { ...stamp(), groupId: group.id, name: "Home" };
  s.households.push(household);
  s.householdMemberships.push({
    ...stamp(),
    householdId: household.id,
    personId: people[0].id,
  });
  const list = command(s, john, "lists.create", {
    name: "Birthday",
    ownerIds: [people[0].id],
    groupIds: [group.id],
    mode: "surprise",
  }) as List;
  const prefs: Preferences = {
    ...stamp(),
    userId: reader.id,
    email: true,
    telegram: true,
    sms: true,
    phone: "+12025550123",
    phoneVerified: true,
    chatId: "123",
    recipientUpdates: false,
    events: ["wishlist"],
    notificationDetails: { push: true, email: true, sms: true, telegram: true },
  };
  s.preferences.push(prefs);
  function follow(target: Follow["target"], targetId: string, extra = {}) {
    return command(s, reader, "follows.update", {
      target,
      targetId,
      following: true,
      ...extra,
    });
  }
  let sequence = 0;
  const add = (priority?: ItemPriority, listId = list.id, actor = john) => {
    const view = command(s, actor, "items.create", {
      title: `Private item ${++sequence}`,
      listId,
      priority,
    }) as Item;
    return s.items.find((i) => i.id === view.id)!;
  };
  return {
    s,
    john,
    reader,
    sarah,
    people,
    group,
    household,
    list,
    prefs,
    follow,
    add,
  };
}
