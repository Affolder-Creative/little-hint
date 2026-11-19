import { spendingView } from "../src/server/spending";
import { test, expect, webkit, type Page } from "@playwright/test";
import { command, stamp, world } from "../src/server/domain";
import { emptyState, type Item } from "../src/shared/model";
import { itemPage } from "../src/server/collections";
import { discussionAudience } from "../src/server/discussion-access";
async function fixture(page: Page) {
  const state = emptyState();
  const actors = [
    "Giver Test",
    "Dad Test",
    "Mom Test",
    "Brother Test",
    "Beth Test",
  ].map((name) => ({
    id: stamp().id,
    name,
    email: name.replaceAll(" ", "") + "@example.test",
  }));
  const people = actors.map((a) => ({
    ...stamp(),
    userId: a.id,
    name: a.name,
    guardians: [],
    admin: a === actors[0],
  }));
  state.people.push(...people);
  const group = {
    ...stamp(),
    name: "Test family",
    ownerId: actors[0].id,
    memberIds: actors.map((a) => a.id),
  };
  state.groups.push(group);
  const list = command(state, actors[1], "lists.create", {
    name: "Christmas wish list",
    ownerIds: [people[1].id],
    groupIds: [group.id],
    mode: "surprise",
  }) as { id: string };
  const idea = command(state, actors[0], "items.create", {
    title: "TV fixture",
    recipientIds: [people[1].id],
    visibility: "hidden",
    groupIds: [group.id],
  }) as Item;
  command(state, actors[3], "comments.create", {
    itemId: idea.id,
    body: "Fixture discussion",
    audienceToken: discussionAudience(state, actors[3], idea.id).token,
  });
  await page.addInitScript(() =>
    localStorage.setItem("little-hint:install", "never"),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1/", "");
    try {
      if (path === "spending")
        return route.fulfill({ json: spendingView(state, actors[0]) });
      if (path === "world")
        return route.fulfill({
          json: {
            ...world(state, actors[0]),
            environment: "test",
            giftPreferences: [],
            spendingEnabled: false,
          },
        });
      if (path === "items" && route.request().method() === "GET")
        return route.fulfill({
          json: await itemPage(
            state,
            actors[0],
            Object.fromEntries(url.searchParams),
            async () => {},
          ),
        });
      if (path.endsWith("discussion-audience"))
        return route.fulfill({
          json: discussionAudience(state, actors[0], idea.id),
        });
      if (path === "notifications")
        return route.fulfill({
          json: {
            entries: [],
            unreadCount: 0,
            readCount: 0,
            nextCursor: null,
            asOf: new Date().toISOString(),
          },
        });
      if (path === "items" || path === "items/update")
        return route.fulfill({
          json: command(
            state,
            actors[0],
            path === "items" ? "items.create" : "items.update",
            route.request().postDataJSON(),
          ),
        });
      return route.fulfill({ json: [] });
    } catch (e) {
      return route.fulfill({
        status: 400,
        json: { error: (e as Error).message },
      });
    }
  });
  return { state, actors, people, idea, list };
}
for (const [width, theme] of [
  [393, "light"],
  [1440, "dark"],
] as const) {
  test(`joint idea editor and visual refinements ${width} ${theme}`, async ({
    page,
  }, info) => {
    const f = await fixture(page);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      (theme) => localStorage.setItem("little-hint:theme", theme),
      theme,
    );
    await page.goto("/people");
    await expect(page.locator(".directory-section").first()).toBeVisible();
    for (const section of await page.locator(".directory-section").all())
      await expect(section.locator(".person-row").last()).toHaveCSS(
        "border-bottom-width",
        "0px",
      );
    await page.screenshot({
      path: info.outputPath("people.png"),
      fullPage: true,
    });
    await page.goto(`/people/${f.people[1].id}`);
    const row = page.locator(".person-list-link").first();
    await expect(row).toBeVisible();
    const gap = await row.evaluate((el) => {
      const icon = el.querySelector(".list-symbol")!.getBoundingClientRect();
      return (
        el.querySelector(".person-list-copy")!.getBoundingClientRect().left -
        icon.right
      );
    });
    expect(gap).toBeCloseTo(16, 0);
    await page.screenshot({
      path: info.outputPath("lists.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Add gift idea", exact: true })
      .click();
    const recipient = page.getByRole("combobox", {
      name: "Who is this idea for?",
      exact: true,
    });
    await recipient.fill("Mom");
    await recipient.press("Enter");
    await page
      .getByLabel("Who can see this idea?", { exact: true })
      .selectOption("restricted");
    await page
      .getByRole("checkbox", { name: "Test family", exact: true })
      .check();
    const excluded = page.getByRole("combobox", {
      name: "Also hide from",
      exact: true,
    });
    await excluded.fill("Brother");
    await excluded.press("Enter");
    await page
      .getByLabel("Gift idea name", { exact: true })
      .fill("Joint TV fixture");
    await page.screenshot({
      path: info.outputPath("editor.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Save gift idea", exact: true })
      .click();
    await expect(
      page.getByText("Review who can see this idea", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Confirm/ }).click();
    await expect
      .poll(
        () =>
          f.state.items.find((i) => i.title === "Joint TV fixture")
            ?.recipientIds.length,
      )
      .toBe(2);
    await page.goto(`/gift/${f.idea.id}`);
    await page.getByText("Fixture discussion", { exact: true }).waitFor();
    await page
      .getByLabel("Actions for note by Brother Test", { exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Delete note", exact: true }),
    ).toHaveCSS("border-top-width", "0px");
    await page.screenshot({
      path: info.outputPath("note-menu.png"),
      fullPage: true,
    });
    await page.goto("/notifications?view=all");
    const all = page.getByRole("button", { name: "All", exact: true });
    await expect(all).toBeVisible();
    expect(
      await all.evaluate((el) => el.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(44);
    const label = all.locator("span");
    expect(
      await label.evaluate((el) =>
        parseFloat(getComputedStyle(el, "::after").width),
      ),
    ).toBeCloseTo(
      await label.evaluate((el) => el.getBoundingClientRect().width),
      0,
    );
    await page.screenshot({
      path: info.outputPath("notifications.png"),
      fullPage: true,
    });
  });
}
test("WebKit joint idea search works on a narrow phone", async ({}, info) => {
  const browser = await webkit.launch({
    channel: "",
    executablePath: webkit.executablePath(),
  });
  const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
  try {
    const f = await fixture(page);
    await page.goto(`http://localhost:5173/people/${f.people[1].id}`);
    await page
      .getByRole("button", { name: "Add gift idea", exact: true })
      .click();
    const field = page.getByRole("combobox", {
      name: "Who is this idea for?",
      exact: true,
    });
    await field.fill("Mom");
    await field.press("Enter");
    await expect(
      page.getByRole("button", { name: "Remove Mom Test", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("webkit-editor.png"),
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
});
