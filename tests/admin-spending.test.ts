import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyState } from "../src/shared/model";
import { activateAccount, command, stamp, world } from "../src/server/domain";
import { adminSpending, enableSpending } from "../src/server/admin-spending";
import { reconcileSpending, spendingView } from "../src/server/spending";
const key = "spending_enable_request_01";
function fixture() {
  const s = emptyState();
  const actors = ["Admin", "Owner", "Opted out", "Enabled"].map((name) => ({
    id: stamp().id,
    name,
    email: name + "@example.test",
  }));
  s.people = actors.map((a, i) => ({
    ...stamp(),
    name: a.name,
    userId: a.id,
    guardians: [],
    admin: i === 0,
  }));
  s.people.push({ ...stamp(), name: "Managed", guardians: [actors[1].id] });
  const group = {
    ...stamp(),
    name: "Family",
    ownerId: actors[1].id,
    memberIds: actors.slice(1).map((a) => a.id),
  };
  s.groups.push(group);
  for (const i of [2, 3])
    command(s, actors[i], "spending.settings", {
      enabled: i === 3,
      summaries: false,
    });
  return { s, actors, a: actors[0], group };
}
afterEach(() => vi.unstubAllEnvs());
describe("admin spending", () => {
  it("counts activated accounts and preserves saved choices across group and all-account runs", () => {
    const { s, a, actors, group } = fixture();
    expect(adminSpending(s, a).overall).toEqual({
      total: 4,
      eligible: 2,
      alreadyEnabled: 1,
      optedOut: 1,
    });
    const original = structuredClone(s.spendingSettings);
    expect(
      enableSpending(s, a, { scope: "group", groupId: group.id }, key),
    ).toMatchObject({ total: 3, enabled: 1, optedOut: 1 });
    expect(s.spendingSettings.slice(0, 2)).toEqual(original);
    expect(world(s, actors[1]).spendingEnabled).toBe(true);
    expect(enableSpending(s, a, { scope: "all" }, key + "2").enabled).toBe(1);
    expect(enableSpending(s, a, { scope: "all" }, key + "3").enabled).toBe(0);
    expect(s.spendingConnections).toEqual([]);
  });
  it("replays exact counts without undoing a later personal opt-out", () => {
    const { s, a, actors } = fixture();
    const first = enableSpending(s, a, { scope: "all" }, key);
    command(s, actors[1], "spending.settings", {
      enabled: false,
      summaries: false,
    });
    expect(enableSpending(s, a, { scope: "all" }, key)).toEqual({
      ...first,
      replayed: true,
    });
    expect(enableSpending(s, a, { scope: "all" }, key + "2").optedOut).toBe(2);
    expect(
      s.spendingSettings.find((p) => p.userId === actors[1].id)?.enabledSource,
    ).toBeUndefined();
  });
  it("blocks group owners, unavailable spending, malformed targets, missing groups and changed replays", () => {
    const { s, a, actors, group } = fixture();
    expect(() => adminSpending(s, actors[1])).toThrow("Administrator");
    expect(() =>
      enableSpending(s, actors[1], { scope: "group", groupId: group.id }, key),
    ).toThrow("Administrator");
    expect(() =>
      enableSpending(s, a, { scope: "group", groupId: stamp().id }, key),
    ).toThrow("not found");
    expect(() =>
      enableSpending(s, a, { scope: "all", groupId: group.id }, key),
    ).toThrow();
    enableSpending(s, a, { scope: "all" }, key);
    expect(() =>
      enableSpending(s, a, { scope: "group", groupId: group.id }, key),
    ).toThrow("changed");
    vi.stubEnv("SPENDING_ENABLED", "false");
    expect(adminSpending(s, a).available).toBe(false);
    expect(() => enableSpending(s, a, { scope: "all" }, key)).toThrow(
      "unavailable",
    );
    s.people[0].admin = false;
    expect(() => enableSpending(s, a, { scope: "all" }, key)).toThrow(
      "Administrator",
    );
  });
  it("leaves new accounts eligible when the default is off", () => {
    const { s, a } = fixture();
    const next = { id: stamp().id, name: "New", email: "new@example.test" };
    command(s, a, "invitations.create", { email: next.email });
    activateAccount(s, next, false);
    activateAccount(s, next, true);
    expect(s.spendingSettings.some((p) => p.userId === next.id)).toBe(false);
    expect(world(s, next).spendingEnabled).toBe(false);
  });
  it("initializes only new accounts, even while availability is off", () => {
    const { s, a } = fixture();
    const next = { id: stamp().id, name: "New", email: "new@example.test" };
    command(s, a, "invitations.create", { email: next.email });
    vi.stubEnv("SPENDING_ENABLED", "false");
    activateAccount(s, next, true);
    expect(s.spendingSettings.find((p) => p.userId === next.id)).toMatchObject({
      enabled: true,
      enabledSource: "default",
      summaries: true,
    });
    activateAccount(s, a, true);
    expect(s.spendingSettings.some((p) => p.userId === a.id)).toBe(false);
    activateAccount(s, next, false);
    expect(s.spendingSettings.filter((p) => p.userId === next.id)).toHaveLength(
      1,
    );
    expect(world(s, next).spendingEnabled).toBe(false);
  });
  it("imports old purchase statuses privately without fabricated amounts or dates", () => {
    const { s, a, actors } = fixture();
    const list = command(s, actors[1], "lists.create", {
      name: "Wishes",
      ownerIds: [s.people[1].id],
      groupIds: [s.groups[0].id],
      mode: "surprise",
    }) as { id: string };
    const item = command(s, actors[1], "items.create", {
      listId: list.id,
      title: "Gift",
      quantity: 1,
      priceCents: 4500,
    }) as { id: string };
    const reservation = command(s, actors[2], "reservations.create", {
      itemId: item.id,
      quantity: 1,
    }) as { id: string; revision: number };
    command(s, actors[2], "reservations.update", {
      ...reservation,
      revision: s.reservations.find((r) => r.id === reservation.id)!.revision,
      quantity: 1,
      purchased: 1,
    });
    s.spendingSettings = s.spendingSettings.filter(
      (p) => p.userId !== actors[2].id,
    );
    enableSpending(s, a, { scope: "all" }, key);
    reconcileSpending(s, actors[2]);
    const purchase = spendingView(s, actors[2]).records.find(
      (r) => r.kind === "purchase",
    );
    expect(purchase).toMatchObject({
      amountCents: null,
      date: null,
      sharing: "private",
    });
    expect(spendingView(s, a).records).toEqual([]);
    expect(JSON.stringify(adminSpending(s, a))).not.toContain("Gift");
  });
});
