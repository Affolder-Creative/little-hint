import { test, expect, type Page } from "@playwright/test";

const pendingKey = "little-hint:pending-sign-in";
const sendPath = "**/api/auth/email-otp/send-verification-otp";
const verifyPath = "**/api/auth/sign-in/email-otp";
async function signedOut(page: Page) {
  await page.route("**/api/v1/world", (route) =>
    route.fulfill({ status: 401, json: { error: "Sign in required." } }),
  );
  await page.route(sendPath, (route) =>
    route.fulfill({ json: { success: true } }),
  );
  await page.goto("/");
}
async function send(page: Page) {
  await page
    .getByLabel("Email address", { exact: true })
    .fill("alex@example.test");
  await page
    .getByRole("button", { name: "Send me a code", exact: true })
    .click();
  await expect(page.getByLabel("Six-digit code")).toBeFocused();
}

test("code entry survives polling intervals, tab switches and a same-tab reload", async ({
  page,
  context,
}) => {
  await page.clock.install();
  await signedOut(page);
  await send(page);
  await expect(page.getByLabel("Six-digit code")).toHaveValue("");
  await page.getByLabel("Six-digit code").fill("123456");
  await page.clock.fastForward(61000);
  const other = await context.newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await page.bringToFront();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByLabel("Six-digit code")).toHaveValue("123456");
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("You're offline");
  await expect(page.getByLabel("Six-digit code")).toHaveValue("123456");
  await context.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel("Six-digit code")).toHaveValue("");
  await expect(
    page.getByText(
      "If alex@example.test has an account or active invitation, we’ll email a sign-in code. Enter it below.",
    ),
  ).toBeVisible();
  const stored = await page.evaluate(
    (key) => JSON.parse(sessionStorage.getItem(key)!),
    pendingKey,
  );
  expect(Object.keys(stored).sort()).toEqual(["email", "requestedAt"]);
  await page.clock.fastForward(10 * 60 * 1000);
  await expect(
    page.getByText("This code has expired. Resend a code below."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Six-digit code")).toBeVisible();
  await other.close();
});

test("failed resend preserves code, successful resend clears it, and changing email clears recovery", async ({
  page,
}) => {
  await signedOut(page);
  await send(page);
  await page.getByLabel("Six-digit code").fill("123456");
  await page.route(sendPath, (route) =>
    route.fulfill({ status: 429, json: { code: "TOO_MANY_REQUESTS" } }),
  );
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Wait a minute");
  await expect(page.getByLabel("Six-digit code")).toHaveValue("123456");
  await page.unroute(sendPath);
  await page.route(sendPath, (route) =>
    route.fulfill({ json: { success: true } }),
  );
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "If this address has an account or active invitation, we’ll email a new code.",
  );
  await expect(page.getByLabel("Six-digit code")).toHaveValue("");
  await page.getByRole("button", { name: "Change email", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "alex@example.test",
  );
  expect(
    await page.evaluate((key) => sessionStorage.getItem(key), pendingKey),
  ).toBeNull();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("invalid and expired code responses keep recovery controls available", async ({
  page,
}) => {
  await signedOut(page);
  await send(page);
  await page.route(verifyPath, (route) =>
    route.fulfill({ status: 400, json: { code: "INVALID_OTP" } }),
  );
  await page.getByLabel("Six-digit code").fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Check the six digits");
  await expect(page.getByLabel("Six-digit code")).toHaveValue("000000");
  await page.route(verifyPath, (route) =>
    route.fulfill({ status: 400, json: { code: "OTP_EXPIRED" } }),
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("expired");
  await expect(
    page.getByRole("button", { name: "Resend code", exact: true }),
  ).toBeEnabled();
});

test("send failures preserve the address and storage failures do not block code entry", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new Error("Storage blocked");
      },
    }),
  );
  await signedOut(page);
  await page.route(sendPath, (route) => route.abort("failed"));
  await page
    .getByLabel("Email address", { exact: true })
    .fill("alex@example.test");
  await page
    .getByRole("button", { name: "Send me a code", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(
    "alex@example.test",
  );
  await page.unroute(sendPath);
  await page.route(sendPath, (route) =>
    route.fulfill({ json: { success: true } }),
  );
  await page
    .getByRole("button", { name: "Send me a code", exact: true })
    .click();
  await expect(page.getByLabel("Six-digit code")).toHaveValue("");
});
