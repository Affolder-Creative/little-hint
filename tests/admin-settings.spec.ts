import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world } from "../src/server/domain";

async function setup(page: Page) {
  const f = stagingFixtures();
  const actor = f.actors[0];
  f.state.people.find((p) => p.userId === actor.id)!.admin = true;
  const people = f.state.people.filter((p) => p.userId);
  const group = {
    ...f.state.groups[0],
    name: "Family gathering",
    memberIds: people.slice(1, 4).map((p) => p.userId!),
    ownerId: people[1].userId!,
    adminIds: [] as string[],
    eventLeaderIds: [] as string[],
  };
  const members = people
    .slice(1, 4)
    .map((p, i) => ({ userId: p.userId!, name: p.name, admin: i === 2 }));
  const candidate = {
    id: people[1].id,
    userId: people[1].userId!,
    name: "Sam Example",
    email: "sam@example.test",
    revision: 1,
  };
  const admins = [
    {
      id: people[0].id,
      userId: actor.id,
      name: "Alex Example",
      email: "alex@example.test",
      revision: 1,
    },
  ];
  const posts: { path: string; body: any }[] = [];
  const state = { conflict: false, denied: false };
  const invitations: { id: string; email: string }[] = [];
  const requests = [{ id: "request", email: "invite@example.test" }];
  const directory = () => ({
    ...group,
    canAdminister: true,
    members,
    households: f.state.households.filter((h) => h.groupId === group.id),
    people: people.slice(1, 4).map((p) => ({
      id: p.id,
      name: p.name,
      revision: p.revision,
      householdIds: [],
    })),
    invitations,
    requests,
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1/", "");
    const json = (value: unknown) => route.fulfill({ json: value });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      posts.push({ path, body });
      if (path === "admin/administrators") {
        if (body.admin) admins.push(candidate);
        else
          admins.splice(
            admins.findIndex((p) => p.id === body.id),
            1,
          );
      }
      if (path === "groups/admins") group.adminIds = body.userIds;
      if (path === "groups/event-leaders") group.eventLeaderIds = body.userIds;
      if (path === "groups/update") {
        if (state.conflict)
          return route.fulfill({
            status: 409,
            json: { message: "This changed. Reload and try again." },
          });
        group.name = body.name;
        group.revision++;
      }
      return json({ ok: true });
    }
    if (path === "world")
      return json({ ...world(f.state, actor), environment: "test" });
    if (path === "admin/administrators") return json(admins);
    if (path === "admin/profiles") {
      expect(url.searchParams.get("eligibleForAdmin")).toBe("true");
      return json({
        rows: [
          candidate,
          { ...candidate, id: "duplicate", email: "other@example.test" },
        ],
        total: 2,
      });
    }
    if (path === "admin/groups")
      return json({
        rows: group.name
          .toLowerCase()
          .includes((url.searchParams.get("search") ?? "").toLowerCase())
          ? [directory()]
          : [],
        total: 1,
      });
    if (path === `admin/groups/${group.id}`)
      return state.denied
        ? route.fulfill({
            status: 403,
            json: { message: "Administration access is required." },
          })
        : json(directory());
    if (path === "push") return json({ publicKey: null, devices: [] });
    if (path === "admin/jobs")
      return json({ workerLastSeen: null, imports: [], notifications: [] });
    if (path === "admin/usage") return json({ visible: false });
    return json([]);
  });
  return { group, members, posts, state, invitations, requests };
}

test("appoint an administrator from the section with unambiguous email and protect the last admin", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/settings?section=admin");
  const panel = page.getByRole("region", {
    name: "App administrators",
    exact: true,
  });
  await expect(panel.getByText("Alex Example · You")).toBeVisible();
  await expect(
    panel.getByText("Add another administrator before removing this role."),
  ).toBeVisible();
  await expect(panel.getByText("Remove admin role")).toHaveCount(0);
  await panel.getByRole("button", { name: "Add administrator" }).click();
  await page.getByRole("searchbox", { name: "Find an account" }).fill("Sam");
  await page
    .getByRole("button", { name: "Sam Example sam@example.test", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("sam@example.test");
  await page
    .getByRole("button", { name: "Make app admin", exact: true })
    .click();
  await expect(panel.getByText("sam@example.test")).toBeVisible();
  expect(f.posts[0].body.admin).toBe(true);
  await panel.getByLabel("Actions for Alex Example").click();
  await page
    .getByRole("button", { name: "Remove admin role", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "You will lose access to Administration.",
  );
});

test("focus group tasks, change roles independently, and preserve search and drafts through history", async ({
  page,
}) => {
  const f = await setup(page);
  await page.goto("/settings?section=admin");
  await page
    .getByRole("searchbox", { name: "Find a family group" })
    .fill("gathering");
  const manage = page.getByRole("button", {
    name: "Manage Family gathering",
    exact: true,
  });
  await manage.click();
  const detail = page.getByRole("region", {
    name: "Manage family group",
    exact: true,
  });
  await expect(detail).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "App administrators", exact: true }),
  ).not.toBeVisible();
  await detail.getByLabel(`Actions for ${f.members[1].name}`).click();
  await detail
    .getByRole("button", { name: "Make family admin", exact: true })
    .click();
  expect(f.posts.find((p) => p.path === "groups/admins")?.body.userIds).toEqual(
    [f.members[1].userId],
  );
  await detail.getByRole("button", { name: "Settings", exact: true }).click();
  await detail.getByRole("textbox", { name: "Group name" }).fill("Draft name");
  await detail.getByRole("button", { name: "Households", exact: true }).click();
  await page.goBack();
  await expect(detail.getByRole("textbox", { name: "Group name" })).toHaveValue(
    "Draft name",
  );
  await page.getByRole("button", { name: "Back to all family groups" }).click();
  await expect(
    page.getByRole("searchbox", { name: "Find a family group" }),
  ).toHaveValue("gathering");
  await expect(manage).toBeFocused();
  await manage.click();
  await detail.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(detail.getByRole("textbox", { name: "Group name" })).toHaveValue(
    "Draft name",
  );
  f.state.conflict = true;
  await detail
    .getByRole("button", { name: "Save group name", exact: true })
    .click();
  await expect(detail.getByRole("alert")).toBeVisible();
  await expect(detail.getByRole("textbox", { name: "Group name" })).toHaveValue(
    "Draft name",
  );
  f.state.denied = true;
  await detail
    .getByRole("button", { name: "Save group name", exact: true })
    .click();
  await expect(detail.getByRole("alert")).toContainText(
    "your access may have changed",
  );
  await expect(detail.getByRole("textbox", { name: "Group name" })).toHaveCount(
    0,
  );
  f.state.denied = false;
  await detail.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(detail.getByRole("textbox", { name: "Group name" })).toHaveValue(
    "Draft name",
  );
  expect(f.posts.some((p) => p.path.includes("join"))).toBe(false);
});

