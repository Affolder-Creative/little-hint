import { emptyState, type Item, type List } from "../src/shared/model";
import { command, stamp } from "../src/server/domain";
export function fixture(revealAfter?: string) {
  const state = emptyState();
  const actors = ["Recipient", "Giver", "Observer", "Fourth"].map((name) => ({
    id: stamp().id,
    name,
    email: `${name.toLowerCase()}@example.test`,
  }));
  state.people = actors.map((a) => ({
    ...stamp(),
    name: a.name,
    userId: a.id,
    guardians: [],
  }));
  const group = {
    ...stamp(),
    name: "Audit family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  };
  state.groups.push(group);
  const lists = actors.map(
    (a, index) =>
      command(state, a, "lists.create", {
        name: `${a.name} wishes`,
        ownerIds: [state.people[index].id],
        groupIds: [group.id],
        mode: "surprise",
        revealAfter,
      }) as List,
  );
  const created = command(state, actors[0], "items.create", {
    listId: lists[0].id,
    title: "Audit surprise",
    quantity: 4,
    priceCents: 7500,
  }) as Item;
  const item = state.items.find((i) => i.id === created.id)!;
  return { state, actors, group, lists, item };
}
export function draw(f: ReturnType<typeof fixture>) {
  const result = command(f.state, f.actors[0], "exchanges.create", {
    name: "Audit exchange",
    groupId: f.group.id,
    participantIds: f.state.people.map((p) => p.id),
    count: 1,
    excludeHousehold: false,
  }) as { id: string };
  const exchange = f.state.exchanges.find((e) => e.id === result.id)!;
  command(f.state, f.actors[0], "exchanges.draw", {
    id: exchange.id,
    revision: exchange.revision,
  });
  const giverId = exchange.assignments.find(
    ([, recipient]) => recipient === f.state.people[0].id,
  )![0];
  const giver = f.actors.find((a) =>
    f.state.people.some((p) => p.id === giverId && p.userId === a.id),
  )!;
  const observer = f.actors.find(
    (a) => a.id !== giver.id && a.id !== f.actors[0].id,
  )!;
  return { exchange, giver, giverId, observer };
}
export function connect(
  f: ReturnType<typeof fixture>,
  buyerIndex: number,
  partnerIndex: number,
  recipientId: string,
) {
  for (const index of [buyerIndex, partnerIndex])
    command(f.state, f.actors[index], "spending.settings", {
      enabled: true,
      summaries: true,
    });
  command(f.state, f.actors[buyerIndex], "spending.connect", {
    userId: f.actors[partnerIndex].id,
  });
  const connection = f.state.spendingConnections[0];
  command(f.state, f.actors[partnerIndex], "spending.connection", {
    id: connection.id,
    revision: connection.revision,
    operation: "accept",
  });
  command(f.state, f.actors[buyerIndex], "spending.connection", {
    id: connection.id,
    revision: connection.revision,
    operation: "rules",
    rules: [`person:${recipientId}`],
  });
}
