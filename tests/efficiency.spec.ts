import { test, expect } from "@playwright/test";
import { login, post } from "./browser-helpers";

test("requests paged snapshots and loads cancelled history only when opened, one page at a time", async ({
  page,
}) => {
  await login(page, "sam@example.test");
  const compact = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/v1/world" &&
      r.request().headers()["x-little-hint-world"] === "paged-v1",
  );
  await page.reload();
  const snapshot = await (await compact).json();
  expect(snapshot.compact).toBe(true);
  expect(snapshot.paged).toBe(true);
  expect(snapshot.items).toEqual([]);
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

for (const width of [393, 1440]) {
  test(`item pages bound rendering and restore navigation at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, "sam@example.test");
    const w = await (await page.request.get("/api/v1/world")).json();
    const own = w.people.find((p: any) => p.userId === w.me.id);
    const created = await post(page, "lists", {
      name: `Paged wishes ${width}`,
      ownerIds: [own.id],
      groupIds: [],
      mode: "surprise",
    });
    for (let n = 0; n < 25; n++)
      await post(page, "items", {
        listId: created.id,
        title: `Paged item ${width} ${String(n).padStart(2, "0")}`,
        quantity: 1,
      });
    await page.goto(`/lists/${created.id}`);
    await expect(page.locator(".gift-card")).toHaveCount(24);
    await expect(
      page.getByRole("navigation", { name: "Results pages above" }),
    ).toContainText("Showing 1–24 of 25");
    await page
      .getByRole("navigation", { name: "Results pages above" })
      .getByRole("button", { name: "Next" })
      .click();
    await expect(page.locator(".gift-card")).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Results pages above" }),
    ).toContainText("Page 2 of 2");
    await page.locator(".gift-card").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      `Paged item ${width} 24`,
    );
    await page.goBack();
    await expect(
      page.getByRole("navigation", { name: "Results pages above" }),
    ).toContainText("Page 2 of 2");
    await page.reload();
    await expect(page.locator(".gift-card")).toHaveCount(1);
    await page.getByRole("searchbox").fill(`Paged item ${width} 00`);
    await expect(page.locator(".gift-card")).toHaveCount(1);
    await expect(page.locator(".gift-card")).toContainText(
      `Paged item ${width} 00`,
    );
    await expect(page.getByRole("searchbox")).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`pagination-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("active gift plans stay bounded across status filters", async ({
  page,
}) => {
  await login(page, "sam@example.test");
  const w = await (await page.request.get("/api/v1/world")).json();
  const recipient = w.people.find(
    (p: any) => p.userId !== w.me.id && !p.guardians.includes(w.me.id),
  );
  for (let n = 0; n < 25; n++) {
    const gift = await post(page, "items", {
      title: `Paged plan ${n}`,
      recipientIds: [recipient.id],
      visibility: "private",
      quantity: 1,
    });
    await post(page, "reservations", { itemId: gift.id, quantity: 1 });
  }
  await page.goto("/buying");
  await expect(page.locator(".buying-row")).toHaveCount(24);
  const top = page.getByRole("navigation", { name: "Results pages above" });
  await top.getByRole("button", { name: "Next" }).click();
  await expect(top).toContainText("Page 2 of");
  expect(await page.locator(".buying-row").count()).toBeLessThanOrEqual(24);
  await page
    .getByRole("button", { name: /Purchased \(/, exact: false })
    .click();
  await expect(top.getByRole("button", { name: "Previous" })).toHaveCount(0);
});
