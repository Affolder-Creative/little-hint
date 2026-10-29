import { describe, it, expect } from "vitest";
import { command, world, stamp } from "../src/server/domain";
import {
  createDiscovery,
  startDiscovery,
  discoveryContext,
  discoveryJob,
  discoveryAllowance,
  updateGiftPreferences,
  preferenceViews,
  quotaKeys,
  prepareDiscoveryReview,
  saveDiscoveryReview,
  newPreference,
  pruneDiscovery,
  discoveryIdempotent,
} from "../src/server/gift-discovery";
import {
  discoveryFixture,
  discoveryConfig as cfg,
  candidate,
  selection,
} from "./gift-discovery-fixture";

describe("gift preferences and visibility", () => {
  it("persists deferred setup separately from dismissal with revision checks", () => {
    const f = discoveryFixture();
    const preference = newPreference(f.people[0].id);
    f.state.giftPreferences.push(preference);
    const body = {
      personId: preference.personId,
      revision: preference.revision,
      categoryIds: [],
      interests: "",
      likes: "",
      avoid: "",
      groupIds: [],
      setup: "deferred",
    };
    expect(() => updateGiftPreferences(f.state, f.actors[1], body)).toThrow(
      "Profile not found",
    );
    updateGiftPreferences(f.state, f.actors[0], body);
    expect(preferenceViews(f.state, f.actors[0])[0].setup).toBe("deferred");
    expect(preferenceViews(f.state, f.actors[1])).toEqual([]);
    expect(() =>
      updateGiftPreferences(f.state, f.actors[0], {
        ...body,
        setup: "skipped",
      }),
    ).toThrow("changed");
    updateGiftPreferences(f.state, f.actors[0], {
      ...body,
      revision: preference.revision,
      setup: "skipped",
    });
    expect(preference.setup).toBe("skipped");
  });

  it("requires explicit sharing confirmation, revision checks and current group membership", () => {
    const f = discoveryFixture(),
      [owner, giver] = f.actors;
    const body = { ...f.input, groupIds: [], setup: "done" };
    updateGiftPreferences(f.state, owner, body);
    expect(preferenceViews(f.state, giver)).toEqual([]);
    const saved = f.state.giftPreferences[0];
    expect(() => updateGiftPreferences(f.state, giver, body)).toThrow(
      "Profile not found",
    );
    expect(() =>
      updateGiftPreferences(f.state, owner, {
        ...body,
        revision: saved.revision,
        groupIds: [f.group.id],
      }),
    ).toThrow("Review who");
    updateGiftPreferences(f.state, owner, {
      ...body,
      revision: saved.revision,
      groupIds: [f.group.id],
      confirmSharing: true,
    });
    expect(preferenceViews(f.state, giver)[0]).toMatchObject({
      likes: "Ceramics",
      canEdit: false,
    });
    expect(preferenceViews(f.state, giver)[0]).not.toHaveProperty("groupIds");
    expect(preferenceViews(f.state, giver)[0]).not.toHaveProperty("setup");
    expect(() =>
      updateGiftPreferences(f.state, owner, { ...body, revision: 1 }),
    ).toThrow("changed");
    f.group.memberIds = [owner.id];
    expect(preferenceViews(f.state, giver)).toEqual([]);
  });
  it("allows guardians to edit but treats managed profiles as receiver mode", () => {
    const f = discoveryFixture();
    f.people[0].guardians.push(f.actors[1].id);
    updateGiftPreferences(f.state, f.actors[1], { ...f.input, groupIds: [] });
    expect(preferenceViews(f.state, f.actors[1])[0].canEdit).toBe(true);
    expect(() =>
      createDiscovery(
        f.state,
        f.actors[1],
        { ...cfg, mode: "givers" },
        f.input,
      ),
    ).toThrow("not enabled");
    expect(
      createDiscovery(
        f.state,
        f.actors[1],
        { ...cfg, mode: "receivers" },
        f.input,
      ).status,
    ).toBe("pending");
  });
  it("infers only from visible active wishes and never returns private jobs in world", () => {
    const f = discoveryFixture();
    command(f.state, f.actors[2], "items.create", {
      title: "Gardening tools",
      recipientIds: [f.people[0].id],
      visibility: "private",
    });
    const context = discoveryContext(f.state, f.actors[1], cfg, f.people[0].id);
    expect(context.inferredCategoryIds).toEqual(["coffee"]);
    createDiscovery(f.state, f.actors[1], cfg, f.input);
    expect(world(f.state, f.actors[0])).not.toHaveProperty("giftDiscoveryJobs");
    f.wish.archived = true;
    expect(
      discoveryContext(f.state, f.actors[1], cfg, f.people[0].id)
        .inferredCategoryIds,
    ).toEqual([]);
  });
});

