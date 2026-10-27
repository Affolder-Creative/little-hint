import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { login, post, expectDialogFieldsToFit } from "./browser-helpers";
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
    const familyGroup = (await readWorld(page)).groups.find(
      (group) => group.name === "The Morgan circle",
    )!;
    const child = await post(leader, "people", { name: "Avery Morgan" });
    await page.goto(
      `/settings?section=groups&view=events&group=${familyGroup.id}`,
    );
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
    await expect(
      leader.getByRole("radio", { name: /See the plans/ }),
    ).not.toBeChecked();
    // This workflow exercises surprise privacy; it is now an explicit choice.
    await leader.getByRole("radio", { name: /Keep it a surprise/ }).check();
    await leader
      .getByLabel("Event name", { exact: true })
      .fill("Christmas 2026");
    await leader
      .getByLabel("A note for the family group")
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
      ["mobile", 393, 852],
      ["narrow", 320, 740],
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
      await expectDialogFieldsToFit(leader);
      const participantSpacing = await leader
        .locator(".event-participants")
        .evaluate((section) => {
          const actions = section
            .querySelector(".event-selection-actions")!
            .getBoundingClientRect();
          const rows = [
            ...section.querySelectorAll(".event-person-choice"),
          ].map((row) => row.getBoundingClientRect());
          const help = section
            .querySelector(":scope > small")!
            .getBoundingClientRect();
          return {
            beforePeople: rows[0].top - actions.bottom,
            afterPeople: help.top - rows.at(-1)!.bottom,
            rowHeights: rows.map((row) => row.height),
          };
        });
      expect(participantSpacing.beforePeople).toBeLessThanOrEqual(8);
      expect(participantSpacing.afterPeople).toBeLessThanOrEqual(8);
      expect(
        participantSpacing.rowHeights.every((height) => height >= 44),
      ).toBe(true);
      expect(
        (await new AxeBuilder({ page: leader }).include("dialog").analyze())
          .violations,
      ).toEqual([]);
    }
    await leader
      .getByRole("button", { name: "Create 2 wish lists", exact: true })
      .click();
    await leader.getByRole("button", { name: "Confirm and save" }).click();
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
      .getByRole("button", { name: "Add item", exact: true })
      .click();
    await leader
      .getByLabel("Item name", { exact: true })
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
      .getByRole("button", { name: "Reserve gift", exact: true })
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
    await leader.setViewportSize({ width: 320, height: 852 });
    await expect(
      leader.getByRole("radio", { name: /Keep it a surprise/ }),
    ).toBeChecked();
    await expect(
      leader.getByRole("radio", { name: /Keep it a surprise/ }),
    ).toBeDisabled();
    // Events shared without a reveal date must keep the date and exchange
    // policy locked, even though new-event dates are browser-managed.
    await expect(
      leader.getByLabel("Reveal gifts after", { exact: true }),
    ).toBeDisabled();
    await expect(
      leader.getByLabel("Include secret exchange gifts and giver names", {
        exact: true,
      }),
    ).toBeDisabled();
    await expectDialogFieldsToFit(leader);
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
        "This event is archived. Items and purchase history are kept.",
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
    await page.goto(
      `/settings?section=groups&view=events&group=${familyGroup.id}`,
    );
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

