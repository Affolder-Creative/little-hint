import { describe, expect, it } from "vitest";
import { command, stamp, world } from "../src/server/domain";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { trash } from "../src/server/management";
import type { Actor } from "../src/shared/model";

function fixture() {
  const { state, actors } = stagingFixtures();
  const group = state.groups[0];
  const [owner, leader, member, formerOrganizer, outsider] = actors;
  const input = {
    name: "Winter exchange",
    groupId: group.id,
    participantIds: state.people.slice(0, 4).map((p) => p.id),
    count: 1,
    excludeHousehold: false,
    exclusions: [],
  };
  const create = (actor = owner) => {
    const { id } = command(state, actor, "exchanges.create", input) as {
      id: string;
    };
    return state.exchanges.find((e) => e.id === id)!;
  };
  const exchange = create();
  // Legacy exchange created by a member before leadership was required.
  exchange.organizerId = formerOrganizer.id;
  const run = (actor: Actor, action: string, extra = {}) =>
    command(state, actor, `exchanges.${action}`, {
      id: exchange.id,
      revision: exchange.revision,
      ...extra,
    });
  return {
    state,
    actors,
    group,
    owner,
    leader,
    member,
    formerOrganizer,
    outsider,
    input,
    exchange,
    create,
    run,
  };
}

