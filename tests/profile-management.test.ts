import { describe, it, expect } from "vitest";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { command, world } from "../src/server/domain";
import { managementDetails } from "../src/server/profile-management";
import {
  closurePlan,
  requestHandoff,
  acceptHandoff,
  closeAccountData,
} from "../src/server/account-closure-domain";
import { takeOverProfile } from "../src/server/profile-takeover";
import { emptyState } from "../src/shared/model";
import type { Person } from "../src/shared/model";
function setup() {
  const f = stagingFixtures();
  const a = f.actors[0],
    b = f.actors[1];
  const p = command(f.state, a, "people.create", { name: "Child" }) as Person;
  return { ...f, a, b, p };
}
function add(f: ReturnType<typeof setup>) {
  command(f.state, f.a, "people.update", {
    id: f.p.id,
    revision: f.p.revision,
    name: f.p.name,
    managerUserIds: [f.a.id, f.b.id],
  });
}
describe("profile ownership and co-management", () => {
  it("lists the creator and grants immediate management without group sharing", () => {
    const f = setup();
    expect(f.p.managedOwnerId).toBe(f.a.id);
    add(f);
    expect(world(f.state, f.b).people.some((p) => p.id === f.p.id)).toBe(true);
    expect(managementDetails(f.state, f.b, f.p.id).candidates).toEqual([]);
    command(f.state, f.b, "people.update", {
      id: f.p.id,
      revision: f.p.revision,
      name: "Updated",
    });
    expect(f.p.name).toBe("Updated");
  });
  it("rejects manager changes and takeover invitations from co-managers", () => {
    const f = setup();
    add(f);
    const before = structuredClone(f.p);
    expect(() =>
      command(f.state, f.b, "people.update", {
        id: f.p.id,
        revision: f.p.revision,
        name: "No",
        managerUserIds: [f.b.id],
      }),
    ).toThrow("Only the profile owner");
    expect(f.p).toEqual(before);
    expect(() =>
      command(f.state, f.b, "people.link", {
        id: f.p.id,
        email: "child@example.test",
      }),
    ).toThrow();
    expect(() =>
      requestHandoff(f.state, f.b, "guardian", f.p.id, f.a.id),
    ).toThrow();
  });
  it("rejects owner removal, unknown accounts and stale saves", () => {
    const f = setup();
    for (const ids of [[f.b.id], [f.a.id, "missing"]])
      expect(() =>
        command(f.state, f.a, "people.update", {
          id: f.p.id,
          revision: f.p.revision,
          name: f.p.name,
          managerUserIds: ids,
        }),
      ).toThrow();
    const revision = f.p.revision;
    add(f);
    expect(() =>
      command(f.state, f.a, "people.update", {
        id: f.p.id,
        revision,
        name: f.p.name,
        managerUserIds: [f.a.id],
      }),
    ).toThrow();
  });
  it.each([true, false])(
    "transfers ownership with keepPreviousOwner=%s",
    (keep) => {
      const f = setup();
      add(f);
      requestHandoff(f.state, f.a, "guardian", f.p.id, f.b.id, keep);
      expect(
        closurePlan(f.state, f.a).blockers.some((b) => b.id === f.p.id),
      ).toBe(true);
      acceptHandoff(f.state, f.b, f.state.links.at(-1)!.id);
      expect(f.p.managedOwnerId).toBe(f.b.id);
      expect(f.p.guardians.includes(f.a.id)).toBe(keep);
      expect(
        closurePlan(f.state, f.a).blockers.some((b) => b.id === f.p.id),
      ).toBe(false);
      expect(
        closurePlan(f.state, f.b).blockers.some((b) => b.id === f.p.id),
      ).toBe(true);
    },
  );
  it("revokes management and keeps the owner responsible", () => {
    const f = setup();
    add(f);
    command(f.state, f.a, "people.update", {
      id: f.p.id,
      revision: f.p.revision,
      name: f.p.name,
      managerUserIds: [f.a.id],
    });
    expect(() => managementDetails(f.state, f.b, f.p.id)).toThrow();
    expect(
      closurePlan(f.state, f.a).blockers.some((b) => b.id === f.p.id),
    ).toBe(true);
  });
  it("deletes a co-manager without orphaning the profile", () => {
    const f = setup();
    add(f);
    const s = emptyState();
    s.people = f.state.people
      .filter(
        (p) => p.userId === f.a.id || p.userId === f.b.id || p.id === f.p.id,
      )
      .map((p) => ({ ...p, admin: false }));
    expect(closurePlan(s, f.b).blockers).toEqual([]);
    closeAccountData(s, f.b);
    const child = s.people.find((p) => p.id === f.p.id)!;
    expect(child.managedOwnerId).toBe(f.a.id);
    expect(child.guardians).toEqual([f.a.id]);
    expect(() => closeAccountData(s, f.a)).toThrow();
  });
  it("clears ownership and outstanding transfers when the recipient takes over", () => {
    const f = setup();
    requestHandoff(f.state, f.a, "guardian", f.p.id, f.b.id, true);
    const linkId = f.state.links.at(-1)!.id;
    takeOverProfile(f.state, f.actors[2], f.p, "account");
    expect(f.p.managedOwnerId).toBeUndefined();
    expect(f.p.guardians).toEqual([]);
    expect(f.state.links.find((l) => l.id === linkId)?.consumed).toBe(true);
    expect(() => acceptHandoff(f.state, f.b, linkId)).toThrow();
  });
  it("supersedes transfers and invalidates takeover invitations", () => {
    const f = setup();
    command(f.state, f.a, "people.link", {
      id: f.p.id,
      email: "child@example.test",
    });
    requestHandoff(f.state, f.a, "guardian", f.p.id, f.b.id);
    const old = f.state.links.at(-1)!.id;
    requestHandoff(f.state, f.a, "guardian", f.p.id, f.b.id, true);
    expect(() => acceptHandoff(f.state, f.b, old)).toThrow();
    acceptHandoff(f.state, f.b, f.state.links.at(-1)!.id);
    expect(
      f.state.links
        .filter((l) => l.kind === "profile" && l.targetId === f.p.id)
        .every((l) => l.consumed),
    ).toBe(true);
  });
});
