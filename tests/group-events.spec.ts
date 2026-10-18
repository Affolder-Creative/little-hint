import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { login, post } from "./browser-helpers";
import type { World } from "../src/shared/model";

const readWorld = async (page: Page): Promise<World> =>
  (await page.request.get("/api/v1/world")).json();

test("leaders manage an occasion while recipients add wishes and unselected members shop", async ({
  page,
  browser,
}) => {
  test.setTimeout(process.env.CI ? 300000 : 120000);
  await mkdir("test-results/visual", { recursive: true });
  const leaderContext = await browser.newContext();
  const shopperContext = await browser.newContext();
  const leader = await leaderContext.newPage();
  const shopper = await shopperContext.newPage();
  try {
    await login(page, "alex@example.test");
    await login(leader, "sam@example.test");
    await login(shopper, "jamie@example.test");
    const child = await post(leader, "people", { name: "Avery Morgan" });
    await page.goto("/settings");
    await page.getByRole("button", { name: "Manage event leaders" }).click();
    await page
      .getByRole("checkbox", { name: "Sam Morgan", exact: true })
      .check();
    await page.getByRole("button", { name: "Save event leaders" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    await leader.getByRole("link", { name: "My lists", exact: true }).click();
    await leader
      .getByRole("button", { name: "Create event", exact: true })
      .click();
    await leader
      .getByLabel("Event name", { exact: true })
      .fill("Christmas 2026");
    await leader
      .getByLabel("A note for the group")
      .fill(
        "A few wishes for our family Christmas. Add things you would love, and we’ll take care of the surprises.",
      );
    await leader.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(
      leader.getByRole("button", { name: "Create 0 wish lists" }),
    ).toBeDisabled();
    await leader
      .getByRole("checkbox", { name: "Sam Morgan", exact: true })
      .check();
    await leader
      .locator(`input[name="participantIds"][value="${child.id}"]`)
      .check();
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ] as const) {
      await leader.setViewportSize({ width, height });
      await leader.getByRole("dialog").evaluate((dialog) => {
        dialog.scrollTop = 0;
      });
      await leader.screenshot({
        path: `test-results/visual/event-form-${name}.png`,
        fullPage: true,
      });
      expect(
        await leader.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page: leader }).include("dialog").analyze())
          .violations,
      ).toEqual([]);
    }
    await leader
      .getByRole("button", { name: "Create 2 wish lists", exact: true })
      .click();
    await expect(leader).toHaveURL(/\/events\//);
    const eventId = new URL(leader.url()).pathname.split("/").pop()!;
    const eventUrl = `/events/${eventId}`;
    let world = await readWorld(leader);
    const lists = world.lists.filter((list) => list.groupEventId === eventId);
    expect(lists).toHaveLength(2);
    const childList = lists.find((list) => list.ownerIds.includes(child.id))!;
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ] as const) {
      await leader.setViewportSize({ width, height });
      // Reload at the final viewport to avoid stale fixed-layer captures after resizing.
      await leader.reload();
      await expect(
        leader.getByRole("heading", { name: "Christmas 2026", exact: true }),
      ).toBeVisible();
      await leader.screenshot({
        path: `test-results/visual/event-detail-${name}.png`,
        fullPage: true,
      });
      expect(
        await leader.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        (
          await new AxeBuilder({ page: leader })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await leader.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(
      leader.getByRole("heading", { name: "Christmas 2026", exact: true }),
    ).toBeVisible();
    await leader.screenshot({
      path: "test-results/visual/event-detail-mobile-dark.png",
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page: leader })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await leader.getByRole("button", { name: "Switch to light theme" }).click();
    await leader.locator(`a[href="/lists/${childList.id}"]`).click();
    await expect(
      leader.getByRole("button", { name: "List settings", exact: true }),
    ).toHaveCount(0);
    await expect(
      leader.getByRole("button", { name: "Archive list", exact: true }),
    ).toHaveCount(0);
    await expect(
      leader.getByRole("link", { name: "Manage event" }),
    ).toBeVisible();
    await leader
      .getByRole("main")
      .getByRole("button", { name: "Add a gift", exact: true })
      .click();
    await leader
      .getByLabel("Gift name", { exact: true })
      .fill("Avery’s watercolor set");
    await expect(leader.getByLabel("Wish list", { exact: true })).toHaveValue(
      childList.id,
    );
    await expect(
      leader.getByLabel("Wish list", { exact: true }).locator("option:checked"),
    ).toHaveText("Christmas 2026 · Avery Morgan");
    await leader
      .getByRole("button", { name: "Add to wish list", exact: true })
      .click();
    await expect(leader.getByRole("dialog")).not.toBeVisible();
    world = await readWorld(leader);
    const gift = world.items.find((item) => item.listId === childList.id)!;
    const before = gift;

    await shopper.goto(eventUrl);
    await expect(
      shopper.getByRole("heading", { name: "Christmas 2026", exact: true }),
    ).toBeVisible();
    await expect(
      shopper.getByRole("button", { name: "Edit event", exact: true }),
    ).toHaveCount(0);
    await shopper.locator(`a[href="/lists/${childList.id}"]`).click();
    await shopper.locator(`a[href="/gift/${gift.id}"]`).click();
    await shopper
      .getByRole("button", { name: "I’ll get this", exact: true })
      .click();
    await expect
      .poll(async () =>
        (await readWorld(shopper)).buying.some((r) => r.itemId === gift.id),
      )
      .toBe(true);
    expect(
      (await readWorld(leader)).items.find((item) => item.id === gift.id),
    ).toEqual(before);
    const denied = await leader.request.post("/api/v1/lists/update", {
      headers: {
        Origin: new URL(leader.url()).origin,
        "Idempotency-Key": crypto.randomUUID(),
      },
      data: { ...childList, name: "Bypass event management" },
    });
    expect(denied.status()).toBe(403);

    await leader.getByRole("link", { name: "Manage event" }).click();
    await leader
      .getByRole("button", { name: "Edit event", exact: true })
      .click();
    await leader
      .locator(`input[name="participantIds"][value="${child.id}"]`)
      .uncheck();
    await leader
      .getByRole("button", { name: "Save event", exact: true })
      .click();
    await expect(
      leader.getByRole("heading", { name: "Removed participants" }),
    ).toBeVisible();
    expect(
      (await readWorld(leader)).lists.find((list) => list.id === childList.id)
        ?.archived,
    ).toBe(true);
    await leader
      .getByRole("button", { name: "Edit event", exact: true })
      .click();
    await leader
      .locator(`input[name="participantIds"][value="${child.id}"]`)
      .check();
    await leader
      .getByRole("button", { name: "Save event", exact: true })
      .click();
    await expect(
      leader.getByRole("heading", { name: "Removed participants" }),
    ).toHaveCount(0);
    expect(
      (await readWorld(leader)).lists.find((list) => list.id === childList.id)
        ?.archived,
    ).toBe(false);
    expect(
      (await readWorld(shopper)).buying.some((r) => r.itemId === gift.id),
    ).toBe(true);

    await leader
      .getByRole("button", { name: "Archive event", exact: true })
      .click();
    await leader
      .getByRole("dialog")
      .getByRole("button", { name: "Archive event", exact: true })
      .click();
    await expect(
      leader.getByText(
        "This event is archived. Gifts and purchase history are preserved.",
      ),
    ).toBeVisible();
    await leader
      .getByRole("button", { name: "Restore event", exact: true })
      .click();
    await leader
      .getByRole("dialog")
      .getByRole("button", { name: "Restore event", exact: true })
      .click();
    await expect(
      leader.getByRole("button", { name: "Archive event", exact: true }),
    ).toBeVisible();
    await page.goto("/settings");
    await page.getByRole("button", { name: "Manage event leaders" }).click();
    await page
      .getByRole("checkbox", { name: "Sam Morgan", exact: true })
      .uncheck();
    await page.getByRole("button", { name: "Save event leaders" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await leader.reload();
    await expect(
      leader.getByRole("heading", { name: "Christmas 2026", exact: true }),
    ).toBeVisible();
    await expect(
      leader.getByRole("button", { name: "Edit event", exact: true }),
    ).toHaveCount(0);
  } finally {
    await leaderContext.close();
    await shopperContext.close();
  }
});
