import { emptyState, type Item, type List } from "../src/shared/model";
import { command, stamp } from "../src/server/domain";
import type {
  DiscoveryConfig,
  DiscoverySelection,
  GiftCandidate,
} from "../src/shared/gift-discovery";

export const discoveryConfig: DiscoveryConfig = {
  mode: "both",
  available: true,
  weeklyLimit: 3,
  monthlyLimit: 100,
  model: "gpt-6-luna",
};
export function discoveryFixture() {
  const state = emptyState();
  const people = ["Receiver", "Giver", "Friend"].map((name, i) => ({
    ...stamp(),
    name,
    userId: `discovery-user-${i}`,
    guardians: [] as string[],
  }));
  const actors = people.map((p) => ({
    id: p.userId,
    name: p.name,
    email: `${p.name}@example.test`,
  }));
  state.people.push(...people);
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  };
  state.groups.push(group);
  const list = command(state, actors[0], "lists.create", {
    name: "Wishes",
    ownerIds: [people[0].id],
    groupIds: [group.id],
    mode: "surprise",
  }) as List;
  const wish = command(state, actors[0], "items.create", {
    title: "Coffee grinder",
    listId: list.id,
  }) as Item;
  const input = {
    personId: people[0].id,
    categoryIds: ["coffee"],
    interests: "Pour-over",
    likes: "Ceramics",
    avoid: "Already has a grinder",
    maxPriceCents: 5000,
  };
  return {
    state,
    people,
    actors,
    group,
    list,
    wish: state.items.find((i) => i.id === wish.id)!,
    input,
  };
}
export function candidate(index = 0): GiftCandidate {
  const checkedAt = new Date().toISOString();
  return {
    id: stamp().id,
    title: `Coffee brewer ${index}`,
    description: "Ceramic brewer",
    image: "",
    reason: "Matches private coffee interests",
    categoryIds: ["coffee"],
    offers: [
      {
        url: `https://www.oxo.com/brewer-${index}`,
        retailer: "OXO",
        seller: "OXO",
        priceCents: 2500,
        currency: "USD",
        checkedAt,
        identity: `gtin:1234567${index}`,
      },
    ],
    evidence: [
      {
        kind: "customer",
        url: `https://www.oxo.com/brewer-${index}`,
        label: "4.5/5 from 100 customer reviews",
        checkedAt,
      },
    ],
  };
}
export function selection(
  c: GiftCandidate,
  listId?: string,
): DiscoverySelection {
  return {
    candidateId: c.id,
    offerUrl: c.offers[0].url,
    title: c.title,
    description: c.description,
    listId,
    visibility: "private",
    groupIds: [],
    allowDuplicate: false,
  };
}
