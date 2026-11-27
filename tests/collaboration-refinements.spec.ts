import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { spendingView } from "../src/server/spending";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { command, world, giftView } from "../src/server/domain";
import { inbox, mentionCandidates } from "../src/server/activity";
import { discussionAudience } from "../src/server/discussion-access";

async function setup(page: Page) {
  page.on("dialog", (dialog) => dialog.accept());
  const { state, actors } = stagingFixtures();
  const actor = actors[0];
  const visible = world(state, actor);
  const gift = state.items.find((i) =>
    visible.items.some((v) => v.id === i.id && !v.isRecipient && !v.archived),
  )!;
  gift.groupIds = state.lists.find((l) => l.id === gift.listId)?.groupIds ?? [];
  state.exchanges = [];
  delete gift.listId;
  gift.creatorId = actor.id;
  gift.visibility = "hidden";
  gift.title = "Shared gift for a thoughtful celebration";
  gift.image = "";
  const readers = mentionCandidates(state, actor, gift.id, "", undefined, {
    ordinary: true,
  });
  for (const body of ["First note", "Second note"])
    command(state, actor, "comments.create", {
      itemId: gift.id,
      body,
      audienceToken: discussionAudience(state, actor, gift.id, undefined, {
        ordinary: true,
      }).token,
      ordinary: true,
    });
  // Use a real authorized activity record for this viewer.
  state.notices = [];
  const other = actors.find((a) => readers.some((r) => r.userId === a.id))!;
  command(state, other, "comments.create", {
    itemId: gift.id,
    body: "A new reply",
    ordinary: true,
    audienceToken: discussionAudience(state, other, gift.id, undefined, {
      ordinary: true,
    }).token,
  });
  await page.addInitScript(() =>
    localStorage.setItem("little-hint:install", "never"),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1/", "");
    const q = Object.fromEntries(url.searchParams);
    if (path === "spending")
      return route.fulfill({ json: spendingView(state, actor) });
    if (path === "world")
      return route.fulfill({
        json: {
          ...world(state, actor),
          giftPreferences: [],
          environment: "test",
        },
      });
    if (path.endsWith("/discussion-audience"))
      return route.fulfill({
        json: discussionAudience(state, actor, gift.id, q.commentId, {
          ordinary: true,
        }),
      });
    if (path.endsWith("/mention-candidates"))
      return route.fulfill({
        json: mentionCandidates(
          state,
          actor,
          gift.id,
          q.q,
          q.commentId,
          { ordinary: true },
          q.exclude?.split(","),
        ),
      });
    if (path === "notifications")
      return route.fulfill({
        json: {
          ...inbox(state, actor, {
            unread: q.unread === "true",
            cursor: q.cursor,
          }),
          asOf: new Date().toISOString(),
        },
      });
    if (path.startsWith("notifications/"))
      return route.fulfill({
        json: command(
          state,
          actor,
          path.replace("/", "."),
          route.request().postDataJSON(),
        ),
      });
    if (path === `items/${gift.id}`)
      return route.fulfill({ json: giftView(state, actor, gift) });
    if (path === "push")
      return route.fulfill({ json: { publicKey: null, devices: [] } });
    return route.fulfill({ json: [] });
  });
  return {
    gift,
    readers,
    personId: world(state, actor).coManagement?.candidates[0]?.personId,
  };
}
for (const [width, theme] of [
  [393, "light"],
  [768, "light"],
  [1440, "dark"],
] as const) {
  test(`collaboration refinements ${width} ${theme}`, async ({
    page,
  }, info) => {
    const { gift, readers, personId } = await setup(page);
    await page.setViewportSize({ width, height: 950 });
    await page.addInitScript(
      (theme) => localStorage.setItem("little-hint:theme", theme),
      theme,
    );
    await page.goto(`/gift/${gift.id}`);
    await expect(page.locator(".gift-attribution")).toBeVisible();
    await expect(page.locator(".discussion-audience")).toHaveCount(1);
    await page
      .getByRole("button", { name: "About who can read this note?" })
      .click();
    const help = page.getByRole("dialog", { name: "Who can read this note?" });
    await expect(help).toContainText("These people can read your note:");
    await expect(help).toContainText("Recipients can’t see it.");
    await page.screenshot({
      path: info.outputPath("audience-help.png"),
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    const note = page.getByLabel("Your note", { exact: true });
    await note.fill("@");
    await page.getByRole("option").filter({ hasText: readers[0].name }).click();
    await expect(page.locator(".mention-highlight .note-mention")).toHaveText(
      `@${readers[0].name}`,
    );
    await note.pressSequentially("@");
    await expect(
      page.getByRole("option").filter({ hasText: readers[0].name }),
    ).toHaveCount(0);
    await note.press("Escape");
    await page.screenshot({
      path: info.outputPath("discussion.png"),
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    gift.visibility = "private";
    await page.reload();
    await expect(page.locator(".gift-attribution")).toHaveCount(0);
    gift.visibility = "hidden";
    if (personId) {
      await page.goto(`/people/${personId}`);
      const summary = page.getByLabel(/^More actions for /);
      await page.screenshot({
        path: info.outputPath("person.png"),
        fullPage: true,
      });
      await expect(summary).toBeVisible();
      const before = await summary.boundingBox();
      await summary.click();
      const after = await summary.boundingBox();
      expect(after!.y).toBe(before!.y);
      await page
        .getByRole("button", { name: "Ask to co-manage", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "Personal drafts stay private",
      );
      await page.keyboard.press("Escape");
    }
    await page.goto("/notifications");
    await expect(page.getByRole("button", { name: /^Unread/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page
      .getByRole("button", { name: /^Dismiss:/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "You’re all caught up" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Dismiss:/ })).toHaveCount(
      1,
    );
    await page.screenshot({
      path: info.outputPath("notifications.png"),
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
}
