import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world, command } from "../src/server/domain";
import { emptyState } from "../src/shared/model";
import { adminUsage } from "../src/server/usage";
import { addDiscoveryUsage, quotaKeys } from "../src/server/gift-discovery";

test.use({ viewport: { width: 393, height: 900 } });

async function setup(
  page: Page,
  options: {
    locked?: boolean;
    restricted?: boolean;
    solo?: boolean;
    admin?: boolean;
  } = {},
) {
  const f = stagingFixtures();
  const actor = f.actors[0];
  const person = f.state.people.find((p) => p.userId === actor.id)!;
  person.admin = options.admin !== false;
  if (options.solo) {
    Object.assign(f.state, emptyState());
    f.state.people.push(person);
  }
  const settings = [
    {
      key: "AUTO_IMPORT_PRODUCT_PHOTOS",
      value: "false",
      source: "settings",
      configured: true,
    },
    ...["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].map(
      (key) => ({ key, value: "", source: "environment", configured: true }),
    ),
    {
      key: "FAMILY_GROUP_CREATION",
      value: options.restricted ? "admins" : "everyone",
      source: "settings",
    },
    {
      key: "GIFT_DISCOVERY_MODE",
      value: "both",
      source: options.locked ? "environment" : "settings",
    },
    {
      key: "GIFT_DISCOVERY_USER_WEEKLY_LIMIT",
      value: "3",
      source: options.locked ? "environment" : "settings",
    },
    {
      key: "GIFT_DISCOVERY_MONTHLY_LIMIT",
      value: "100",
      source: "environment",
    },
    {
      key: "GIFT_DISCOVERY_MODEL",
      value: "gpt-6-luna",
      source: options.locked ? "environment" : "settings",
    },
  ];
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  addDiscoveryUsage(f.state, quotaKeys(actor.id).month, 12);
  addDiscoveryUsage(f.state, quotaKeys(actor.id).monthExempt, 2);
  for (const [key, count] of [
    [`discovery:metrics:${month}:gpt-6-luna:reported`, 11],
    [`discovery:metrics:${month}:gpt-6-luna:input`, 12000],
    [`discovery:metrics:${month}:gpt-6-luna:output`, 3000],
    [`discovery:metrics:${month}:gpt-6-luna:searches`, 18],
    [`${month}-01:openai`, 7],
    [`imports:metrics:${month}:gpt-6-luna:reported`, 5],
    [`imports:metrics:${month}:gpt-6-luna:input`, 3200],
    [`imports:metrics:${month}:gpt-6-luna:output`, 800],
    [`${month}-01:scrapingfish`, 4],
  ] as const)
    addDiscoveryUsage(f.state, key, count);
  const state = {
    failSave: false,
    failUsage: false,
    visible: true,
    lastBatch: [] as Array<{ key: string; value: string }>,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/",
      "",
    );
    if (path === "world")
      return route.fulfill({
        json: {
          ...world(f.state, actor),
          canCreateGroups: !options.restricted || person.admin,
          environment: "development",
        },
      });
    if (path === "admin/settings") {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        settings.find((s) => s.key === body.key)!.value = body.value;
      }
      return route.fulfill({ json: settings });
    }
    if (path === "admin/settings/batch") {
      state.lastBatch = route.request().postDataJSON().settings;
      if (state.failSave)
        return route.fulfill({
          status: 400,
          json: { error: "Could not save these settings. Try again." },
        });
      for (const entry of state.lastBatch)
        settings.find((s) => s.key === entry.key)!.value = entry.value;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "admin/usage") {
      if (state.failUsage)
        return route.fulfill({ status: 400, json: { error: "Try again" } });
      return route.fulfill({
        json: {
          ...adminUsage(f.state, {
            GIFT_DISCOVERY_MODE: "both",
            OPENAI_API_KEY: "synthetic",
            PAID_DAILY_LIMIT: "50",
            SCRAPINGFISH_API_KEY: "synthetic",
          }),
          visible: state.visible,
        },
      });
    }
    if (path === "admin/jobs")
      return route.fulfill({
        json: { workerLastSeen: Date.now(), imports: [], notifications: [] },
      });
    if (path === "push")
      return route.fulfill({ json: { publicKey: null, devices: [] } });
    if (path.includes("list-sessions") || path.includes("list-user-passkeys"))
      return route.fulfill({ json: [] });
    if (path === "people/update")
      return route.fulfill({
        json: command(
          f.state,
          actor,
          "people.update",
          route.request().postDataJSON(),
        ),
      });
    return route.fulfill({
      status: 404,
      json: { error: "Not in this fixture" },
    });
  });
  return { ...f, actor, person, settings, state };
}
test("settings changes save together, omit locked fields, and preserve failed drafts", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/settings?section=admin");
  const form = page.getByRole("region", {
    name: "AI gift suggestions",
    exact: true,
  });
  await expect(form.getByRole("button", { name: /Save/ })).toHaveCount(1);
  await form
    .getByLabel("AI gift suggestions", { exact: true })
    .selectOption("givers");
  await form.getByLabel("New searches per account each week").fill("6");
  await expect(
    form.getByLabel("Shared new-search allowance each month"),
  ).toBeDisabled();
  f.state.failSave = true;
  await form
    .getByRole("button", { name: "Save gift suggestion settings" })
    .click();
  await expect(form.getByRole("alert")).toContainText("Could not save");
  await expect(
    form.getByLabel("New searches per account each week"),
  ).toHaveValue("6");
  await page
    .getByLabel("Settings section", { exact: true })
    .selectOption("about");
  await page
    .getByLabel("Settings section", { exact: true })
    .selectOption("admin");
  await expect(
    form.getByLabel("New searches per account each week"),
  ).toHaveValue("6");
  f.state.failSave = false;
  await form
    .getByRole("button", { name: "Save gift suggestion settings" })
    .click();
  await expect(
    page.getByText("Gift suggestion settings saved.", { exact: true }),
  ).toBeVisible();
  expect(f.state.lastBatch).toEqual([
    { key: "GIFT_DISCOVERY_MODE", value: "givers" },
    { key: "GIFT_DISCOVERY_USER_WEEKLY_LIMIT", value: "6" },
  ]);
  await expect(
    form.getByRole("button", { name: "Save gift suggestion settings" }),
  ).toBeDisabled();
});
test("server-managed fields have no save button, usage retries and can be hidden", async ({
  page,
}) => {
  const f = await setup(page, { locked: true });
  f.state.failUsage = true;
  await page.goto("/settings?section=admin");
  const form = page.getByRole("region", {
    name: "AI gift suggestions",
    exact: true,
  });
  await expect(form.getByRole("button", { name: /Save/ })).toHaveCount(0);
  await expect(form).toContainText("managed on the server");
  await expect(page.getByRole("button", { name: "Retry usage" })).toBeVisible();
  f.state.failUsage = false;
  await page.getByRole("button", { name: "Retry usage" }).click();
  await expect(
    page.getByRole("region", { name: "This month's usage" }),
  ).toBeVisible();
  f.state.visible = false;
  await page.reload();
  await expect(form).toBeVisible();
  await expect(
    page.getByRole("region", { name: "This month's usage" }),
  ).toHaveCount(0);
});
test("restricted non-admins get invitation guidance instead of group creation actions", async ({
  page,
}) => {
  await setup(page, { restricted: true, solo: true, admin: false });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Create a family group", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/ask an app administrator to create a group/),
  ).toBeVisible();
  await page.goto("/settings?section=groups");
  await expect(
    page.getByRole("button", { name: "Create family group", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Ask an app administrator to create one/),
  ).toBeVisible();
});
test("preference shortcuts select the right tab and protect drafts on both pages", async ({
  page,
}) => {
  const f = await setup(page);
  for (const url of ["/settings?section=profile", `/people/${f.person.id}`]) {
    await page.goto(url);
    await page
      .getByRole("button", {
        name: `Gift preferences for ${f.person.name}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("tab", { name: "Gift preferences" }),
    ).toHaveAttribute("aria-selected", "true");
    await dialog.getByRole("tab", { name: "Profile", exact: true }).click();
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Draft name");
    await dialog
      .getByRole("tab", { name: "Gift preferences", exact: true })
      .click();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(
      page.getByText("Discard your changes?", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
  }
});
test.describe("settings visual review", () => {
  test.use({ hasTouch: true });
  for (const [width, theme] of [
    [320, "dark"],
    [393, "light"],
    [768, "light"],
    [1440, "dark"],
  ] as const) {
    test(`settings at ${width}px ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (theme) => localStorage.setItem("little-hint:theme", theme),
        theme,
      );
      const f = await setup(page);
      for (const section of ["profile", "groups", "about", "admin"]) {
        await page.goto(`/settings?section=${section}`);
        await expect(
          page.getByRole("heading", { name: "Settings", exact: true }),
        ).toBeVisible();
        if (section === "admin")
          await expect(
            page.getByRole("region", { name: "This month's usage" }),
          ).toBeVisible();
        if (section === "admin")
          await page.locator(".integration-group > summary").first().click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(`${section}.png`),
          fullPage: true,
        });
        if (section === "about" && width < 1100) {
          await page.locator(".settings-about").evaluate((element) => {
            window.scrollTo({
              top: window.scrollY + element.getBoundingClientRect().top - 100,
              behavior: "instant",
            });
          });
          await page.screenshot({
            path: info.outputPath("about-viewport.png"),
          });
        }
        if (section === "about" || section === "admin")
          expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
          );
      }
      await page.goto("/settings?section=profile");
      await page
        .getByRole("button", {
          name: `Gift preferences for ${f.person.name}`,
          exact: true,
        })
        .click();
      await page.screenshot({
        path: info.outputPath("preferences.png"),
        fullPage: true,
      });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
});

