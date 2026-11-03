import { afterEach, expect, it, vi } from "vitest";
import { command, idempotent, stamp } from "../src/server/domain";
import { emptyState, type ImportJob } from "../src/shared/model";
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  vi.stubEnv("SCRAPING_PROVIDER", "auto");
  const state = emptyState();
  const actor = { id: "alice", email: "alice@example.test", name: "Alice" };
  const person = { ...stamp(), name: "Alice", userId: actor.id, guardians: [] };
  state.people.push(person);
  const list = command(state, actor, "lists.create", {
    name: "Wishes",
    ownerIds: [person.id],
    groupIds: [],
    mode: "surprise",
  }) as { id: string };
  const input = {
    url: "https://example.com/gift",
    draft: { listId: list.id, fields: { title: "Draft" }, touched: ["title"] },
  };
  const key = stamp().id;
  const first = idempotent(
    state,
    actor,
    key,
    "imports.create",
    input,
  ) as ImportJob;
  return { state, actor, input, key, first, job: state.imports[0] };
}
it("replays the live import status so a lost create response can resume polling", () => {
  const f = fixture();
  f.job.status = "running";
  f.job.diagnostic = { stage: "lookup", reason: "private diagnostics" };
  const replay = idempotent(
    f.state,
    f.actor,
    f.key,
    "imports.create",
    f.input,
  ) as ImportJob;
  expect(replay).toMatchObject({
    id: f.first.id,
    status: "running",
    draft: { revision: 1 },
    replayed: true,
  });
  expect(replay).not.toHaveProperty("diagnostic");
  expect(f.state.imports).toHaveLength(1);
  f.job.status = "complete";
  f.job.result = { title: "Current shop title" };
  expect(
    idempotent(f.state, f.actor, f.key, "imports.create", f.input),
  ).toMatchObject({
    status: "complete",
    result: { title: "Current shop title" },
  });
});
it("returns the current draft revision on retry without applying the edit twice", () => {
  const f = fixture();
  const key = stamp().id;
  const edit = {
    id: f.job.id,
    revision: 1,
    fields: { title: "Edited" },
    touched: ["title"],
  };
  idempotent(f.state, f.actor, key, "imports.update", edit);
  const replay = idempotent(
    f.state,
    f.actor,
    key,
    "imports.update",
    edit,
  ) as ImportJob;
  expect(replay.draft).toMatchObject({
    revision: 2,
    fields: { title: "Edited" },
  });
  command(f.state, f.actor, "imports.update", {
    ...edit,
    revision: replay.draft!.revision,
    fields: { title: "Next edit" },
  });
  expect(f.job.draft!.revision).toBe(3);
  expect(
    idempotent(f.state, f.actor, key, "imports.update", edit),
  ).toMatchObject({ draft: { revision: 3, fields: { title: "Next edit" } } });
});
it("reauthorizes import replay ownership and refuses removed jobs", () => {
  const f = fixture();
  f.job.userId = "bob";
  expect(() =>
    idempotent(f.state, f.actor, f.key, "imports.create", f.input),
  ).toThrow("Import not found");
  f.state.imports = [];
  expect(() =>
    idempotent(f.state, f.actor, f.key, "imports.create", f.input),
  ).toThrow("Import not found");
  expect(f.state.imports).toHaveLength(0);
});
