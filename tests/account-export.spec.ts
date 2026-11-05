import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { accountCsv } from "../src/server/account-csv";
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
            json:
              route.request().postDataJSON()?.format === "csv"
                ? accountCsv(
                    f.state,
                    f.actors[0],
                    route.request().postDataJSON().table,
                  )
                : {
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
  await page.getByLabel("Export format").selectOption("csv");
  for (const table of ["wishes", "buying", "spending"]) {
    await page.getByLabel("CSV table").selectOption(table);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download CSV", exact: true })
      .click();
    const result = await download;
    expect(result.suggestedFilename()).toBe(`little-hint-${table}.csv`);
    const text = await readFile((await result.path())!, "utf8");
    expect(text.startsWith('\uFEFF"Type"')).toBe(true);
    expect(text).toContain("\r\n");
  }
  for (const width of [393, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const exportSection = page.getByRole("region", {
      name: "Export your data",
    });
    const layout = await exportSection.evaluate((element) => {
      const style = getComputedStyle(element);
      const heading = element.querySelector("h2")!;
      const signOut = document.querySelector(".settings-sign-out h2")!;
      const help = element
        .querySelector("#account-csv-help")!
        .getBoundingClientRect();
      const select = element
        .querySelector('[aria-describedby="account-csv-help"]')!
        .getBoundingClientRect();
      const button = element.querySelector("button")!.getBoundingClientRect();
      return {
        helpGap: help.top - select.bottom,
        buttonGap: button.top - help.bottom,
        margin: parseFloat(style.marginTop),
        padding: parseFloat(style.paddingTop),
        border: parseFloat(style.borderTopWidth),
        headingSize: getComputedStyle(heading).fontSize,
        otherHeadingSize: getComputedStyle(signOut).fontSize,
      };
    });
    expect(layout.helpGap).toBeGreaterThanOrEqual(16);
    expect(layout.buttonGap).toBeGreaterThanOrEqual(16);
    expect(layout.margin).toBeGreaterThanOrEqual(40);
    expect(layout.padding).toBeGreaterThanOrEqual(24);
    expect(layout.border).toBe(1);
    expect(layout.headingSize).toBe(layout.otherHeadingSize);
    await exportSection.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`export-${width}.png`) });
  }
});
