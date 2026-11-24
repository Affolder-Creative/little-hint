import { expect, it, vi } from "vitest";
import { command, world, stamp } from "../src/server/domain";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { buyingPage } from "../src/server/collections";
import { sourceView } from "../src/server/gift-lifecycle";
import { standaloneBuying } from "../src/server/buying-purchases";
import { spendingView } from "../src/server/spending";
import { arrivalLabel, matchesArrival } from "../src/shared/arrival";

vi.mock("../src/server/db", async (original) => ({
  ...(await original<typeof import("../src/server/db")>()),
  hydrateCollectionItems: vi.fn(),
}));

function fixture() {
  const { state: s, actors } = stagingFixtures();
  const a = actors.find((a) =>
    s.reservations.some((r) => r.buyerId === a.id && r.quantity > 0),
  )!;
  const r = s.reservations.find((r) => r.buyerId === a.id && r.quantity > 0)!;
  r.quantity = 3;
  r.purchased = 2;
  r.inHandQuantity = 1;
  return { s, a, r, other: actors.find((v) => v.id !== a.id)! };
}
it("tracks partial deliveries privately and validates ownership, quantities and revisions", () => {
  const { s, a, r, other } = fixture();
  const update = (
    actor = a,
    inHandQuantity: number | null = 2,
    revision = r.revision,
  ) =>
    command(s, actor, "buying.arrival", {
      id: r.id,
      source: "reservation",
      revision,
      inHandQuantity,
    });
  expect(() => update(other)).toThrow();
  expect(() => update(a, 3)).toThrow();
  expect(() => update(a, 2, r.revision - 1)).toThrow();
  update();
  expect(r.inHandQuantity).toBe(2);
  expect(sourceView(s, r, other).inHandQuantity).toBeUndefined();
  expect(world(s, a).buying.find((v) => v.id === r.id)?.inHandQuantity).toBe(2);
  update(a, null);
  expect(r.inHandQuantity).toBeUndefined();
});
it("clamps possession when purchases decrease and clears it at zero", () => {
  const { s, a, r } = fixture();
  command(s, a, "reservations.update", {
    id: r.id,
    revision: r.revision,
    quantity: 3,
    purchased: 0,
  });
  expect(r.inHandQuantity).toBeUndefined();
});
it("filters purchased quantities before pagination, including incomplete plans", async () => {
  const { s, a, r } = fixture();
  const awaiting = await buyingPage(s, a, {
    view: "purchased",
    arrival: "awaiting",
  });
  expect(awaiting.rows.some((v) => v.id === r.id)).toBe(true);
  expect(
    (await buyingPage(s, a, { view: "needs-buying" })).rows.some(
      (v) => v.id === r.id,
    ),
  ).toBe(true);
  r.inHandQuantity = undefined;
  expect(
    (
      await buyingPage(s, a, { view: "purchased", arrival: "awaiting" })
    ).rows.some((v) => v.id === r.id),
  ).toBe(false);
});
it("combines standalone purchases once and excludes linked ledger entries", async () => {
  const { s, a, r, other } = fixture();
  command(s, a, "spending.settings", { enabled: true, summaries: true });
  const base = s.spendingRecords.find((v) => v.ownerId === a.id)!;
  const purchase = {
    ...base,
    ...stamp(),
    kind: "purchase" as const,
    reservationId: undefined,
    quantity: 2,
    inHandQuantity: 0,
  };
  s.spendingRecords.push(purchase, {
    ...purchase,
    ...stamp(),
    reservationId: r.id,
  });
  expect(
    standaloneBuying(s, a).filter((v) => v.id === purchase.id),
  ).toHaveLength(1);
  command(s, a, "buying.arrival", {
    id: purchase.id,
    revision: purchase.revision,
    source: "purchase",
    inHandQuantity: 2,
  });
  expect(purchase.inHandQuantity).toBe(2);
  const purchasedPage = await buyingPage(s, a, {
    view: "purchased",
    arrival: "in-hand",
  });
  expect(
    purchasedPage.rows.find((v) => v.id === purchase.id)?.standalonePurchase
      ?.id,
  ).toBe(purchase.id);

  expect(
    purchasedPage.rows.find((v) => v.id === purchase.id)?.sourceState,
  ).toBeUndefined();
  expect(() =>
    command(s, other, "buying.arrival", {
      id: purchase.id,
      revision: purchase.revision,
      source: "purchase",
      inHandQuantity: 0,
    }),
  ).toThrow();
  expect(
    spendingView(s, a).records.find((v) => v.id === purchase.id)
      ?.inHandQuantity,
  ).toBe(2);
  command(s, a, "spending.settings", { enabled: false, summaries: false });
  expect(standaloneBuying(s, a)).toHaveLength(0);
});
it("keeps historical unknown arrivals out of outstanding counts", () => {
  expect(matchesArrival(1, undefined, "awaiting")).toBe(false);
  expect(arrivalLabel(1, undefined)).toBe("Arrival not recorded");
  expect(arrivalLabel(3, 2)).toBe("2 of 3 in hand");
});
