import { test, expect } from "@playwright/test";
import { discoveryFixture } from "./gift-discovery-fixture";
import { world } from "../src/server/domain";

for (const width of [320, 390, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`price ranges and paused tracking at ${width}px in ${theme}`, async ({
      page,
    }) => {
      const f = discoveryFixture();
      f.wish.priceCents = 40000;
      f.wish.priceMaxCents = 70000;
      f.wish.url = "https://shop.example/tv";
      f.wish.title = "TV for Dad";
      const data = world(f.state, f.actors[0]);
      data.priceChecksEnabled = true;
      const gift = data.items.find((item) => item.id === f.wish.id)!;
      gift.priceWatching = true;
      gift.pricing = {
        baseline: 50000,
        baselineLabel: "when added",
        generation: "range-test",
        checkedAt: new Date().toISOString(),
        status: "verified",
        paused: true,
      };
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/prices/watch")) {
          expect(route.request().postDataJSON().enabled).toBe(false);
          gift.priceWatching = false;
          return route.fulfill({ json: { ok: true } });
        }
        return route.fulfill({ json: path.endsWith("/world") ? data : {} });
      });
      await page.goto(`/gift/${gift.id}`);
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      await expect(page.locator(".detail-price")).toHaveText("$400–$700");
      await expect(page.locator(".detail-price")).toHaveAttribute(
        "aria-label",
        "$400 to $700",
      );
      await expect(
        page.getByText("Price range", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("$500 when added", { exact: false }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Resume automatic price checks" }),
      ).toHaveCount(0);
      await expect(
        page.getByText(
          "Automatic price checks are paused. Choose Use shop prices in the editor to resume.",
        ),
      ).toBeVisible();
      await expect(page.getByLabel("Notify me of price drops")).toBeChecked();
      await page.getByLabel("Notify me of price drops").click();
      await expect(page.getByLabel("Notify me of price drops")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/range-details-${width}-${theme}.png`,
        fullPage: true,
      });
    });
  }
}
