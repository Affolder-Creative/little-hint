import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { List, World } from "../src/shared/model";
import { login, post } from "./browser-helpers";

test("a consenting co-manager maintains and shares wishes, then loses access on revocation", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const ownerContext = await browser.newContext();
  const helperContext = await browser.newContext();
  let ownerForCleanup: Page | undefined;
  let arrangementId: string | undefined;
  try {
    for (const context of [ownerContext, helperContext])
      await context.addInitScript(() =>
        localStorage.setItem("little-hint:install", "never"),
      );
    const owner = await ownerContext.newPage();
    ownerForCleanup = owner;
    const helper = await helperContext.newPage();
    await login(owner, "alex@example.test");
    await login(helper, "sam@example.test");
    const ow = (await (
      await owner.request.get("/api/v1/world")
    ).json()) as World;
    const hw = (await (
      await helper.request.get("/api/v1/world")
    ).json()) as World;
    const person = ow.people.find((p) => p.userId === ow.me.id)!;
    const suffix = Date.now();
    const title = `Co-managed wish ${suffix}`;
    const group = await post(owner, "groups", {
      name: `Owner audience ${suffix}`,
    });
    const list = (await post(owner, "lists", {
      name: `Co-management browser list ${suffix}`,
      ownerIds: [person.id],
      groupIds: [],
      mode: "surprise",
    })) as List;

    await owner.goto("/settings?section=co-management");
    await owner
      .getByRole("button", { name: "Invite a co-manager", exact: true })
      .click();
    const invitation = owner.getByRole("dialog");
    await invitation
      .getByLabel("Connected person", { exact: true })
      .selectOption(hw.me.id);
    await expect(invitation).toContainText("Personal drafts stay private");
    await invitation
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(invitation).not.toBeVisible();
    const pendingWorld = (await (
      await helper.request.get("/api/v1/world")
    ).json()) as World;
    expect(pendingWorld.lists.some((l) => l.id === list.id)).toBe(false);
    arrangementId = pendingWorld.coManagement?.arrangements.find(
      (g) => g.personId === person.id && g.helperId === hw.me.id,
    )?.id;

    await helper.goto("/settings?section=co-management");
    const request = helper
      .locator(".invitation-row")
      .filter({ hasText: person.name });
    await request
      .getByRole("button", { name: "Review and accept", exact: true })
      .click();
    await helper
      .getByRole("dialog")
      .getByRole("button", { name: "Accept co-management", exact: true })
      .click();
    await expect(helper.getByRole("dialog")).not.toBeVisible();
    await helper.goto(`/people/${person.id}`);
    await expect(
      helper.getByText(`Managing wishes for ${person.name}`, { exact: true }),
    ).toBeVisible();

    await helper.goto(`/lists/${list.id}`);
    await helper
      .getByRole("main")
      .getByRole("button", { name: "Add item", exact: true })
      .click();
    await helper.getByLabel("Item name", { exact: true }).fill(title);
    const [createdResponse] = await Promise.all([
      helper.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/v1/items" &&
          r.request().method() === "POST",
      ),
      helper
        .getByRole("button", { name: "Add to wish list", exact: true })
        .click(),
    ]);
    expect(createdResponse.ok(), await createdResponse.text()).toBe(true);
    const item = await createdResponse.json();
    await expect(helper.getByRole("dialog")).not.toBeVisible();

    await helper
      .getByLabel(`List actions for ${list.name}`, { exact: true })
      .click();
    await helper
      .getByRole("button", { name: "Edit list", exact: true })
      .click();
    const settings = helper.getByRole("dialog");
    await expect(
      settings.getByRole("radio", { name: /See the plans/ }),
    ).toBeDisabled();
    await settings
      .locator(`input[name="groupIds"][value="${group.id}"]`)
      .check();
    await settings
      .getByRole("button", { name: "Save list", exact: true })
      .click();
    await expect(settings).not.toBeVisible();
    const shared = (await (
      await helper.request.get("/api/v1/world")
    ).json()) as World;
    expect(shared.lists.find((l) => l.id === list.id)?.groupIds).toEqual([
      group.id,
    ]);
    expect(shared.groups.some((g) => g.id === group.id)).toBe(false);

    await owner.goto(`/gift/${item.id}`);
    await expect(
      owner.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByText(`Added by ${hw.me.name}`, { exact: false }),
    ).toBeVisible();
    await expect(
      owner.getByText(`Last edited by ${hw.me.name}`, { exact: false }),
    ).toBeVisible();

    // Keep a real edit form open while the owner revokes the grant.
    await helper.goto(`/gift/${item.id}`);
    await helper.getByLabel(`Actions for ${title}`, { exact: true }).click();
    await helper
      .locator("details[open]")
      .getByRole("button", { name: "Edit item", exact: true })
      .click();
    await helper
      .getByLabel("Item name", { exact: true })
      .fill(`${title} stale edit`);
    await owner.goto("/settings?section=co-management");
    const active = owner
      .locator(".invitation-row")
      .filter({ hasText: hw.me.name });
    await active
      .getByRole("button", { name: "Remove co-manager", exact: true })
      .click();
    await owner
      .getByRole("dialog")
      .getByRole("button", { name: "Remove co-manager", exact: true })
      .click();
    await expect(owner.getByRole("dialog")).not.toBeVisible();
    const [rejected] = await Promise.all([
      helper.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/v1/items/update" &&
          r.request().method() === "POST",
      ),
      helper.getByRole("button", { name: "Save changes", exact: true }).click(),
    ]);
    expect(rejected.ok()).toBe(false);
    const after = (await (
      await helper.request.get("/api/v1/world")
    ).json()) as World;
    expect(after.lists.some((l) => l.id === list.id)).toBe(false);
    const retained = await (
      await owner.request.get(`/api/v1/items/${item.id}`)
    ).json();
    expect(retained.title).toBe(title);
    await helper.reload();
    await expect(
      helper.getByLabel(`Actions for ${title}`, { exact: true }),
    ).toHaveCount(0);
  } finally {
    if (arrangementId && ownerForCleanup)
      await ownerForCleanup.request
        .post("/api/v1/co-management/end", { data: { id: arrangementId } })
        .catch(() => {});
    await ownerContext.close();
    await helperContext.close();
  }
});