test("family-group households support duplicate names and member-controlled selections", async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const context = await browser.newContext();
  const member = await context.newPage();
  try {
    await login(page, "alex@example.test");
    await login(member, "sam@example.test");
    const group = await post(page, "groups", {
      name: "Household browser test",
    });
    await post(page, "groups", { name: "Household browser test" });
    const invitation = await post(page, "groups/invite", {
      groupId: group.id,
      email: "sam@example.test",
    });
    await post(member, "invitations/accept", { id: invitation.id });
    const child = await post(member, "people", { name: "Household child" });
    await page.goto(
      `/settings?section=groups&view=households&group=${group.id}`,
    );
    const section = page.locator(`[data-group-id="${group.id}"]`);
    for (let i = 0; i < 2; i++) {
      await section
        .getByRole("button", { name: "Create household", exact: true })
        .click();
      await page
        .getByLabel("Household name", { exact: true })
        .fill("The Smiths");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Create household", exact: true })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
    }
    const w = await readWorld(page);
    const homes = w.households.filter((h) => h.groupId === group.id);
    expect(homes).toHaveLength(2);
    await member.goto(
      `/settings?section=groups&view=households&group=${group.id}`,
    );
    const memberSection = member.locator(`[data-group-id="${group.id}"]`);
    await expect(
      memberSection.getByRole("button", {
        name: "Create household",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      memberSection.getByRole("button", {
        name: "Choose households for Alex Morgan",
        exact: true,
      }),
    ).toHaveCount(0);
    await memberSection
      .getByRole("button", {
        name: "Choose households for Household child",
        exact: true,
      })
      .click();
    const dialog = member.getByRole("dialog");
    const labels = await dialog
      .getByRole("checkbox")
      .evaluateAll((inputs) =>
        inputs.map((i) => i.closest("label")!.textContent),
      );
    expect(new Set(labels).size).toBe(2);
    for (const home of homes)
      await dialog.locator(`input[value="${home.id}"]`).check();
    await dialog.getByRole("button", { name: "Save households" }).click();
    await expect(dialog).not.toBeVisible();
    expect(
      (await readWorld(member)).householdMemberships.filter(
        (m) => m.personId === child.id,
      ),
    ).toHaveLength(2);
    await page.reload();
    await section
      .getByRole("button", { name: /^Rename / })
      .first()
      .click();
    await page
      .getByLabel("Household name", { exact: true })
      .fill("School-week home");
    await page
      .getByRole("button", { name: "Save household", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const renamed = await readWorld(page);
    expect(
      renamed.householdMemberships.filter((m) => m.personId === child.id),
    ).toHaveLength(2);
    await mkdir("test-results/visual", { recursive: true });
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 393, 852],
    ] as const) {
      await page.setViewportSize({ width, height });
      await section.locator(".household-settings").scrollIntoViewIfNeeded();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/visual/households-${name}.png`,
      });
    }
    expect(
      (
        await new AxeBuilder({ page })
          .include(`[data-group-id="${group.id}"]`)
          .analyze()
      ).violations,
    ).toEqual([]);
    await section
      .getByRole("button", { name: /^Delete School-week home/ })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete household", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(
      (await readWorld(page)).householdMemberships.filter(
        (m) => m.personId === child.id,
      ),
    ).toHaveLength(1);
  } finally {
    await context.close();
  }
});

test("settings navigation isolates tasks and preserves unfinished preferences", async ({
  page,
}) => {
  await login(page, "alex@example.test");
  const groupName = `Navigation family ${Date.now()}`;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Profile & appearance" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create family group", exact: true }),
  ).not.toBeVisible();
  const navigation = page.getByRole("navigation", {
    name: "Settings sections",
  });
  await navigation
    .getByRole("link", { name: "Notifications", exact: true })
    .click();
  const email = page
    .getByRole("group", { name: "Delivery channels", exact: true })
    .getByRole("checkbox", { name: "Email", exact: true });
  const wasChecked = await email.isChecked();
  await email.setChecked(!wasChecked);
  await navigation
    .getByRole("link", { name: "Family groups", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Members & invitations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create household", exact: true }),
  ).not.toBeVisible();
  const groupPicker = page.getByLabel("Family group", { exact: true });
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: "Create family group", exact: true })
      .click();
    await page.getByLabel("Family group name", { exact: true }).fill(groupName);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Create family group", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Navigation family/ }),
    ).toBeVisible();
    await expect(groupPicker).toHaveValue(
      new URL(page.url()).searchParams.get("group")!,
    );
  }

  const groups = await groupPicker.locator("option").evaluateAll((options) =>
    options.map((o) => ({
      id: (o as HTMLOptionElement).value,
      label: o.textContent,
    })),
  );
  const duplicates = groups.filter((g) => g.label?.includes(groupName));
  expect(duplicates).toHaveLength(2);
  expect(duplicates[0].label).not.toBe(duplicates[1].label);
  await groupPicker.selectOption(duplicates[1].id);
  await page
    .getByRole("navigation", { name: "Family group settings" })
    .getByRole("link", { name: "Households", exact: true })
    .click();
  await expect(
    page.locator(`[data-group-id="${duplicates[1].id}"]`),
  ).toBeVisible();
  await navigation
    .getByRole("link", { name: "Notifications", exact: true })
    .click();
  await expect(email).toBeChecked({ checked: !wasChecked });
  await page.goBack();
  await expect(groupPicker).toHaveValue(duplicates[1].id);
  await expect(
    page.getByRole("button", { name: "Create household", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(groupPicker).toHaveValue(duplicates[1].id);
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 393, 852],
    ["narrow", 320, 740],
  ] as const) {
    await page.setViewportSize({ width, height });
    if (width < 1100) {
      await page
        .getByLabel("Settings section", { exact: true })
        .selectOption("profile");
      await page
        .getByLabel("Settings section", { exact: true })
        .selectOption("groups");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/visual/settings-organized-${name}.png`,
      fullPage: true,
    });
  }
  expect(
    (await new AxeBuilder({ page }).include(".settings-layout").analyze())
      .violations,
  ).toEqual([]);
  await page.goto("/settings?section=unknown&group=unknown");
  await expect(
    page.getByRole("heading", { name: "Profile & appearance" }),
  ).toBeVisible();
});

