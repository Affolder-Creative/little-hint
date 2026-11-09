import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { requestHandoff } from "../src/server/account-closure-domain";
import { managementDetails } from "../src/server/profile-management";
import { command, world } from "../src/server/domain";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { spendingView } from "../src/server/spending";
import type { Person, FriendEntry } from "../src/shared/model";

async function setup(page: Page) {
  const { state, actors } = stagingFixtures();
  const actor = actors[0];
  const child = command(state, actor, "people.create", {
    name: "Robin Alexandra Morgan",
    managedGroupIds: [state.groups[0].id],
  }) as Person;
  command(state, actor, "people.link", {
    id: child.id,
    email: "robin.long-address@example.test",
  });
  const friend = command(state, actor, "friends.create", {
    name: "Melissa Alexandra Affolder",
  }) as FriendEntry;
  command(state, actor, "friends.invite", {
    id: friend.id,
    email: "melissa.long-address@example.test",
  });
  command(state, actor, "groups.invite", {
    groupId: state.groups[0].id,
    email: "another.long-address@example.test",
  });
  await page.addInitScript(() =>
    localStorage.setItem("little-hint:install", "never"),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/",
      "",
    );
    try {
      if (path === "account/handoff") {
        const b = route.request().postDataJSON();
        requestHandoff(
          state,
          actor,
          b.kind,
          b.personId,
          b.userId,
          b.keepPreviousOwner,
        );
        return route.fulfill({ json: { ok: true } });
      }
      if (path === `people/${child.id}/management`)
        return route.fulfill({
          json: managementDetails(state, actor, child.id),
        });
      if (path === "world")
        return route.fulfill({
          json: { ...world(state, actor), environment: "test" },
        });
      if (path === "spending")
        return route.fulfill({ json: spendingView(state, actor) });
      if (path.startsWith("buying/"))
        return route.fulfill({ json: { rows: [], nextCursor: null } });
      if (path === "admin/profiles")
        return route.fulfill({
          json: {
            rows: state.people
              .filter((p) => !p.mergedIntoId)
              .map((p) => ({
                ...p,
                email: actors.find((a) => a.id === p.userId)?.email,
                managed: !p.userId,
              })),
            total: state.people.length,
          },
        });
      if (path.endsWith("/deletion"))
        return route.fulfill({
          json: {
            token: "0".repeat(64),
            counts: { lists: 1, gifts: 3, notes: 2 },
            blockers: [],
            candidates: [],
          },
        });
      if (path === "admin/jobs")
        return route.fulfill({
          json: {
            imports: [],
            notifications: [],
            workerLastSeen: Date.now(),
            backupProvider: "external",
            prices: { enabled: false, providerUsage: [] },
          },
        });
      if (path === "push")
        return route.fulfill({ json: { publicKey: null, devices: [] } });
      if (route.request().method() === "POST") {
        const aliases: Record<string, string> = {
          people: "people.create",
          lists: "lists.create",
          items: "items.create",
        };
        return route.fulfill({
          json: command(
            state,
            actor,
            aliases[path] ?? path.replace("/", "."),
            route.request().postDataJSON(),
          ),
        });
      }
      return route.fulfill({ json: [] });
    } catch (error) {
      return route.fulfill({
        status: 400,
        json: { error: (error as Error).message },
      });
    }
  });
  return { state, actor, child, friend };
}
for (const [width, theme] of [
  [320, "light"],
  [393, "dark"],
  [768, "light"],
  [1440, "dark"],
] as const) {
  test(`managed profiles and invitation layouts at ${width}px ${theme}`, async ({
    page,
  }, info) => {
    const f = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      (theme) => localStorage.setItem("little-hint:theme", theme),
      theme,
    );
    const capture = async (name: string) => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`${name}.png`),
        fullPage: true,
      });
    };
    await page.goto("/settings?section=profile");
    await expect(
      page.getByRole("button", { name: `Edit profile for ${f.child.name}` }),
    ).toBeVisible();
    await expect(
      page.getByText("Take over this profile:", { exact: false }),
    ).toHaveCount(0);
    await capture("profiles");
    await page
      .getByRole("button", { name: `Edit profile for ${f.child.name}` })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Edit profile",
      exact: true,
    });
    await expect(
      dialog.getByLabel("Share with family groups", { exact: true }),
    ).toBeChecked();
    const save = await dialog
      .getByRole("button", { name: "Save profile", exact: true })
      .boundingBox();
    const done = await dialog
      .getByRole("button", { name: "Done", exact: true })
      .boundingBox();
    expect(Math.abs(save!.y - done!.y)).toBeLessThan(2);
    expect(done!.x).toBeGreaterThan(save!.x);
    await capture("profile-editor");
    const violations = (
      await new AxeBuilder({ page }).include("dialog[open]").analyze()
    ).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(violations).toEqual([]);
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page.goto("/settings?section=groups");
    const invitation = page
      .locator(".invitation-row")
      .filter({ hasText: "another.long-address@example.test" });
    await expect(
      invitation.getByRole("button", { name: "Cancel invitation" }),
    ).toBeVisible();
    const copy = await invitation
      .getByRole("button", { name: /(?:Copy|Share) sign-in link/ })
      .boundingBox();
    expect(copy!.height).toBeLessThan(100);
    await capture("group-invitation");
    await page.goto(`/people/${f.friend.personId}?tab=ideas`);
    const connection = page
      .locator(".invitation-row")
      .filter({ hasText: "Connection invitation pending" });
    await expect(connection).toBeVisible();
    await capture("connection-invitation");
    await page.goto(`/people/${f.child.id}`);
    await page
      .getByRole("button", { name: "Create wish list", exact: true })
      .click();
    await expect(
      page.locator(`input[name="ownerIds"][value="${f.child.id}"]`),
    ).toBeChecked();
    await expect(
      page.locator(`input[name="groupIds"][value="${f.state.groups[0].id}"]`),
    ).toBeChecked();
    await capture("first-managed-list");
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    await page.goto(`/people/${f.child.id}?tab=ideas`);
    await page
      .getByRole("button", { name: "Add gift idea", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Gift idea name", { exact: true })
      .fill("A bicycle helmet");
    await page
      .getByRole("button", { name: "Save gift idea", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      f.state.items.find((i) => i.title === "A bicycle helmet")?.recipientIds,
    ).toEqual([f.child.id]);
    await capture("managed-ideas");
    const selfList = f.state.lists.find((l) =>
      l.ownerIds.some(
        (id) => f.state.people.find((p) => p.id === id)?.userId === f.actor.id,
      ),
    )!;
    await page.goto(`/lists/${selfList.id}`);
    await expect(page.getByText("Your spending", { exact: true })).toHaveCount(
      0,
    );
    await page.goto("/settings?section=admin");
    const directory = page.getByRole("region", { name: "Users and profiles" });
    await expect(
      directory.getByRole("heading", { name: "Users & profiles" }),
    ).toBeVisible();
    await directory.getByRole("searchbox").fill("Taylor");
    await directory
      .locator(".admin-profile-match")
      .filter({ hasText: "Taylor" })
      .first()
      .click();
    await directory.scrollIntoViewIfNeeded();
    await capture("admin-profiles");
    await directory
      .getByRole("button", { name: "Delete account", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Delete account permanently" }),
    ).toBeDisabled();
    await page
      .getByLabel("What should happen to their data?")
      .selectOption("keep-shared");
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await expect(
      page.getByRole("button", { name: "Delete account permanently" }),
    ).toBeEnabled();
    await capture("deletion-review");
  });
}

test("first activation requires a readable name before opening the app", async ({
  page,
}, info) => {
  const f = await setup(page);
  f.state.people.find((p) => p.userId === f.actor.id)!.nameSetupRequired = true;
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() =>
    localStorage.setItem("little-hint:theme", "dark"),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What should we call you?" }),
  ).toBeVisible();
  await expect(page.getByLabel("First name")).toBeVisible();
  await expect(page.getByLabel("Last name")).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("name-setup.png"),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
});