describe("bounded searches", () => {
  it("enforces off, audience modes, giver budget and per-account ownership", () => {
    const f = discoveryFixture();
    for (const mode of ["off", "receivers"] as const)
      expect(() =>
        createDiscovery(f.state, f.actors[1], { ...cfg, mode }, f.input),
      ).toThrow("not enabled");
    expect(() =>
      createDiscovery(f.state, f.actors[1], cfg, {
        ...f.input,
        maxPriceCents: null,
      }),
    ).toThrow("maximum price");
    const j = createDiscovery(f.state, f.actors[1], cfg, f.input);
    expect(() => discoveryJob(f.state, f.actors[2], cfg, j.id)).toThrow(
      "no longer available",
    );
    expect(() =>
      discoveryJob(f.state, f.actors[1], { ...cfg, available: false }, j.id),
    ).toThrow("not enabled");
  });
  it("reserves once, reuses batches, allows one active job and shares quota across recipients", () => {
    const f = discoveryFixture(),
      giver = f.actors[1];
    const j = createDiscovery(f.state, giver, cfg, f.input);
    expect(discoveryAllowance(f.state, giver, cfg).weeklyRemaining).toBe(3);
    expect(createDiscovery(f.state, giver, cfg, f.input).id).toBe(j.id);
    expect(() =>
      createDiscovery(f.state, giver, cfg, { ...f.input, maxPriceCents: 6000 }),
    ).toThrow("Wait for");
    expect(startDiscovery(f.state, giver, cfg, j.id)).toBeDefined();
    expect(startDiscovery(f.state, giver, cfg, j.id)).toBeUndefined();
    j.status = "complete";
    expect(createDiscovery(f.state, giver, cfg, f.input).id).toBe(j.id);
    for (let n = 0; n < 2; n++) {
      const next = createDiscovery(f.state, giver, cfg, {
        ...f.input,
        personId: f.people[2].id,
        fresh: true,
      });
      startDiscovery(f.state, giver, cfg, next.id);
      next.status = "failed";
    }
    expect(() =>
      createDiscovery(f.state, giver, cfg, { ...f.input, fresh: true }),
    ).toThrow("allowance");
    expect(discoveryAllowance(f.state, giver, cfg).weeklyRemaining).toBe(0);
    expect(discoveryAllowance(f.state, f.actors[2], cfg).monthlyRemaining).toBe(
      97,
    );
    expect(createDiscovery(f.state, giver, cfg, f.input).id).toBe(j.id);
  });
  it("uses UTC calendar boundaries, cancels revoked/off results and expires private batches", () => {
    expect(quotaKeys("user", new Date("2026-11-01T23:59:59Z"))).toMatchObject({
      week: "discovery:week:2026-10-26:user",
      month: "discovery:month:2026-11",
      weekResetsAt: "2026-11-02T00:00:00.000Z",
      monthResetsAt: "2026-12-01T00:00:00.000Z",
    });
    const f = discoveryFixture(),
      j = createDiscovery(f.state, f.actors[1], cfg, f.input);
    j.status = "complete";
    j.candidates = [candidate()];
    f.wish.revision++;
    expect(() => discoveryJob(f.state, f.actors[1], cfg, j.id)).toThrow(
      "changed",
    );
    pruneDiscovery(f.state, cfg);
    expect(j.status).toBe("cancelled");
    expect(j.candidates).toEqual([]);
    expect(() => discoveryJob(f.state, f.actors[1], cfg, j.id)).toThrow(
      "no longer available",
    );
    pruneDiscovery(f.state, cfg, new Date(Date.now() + 86400001));
    expect(f.state.giftDiscoveryJobs).toEqual([]);
  });
  it("deduplicates retries without storing private snapshots and rejects key reuse", () => {
    const f = discoveryFixture(),
      a = f.actors[1],
      key = "same_request_00001";
    const run = () => createDiscovery(f.state, a, cfg, f.input);
    const first = discoveryIdempotent(
      f.state,
      a,
      key,
      "create",
      f.input,
      run,
    ) as { id: string };
    expect(
      discoveryIdempotent(f.state, a, key, "create", f.input, run),
    ).toEqual({ replayed: true, jobId: first.id });
    expect(f.state.replays[0].result).toEqual({ jobId: first.id });
    expect(() =>
      discoveryIdempotent(f.state, a, key, "create", {}, run),
    ).toThrow("changed");
  });
});

