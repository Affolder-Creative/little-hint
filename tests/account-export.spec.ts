import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world } from "../src/server/domain";
test("downloads JSON and lets users retry a failed export on mobile", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 393, height: 900 });
  const f = stagingFixtures();
  let fail = true;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/world"))
      return route.fulfill({
        json: { ...world(f.state, f.actors[0]), environment: "test" },
      });
    if (path.endsWith("/account/export"))
      return fail
        ? route.fulfill({
            status: 503,
            json: { error: "Export unavailable. Try again." },
          })
        : route.fulfill({
            json: {
              format: "little-hint-personal-data",
              account: { name: "Alex" },
            },
          });
    if (path.endsWith("/push"))
      return route.fulfill({ json: { publicKey: null, devices: [] } });
    if (path.includes("list-sessions") || path.includes("list-user-passkeys"))
      return route.fulfill({ json: [] });
    return route.fulfill({
      status: 404,
      json: { error: "Unavailable in fixture" },
    });
  });
  await page.goto("/settings?section=device");
  await page.getByRole("button", { name: "Download my data" }).click();
  await expect(page.getByRole("alert")).toContainText("Export unavailable");
  fail = false;
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("little-hint-personal-data.json");
  expect(
    JSON.parse(await readFile((await file.path())!, "utf8")).account.name,
  ).toBe("Alex");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("heading", { name: "Export your data" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("export-mobile.png") });
});
