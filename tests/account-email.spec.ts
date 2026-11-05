import { test, expect } from "@playwright/test";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world } from "../src/server/domain";
import { expectDialogFieldsToFit } from "./browser-helpers";

test("email change verifies both addresses and keeps failed codes recoverable", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 393, height: 900 });
  const f = stagingFixtures();
  let fail = true;
  const calls: { path: string; body: any }[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/world"))
      return route.fulfill({
        json: { ...world(f.state, f.actors[0]), environment: "test" },
      });
    if (path.endsWith("/push"))
      return route.fulfill({ json: { publicKey: null, devices: [] } });
    if (path.includes("list-sessions") || path.includes("list-user-passkeys"))
      return route.fulfill({ json: [] });
    if (path.includes("/email-otp/")) {
      calls.push({ path, body: route.request().postDataJSON() });
      if (path.endsWith("/request-email-change") && fail)
        return route.fulfill({
          status: 400,
          json: { code: "INVALID_OTP", message: "Invalid code. Try again." },
        });
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Unavailable in fixture" },
    });
  });
  await page.goto("/settings?section=security");
  await page.getByRole("button", { name: "Change email", exact: true }).click();
  await page.getByLabel("New email address").fill("New@example.test");
  await page.getByRole("button", { name: "Send current email code" }).click();
  expect(calls.at(-1)?.body).toEqual({
    email: f.actors[0].email,
    type: "email-verification",
  });
  await page.getByLabel("Current email code").fill("123456");
  await page.getByRole("button", { name: "Verify current email" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid code");
  fail = false;
  await page.getByRole("button", { name: "Verify current email" }).click();
  await expect(page.getByLabel("New email code")).toBeVisible();
  expect(calls.at(-1)?.body).toEqual({
    newEmail: "new@example.test",
    otp: "123456",
  });
  await expect(page.getByRole("dialog")).toContainText("new@example.test");
  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectDialogFieldsToFit(page);
    const confirm = await page
      .getByRole("button", { name: "Confirm new email", exact: true })
      .boundingBox();
    const cancel = await page
      .getByRole("button", { name: "Cancel", exact: true })
      .boundingBox();
    const restart = await page
      .getByRole("button", { name: "Start over or request a new code" })
      .boundingBox();
    expect(Math.abs(confirm!.y - cancel!.y)).toBeLessThanOrEqual(1);
    expect(cancel!.x).toBeGreaterThan(confirm!.x + confirm!.width);
    expect(restart!.y).toBeGreaterThan(confirm!.y + confirm!.height);
    expect(
      Math.abs(
        restart!.x +
          restart!.width / 2 -
          (confirm!.x + cancel!.x + cancel!.width) / 2,
      ),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath(`email-change-${width}.png`),
    });
  }
  await page
    .getByRole("button", { name: "Start over or request a new code" })
    .click();
  await expect(page.getByLabel("New email address")).toHaveValue(
    "new@example.test",
  );
});