describe("exchange leadership", () => {
  it("allows owners and multiple designated leaders to create exchanges", () => {
    const f = fixture();
    command(f.state, f.owner, "groups.event-leaders", {
      groupId: f.group.id,
      revision: f.group.revision,
      userIds: [f.leader.id, f.member.id],
    });
    for (const actor of [f.owner, f.leader, f.member])
      expect(f.create(actor).organizerId).toBe(actor.id);
    delete f.group.eventLeaderIds;
    expect(() => f.create(f.leader)).toThrow();
    expect(f.create().organizerId).toBe(f.owner.id);
  });

  const operations = [
    "update",
    "draw",
    "cancel",
    "guideline",
    "archive",
    "trash",
    "restore",
    "purge",
  ] as const;
  function prepare(
    f: ReturnType<typeof fixture>,
    operation: (typeof operations)[number],
  ) {
    if (operation === "restore" || operation === "purge")
      f.exchange.deletedAt = new Date().toISOString();
    if (operation === "update") return { ...f.input, name: "Updated exchange" };
    if (operation === "guideline") return { spendingGuidelineCents: 3500 };
    if (operation === "archive") return { archived: true };
    return {};
  }

  it.each(operations)(
    "owners and leaders can %s another member's existing exchange",
    (operation) => {
      for (const index of [0, 1]) {
        const f = fixture();
        const extra = prepare(f, operation);
        expect(() => f.run(f.actors[index], operation, extra)).not.toThrow();
        if (operation !== "purge")
          expect(f.exchange.organizerId).toBe(f.formerOrganizer.id);
        else
          expect(f.state.exchanges.some((e) => e.id === f.exchange.id)).toBe(
            false,
          );
      }
    },
  );

  it.each(operations)(
    "rejects unauthorized %s calls without changing state",
    (operation) => {
      for (const index of [2, 3, 4]) {
        const f = fixture();
        // Administrator and leader flags cannot bypass group membership.
        f.state.people.find((p) => p.userId === f.outsider.id)!.admin = true;
        f.group.eventLeaderIds!.push(f.outsider.id);
        const extra = prepare(f, operation);
        const before = structuredClone(f.state);
        expect(() => f.run(f.actors[index], operation, extra)).toThrow();
        expect(f.state).toEqual(before);
        expect(() => f.create(f.actors[index])).toThrow();
        expect(f.state).toEqual(before);
      }
    },
  );

  it("revokes creators' authority when leadership or membership ends", () => {
    for (const leave of [false, true]) {
      const f = fixture();
      f.exchange.organizerId = f.leader.id;
      const staleEdit = {
        ...f.input,
        id: f.exchange.id,
        revision: f.exchange.revision,
      };
      if (leave)
        command(f.state, f.leader, "groups.remove", {
          groupId: f.group.id,
          userId: f.leader.id,
        });
      else
        command(f.state, f.owner, "groups.event-leaders", {
          groupId: f.group.id,
          revision: f.group.revision,
          userIds: [],
        });
      expect(() =>
        command(f.state, f.leader, "exchanges.update", staleEdit),
      ).toThrow();
      expect(
        world(f.state, f.leader).exchanges.find((e) => e.id === f.exchange.id)
          ?.canManage,
      ).toBeFalsy();
      f.run(f.owner, "update", {
        ...f.input,
        name: "Owner recovered exchange",
        participantIds: f.input.participantIds.filter(
          (id) =>
            !leave ||
            f.state.people.find((p) => p.id === id)?.userId !== f.leader.id,
        ),
      });
      expect(f.exchange.organizerId).toBe(f.leader.id);
    }
  });

  it("transfers exchange authority only when group ownership is accepted", () => {
    const f = fixture();
    command(f.state, f.owner, "groups.transfer", {
      groupId: f.group.id,
      userId: f.member.id,
      email: f.member.email,
    });
    expect(
      world(f.state, f.member).exchanges.find((e) => e.id === f.exchange.id)
        ?.canManage,
    ).toBe(false);
    command(f.state, f.member, "links.accept", {
      id: f.state.links.at(-1)!.id,
    });
    f.run(f.member, "update", f.input);
    expect(() => f.run(f.owner, "update", f.input)).toThrow();
    f.run(f.leader, "update", f.input);
    expect(f.exchange.organizerId).toBe(f.formerOrganizer.id);
  });

  it("shows managers delivery totals and trash without revealing other assignments", () => {
    const f = fixture();
    f.run(f.owner, "draw");
    f.state.notices = ["sent", "pending", "failed"].map((status) => ({
      ...stamp(),
      userId: f.member.id,
      event: "exchange",
      exchangeId: f.exchange.id,
      delivered: [],
      status,
      attempts: 0,
    })) as typeof f.state.notices;
    for (const actor of [f.owner, f.leader, f.member, f.formerOrganizer]) {
      const view = world(f.state, actor).exchanges.find(
        (e) => e.id === f.exchange.id,
      )!;
      const manages = [f.owner.id, f.leader.id].includes(actor.id);
      expect(view.canManage).toBe(manages);
      expect(view.delivery).toEqual(
        manages
          ? { sent: 1, pending: 1, failed: 1 }
          : { sent: 0, pending: 0, failed: 0 },
      );
      expect(view).not.toHaveProperty("assignments");
      const person = f.state.people.find((p) => p.userId === actor.id)!;
      expect(view.myAssignments).toEqual(
        f.exchange.assignments.filter(([giver]) => giver === person.id),
      );
    }
    expect(world(f.state, f.outsider).exchanges).toEqual([]);
    f.run(f.leader, "cancel");
    f.run(f.leader, "trash");
    for (const actor of [f.owner, f.leader])
      expect(trash(f.state, actor).some((e) => e.id === f.exchange.id)).toBe(
        true,
      );
    for (const actor of [f.member, f.formerOrganizer])
      expect(trash(f.state, actor).some((e) => e.id === f.exchange.id)).toBe(
        false,
      );
  });

  it("keeps revision checks and draw/lifecycle restrictions for all managers", () => {
    const f = fixture();
    const old = {
      ...f.input,
      id: f.exchange.id,
      revision: f.exchange.revision,
    };
    f.run(f.leader, "update", { ...f.input, name: "Leader's edit" });
    expect(() => command(f.state, f.owner, "exchanges.update", old)).toThrow(
      "changed since",
    );
    f.run(f.owner, "draw");
    const drawn = structuredClone(f.exchange);
    expect(() => f.run(f.leader, "draw")).toThrow("already been drawn");
    expect(() => f.run(f.leader, "update", f.input)).toThrow(
      "before names are drawn",
    );
    expect(() => f.run(f.leader, "trash")).toThrow("Cancel");
    expect(f.exchange).toEqual(drawn);
    f.run(f.leader, "guideline", { spendingGuidelineCents: 5000 });
    expect(f.exchange.assignments).toEqual(drawn.assignments);
    f.run(f.owner, "archive", { archived: true });
    expect(() =>
      f.run(f.leader, "guideline", { spendingGuidelineCents: 4000 }),
    ).toThrow("Restore");
  });
});
