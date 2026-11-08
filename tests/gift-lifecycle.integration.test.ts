import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture } from "./privacy-fixture";
import { command } from "../src/server/domain";
import { sourceView } from "../src/server/gift-lifecycle";
import { contributionHistory } from "../src/server/buying-history";
import type { Contribution } from "../src/shared/model";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("gift lifecycle transactions", () => {
  let db: typeof import("../src/server/db");
  const f = fixture(),
    s = f.state,
    [owner, buyer, donor] = f.actors;
  let contributionId: string;
  beforeAll(async () => {
    if (!/little_hint_test(?:\?|$)/.test(url!))
      throw new Error("Use the isolated little_hint_test database.");
    process.env.DATABASE_URL = url;
    db = await import("../src/server/db");
    await db.migrate();
    const created = command(s, buyer, "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
    }) as { id: string };
    const r = s.reservations.find((r) => r.id === created.id)!;
    command(s, buyer, "reservations.update", { ...r, poolTargetCents: 4000 });
    const c = command(s, donor, "contributions.create", {
      reservationId: r.id,
      amountCents: 4000,
    }) as Contribution;
    contributionId = c.id;
    command(s, donor, "contributions.update", { ...c, status: "sent" });
    command(s, buyer, "contributions.update", { ...c, status: "received" });
    f.lists[0].archiveAfter = "2020-01-01";
    await db.transact((state) => Object.assign(state, s));
  });
  afterAll(async () => db?.pool.end());
  it("projects scheduled state and commits review despite an offline worker", async () => {
    const read = await db.readBuyingState(donor.id);
    expect(contributionHistory(read, donor, {}).rows[0].sourceState).toBe(
      "archived",
    );
    const r = read.reservations[0],
      view = sourceView(read, r, donor);
    await db.transact((state) =>
      command(state, donor, "reservations.review", {
        id: r.id,
        sourceVersion: view.sourceVersion,
      }),
    );
    expect(
      (await db.readBuyingState(donor.id)).reservations[0].sourceReviewedBy?.[
        donor.id
      ],
    ).toBe(view.sourceVersion);
  });
  it("serializes concurrent partial returns without over-returning", async () => {
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        db.transact((state) => {
          const c = state.contributions.find((c) => c.id === contributionId)!;
          return command(state, buyer, "contributions.return", {
            id: c.id,
            revision: c.revision,
            amountCents: 3000,
            date: "2025-12-31",
          });
        }),
      ),
    );
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.readBuyingState(donor.id)).contributions[0].returns,
    ).toHaveLength(1);
  });
});
