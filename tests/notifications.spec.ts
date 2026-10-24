import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, post } from "./browser-helpers";

test("following, scoped mentions, inbox read controls, and mobile settings", async ({
  page,
  browser,
}) => {
  const helperContext = await browser.newContext();
  const helper = await helperContext.newPage();
  const buyerContext = await browser.newContext();
  const buyer = await buyerContext.newPage();
  await login(page, "alex@example.test");
  await login(helper, "sam@example.test");
  await login(buyer, "jamie@example.test");
  const owner = await (await page.request.get("/api/v1/world")).json();
  const sam = await (await helper.request.get("/api/v1/world")).json();
  const list = owner.lists.find((l: any) => l.canEdit && !l.archived);
  await helper.goto(`/lists/${list.id}`);
  await helper
    .getByRole("button", { name: "Follow wish list", exact: true })
    .click();
  await expect(
    helper.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
  const item = await post(page, "items", {
    listId: list.id,
    title: `Notification test ${Date.now()}`,
  });
  await helper.goto("/notifications");
  await expect(
    helper.getByRole("button", { name: new RegExp(item.title) }),
  ).toBeVisible();
  await expect(
    helper.getByRole("link", { name: /Notifications, \d+ unread/ }),
  ).toBeVisible();
  await helper.getByRole("button", { name: new RegExp(item.title) }).click();
  await expect(helper).toHaveURL(new RegExp(`/gift/${item.id}`));
  await buyer.goto(`/gift/${item.id}`);
  const note = buyer.getByLabel("Your note", { exact: true });
  await note.fill("@Sam");
  await expect(buyer.getByRole("option", { name: /Sam Morgan/ })).toBeVisible();
  await expect(buyer.getByRole("option", { name: /Alex Morgan/ })).toHaveCount(
    0,
  );
  const noteAudit = await new AxeBuilder({ page: buyer }).analyze();
  expect.soft(noteAudit.violations).toEqual([]);
  await buyer.screenshot({
    path: "test-results/mention-picker-desktop.png",
    fullPage: true,
  });
  await note.press("Enter");
  await expect(note).toHaveValue("@Sam Morgan ");
  await note.press("End");
  await note.pressSequentially("Could you check the size?");
  await buyer
    .getByRole("button", { name: "Add private note", exact: true })
    .click();
  await expect(
    buyer.getByText("Private note added.", { exact: true }),
  ).toBeVisible();
  await helper.goto("/notifications");
  const mention = helper.getByRole("button", {
    name: new RegExp(`Jamie Chen mentioned you.*${item.title}`),
  });
  await expect(mention).toBeVisible();
  const notification = (
    await (await helper.request.get("/api/v1/notifications")).json()
  ).entries.find((n: any) => n.event === "mention");
  const denied = await page.request.get(
    `/api/v1/notifications/${notification.id}`,
  );
  expect(denied.status()).toBe(404);
  await helper.setViewportSize({ width: 390, height: 844 });
  await expect(
    helper.getByRole("button", { name: "Mark all as read" }),
  ).toBeVisible();
  await expect(helper.locator("body")).toHaveJSProperty("scrollWidth", 390);
  const audit = await new AxeBuilder({ page: helper }).analyze();
  expect.soft(audit.violations).toEqual([]);
  await helper.screenshot({
    path: "test-results/notifications-mobile.png",
    fullPage: true,
  });
  await helper.setViewportSize({ width: 1440, height: 1000 });
  await helper.screenshot({
    path: "test-results/notifications-desktop.png",
    fullPage: true,
  });
  await mention.click();
  await expect(helper).toHaveURL(/#note-/);
  await expect(helper.locator(".comment.targeted-note")).toContainText(
    "Could you check the size?",
  );
  await helper
    .getByRole("button", { name: "Watch notes", exact: true })
    .click();
  await expect(
    helper.getByRole("button", { name: "Stop watching notes", exact: true }),
  ).toBeVisible();
  await helper.goto("/notifications");
  await helper.getByRole("button", { name: /Mark unread: Jamie Chen/ }).click();
  await helper.getByRole("button", { name: "Unread", exact: true }).click();
  await expect(mention).toBeVisible();
  await helper.getByRole("button", { name: "Mark all as read" }).click();
  await expect(
    helper.getByRole("heading", { name: "You’re all caught up" }),
  ).toBeVisible();
  await page.goto(`/gift/${item.id}`);
  await expect(page.getByLabel("Your note", { exact: true })).toHaveCount(0);
  expect(
    (
      await (await page.request.get("/api/v1/notifications")).json()
    ).entries.some((n: any) => n.event === "mention"),
  ).toBe(false);
  await helper.goto("/settings?section=notifications");
  await helper.setViewportSize({ width: 390, height: 844 });
  await expect(
    helper.getByText(
      "Push is not configured on this installation. Your in-app inbox still works.",
    ),
  ).toBeVisible();
  const topics = helper.locator(".channel-topics");
  await topics
    .getByRole("group", { name: "Mentions", exact: true })
    .getByLabel("Push", { exact: true })
    .uncheck();
  await helper
    .getByRole("button", { name: "Save notification preferences" })
    .click();
  await expect(
    helper.getByText("Notification preferences saved.", { exact: true }),
  ).toBeVisible();
  const saved = await (await helper.request.get("/api/v1/world")).json();
  expect(saved.preferences.pushEvents).not.toContain("mention");
  expect(saved.me.id).toBe(sam.me.id);
  const settingsAudit = await new AxeBuilder({ page: helper }).analyze();
  expect.soft(settingsAudit.violations).toEqual([]);
  await helper.screenshot({
    path: "test-results/notification-settings-mobile.png",
    fullPage: true,
  });
  const newGroup = await post(page, "groups", {
    name: "Invitation replay test",
  });
  const beforeInvites = (
    await (await helper.request.get("/api/v1/notifications")).json()
  ).entries.filter((n: any) => n.event === "invitation").length;
  const inviteRequest = {
    headers: {
      Origin: new URL(page.url()).origin,
      "Idempotency-Key": "notification_invite_replay_0001",
    },
    data: { groupId: newGroup.id, email: "sam@example.test" },
  };
  expect(
    (await page.request.post("/api/v1/groups/invite", inviteRequest)).ok(),
  ).toBe(true);
  expect(
    (await page.request.post("/api/v1/groups/invite", inviteRequest)).ok(),
  ).toBe(true);
  const afterInvites = (
    await (await helper.request.get("/api/v1/notifications")).json()
  ).entries.filter((n: any) => n.event === "invitation").length;
  expect(afterInvites - beforeInvites).toBe(1);
  await helperContext.grantPermissions(["notifications"]);
  await helper.evaluate((accountId) => {
    localStorage.setItem("little-hint:push-account", accountId);
    localStorage.setItem("little-hint:push-device", "removed-device");
  }, sam.me.id);
  await helper.reload();
  await expect
    .poll(() =>
      helper.evaluate(() => localStorage.getItem("little-hint:push-device")),
    )
    .toBeNull();
  await helperContext.close();
  await buyerContext.close();
});