for (const width of [360, 768, 1440])
  for (const dark of [false, true]) {
    test(`group navigation and layout at ${width}px ${dark ? "dark" : "light"}`, async ({
      page,
    }, testInfo) => {
      const f = await setup(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
      await page.goto(
        `/settings?section=admin&adminGroup=${f.group.id}&adminTab=households`,
      );
      const detail = page.getByRole("region", {
        name: "Manage family group",
        exact: true,
      });
      await expect(
        detail.getByRole("button", { name: "Create household", exact: true }),
      ).toBeVisible();
      await detail
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await expect(
        detail.getByRole("textbox", { name: "Group name" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page })
            .include(".admin-group-detail")
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath("group-settings.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Back to all family groups" })
        .click();
      await expect(
        page.getByRole("heading", { name: "App administrators", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("overview.png"),
        fullPage: true,
      });
    });
  }

test("manage invitations and households in focused dialogs and recover from lost group access", async ({
  page,
}, testInfo) => {
  const f = await setup(page);
  await page.setViewportSize({ width: 393, height: 900 });
  await page.goto(`/settings?section=admin&adminGroup=${f.group.id}`);
  const detail = page.getByRole("region", {
    name: "Manage family group",
    exact: true,
  });
  await expect(
    detail.getByText("App admin · all groups", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("members.png"),
    fullPage: true,
  });
  await detail
    .getByRole("button", { name: "Invitations (1)", exact: true })
    .click();
  await detail
    .getByRole("button", { name: "Approve and send", exact: true })
    .click();
  expect(f.posts.at(-1)?.body).toEqual({ id: "request", decision: "approve" });
  await detail.getByRole("button", { name: "Households", exact: true }).click();
  await detail
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Household name" })
    .fill("New household");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create household", exact: true })
    .click();
  expect(f.posts.at(-1)?.body).toEqual({
    groupId: f.group.id,
    name: "New household",
  });
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.evaluate(() => {
    const sizes = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".admin-group-detail h3, .admin-group-detail h4, .admin-group-detail p, .admin-group-detail button",
      ),
    ).map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) }));
    for (const { el, size } of sizes) el.style.fontSize = `${size * 2}px`;
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("households-enlarged.png"),
    fullPage: true,
  });
  f.state.denied = true;
  await page.reload();
  await expect(detail.getByRole("alert")).toContainText(
    "your access may have changed",
  );
  await expect(
    detail.getByRole("button", { name: "Create household", exact: true }),
  ).toHaveCount(0);
  f.state.denied = false;
  await detail.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    detail.getByRole("button", { name: "Create household", exact: true }),
  ).toBeVisible();
});

for (const width of [320, 393, 768, 1440]) {
  for (const theme of ["light", "dark"]) {
    test(`invitation section rhythm ${width} ${theme}`, async ({
      page,
    }, info) => {
      const f = await setup(page);
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (theme) => localStorage.setItem("little-hint:theme", theme),
        theme,
      );
      f.requests.length = 0;
      await page.goto(
        `/settings?section=admin&adminGroup=${f.group.id}&adminTab=invitations`,
      );
      const sections = page.locator(".admin-invitation-section");
      await expect(sections).toHaveCount(2);
      for (const populated of [false, true]) {
        if (populated) {
          f.requests.push(
            {
              id: "r1",
              email: "a-long-family-invitation-address@example.test",
            },
            { id: "r2", email: "second@example.test" },
          );
          f.invitations.push({ id: "i1", email: "pending@example.test" });
          await page.reload();
          await expect(
            page.getByRole("button", { name: "Approve and send" }),
          ).toHaveCount(2);
        }
        const gap = await page
          .locator(".admin-invitations")
          .evaluate((e) => getComputedStyle(e).gap);
        expect(gap).toBe(width <= 650 ? "24px" : "32px");
        expect(
          await sections.first().evaluate((e) => getComputedStyle(e).gap),
        ).toBe("8px");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath(
            `invitations-${populated ? "populated" : "empty"}.png`,
          ),
          fullPage: true,
        });
      }
      expect(
        (
          await new AxeBuilder({ page })
            .include(".admin-group-detail")
            .analyze()
        ).violations,
      ).toEqual([]);
    });
  }
}