test("a manager creates the first shared wish list and adds an item", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto(`/people/${f.child.id}`);
  await page
    .getByRole("button", { name: "Create wish list", exact: true })
    .click();
  await page
    .getByLabel("List name", { exact: true })
    .fill("Robin's birthday wishes");
  await page.getByRole("radio", { name: /Keep it a surprise/ }).check();
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Add item", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Item name", { exact: true }).fill("A new bicycle");
  await page
    .getByRole("button", { name: "Add to wish list", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const item = f.state.items.find((i) => i.title === "A new bicycle")!;
  const list = f.state.lists.find((l) => l.id === item.listId)!;
  expect(list.ownerIds).toEqual([f.child.id]);
  expect(list.groupIds).toEqual([f.state.groups[0].id]);
});

for (const width of [320, 768, 1440])
  test(`co-manager editor at ${width}px`, async ({ page }, info) => {
    const f = await setup(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/people/${f.child.id}`);
    await page
      .getByRole("button", { name: "Edit profile", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Edit profile",
      exact: true,
    });
    await expect(dialog.getByText("Owner", { exact: true })).toBeVisible();
    const candidates = managementDetails(
      f.state,
      f.actor,
      f.child.id,
    ).candidates.filter((m) => m.id !== f.actor.id);
    const next = candidates[0];
    await dialog.getByRole("combobox", { name: "Find users" }).fill(next.name);
    await dialog.getByRole("option", { name: next.name, exact: true }).click();
    await dialog
      .getByRole("button", { name: "Save profile", exact: true })
      .click();
    await expect.poll(() => f.child.guardians.includes(next.id)).toBe(true);
    await expect(
      dialog.getByRole("button", { name: `Remove ${next.name}`, exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Transfer ownership", exact: true })
      .click();
    await expect(
      dialog.getByRole("checkbox", { name: "Keep me as a co-manager" }),
    ).toBeChecked();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("co-managers.png"),
      fullPage: true,
    });
    await dialog
      .getByRole("combobox", { name: "New owner" })
      .selectOption(next.id);
    await dialog
      .getByRole("button", { name: "Request ownership transfer" })
      .click();
    await expect(
      dialog.getByText(new RegExp(`Waiting for ${next.name}`)),
    ).toBeVisible();
    await dialog
      .getByRole("textbox", { name: "Name", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath("managers-top.png"),
      fullPage: true,
    });
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });

test("co-managers see a read-only manager list", async ({ page }) => {
  const f = await setup(page);
  const next = managementDetails(f.state, f.actor, f.child.id).candidates.find(
    (m) => m.id !== f.actor.id,
  )!;
  command(f.state, f.actor, "people.update", {
    id: f.child.id,
    revision: f.child.revision,
    name: f.child.name,
    managerUserIds: [f.actor.id, next.id],
  });
  const actor = {
    id: next.id,
    name: next.name,
    email: "co-manager@example.test",
  };
  await page.route("**/api/v1/world", (route) =>
    route.fulfill({ json: { ...world(f.state, actor), environment: "test" } }),
  );
  await page.route(`**/api/v1/people/${f.child.id}/management`, (route) =>
    route.fulfill({ json: managementDetails(f.state, actor, f.child.id) }),
  );
  await page.goto(`/people/${f.child.id}`);
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  const managers = page.getByRole("group", { name: "Managers", exact: true });
  await expect(managers.getByText("Owner", { exact: true })).toBeVisible();
  await expect(managers.getByText("Co-manager", { exact: true })).toBeVisible();
  await expect(managers.getByRole("checkbox")).toHaveCount(0);
  await expect(managers.getByRole("searchbox")).toHaveCount(0);
  await expect(
    managers.getByRole("button", { name: "Transfer ownership", exact: true }),
  ).toHaveCount(0);
});