test("spending guidelines stay advisory for purchases, shared gifts, and drawn exchanges", async ({
  page,
  browser,
}) => {
  test.setTimeout(300000);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [buyer, contributor, secondContributor] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const world = async (p: Page): Promise<World> =>
    (await p.request.get("/api/v1/world")).json();
  try {
    await login(page, "alex@example.test");
    await login(buyer, "sam@example.test");
    await login(contributor, "jamie@example.test");
    await login(secondContributor, "riley@example.test");
    const initial = await world(page);
    const family = initial.groups.find((g) => g.name === "The Morgan circle")!;
    const owner = initial.people.find((p) => p.userId === initial.me.id)!;
    await page.goto(`/settings?section=groups&view=events&group=${family.id}`);
    await page
      .getByRole("button", { name: "Create event", exact: true })
      .click();
    await page
      .getByLabel("Event name", { exact: true })
      .fill("Guideline Christmas");
    await page.getByRole("radio", { name: /Keep it a surprise/ }).check();
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page
      .locator(`input[name="participantIds"][value="${owner.id}"]`)
      .check();
    await page
      .getByLabel("Spending guideline in USD, optional", { exact: true })
      .fill("50");
    await mkdir("test-results/visual", { recursive: true });
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 950 });
      await expectDialogFieldsToFit(page);
      await page
        .getByLabel("Spending guideline in USD, optional", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `test-results/visual/guideline-form-${width}.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "Create 1 wish list", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByText(/Spending guideline: \$50/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm and save" }).click();
    await expect(
      page.getByRole("heading", { name: "Guideline Christmas" }),
    ).toBeVisible();
    const updated = await world(page);
    const event = updated.groupEvents.find(
      (e) => e.name === "Guideline Christmas",
    )!;
    const list = updated.lists.find((l) => l.groupEventId === event.id)!;
    const addGift = (title: string, priceCents: number) =>
      post(page, "items", {
        listId: list.id,
        title,
        description: "",
        url: "",
        image: "",
        tags: [],
        quantity: 1,
        priceCents,
      });
    const game = await addGift("Guideline game", 3500);
    const book = await addGift("Guideline book", 2500);
    const shared = await addGift("Guideline shared gift", 9000);
    await buyer.goto(`/gift/${game.id}`);
    await buyer
      .getByRole("button", { name: "Reserve gift", exact: true })
      .click();
    await buyer.goto(`/gift/${book.id}`);
    await expect(
      buyer.getByText(/Your planned gifts total \$60, which is \$10 above/),
    ).toBeVisible();
    await buyer
      .getByRole("button", { name: "Reserve gift", exact: true })
      .click();
    await buyer.goto("/buying");
    await buyer
      .getByRole("button", {
        name: "Mark Guideline game as purchased",
        exact: true,
      })
      .click();
    await expect(
      buyer
        .locator(".buying-row")
        .filter({ hasText: "Guideline game" })
        .getByText("Purchased", { exact: true }),
    ).toBeVisible();
    const purchases = (await world(buyer)).buying.filter((r) =>
      [game.id, book.id].includes(r.itemId),
    );
    for (const r of purchases)
      await post(buyer, "reservations/update", {
        id: r.id,
        revision: r.revision,
        quantity: 0,
        purchased: 0,
      });
    await buyer.goto(`/gift/${shared.id}`);
    await buyer
      .getByRole("button", { name: "Reserve gift", exact: true })
      .click();
    await buyer.goto("/buying");
    const sharedRow = buyer
      .locator(".buying-row")
      .filter({ hasText: "Guideline shared gift" });
    await sharedRow
      .getByRole("button", { name: "Share the cost", exact: true })
      .click();
    await buyer.getByLabel("Target amount in USD", { exact: true }).fill("90");
    await expect(
      buyer
        .getByRole("dialog")
        .getByText(/This shared gift totals \$90, above/),
    ).toBeVisible();
    await buyer
      .getByRole("button", { name: "Save contribution goal", exact: true })
      .click();
    await contributor.goto(`/gift/${shared.id}`);
    await contributor
      .getByRole("button", { name: "Contribute", exact: true })
      .click();
    await contributor
      .getByLabel("Contribution in USD", { exact: true })
      .fill("30");
    await expect(
      contributor
        .getByRole("dialog")
        .getByText(/Your planned gifts total \$30/),
    ).toBeVisible();
    await expect(
      contributor
        .getByRole("dialog")
        .getByText(/This shared gift totals \$90, above/),
    ).toBeVisible();
    await contributor
      .getByRole("button", { name: "Save contribution", exact: true })
      .click();
    await expect(contributor.getByRole("dialog")).not.toBeVisible();
    const reservation = (await world(buyer)).buying.find(
      (r) => r.itemId === shared.id,
    )!;
    await post(secondContributor, "contributions", {
      reservationId: reservation.id,
      amountCents: 3000,
    });
    const overfund = await contributor.request.post("/api/v1/contributions", {
      data: { reservationId: reservation.id, amountCents: 4000 },
      headers: {
        Origin: new URL(contributor.url()).origin,
        "idempotency-key": crypto.randomUUID(),
      },
    });
    expect(overfund.status(), await overfund.text()).toBe(409);
    await buyer.reload();
    await expect(
      sharedRow.getByText(/Your planned gifts total \$30/),
    ).toBeVisible();
    for (const width of [1440, 320]) {
      await buyer.setViewportSize({ width, height: 950 });
      await expect(buyer.locator("body")).toBeVisible();
      expect(
        await buyer.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await buyer.screenshot({
        path: `test-results/visual/guideline-buying-${width}.png`,
        fullPage: true,
      });
    }
    expect(
      (
        await new AxeBuilder({ page: buyer })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.goto(`/gift/${shared.id}`);
    await expect(page.locator(".spending-guidance")).toHaveCount(0);
    expect(
      (await world(page)).items.find((i) => i.id === shared.id)?.reservations,
    ).toBeUndefined();
    const actors = await Promise.all(
      [page, buyer, contributor, secondContributor].map(world),
    );
    const participantIds = actors.map(
      (w) => w.people.find((p) => p.userId === w.me.id)!.id,
    );
    // Each participant already has a surprise list shared with this family in the demo.
    const created = await post(page, "exchanges", {
      name: "Guideline exchange",
      groupId: family.id,
      participantIds,
      count: 1,
      excludeHousehold: false,
      spendingGuidelineCents: 5000,
    });
    let exchange = (await world(page)).exchanges.find(
      (e) => e.id === created.id,
    )!;
    await post(page, "exchanges/draw", {
      id: exchange.id,
      revision: exchange.revision,
    });
    const assignments = (await world(buyer)).exchanges.find(
      (e) => e.id === exchange.id,
    )!.myAssignments;
    await page.goto(`/exchanges#exchange-${exchange.id}`);
    const panel = page.locator(`#exchange-${exchange.id}`);
    await panel
      .getByRole("button", { name: "Edit spending guideline", exact: true })
      .click();
    await page
      .getByLabel("Spending guideline in USD, optional", { exact: true })
      .fill("75");
    await page
      .getByRole("button", { name: "Save spending guideline", exact: true })
      .click();
    await expect(panel.getByText(/Spending guideline: \$75/)).toBeVisible();
    exchange = (await world(buyer)).exchanges.find(
      (e) => e.id === exchange.id,
    )!;
    expect(exchange.myAssignments).toEqual(assignments);
    const notices = await (
      await buyer.request.get("/api/v1/notifications")
    ).json();
    expect(
      notices.entries.some(
        (n: { message: string; href: string }) =>
          n.message === "The spending guideline has changed" &&
          n.href === `/exchanges#exchange-${exchange.id}`,
      ),
    ).toBe(true);
    await panel
      .getByRole("button", { name: "Edit spending guideline", exact: true })
      .click();
    await page
      .getByLabel("Spending guideline in USD, optional", { exact: true })
      .fill("");
    await page
      .getByRole("button", { name: "Save spending guideline", exact: true })
      .click();
    await expect(panel.getByText(/Spending guideline:/)).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