test("invitation confirmation shares the sign-in link and handles cancellation and copy failure", async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        (window as any).shared = data;
        throw new DOMException("Cancelled", "AbortError");
      },
    });
  });
  await page.route("**/api/v1/invitations", (route) =>
    route.fulfill({ json: { id: "invitation-test" } }),
  );
  await page.goto("/settings?section=invitations");
  await page
    .getByRole("button", { name: "Invite someone to Little Hint", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Email address")
    .fill("friend@example.test");
  await page
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("status")).toContainText(
    "waiting to be emailed",
  );
  await dialog.getByRole("button", { name: "Share sign-in link" }).click();
  expect(await page.evaluate(() => (window as any).shared.url)).toBe(
    new URL("/", page.url()).href,
  );
  await expect(dialog.getByLabel("Sign-in link", { exact: true })).toHaveCount(
    0,
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    });
  });
  await dialog.getByRole("button", { name: "Share sign-in link" }).click();
  await expect(
    dialog.getByRole("button", { name: "Copy sign-in link" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Copy sign-in link" }).click();
  await expect(
    dialog.getByLabel("Sign-in link", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("family invitation confirmation shares its deep link", async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => {
        (window as any).shared = data;
      },
    });
  });
  await page.route("**/api/v1/groups/invite", (route) =>
    route.fulfill({ json: { id: "family-invitation" } }),
  );
  await page.goto("/settings?section=groups");
  await page
    .getByRole("button", { name: "Invite someone", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email address").fill("relative@example.test");
  await dialog
    .getByRole("button", { name: "Send invitation", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Share sign-in link" }).click();
  expect(await page.evaluate(() => (window as any).shared.url)).toBe(
    new URL("/invite/family-invitation", page.url()).href,
  );
});
