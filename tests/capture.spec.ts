import { test, expect } from "@playwright/test";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world } from "../src/server/domain";

for (const width of [393, 1440])
  test(`capture survives sign-in and reviews a failed import at ${width}px`, async ({
    page,
  }, info) => {
    const { state, actors } = stagingFixtures();
    const actor = actors[0];
    let signedIn = false;
    let imports = 0;
    let saves = 0;
    let job: any;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/world")
        return signedIn
          ? route.fulfill({
              json: {
                ...world(state, actor, true, true),
                productLookupEnabled: true,
                spendingAvailable: false,
              },
            })
          : route.fulfill({
              status: 401,
              json: { error: "Sign in required." },
            });
      if (path === "/api/auth/sign-in/email-otp") {
        signedIn = true;
        return route.fulfill({ json: { user: { id: actor }, session: {} } });
      }
      if (path === "/api/v1/imports") {
        imports++;
        const body = route.request().postDataJSON();
        job = {
          id: "capture-import",
          url: body.url,
          status: "failed",
          error: "Shop unavailable. Enter details manually.",
          draft: { ...body.draft, state: "active", revision: 1 },
        };
        return route.fulfill({ json: job });
      }
      if (path === "/api/v1/imports/capture-import")
        return route.fulfill({ json: job });
      if (path === "/api/v1/imports/update")
        return route.fulfill({ json: job });
      if (path === "/api/v1/items" && route.request().method() === "POST") {
        saves++;
        return route.fulfill({
          json: { id: "captured", ...route.request().postDataJSON() },
        });
      }
      return route.fulfill({ json: { success: true } });
    });
    await page.setViewportSize({ width, height: 900 });
    const path =
      "/capture?text=" +
      encodeURIComponent("Love this https://shop.example/product?size=4") +
      "&title=Birthday%20idea";
    await page.goto(path);
    await page
      .getByLabel("Email address", { exact: true })
      .fill("alex@example.test");
    await page
      .getByRole("button", { name: "Send me a code", exact: true })
      .click();
    await expect(page.getByLabel("Six-digit code")).toBeVisible();
    await page.reload();
    await page.getByLabel("Six-digit code").fill("123456");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Capture a product" }),
    ).toBeVisible();
    await expect(page.getByLabel("Product link or shared text")).toHaveValue(
      "https://shop.example/product?size=4",
    );
    expect(imports).toBe(0);
    await page.screenshot({
      path: info.outputPath(`capture-${width}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Review item", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Product link (optional)")).toHaveValue(
      "https://shop.example/product?size=4",
    );
    await expect(
      dialog.getByText("Shop unavailable. Enter details manually."),
    ).toBeVisible();
    expect(imports).toBe(1);
    await expect(
      dialog.getByRole("button", { name: "Save for later", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`capture-review-${width}.png`),
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Add to wish list", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(saves).toBe(1);
    await expect(page.getByLabel("Product link or shared text")).toHaveValue(
      "",
    );
    await expect(page).toHaveURL(/\/capture$/);
  });

test("paste fallback rejects extra links and makes no automatic requests", async ({
  page,
}) => {
  const { state, actors } = stagingFixtures();
  let imports = 0;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/imports") imports++;
    return route.fulfill({
      json:
        path === "/api/v1/world"
          ? { ...world(state, actors[0], true, true), spendingAvailable: false }
          : {},
    });
  });
  await page.goto("/capture");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: async () => {
          throw new Error("Denied");
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Paste link", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Press and hold");
  await page
    .getByLabel("Product link or shared text")
    .fill("https://one.example https://two.example");
  await page.getByRole("button", { name: "Review item", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Remove any extra links");
  expect(imports).toBe(0);
});

test("manual capture preserves duplicate protection and prevents double saves", async ({
  page,
}) => {
  const { state, actors } = stagingFixtures();
  let writes = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/world")
      return route.fulfill({
        json: {
          ...world(state, actors[0], true, true),
          productLookupEnabled: false,
          spendingAvailable: false,
        },
      });
    if (path === "/api/v1/items" && route.request().method() === "POST") {
      writes++;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return route.fulfill({
        json:
          writes === 1
            ? {
                duplicate: {
                  id: "existing",
                  title: "Existing gift",
                  listId: "list",
                },
              }
            : { id: "new-item" },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/capture?url=https://shop.example/item&title=New%20gift");
  await page.getByRole("button", { name: "Review item", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const save = dialog.getByRole("button", {
    name: "Add to wish list",
    exact: true,
  });
  await save.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(
    dialog.getByText(/This looks like something already saved/),
  ).toBeVisible();
  expect(writes).toBe(1);
  await expect(save).toBeDisabled();
  await dialog.getByLabel("Save separately with its own gift plans").check();
  await save.click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toBe(2);
});

test("capture can save a private gift idea without owning a wish list", async ({
  page,
}) => {
  const { state, actors } = stagingFixtures();
  const snapshot = world(state, actors[0], true, true);
  const recipient = snapshot.people.find(
    (p) => p.userId !== snapshot.me.id && !p.guardians.includes(snapshot.me.id),
  )!;
  let payload: any;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/world")
      return route.fulfill({
        json: {
          ...snapshot,
          lists: [],
          productLookupEnabled: false,
          spendingAvailable: false,
          spendingEnabled: false,
        },
      });
    if (path === "/api/v1/items" && route.request().method() === "POST") {
      payload = route.request().postDataJSON();
      return route.fulfill({ json: { id: "idea" } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(
    "/capture?url=https://shop.example/item&title=Private%20idea",
  );
  await expect(
    page.getByRole("button", { name: "Create a wish list", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Save to", { exact: true }).selectOption(recipient.id);
  await page
    .getByRole("button", { name: "Review gift idea", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Save gift idea", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(payload.recipientIds).toEqual([recipient.id]);
  expect(payload.visibility).toBe("private");
});

test("successful lookup fills details and preserves the user's title", async ({
  page,
}) => {
  const { state, actors } = stagingFixtures();
  let job: any;
  let finish = false;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/world")
      return route.fulfill({
        json: {
          ...world(state, actors[0], true, true),
          productLookupEnabled: true,
          spendingAvailable: false,
        },
      });
    if (path === "/api/v1/imports") {
      const payload = route.request().postDataJSON();
      job = {
        id: "successful-capture",
        url: payload.url,
        status: "pending",
        draft: { ...payload.draft, state: "active", revision: 1 },
      };
      return route.fulfill({ json: job });
    }
    if (path === "/api/v1/imports/successful-capture")
      return route.fulfill({
        json: {
          ...job,
          ...(finish
            ? {
                status: "complete",
                result: {
                  title: "Shop title",
                  description: "Product description",
                  priceCents: 1599,
                },
              }
            : {}),
        },
      });
    if (path === "/api/v1/imports/update") return route.fulfill({ json: job });
    return route.fulfill({ json: {} });
  });
  await page.goto("/capture?url=https://shop.example/item");
  await page.getByRole("button", { name: "Review item", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Item name", { exact: true }).fill("My chosen name");
  finish = true;
  await expect(
    dialog.getByText("Details found. Check them before saving."),
  ).toBeVisible();
  await expect(dialog.getByLabel("Item name", { exact: true })).toHaveValue(
    "My chosen name",
  );
  await expect(
    dialog.getByRole("button", { name: "Save for later", exact: true }),
  ).toBeVisible();
});
