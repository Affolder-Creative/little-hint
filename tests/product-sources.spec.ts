import { test, expect } from "@playwright/test";
import { discoveryFixture } from "./gift-discovery-fixture";
import { world, stamp } from "../src/server/domain";
for (const width of [390, 1280]) {
  test(`recovered sources on saved gift and draft at ${width}px`, async ({
    page,
  }) => {
    const f = discoveryFixture();
    const source = {
      url: "https://shop.example/products/grinder",
      fields: ["title", "description"] as Array<"title" | "description">,
      method: "web" as const,
      checkedAt: new Date().toISOString(),
    };
    f.wish.productSources = [source];
    f.wish.url = source.url;
    f.state.imports.push({
      ...stamp(),
      userId: f.actors[0].id,
      url: source.url,
      status: "complete",
      result: {
        title: "Recovered grinder",
        description: "Steel burrs",
        source: "shop.example",
        productSources: [source],
      },
      draft: {
        state: "active",
        revision: 0,
        listId: f.list.id,
        fields: {},
        touched: [],
      },
    });
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const value = path.endsWith("/world")
        ? world(f.state, f.actors[0])
        : path.includes("/imports/")
          ? f.state.imports[0]
          : {};
      await route.fulfill({ json: value });
    });
    await page.goto(`/gift/${f.wish.id}`);
    await expect(
      page.getByRole("link", { name: "shop.example", exact: true }),
    ).toHaveAttribute("href", source.url);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/product-sources-${width}.png`,
      fullPage: true,
    });
    await page.goto(`/lists?draft=${f.state.imports[0].id}`);
    // Draft cards retain the source with the result, ready for the existing review flow.
    await expect(page.getByLabel("Item name", { exact: true })).toHaveValue(
      "Recovered grinder",
    );
    await expect(
      page
        .getByRole("dialog")
        .getByRole("link", { name: "shop.example", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/product-draft-${width}.png`,
      fullPage: true,
    });
    await page.getByLabel("Item name", { exact: true }).fill("My grinder");
    await expect(
      page.getByRole("dialog").getByText("· description", { exact: false }),
    ).toBeVisible();
  });
}
