import { test, expect } from "@playwright/test";
import { login, post } from "./browser-helpers";

test("requests compact snapshots and loads cancelled history only when opened, one page at a time", async ({
  page,
}) => {
  await login(page, "sam@example.test");
  const compact = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/v1/world" &&
      r.request().headers()["x-little-hint-world"] === "compact",
  );
  await page.reload();
  const snapshot = await (await compact).json();
  expect(snapshot.compact).toBe(true);
  expect(snapshot.contributionHistory).toEqual([]);
  expect(snapshot.buying.every((r: any) => r.quantity > 0 && !r.item)).toBe(
    true,
  );
  let pages = 0;
  await page.route("**/api/v1/buying/cancelled?**", async (route) => {
    pages++;
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    const start = cursor ? 50 : 0,
      count = cursor ? 1 : 50;
    await route.fulfill({
      json: {
        rows: Array.from({ length: count }, (_, i) => ({
          id: `cancelled-${start + i}`,
          titleSnapshot: `Historical reservation ${start + i}`,
          quantity: 0,
          purchased: 0,
          createdAt: "2026-01-01T00:00:00Z",
        })),
        nextCursor: cursor ? null : "second-page",
      },
    });
  });
  await page.goto("/buying");
  await expect(
    page.getByRole("heading", { name: "Your gift plans" }),
  ).toBeVisible();
  expect(pages).toBe(0);
  await page.getByText("Cancelled reservations", { exact: true }).click();
  await expect(
    page.getByText("Historical reservation 49", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Historical reservation 50", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Load more cancelled reservations" })
    .click();
  await expect(
    page.getByText("Historical reservation 50", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more cancelled reservations" }),
  ).toHaveCount(0);
  expect(pages).toBe(2);
});

test("a cancelled reservation moves out of the compact snapshot and into live history", async ({
  page,
}) => {
  await login(page, "sam@example.test");
  const world = await (await page.request.get("/api/v1/world")).json();
  const person = world.people.find(
    (p: any) => p.userId !== world.me.id && !p.guardians.includes(world.me.id),
  );
  const title = `History regression ${Date.now()}`;
  const gift = await post(page, "items", {
    title,
    recipientIds: [person.id],
    groupIds: [],
    visibility: "private",
    quantity: 1,
  });
  const r = await post(page, "reservations", { itemId: gift.id, quantity: 1 });
  await page.goto("/buying");
  const row = page.locator(".buying-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  const initial = await (await page.request.get("/api/v1/world")).json();
  const reservation = initial.buying.find((v: any) => v.id === r.id);
  await post(page, "reservations/update", {
    id: r.id,
    revision: reservation.revision,
    quantity: 0,
    purchased: 0,
  });
  await page.reload();
  await expect(
    page.locator(".buying-row").filter({ hasText: title }),
  ).toHaveCount(0);
  await page.getByText("Cancelled reservations", { exact: true }).click();
  await expect(
    page.locator(".reservation-row").filter({ hasText: title }),
  ).toBeVisible();
  const history = await (
    await page.request.get("/api/v1/buying/cancelled")
  ).json();
  expect(history.rows.some((v: any) => v.id === r.id)).toBe(true);
});
