import { afterEach, expect, it, vi } from "vitest";
import { emptyState } from "../src/shared/model";
import { activateAccount, command, stamp, world } from "../src/server/domain";
function fixture() {
  const state = emptyState();
  const admin = { id: stamp().id, name: "Admin", email: "admin@example.test" };
  const newcomer = { id: stamp().id, name: "New", email: "new@example.test" };
  state.people.push({
    ...stamp(),
    userId: admin.id,
    name: admin.name,
    guardians: [],
    admin: true,
  });
  command(state, admin, "invitations.create", { email: newcomer.email });
  return { state, admin, newcomer };
}
afterEach(() => vi.unstubAllEnvs());
it("enables only first activation and preserves a later personal opt-out", () => {
  const { state, admin, newcomer } = fixture();
  activateAccount(state, newcomer, true);
  const setting = state.spendingSettings[0];
  expect(setting).toMatchObject({
    userId: newcomer.id,
    enabled: true,
    summaries: true,
    enabledSource: "default",
  });
  expect(world(state, newcomer).spendingEnabled).toBe(true);
  expect(state.spendingConnections).toEqual([]);
  activateAccount(state, admin, true);
  expect(state.spendingSettings).toHaveLength(1);
  command(state, newcomer, "spending.settings", {
    enabled: false,
    summaries: false,
  });
  activateAccount(state, newcomer, true);
  expect(setting.enabled).toBe(false);
  expect(setting.enabledSource).toBeUndefined();
  expect(state.spendingSettings).toHaveLength(1);
});
it("does not retroactively enable accounts created with the default off", () => {
  const { state, newcomer } = fixture();
  activateAccount(state, newcomer);
  activateAccount(state, newcomer, true);
  expect(state.spendingSettings).toEqual([]);
  expect(world(state, newcomer).spendingEnabled).toBe(false);
});
it("retains an enabled default while deployment availability is off", () => {
  const { state, newcomer } = fixture();
  vi.stubEnv("SPENDING_ENABLED", "false");
  activateAccount(state, newcomer, true);
  expect(state.spendingSettings[0].enabled).toBe(true);
  expect(world(state, newcomer).spendingEnabled).toBe(false);
  expect(state.spendingRecords).toEqual([]);
  vi.stubEnv("SPENDING_ENABLED", "");
  expect(world(state, newcomer).spendingEnabled).toBe(true);
});
it("preserves an existing saved choice even at first activation", () => {
  const { state, newcomer } = fixture();
  state.spendingSettings.push({
    ...stamp(),
    userId: newcomer.id,
    enabled: false,
    summaries: false,
  });
  const before = structuredClone(state.spendingSettings);
  activateAccount(state, newcomer, true);
  expect(state.spendingSettings).toEqual(before);
});
