import {
  emptyState,
  type Actor,
  type Group,
  type List,
  type Item,
  type Contribution,
} from "../shared/model";
import { activateAccount, command, stamp } from "./domain";

/** Pure fixture construction: no database connections or external delivery. */
export function stagingFixtures() {
  const state = emptyState();
  const actors: Actor[] = [
    "Alex Morgan",
    "Sam Morgan",
    "Jamie Chen",
    "Riley Morgan",
    "Taylor Reed",
  ].map((name) => ({
    id: stamp().id,
    name,
    email: `${name.split(" ")[0].toLowerCase()}@example.test`,
  }));
  actors.forEach((actor, index) => {
    state.invitations.push({
      ...stamp(),
      email: actor.email,
      bootstrap: index === 0,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    activateAccount(state, actor);
  });
  state.giftPreferences.forEach((p) => {
    p.setup = "skipped";
  });
  const people = actors.map((a) =>
    state.people.find((p) => p.userId === a.id)!,
  );
  const family = command(state, actors[0], "groups.create", {
    name: "Morgan family",
  }) as Group;
  family.memberIds = actors.slice(0, 4).map((a) => a.id);
  const friends = command(state, actors[2], "groups.create", {
    name: "Weekend friends",
  }) as Group;
  friends.memberIds = [actors[0].id, actors[2].id, actors[4].id];
  const addList = (
    owner: number,
    name: string,
    group: Group,
    mode: "surprise" | "transparent" = "surprise",
    extra = {},
  ) =>
    command(state, actors[owner], "lists.create", {
      name,
      ownerIds: [people[owner].id],
      groupIds: [group.id],
      mode,
      description: "Synthetic staging scenario.",
      timeZone: "America/Indiana/Indianapolis",
      ...extra,
    }) as List;
  const addItem = (
    owner: number,
    list: List,
    title: string,
    priceCents = 4800,
  ) =>
    command(state, actors[owner], "items.create", {
      listId: list.id,
      title,
      priceCents,
      quantity: 2,
    }) as Item;
  const reserve = (
    buyer: number,
    item: Item,
    purchased = 0,
    poolTargetCents?: number,
  ) => {
    const { id } = command(state, actors[buyer], "reservations.create", {
      itemId: item.id,
      quantity: 1,
    }) as { id: string };
    const reservation = state.reservations.find((r) => r.id === id)!;
    command(state, actors[buyer], "reservations.update", {
      ...reservation,
      purchased,
      poolTargetCents,
    });
    return reservation;
  };
  const lists = actors
    .slice(0, 4)
    .map((a, i) => addList(i, `${a.name.split(" ")[0]}'s wishes`, family));
  const gifts = [
    "Ceramic pour-over set",
    "Linen journal",
    "Trail daypack",
    "Sunday record",
  ];
  const items = lists.map((list, i) => addItem(i, list, gifts[i]));
  const pool = reserve(1, items[0], 0, 4800);
  const contribution = command(state, actors[2], "contributions.create", {
    reservationId: pool.id,
    amountCents: 1200,
  }) as Contribution;
  command(state, actors[2], "contributions.update", {
    ...contribution,
    status: "sent",
  });
  command(state, actors[1], "contributions.update", {
    ...contribution,
    status: "received",
  });
  command(state, actors[3], "contributions.create", {
    reservationId: pool.id,
    amountCents: 800,
  });
  reserve(2, items[1], 1);
  const transparent = addList(4, "Shared picnic plans", friends, "transparent");
  reserve(0, addItem(4, transparent, "Picnic blanket"), 1);
  const revealed = addList(0, "Last birthday", family, "surprise", {
    revealAfter: "2020-01-01",
  });
  reserve(1, addItem(0, revealed, "Birthday sketchbook"), 1);
  command(state, actors[0], "lists.update", { ...revealed, archived: true });
  command(state, actors[0], "groups.event-leaders", {
    groupId: family.id,
    revision: family.revision,
    userIds: [actors[1].id],
  });
  command(state, actors[1], "group-events.create", {
    groupId: family.id,
    name: "Family celebration",
    mode: "surprise",
    participantIds: [people[0].id, people[2].id],
    timeZone: "America/Indiana/Indianapolis",
  });
  const eventList = state.lists.find(
    (l) => l.groupEventId && l.ownerIds.includes(people[2].id),
  )!;
  addItem(2, eventList, "Celebration puzzle");
  const exchange = command(state, actors[0], "exchanges.create", {
    name: "Family gift exchange",
    groupId: family.id,
    participantIds: people.slice(0, 4).map((p) => p.id),
    count: 1,
    excludeHousehold: false,
  }) as { id: string };
  command(state, actors[0], "exchanges.draw", { id: exchange.id, revision: 1 });
  return { actors, state };
}
