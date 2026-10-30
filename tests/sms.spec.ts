import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world, preferences } from "../src/server/domain";
import { smsNotificationConsent } from "../src/shared/sms";
import { smsInfo } from "../src/server/sms-provider";
import { adminUsage } from "../src/server/usage";
const cfg = {
  SMS_PROVIDER: "textbelt",
  TEXTBELT_API_KEY: "fixture",
  PAID_DAILY_LIMIT: "50",
  GIFT_DISCOVERY_MODE: "off",
  SMS_ALLOWED_EVENTS: "exchange,access",
  SMS_MONTHLY_LIMIT: "100",
  SMS_USER_DAILY_LIMIT: "2",
  SMS_CREDIT_RESERVE: "20",
};
for (const width of [393, 1280]) {
  test(`SMS sign-in provides generic feedback, cooldown and email recovery at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/world", (r) =>
      r.fulfill({ status: 401, json: { error: "Sign in" } }),
    );
    await page.route("**/api/v1/sms-info", (r) =>
      r.fulfill({ json: smsInfo(cfg) }),
    );
    await page.route("**/api/auth/sms/send-code", (r) =>
      r.fulfill({
        json: { challenge: "98bab26e-e391-4c0d-aed1-a77df8e08f84" },
      }),
    );
    await page.route("**/api/auth/sms/sign-in", (r) =>
      r.fulfill({ status: 400, json: { message: "Invalid code" } }),
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: "Sign in with a text code" })
      .click();
    await page.getByLabel("US mobile number").fill("+12025550123");
    await page
      .getByRole("button", { name: "Send sign-in code", exact: true })
      .click();
    await expect(
      page.getByText(/If \+12025550123 has SMS sign-in enabled/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Resend text code/ }),
    ).toBeDisabled();
    await page.getByLabel("Six-digit text code").fill("111111");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Use email or a passkey",
    );
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/sms-login-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Use email or a passkey", exact: true })
      .click();
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
  });
  test(`SMS settings separate consent and show quota at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const f = stagingFixtures(),
      actor = f.actors[0];
    f.state.people.find((p) => p.userId === actor.id)!.admin = true;
    const prefs = preferences(f.state, actor);
    if (!f.state.preferences.includes(prefs)) f.state.preferences.push(prefs);
    Object.assign(prefs, {
      sms: false,
      smsLogin: false,
      phone: undefined,
      phoneVerified: false,
    });
    const requests: Array<{ path: string; body: any }> = [];
    await page.route("**/api/**", async (r) => {
      const path = new URL(r.request().url()).pathname.replace("/api/v1/", "");
      if (path === "world")
        return r.fulfill({
          json: {
            ...world(f.state, actor),
            sms: smsInfo(cfg),
            environment: "test",
          },
        });
      if (path === "push")
        return r.fulfill({ json: { publicKey: null, devices: [] } });
      if (path === "admin/usage")
        return r.fulfill({ json: adminUsage(f.state, cfg) });
      if (
        path === "admin/services" ||
        path === "admin/settings" ||
        path.includes("list-sessions") ||
        path.includes("list-user-passkeys")
      )
        return r.fulfill({ json: [] });
      if (path === "admin/jobs")
        return r.fulfill({ json: { imports: [], notifications: [] } });
      if (path.startsWith("channels/sms/")) {
        requests.push({ path, body: r.request().postDataJSON() });
        if (path === "channels/sms/verify")
          Object.assign(prefs, {
            phone: "+12025550123",
            phoneVerified: true,
            sms: false,
            smsLogin: false,
          });
        if (path === "channels/sms/login")
          prefs.smsLogin = r.request().postDataJSON().enabled;
        return r.fulfill({
          json: { ok: true, challenge: "98bab26e-e391-4c0d-aed1-a77df8e08f84" },
        });
      }
      return r.fulfill({
        status: 404,
        json: { error: "Fixture route unavailable" },
      });
    });
    await page.goto("/settings?section=notifications");
    await expect(
      page.getByRole("checkbox", { name: /Text messages/ }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Manage phone & SMS sign-in" })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: "Send email confirmation code" })
      .click();
    await dialog.getByLabel("Six-digit code").fill("123456");
    await dialog
      .getByRole("button", { name: "Verify code", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Link phone number" }).click();
    await dialog.getByLabel("US mobile number").fill("+12025550123");
    await expect(dialog.getByRole("checkbox")).not.toBeChecked();
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Send verification code" })
      .click();
    await dialog.getByLabel("Six-digit code").fill("123456");
    await dialog
      .getByRole("button", { name: "Verify code", exact: true })
      .click();
    await expect(dialog.getByRole("checkbox")).not.toBeChecked();
    await expect(dialog).toContainText("recurring text updates are still off");
    const a11y = await new AxeBuilder({ page }).analyze();
    expect(a11y.violations).toEqual([]);
    await page.screenshot({
      path: `test-results/sms-settings-${width}.png`,
      fullPage: true,
    });
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByRole("button", { name: "Save SMS sign-in choice" })
      .click();
    await expect(dialog).not.toBeVisible();
    expect(requests.find((r) => r.path === "channels/sms/login")?.body).toEqual(
      { enabled: true, consent: true },
    );
    await expect(
      page.getByRole("checkbox", { name: /Text messages/ }),
    ).not.toBeChecked();
    await expect(
      page.getByText(smsNotificationConsent, { exact: false }),
    ).toBeVisible();
    await page.goto("/settings?section=admin");
    const usage = page.getByRole("region", { name: "SMS", exact: true });
    await expect(usage).toBeVisible();
    await expect(usage).toContainText("Unavailable");
    await expect(usage).toContainText("0 / 100");
    await page.screenshot({
      path: `test-results/sms-usage-${width}.png`,
      fullPage: true,
    });
  });
}
