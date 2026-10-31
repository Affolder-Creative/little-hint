import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world, command } from "../src/server/domain";
import { emptyState } from "../src/shared/model";
import { serviceStatuses } from "../src/server/service-status";
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
    lookup?: boolean;
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
    ...["PRODUCT_IMAGE_CACHE_ENABLED", "PRODUCT_IMAGE_PREFETCH_ENABLED"].map(
      (key) => ({
        key,
        value: "true",
        source: options.locked ? "environment" : "settings",
        configured: true,
      }),
    ),
    {
      key: "AUTO_IMPORT_PRODUCT_PHOTOS",
      value: "false",
      source: options.locked ? "environment" : "settings",
      configured: true,
    },
    {
      key: "FAMILY_GROUP_CREATION",
      value: options.restricted ? "admins" : "everyone",
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
    failServices: false,
    retried: false,
    failUsage: false,
    visible: true,
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
          productLookupEnabled: options.lookup !== false,
        },
      });
    if (path === "admin/settings") {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        for (const update of body.updates ?? [body])
          settings.find((s) => s.key === update.key)!.value = update.value;
      }
      return route.fulfill({ json: settings });
    }
    if (path === "admin/services")
      return state.failServices
        ? route.fulfill({ status: 500, json: { error: "Unavailable" } })
        : route.fulfill({
            json: serviceStatuses(
              {
                GIFT_DISCOVERY_MODE: "both",
                SCRAPING_PROVIDER: options.lookup === false ? "none" : "auto",
                GIFT_DISCOVERY_USER_WEEKLY_LIMIT: "3",
                GIFT_DISCOVERY_MONTHLY_LIMIT: "100",
                OPENAI_API_KEY: "synthetic",
                SMTP_HOST: "synthetic",
                PAID_DAILY_LIMIT: "50",
                SCRAPINGFISH_API_KEY: "synthetic",
              },
              false,
            ),
          });
    if (path === "admin/jobs/retry") {
      state.retried = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "admin/usage") {
      if (state.failUsage)
        return route.fulfill({ status: 400, json: { error: "Try again" } });
      return route.fulfill({
        json: {
          ...adminUsage(f.state, {
            GIFT_DISCOVERY_MODE: "both",
                SCRAPING_PROVIDER: options.lookup === false ? "none" : "auto",
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
        json: {
          workerLastSeen: Date.now(),
          imports: [
            {
              id: "import",
              createdAt: "2026-10-31T16:00:00Z",
              status: "failed",
              error: "Shop lookup failed.",
            },
          ],
          notifications: state.retried
            ? []
            : [
                {
                  id: "notice",
                  status: "failed",
                  error: "Delivery failed",
                  attempts: 5,
                },
              ],
        },
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
  return { ...f, modelState: f.state, actor, person, settings, state };
}
test("administration has only app preferences and read-only services", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/settings?section=admin");
  await expect(
    page.getByRole("region", { name: "Service status", exact: true }),
  ).toContainText("Configured");
  await expect(
    page.getByRole("button", { name: "Save gift suggestion settings" }),
  ).toHaveCount(0);
  await expect(page.getByText("SMTP_HOST", { exact: true })).toHaveCount(0);
  await page.getByLabel("Who can create family groups?").selectOption("admins");
  await page.getByRole("button", { name: "Save group setting" }).click();
  await expect(
    page.getByText("Family-group creation saved.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Add photos from shop links automatically").check();
  await page.getByRole("button", { name: "Save photo settings" }).click();
  await expect(
    page.getByText("Product photos saved.", { exact: true }),
  ).toBeVisible();
});
test("locked preferences remain readable and usage can retry", async ({
  page,
}) => {
  const f = await setup(page, { locked: true });
  f.state.failUsage = true;
  await page.goto("/settings?section=admin");
  await expect(
    page.getByRole("button", { name: "Save group setting" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Add photos from shop links automatically"),
  ).toBeDisabled();
  f.state.failUsage = false;
  await page.getByRole("button", { name: "Retry usage" }).click();
  await expect(
    page.getByRole("region", { name: "This month's usage" }),
  ).toBeVisible();
  f.state.visible = false;
  await page.reload();
  await expect(
    page.getByRole("region", { name: "This month's usage" }),
  ).toHaveCount(0);
});
test("service status can recover and failed jobs remain actionable", async ({
  page,
}) => {
  const f = await setup(page);
  f.state.failServices = true;
  await page.goto("/settings?section=admin");
  await expect(
    page.getByRole("button", { name: "Retry service status" }),
  ).toBeVisible();
  f.state.failServices = false;
  await page.getByRole("button", { name: "Retry service status" }).click();
  await expect(
    page.getByRole("region", { name: "Service status", exact: true }),
  ).toContainText("Browser push");
  const jobs = page.getByRole("region", {
    name: "Background jobs",
    exact: true,
  });
  await expect(
    jobs.getByRole("heading", { name: "Background jobs" }),
  ).toBeVisible();
  await expect(jobs.getByText(/Shop lookup failed/)).toHaveCount(1);
  await expect(jobs).toContainText(
    "0 shop lookups waiting · 0 updates waiting",
  );
  await jobs.getByText("Failed shop lookups (1)", { exact: true }).click();
  await expect(jobs.locator("time")).toHaveAttribute(
    "datetime",
    "2026-10-31T16:00:00Z",
  );
  await jobs.getByText("Failed updates (1)", { exact: true }).click();
  await jobs.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(jobs).not.toContainText("Delivery failed");
  expect(f.state.retried).toBe(true);
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

test("photo settings couple effective controls and remember preloading across reloads", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/settings?section=admin");
  const cache = page.getByLabel("Cache product photos on devices", {
    exact: true,
  });
  const preload = page.getByLabel("Preload larger product photos", {
    exact: true,
  });
  const save = page.getByRole("button", { name: "Save photo settings" });
  await expect(save).toBeDisabled();
  await cache.uncheck();
  await expect(preload).not.toBeChecked();
  await expect(preload).toBeDisabled();
  await save.click();
  await page.reload();
  await expect(preload).not.toBeChecked();
  await cache.check();
  await expect(preload).toBeChecked();
  await expect(preload).toBeEnabled();
  await save.click();
  await page.reload();
  await expect(preload).toBeChecked();
});

test("groups preserve independent drafts and discard only their own changes", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/settings?section=admin");
  const group = page.getByRole("region", {
    name: "Family-group creation",
    exact: true,
  });
  const photos = page.getByRole("region", {
    name: "Product photos",
    exact: true,
  });
  await page.getByLabel("Who can create family groups?").selectOption("admins");
  await page.getByLabel("Add photos from shop links automatically").check();
  await group.getByRole("button", { name: "Save group setting" }).click();
  await expect(
    photos.getByRole("button", { name: "Save photo settings" }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("Add photos from shop links automatically"),
  ).toBeChecked();
  await photos.getByRole("button", { name: "Discard changes" }).click();
  await expect(
    page.getByLabel("Add photos from shop links automatically"),
  ).not.toBeChecked();
  await expect(page.getByLabel("Who can create family groups?")).toHaveValue(
    "admins",
  );
});

test("failed grouped saves retain edits for retry", async ({ page }) => {
  await setup(page);
  await page.goto("/settings?section=admin");
  await page.getByLabel("Add photos from shop links automatically").check();
  await page.route("**/api/v1/admin/settings", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 500,
        json: { error: "Save failed. Try again." },
      });
    return route.fallback();
  });
  await page.getByRole("button", { name: "Save photo settings" }).click();
  await expect(page.getByRole("alert")).toContainText("Save failed");
  await expect(
    page.getByLabel("Add photos from shop links automatically"),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Save photo settings" }),
  ).toBeEnabled();
});

for (const width of [393, 1440]) {
  test(`manual entry and list polish at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const f = await setup(page, { lookup: false });
    const list = world(f.modelState, f.actor).lists.find(
      (l) => l.canEdit && !l.archived,
    )!;
    f.modelState.imports.push({
      id: "00000000-0000-4000-8000-000000000011",
      revision: 1,
      createdAt: new Date().toISOString(),
      userId: f.actor.id,
      url: "https://example.com/product",
      status: "failed",
      draft: {
        listId: list.id,
        state: "active",
        revision: 1,
        fields: { title: "A saved draft" },
        touched: [],
      },
    });
    await page.goto(`/lists/${list.id}`);
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toHaveCount(0);
    const privacy = page.locator(".list-privacy > summary");
    await privacy.click();
    await expect(privacy.locator(".privacy-disclosure-label svg")).toHaveCSS(
      "transform",
      "none",
    );
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await page.screenshot({
        path: `/tmp/little-hint-list-${width}-${theme}.png`,
        fullPage: true,
      });
    }
    await page
      .locator("main")
      .getByRole("button", { name: "Add item", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Get details", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Product link (optional)")).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.goto("/settings?section=admin");
    await expect(
      page.getByLabel("Add photos from shop links automatically"),
    ).toBeDisabled();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await page.screenshot({
        path: `/tmp/little-hint-admin-${width}-${theme}.png`,
        fullPage: true,
      });
    }
  });
}
