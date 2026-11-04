import { test, expect } from "@playwright/test";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { stamp, world, giftView } from "../src/server/domain";
import { itemPage } from "../src/server/collections";
for (const width of [393, 1440])
  test(`paged search retains focus after history restoration at ${width}px`, async ({
    page,
  }, info) => {
    const { state, actors } = stagingFixtures();
    const actor = actors[0];
    const template = state.items.find((i) =>
      world(state, actor).items.some(
        (v) => v.id === i.id && v.canEdit && v.listId,
      ),
    )!;
    state.items = Array.from({ length: 49 }, (_, n) => ({
      ...template,
      ...stamp(),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
      title: `Pagination ${String(n).padStart(2, "0")}`,
      image: "",
      archived: false,
    }));
    state.reservations = [];
    state.comments = [];
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/v1/world")
        return route.fulfill({
          json: {
            ...world(state, actor, true, true),
            environment: "test",
            spendingAvailable: false,
          },
        });
      if (url.pathname === "/api/v1/items")
        return route.fulfill({
          json: await itemPage(
            state,
            actor,
            Object.fromEntries(url.searchParams),
            async () => {},
          ),
        });
      if (url.pathname.startsWith("/api/v1/items/")) {
        const item = state.items.find(
          (i) => i.id === url.pathname.split("/").pop(),
        );
        return route.fulfill({
          json: item
            ? giftView(state, actor, item)
            : { error: "Item not found" },
          status: item ? 200 : 404,
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/lists/${template.listId}`);
    const top = page.getByRole("navigation", { name: "Results pages above" });
    await expect(page.locator(".gift-card")).toHaveCount(24);
    await top.getByRole("button", { name: "Next" }).click();
    await expect(top).toContainText("Page 2 of 3");
    await page.screenshot({
      path: info.outputPath(`paged-${width}.png`),
      fullPage: true,
    });
    await page.locator(".gift-card").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Pagination 24",
    );
    await page.goBack();
    await expect(top).toContainText("Page 2 of 3");
    await page.reload();
    await expect(top).toContainText("Page 2 of 3");
    const search = page.getByRole("searchbox");
    await search.fill("Pagination 00");
    await expect(page.locator(".gift-card")).toHaveCount(1);
    await expect(page.locator(".gift-card")).toContainText("Pagination 00");
    await expect(search).toBeFocused();
    await search.fill("");
    await expect(page.locator(".gift-card")).toHaveCount(24);
    await expect(top).toContainText("Page 1 of 3");
    await top.getByRole("button", { name: "Next" }).click();
    await expect(top).toContainText("Page 2 of 3");
    await top.getByRole("button", { name: "Next" }).click();
    await expect(page.locator(".gift-card")).toHaveCount(1);
    state.items.pop();
    await page.reload();
    await expect(top).toContainText("Page 2 of 2");
    await expect(page.locator(".gift-card")).toHaveCount(24);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
