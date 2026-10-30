import { test, expect } from "@playwright/test";

test.skip(process.env.E2E_BUILT !== "1", "Requires a production build");
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 401, json: { error: "Sign in" } }),
  );
  await page.addInitScript(() => {
    const container = new EventTarget();
    const worker = Object.assign(new EventTarget(), {
      state: "installed",
      postMessage: () => {
        sessionStorage.setItem(
          "update-messages",
          String(Number(sessionStorage.getItem("update-messages")) + 1),
        );
      },
    });
    const registration = Object.assign(new EventTarget(), {
      waiting: worker as any,
      installing: null,
      update: async () => {},
    });
    Object.assign(container, {
      controller: {},
      register: async () => registration,
    });
    Object.defineProperty(navigator, "serviceWorker", { value: container });
    (window as any).activateUpdate = () => {
      worker.state = "activated";
      registration.waiting = null;
      Object.assign(container, { controller: worker });
      container.dispatchEvent(new Event("controllerchange"));
    };
  });
});
test("an update activated elsewhere waits for this tab's click, then reloads", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Update now" })).toBeVisible();
  await page.evaluate(() => (window as any).activateUpdate());
  await expect(page.getByRole("button", { name: "Update now" })).toBeEnabled();
  await Promise.all([
    page.waitForEvent("framenavigated"),
    page.getByRole("button", { name: "Update now" }).click(),
  ]);
  expect(
    await page.evaluate(() => sessionStorage.getItem("update-messages")),
  ).toBeNull();
});
test("activation reloads once, and dirty forms block the request", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Update now" })).toBeVisible();
  await page.evaluate(() => {
    const f = document.createElement("form");
    f.dataset.dirty = "true";
    f.id = "dirty-test";
    document.body.append(f);
  });
  await page.getByRole("button", { name: "Update now" }).click();
  await expect(
    page.getByText("Finish saving or close your form before updating."),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("update-messages")),
  ).toBeNull();
  await page.evaluate(() => document.getElementById("dirty-test")!.remove());
  await page.getByRole("button", { name: "Update now" }).click();
  await expect(page.getByRole("button", { name: "Updating…" })).toBeDisabled();
  await Promise.all([
    page.waitForEvent("framenavigated"),
    page.evaluate(() => (window as any).activateUpdate()),
  ]);
  expect(
    await page.evaluate(() => sessionStorage.getItem("update-messages")),
  ).toBe("1");
});
test("activation timeout restores a retry action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Update now" })).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "Update now" }).click();
  await page.clock.fastForward(10001);
  await expect(page.getByRole("button", { name: "Update now" })).toBeEnabled();
  await expect(
    page.getByText("The update did not finish. Try Update now again."),
  ).toBeVisible();
});

test("first installation does not announce an app update", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(navigator.serviceWorker, { controller: null });
  });
  await page.goto("/");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update now" })).toHaveCount(0);
});
