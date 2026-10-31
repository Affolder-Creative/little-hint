import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { preferences, world, stamp } from "../src/server/domain";
import { smsInfo } from "../src/server/sms-provider";
import { telegramInfo } from "../src/server/channel-availability";
import { adminUsage } from "../src/server/usage";
import { serviceStatuses } from "../src/server/service-status";

async function setup(
  page: Page,
  sms: boolean,
  telegram: boolean,
  connected = true,
) {
  const f = stagingFixtures(),
    actor = f.actors[0];
  f.state.people.find((p) => p.userId === actor.id)!.admin = true;
  const prefs = preferences(f.state, actor);
  if (!f.state.preferences.includes(prefs)) f.state.preferences.push(prefs);
  Object.assign(prefs, {
    sms: connected,
    telegram: connected,
    smsLogin: connected,
    phone: connected ? "+12025550123" : undefined,
    phoneVerified: connected,
    chatId: connected ? "123" : undefined,
    notificationDetails: { telegram: true, push: false, email: false },
    channelEvents: {
      email: ["exchange"],
      telegram: ["wishlist"],
      sms: ["exchange"],
    },
  });
  f.state.follows.push({
    ...stamp(),
    userId: actor.id,
    target: "group",
    targetId: f.state.groups[0].id,
    channels: ["telegram"],
  });
  const cfg = {
    SMS_ENABLED: String(sms),
    SMS_PROVIDER: "textbelt",
    TEXTBELT_API_KEY: "fixture",
    TELEGRAM_ENABLED: String(telegram),
    TELEGRAM_BOT_TOKEN: "fixture",
    TELEGRAM_BOT_NAME: "fixture_bot",
    PAID_DAILY_LIMIT: "50",
    GIFT_DISCOVERY_MODE: "off",
    SCRAPING_PROVIDER: "none",
  };
  const saved: Record<string, any>[] = [];
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname.replace("/api/v1/", "");
    if (path === "world")
      return r.fulfill({
        json: {
          ...world(f.state, actor),
          sms: smsInfo(cfg),
          telegram: telegramInfo(cfg),
          environment: "test",
        },
      });
    if (path === "preferences" || path === "follows") {
      saved.push(r.request().postDataJSON());
      return r.fulfill({ json: { ok: true } });
    }
    if (path === "admin/jobs")
      return r.fulfill({
        json: {
          workerLastSeen: null,
          backupProvider: "not configured",
          imports: [],
          notifications: [],
        },
      });
    if (path === "push")
      return r.fulfill({ json: { publicKey: null, devices: [] } });
    if (path === "admin/usage")
      return r.fulfill({ json: adminUsage(f.state, cfg) });
    if (path === "admin/services")
      return r.fulfill({ json: serviceStatuses(cfg, false) });
    if (path === "notifications")
      return r.fulfill({ json: { entries: [], unreadCount: 0 } });
    return r.fulfill({ json: [] });
  });
  return { saved };
}

for (const width of [393, 1280]) {
  for (const [sms, telegram] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]) {
    test(`optional channels sms=${sms}, telegram=${telegram} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (theme) => localStorage.setItem("little-hint:theme", theme),
        width === 393 ? "dark" : "light",
      );
      const { saved } = await setup(page, sms, telegram);
      await page.goto("/settings?section=notifications");
      const section = page.locator(".notification-settings");
      await expect(
        section.getByRole("button", { name: "Manage phone & SMS sign-in" }),
      ).toHaveCount(sms ? 1 : 0);
      await expect(section.locator('input[name="telegram"]')).toHaveCount(
        telegram ? 1 : 0,
      );
      await section
        .locator("summary")
        .filter({ hasText: /^Customize topics/ })
        .click();
      await expect(section.locator('input[name="smsEvents"]')).toHaveCount(
        sms ? 9 : 0,
      );
      await expect(section.locator('input[name="telegramEvents"]')).toHaveCount(
        telegram ? 9 : 0,
      );
      const topics = section
        .locator("summary")
        .filter({ hasText: /^Customize topics/ });
      if (!sms) await expect(topics).not.toContainText("Text messages");
      if (!telegram) await expect(topics).not.toContainText("Telegram");
      const privacy = section
        .locator("summary")
        .filter({ hasText: /^Preview privacy/ });
      await privacy.click();
      await expect(section.locator('input[name="details-sms"]')).toHaveCount(0);
      await expect(
        section.locator('input[name="details-telegram"]'),
      ).toHaveCount(telegram ? 1 : 0);
      if (!telegram)
        await expect(privacy).toContainText("Details hidden on all channels");
      if (!sms) await expect(section).not.toContainText("SMS");
      if (!telegram) await expect(section).not.toContainText("Telegram");
      await section
        .getByRole("button", { name: "Save notification preferences" })
        .click();
      await expect(section.getByRole("status")).toHaveText(
        "Notification preferences saved.",
      );
      const body = saved[0];
      for (const [channel, available] of [
        ["sms", sms],
        ["telegram", telegram],
      ] as const) {
        expect(Object.hasOwn(body, channel)).toBe(available);
        expect(Object.hasOwn(body.channelEvents, channel)).toBe(available);
        if (!available)
          expect(Object.hasOwn(body.notificationDetails, channel)).toBe(false);
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (sms === telegram) {
        await topics.click();
        await privacy.click();
        await page.evaluate(() => {
          (document.activeElement as HTMLElement)?.blur();
          window.scrollTo(0, 0);
        });
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.screenshot({
          path: `test-results/channels-${width}-${sms ? "enabled" : "disabled"}.png`,
          fullPage: true,
        });
      }
      await section
        .getByRole("button", { name: /^Edit notifications for/ })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("checkbox", { name: "Telegram", exact: true }),
      ).toHaveCount(telegram ? 1 : 0);
      if (!telegram) await expect(dialog).not.toContainText("Telegram");
      await dialog
        .getByRole("checkbox", { name: "Email", exact: true })
        .check();
      await dialog
        .getByRole("button", { name: "Save follow settings" })
        .click();
      // Hidden custom choices remain in the draft; the server separately enforces preservation.
      expect(saved.at(-1)?.channels).toContain("telegram");
    });
  }
}
test("available but unconnected channels retain their setup actions", async ({
  page,
}) => {
  await setup(page, true, true, false);
  await page.goto("/settings?section=notifications");
  await expect(
    page.getByRole("button", { name: "Link Telegram" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage phone & SMS sign-in" }),
  ).toBeVisible();
  await expect(page.locator('input[name="telegram"]')).toBeDisabled();
  await expect(page.locator('input[name="sms"]')).toBeDisabled();
});
test("unused disabled usage disappears while administrator diagnostics remain", async ({
  page,
}) => {
  await setup(page, false, false);
  await page.goto("/settings?section=admin");
  await expect(
    page.getByRole("region", { name: "This month's usage" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Service status", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Enable Telegram in the deployment environment to offer it to users.",
    ),
  ).toBeVisible();
});
