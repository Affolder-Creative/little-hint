import { test, expect } from "@playwright/test";
import { login, post, expectDialogFieldsToFit } from "./browser-helpers";
for (const width of [390, 1280]) {
  test(`save, edit and publish a wish-list draft at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page, "alex@example.test");
    const world = await page.evaluate(async () =>
      (await fetch("/api/v1/world")).json(),
    );
    const person = world.people.find((p: any) => p.userId === world.me.id);
    const list = await post(page, "lists", {
      name: `Draft checks ${Date.now()}`,
      ownerIds: [person.id],
      groupIds: [],
      mode: "surprise",
    });
    await page.goto(`/lists/${list.id}`);
    await page
      .locator("#main")
      .getByRole("button", { name: "Add item", exact: true })
      .click();
    await page
      .getByLabel("Item name", { exact: true })
      .fill("A telescope to think about");
    await expectDialogFieldsToFit(page);
    await page.screenshot({
      path: `/tmp/draft-form-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const drafts = page.getByRole("region", { name: "Saved wish-list drafts" });
    await expect(drafts).toContainText("A telescope to think about");
    await drafts
      .getByRole("button", { name: "Edit draft", exact: true })
      .click();
    await page
      .getByLabel("Item name", { exact: true })
      .fill("Reviewed telescope");
    // Enter must save changes, never publish the draft.
    await page.getByLabel("Item name", { exact: true }).press("Enter");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(drafts).toContainText("Reviewed telescope");
    await drafts
      .getByRole("button", { name: "Edit draft", exact: true })
      .click();
    await expectDialogFieldsToFit(page);
    await page.screenshot({
      path: `/tmp/draft-edit-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(drafts).not.toBeVisible();
    await expect(
      page.getByRole("link").filter({ hasText: "Reviewed telescope" }),
    ).toBeVisible();
  });
}
test("joint owners cannot retrieve draft content through details, ordering, browsing or exports", async ({
  browser,
}) => {
  const ownerContext = await browser.newContext(),
    viewerContext = await browser.newContext();
  try {
    const owner = await ownerContext.newPage(),
      viewer = await viewerContext.newPage();
    await login(owner, "alex@example.test");
    await login(viewer, "sam@example.test");
    const own: any = await owner.evaluate(async () =>
      (await fetch("/api/v1/world")).json(),
    );
    const other: any = await viewer.evaluate(async () =>
      (await fetch("/api/v1/world")).json(),
    );
    const ownerId = own.people.find((p: any) => p.userId === own.me.id).id;
    const viewerId = other.people.find((p: any) => p.userId === other.me.id).id;
    const list = await post(owner, "lists", {
      name: "Private draft boundary",
      ownerIds: [ownerId, viewerId],
      groupIds: [],
      mode: "surprise",
    });
    await post(viewer, "lists/accept", { id: list.id });
    const draft = await post(owner, "items", {
      title: "Private draft boundary telescope",
      listId: list.id,
      publicationState: "draft",
    });
    const result = await viewer.evaluate(
      async ({ listId, itemId }) => {
        const detail = await fetch(`/api/v1/items/${itemId}`);
        const order = await (
          await fetch(`/api/v1/lists/${listId}/item-order`)
        ).json();
        const page = await (
          await fetch(
            `/api/v1/items?scope=list&id=${listId}&publicationState=draft`,
          )
        ).json();
        return { detail: detail.status, order, page };
      },
      { listId: list.id, itemId: draft.id },
    );
    expect(result.detail).toBe(404);
    expect(result.order).toEqual([]);
    expect(result.page.total).toBe(0);
    const exported = await post(viewer, "account/export", { format: "json" });
    expect(JSON.stringify(exported)).not.toContain(draft.title);
  } finally {
    await ownerContext.close();
    await viewerContext.close();
  }
});
