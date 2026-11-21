import { test, expect } from "@playwright/test";
import { discoveryFixture } from "./gift-discovery-fixture";
import { world, stamp } from "../src/server/domain";
import { expectDialogFieldsToFit } from "./browser-helpers";

for (const width of [320, 390, 768, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`price range editor at ${width}px in ${theme}`, async ({ page }) => {
      const f = discoveryFixture();
      const job = {
        ...stamp(),
        userId: f.actors[0].id,
        url: "https://shop.example/tv",
        status: "complete" as const,
        result: { title: "TV for Dad" },
        draft: {
          state: "active" as const,
          revision: 0,
          listId: f.list.id,
          fields: { title: "TV for Dad", price: "400" },
          touched: ["price"],
        },
      };
      f.state.imports.push(job);
      const saved: Record<string, unknown>[] = [];
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        const body =
          route.request().method() === "POST"
            ? route.request().postDataJSON()
            : null;
        if (path.endsWith("/imports/update") && body) {
          job.draft.fields = body.fields;
          job.draft.touched = body.touched;
          job.draft.revision++;
        }
        if (path.endsWith("/items") && body) saved.push(body);
        await route.fulfill({
          json: path.endsWith("/world")
            ? world(f.state, f.actors[0])
            : path.includes("/imports/")
              ? job
              : {},
        });
      });
      await page.goto(`/lists?draft=${job.id}`);
      await page.evaluate(
        (value) => document.documentElement.setAttribute("data-theme", value),
        theme,
      );
      await page
        .getByRole("dialog")
        .getByText("More details", { exact: true })
        .click();
      const price = page.getByLabel("Price in USD", { exact: true });
      const range = page.getByRole("button", {
        name: "Add price range",
        exact: true,
      });
      await expect(price).toHaveAttribute("inputmode", "decimal");
      await range.click();
      await expect(price).toBeFocused();
      await expect(price).toHaveValue("400-");
      await price.pressSequentially("700");
      await range.click();
      await expect(price).toHaveValue("400-700");
      await expect
        .poll(() => price.evaluate((el: HTMLInputElement) => el.selectionStart))
        .toBe(4);
      await price.fill("400-400");
      await price.press("Tab");
      await expect(
        page.getByText("The second price must be higher than the first.", {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Add to wish list", exact: true })
        .click();
      expect(saved).toHaveLength(0);
      await price.fill("");
      await price.evaluate((el) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData("text", "$1,000.00 – $1,500.00");
        el.dispatchEvent(
          new ClipboardEvent("paste", {
            clipboardData,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      await expect(price).toHaveValue("1000.00-1500.00");
      await expectDialogFieldsToFit(page);
      const priceBox = await price.boundingBox();
      const quantityBox = await page
        .getByLabel("Quantity wanted", { exact: true })
        .boundingBox();
      const buttonBox = await range.boundingBox();
      expect(priceBox!.width).toBeGreaterThan(120);
      expect(Math.abs(priceBox!.y - buttonBox!.y)).toBeLessThan(2);
      expect(Math.abs(priceBox!.height - buttonBox!.height)).toBeLessThan(2);
      if (width <= 650) {
        expect(quantityBox!.y).toBeGreaterThan(priceBox!.y + priceBox!.height);
        expect(Math.abs(quantityBox!.x - priceBox!.x)).toBeLessThan(2);
      } else {
        expect(Math.abs(quantityBox!.y - priceBox!.y)).toBeLessThan(2);
      }
      await price.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `/tmp/price-range-${width}-${theme}.png`,
        fullPage: true,
      });
      await price.fill("400-");
      await expect.poll(() => job.draft.fields.price).toBe("400-");
      await page.goto(`/lists?draft=${job.id}`);
      await page
        .getByRole("dialog")
        .getByText("More details", { exact: true })
        .click();
      await expect(price).toHaveValue("400-");
      await price.fill("400-700");
      await page
        .getByRole("button", { name: "Add to wish list", exact: true })
        .click();
      await expect.poll(() => saved.length).toBe(1);
      expect(saved[0]).toMatchObject({
        priceCents: 40000,
        priceMaxCents: 70000,
      });
    });
  }
}