describe("review and atomic save", () => {
  function ready(own = false) {
    const f = discoveryFixture(),
      a = f.actors[own ? 0 : 1];
    const j = createDiscovery(f.state, a, cfg, f.input);
    j.status = "complete";
    j.candidates = [candidate(), candidate(1)];
    return {
      ...f,
      a,
      j,
      picks: j.candidates.map((c) => selection(c, own ? f.list.id : undefined)),
    };
  }
  it("requires confirmation, preserves public evidence and never copies private rationale", () => {
    const f = ready();
    expect(() =>
      saveDiscoveryReview(f.state, f.a, cfg, f.j.id, { reviewId: stamp().id }),
    ).toThrow("Review");
    prepareDiscoveryReview(f.state, f.a, cfg, f.j.id, f.picks);
    expect(f.state.items).toHaveLength(1);
    const token = f.j.review!.id;
    const result = saveDiscoveryReview(f.state, f.a, cfg, f.j.id, {
      reviewId: token,
    });
    const items = f.state.items.filter((i) =>
      Object.values(result.saved).includes(i.id),
    );
    expect(items).toHaveLength(2);
    expect(
      items.every(
        (i) =>
          i.visibility === "private" &&
          !i.listId &&
          i.purchaseOffers?.length === 1,
      ),
    ).toBe(true);
    expect(JSON.stringify(items)).not.toContain("Matches private");
    expect(JSON.stringify(items)).not.toContain("Already has a grinder");
    expect(f.state.reservations).toEqual([]);
    expect(() =>
      saveDiscoveryReview(f.state, f.a, cfg, f.j.id, { reviewId: token }),
    ).toThrow("Review");
  });
  it("saves to an owned list and invalidates changed destinations without partial writes", () => {
    const f = ready(true);
    prepareDiscoveryReview(f.state, f.a, cfg, f.j.id, f.picks);
    const token = f.j.review!.id;
    f.list.name = "Changed destination";
    expect(() =>
      saveDiscoveryReview(f.state, f.a, cfg, f.j.id, { reviewId: token }),
    ).toThrow("Review");
    expect(f.state.items).toHaveLength(1);
    prepareDiscoveryReview(f.state, f.a, cfg, f.j.id, f.picks);
    saveDiscoveryReview(f.state, f.a, cfg, f.j.id, {
      reviewId: f.j.review!.id,
    });
    expect(f.state.items).toHaveLength(3);
    expect(discoveryJob(f.state, f.a, cfg, f.j.id).saved).toBeDefined();
  });
  it("refreshes stale offers, rejects over-budget offers and invalid batches atomically", () => {
    const f = ready();
    f.j.candidates[0].offers[0].checkedAt = new Date(
      Date.now() - 16 * 60000,
    ).toISOString();
    prepareDiscoveryReview(f.state, f.a, cfg, f.j.id, f.picks);
    expect(f.j.status).toBe("reviewing");
    expect(f.j.review).toBeUndefined();
    f.j.status = "complete";
    f.j.candidates[0].offers[0].priceCents = 6000;
    expect(() =>
      prepareDiscoveryReview(f.state, f.a, cfg, f.j.id, f.picks),
    ).toThrow("price limit");
    f.j.candidates[0].offers[0].priceCents = 2500;
    expect(() =>
      prepareDiscoveryReview(f.state, f.a, cfg, f.j.id, [
        f.picks[0],
        { ...f.picks[1], listId: f.list.id },
      ]),
    ).toThrow("gift ideas");
    expect(f.state.items).toHaveLength(1);
  });
  it("shows only visible duplicates and requires explicit separate-entry choice", () => {
    const f = ready();
    command(f.state, f.actors[2], "items.create", {
      title: "Secret duplicate",
      url: f.picks[0].offerUrl,
      recipientIds: [f.people[0].id],
      visibility: "private",
    });
    prepareDiscoveryReview(f.state, f.a, cfg, f.j.id, [f.picks[0]]);
    expect(f.j.review!.conflicts).toEqual([]);
    command(f.state, f.a, "items.create", {
      title: "Visible duplicate",
      url: f.picks[0].offerUrl,
      recipientIds: [f.people[0].id],
    });
    prepareDiscoveryReview(f.state, f.a, cfg, f.j.id, [f.picks[0]]);
    expect(f.j.review!.conflicts).toHaveLength(1);
    expect(() =>
      saveDiscoveryReview(f.state, f.a, cfg, f.j.id, {
        reviewId: f.j.review!.id,
      }),
    ).toThrow("Review");
    prepareDiscoveryReview(f.state, f.a, cfg, f.j.id, [
      { ...f.picks[0], allowDuplicate: true },
    ]);
    saveDiscoveryReview(f.state, f.a, cfg, f.j.id, {
      reviewId: f.j.review!.id,
    });
    expect(f.state.items).toHaveLength(4);
  });
});
