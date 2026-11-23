import { test, expect } from "@playwright/test";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world, stamp } from "../src/server/domain";
import { sortBuying, type BuyingSort } from "../src/shared/buying-sort";
import { pageRows } from "../src/shared/pagination";
for (const width of [320, 390, 768, 1440])
  test(`Buying sort remembers selection at ${width}px`, async ({
    page,
  }, info) => {
    const { state, actors } = stagingFixtures();
    const data = world(state, actors[1]);
    const base = data.buying[0];
    data.buying = Array.from({ length: 30 }, (_, n) => ({
      ...base,
      id: `reservation-${n}`,
      createdAt: new Date(Date.UTC(2026, 0, n + 1)).toISOString(),
      titleSnapshot: `Gift ${String(n).padStart(2, "0")}`,
      quantity: 1,
      purchased: 0,
    }));
    data.spendingAvailable = false;
    data.paged = true;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      if (path.endsWith("/buying/active")) {
        await route.fulfill({
          json: {
            ...pageRows(
              sortBuying(
                data.buying,
                (url.searchParams.get("sort") || "newest") as BuyingSort,
              ),
              Number(url.searchParams.get("page")) || 1,
            ),
            counts: { all: 30, needsBuying: 30, purchased: 0 },
          },
        });
        return;
      }
      if (path.endsWith("/organization/update")) {
        const body = route.request().postDataJSON();
        data.organization = [
          {
            ...stamp(),
            userId: data.me.id,
            scope: "buying",
            sort: body.sort,
            order: [],
          },
        ];
      }
      await route.fulfill({
        json: path.endsWith("/world")
          ? data
          : path.includes("/spending")
            ? { settings: { enabled: false } }
            : { rows: [], nextCursor: null },
      });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/buying");
    const sort = page.getByLabel("Sort gift plans");
    await expect(sort).toHaveValue("newest");
    await expect(page.locator(".buying-row h2").first()).toHaveText("Gift 29");
    await sort.selectOption("oldest");
    await expect(page.locator(".buying-row h2").first()).toHaveText("Gift 00");
    await page.reload();
    await expect(sort).toHaveValue("oldest");
    await sort.selectOption("name-desc");
    await expect(page.locator(".buying-row h2").first()).toHaveText("Gift 29");
    const navigation = page.getByRole("navigation", {
      name: "Results pages above",
    });
    const countBox = await navigation.getByRole("status").boundingBox();
    const sortBox = await sort.boundingBox();
    const previousBox = await navigation
      .getByRole("button", { name: "Previous" })
      .boundingBox();
    const nextBox = await navigation
      .getByRole("button", { name: "Next" })
      .boundingBox();
    expect(
      Math.abs(
        countBox!.y + countBox!.height / 2 - sortBox!.y - sortBox!.height / 2,
      ),
    ).toBeLessThan(2);
    expect(sortBox!.x).toBeGreaterThanOrEqual(countBox!.x + countBox!.width);
    expect(previousBox!.y).toBeGreaterThan(sortBox!.y + sortBox!.height);
    expect(Math.abs(previousBox!.y - nextBox!.y)).toBeLessThan(2);
    await page.screenshot({
      path: info.outputPath(`buying-sort-${width}-light.png`),
    });
    await page.evaluate(
      () => (document.documentElement.dataset.theme = "dark"),
    );
    await page.screenshot({
      path: info.outputPath(`buying-sort-${width}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
