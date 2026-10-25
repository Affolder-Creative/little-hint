import { test, expect, type Page } from "@playwright/test";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { command, world } from "../src/server/domain";
import { emptyState, type List } from "../src/shared/model";

async function preview(page: Page, actorIndex = 0, solo = false) {
  const fixture = stagingFixtures();
  const actor = fixture.actors[actorIndex];
  if (solo) {
    const person = fixture.state.people.find((p) => p.userId === actor.id)!;
    Object.assign(fixture.state, emptyState());
    fixture.state.people.push(person);
  }
  const paths: Record<string, string> = {
    invitations: "invitations.create",
    "invitations/revoke": "invitations.revoke",
    groups: "groups.create",
    items: "items.create",
    "items/update": "items.update",
    comments: "comments.create",
    reservations: "reservations.create",
    "reservations/update": "reservations.update",
    lists: "lists.create",
    "lists/update": "lists.update",
    "group-events": "group-events.create",
    exchanges: "exchanges.create",
    "exchanges/update": "exchanges.update",
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/world")
      return route.fulfill({
        json: { ...world(fixture.state, actor), environment: "development" },
      });
    if (
      path.includes("list-sessions") ||
      path.includes("list-user-passkeys") ||
      path.endsWith("admin/settings")
    )
      return route.fulfill({ json: [] });
    if (path.endsWith("admin/jobs"))
      return route.fulfill({
        json: { workerLastSeen: Date.now(), imports: [], notifications: [] },
      });
    const action = paths[path.replace("/api/v1/", "")];
    if (action && route.request().method() === "POST") {
      try {
        return route.fulfill({
          json: command(
            fixture.state,
            actor,
            action,
            route.request().postDataJSON(),
          ),
        });
      } catch (error) {
        return route.fulfill({
          status: 400,
          json: { error: (error as Error).message },
        });
      }
    }
    return route.fulfill({
      status: 404,
      json: { error: "Not in this fixture" },
    });
  });
  return { ...fixture, actor };
}

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  const size = viewport.width === 390 ? "mobile" : "desktop";
  test(`standalone invitations and solo Home on ${size}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const { state } = await preview(page, 1, true);
    await page.goto("/");
    await expect(
      page.getByRole("button", {
        name: "Create your first wish list",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`${size}-solo-home.png`),
      fullPage: true,
    });
    await page.goto("/settings?section=invitations");
    await expect(
      page.getByRole("heading", { name: "Invitations", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("You have no pending invitations to Little Hint."),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Invite someone to Little Hint",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Email address", { exact: true })
      .fill("friend@example.test");
    await page.screenshot({
      path: testInfo.outputPath(`${size}-invite-form.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByText("friend@example.test", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/pending family-group/)).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`${size}-invitations.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", {
        name: "Invite someone to Little Hint",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Email address", { exact: true })
      .fill("friend@example.test");
    await page
      .getByRole("button", { name: "Send invitation", exact: true })
      .click();
    await expect(
      page.getByText(
        "You already have a pending invitation for this address.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(state.invitations).toHaveLength(1);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    // Discard the duplicate form if its dirty-form guard is shown.
    const discard = page.getByRole("button", {
      name: "Discard changes",
      exact: true,
    });
    if (await discard.isVisible()) await discard.click();
    await page
      .getByRole("button", {
        name: "Cancel invitation to friend@example.test",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel invitation", exact: true })
      .click();
    await expect(
      page.getByText("You have no pending invitations to Little Hint."),
    ).toBeVisible();
    expect(state.invitations[0].revoked).toBe(true);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Create your first wish list", exact: true })
      .click();
    await page.getByLabel("List name", { exact: true }).fill("Private wishes");
    await page.getByRole("radio", { name: /Keep it a surprise/ }).check();
    await page
      .getByRole("button", { name: "Create list", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(state.lists[0].groupIds).toEqual([]);
    await expect(
      page.getByRole("heading", {
        name: "Add a few things you would love",
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("new shared lists require deliberate privacy and a review before saving", async ({
  page,
}) => {
  const { state } = await preview(page);
  await page.goto("/lists");
  await page
    .getByRole("button", { name: "Create a list", exact: true })
    .click();
  await expect(
    page.getByRole("radio", { name: /See the plans/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("radio", { name: /Keep it a surprise/ }),
  ).not.toBeChecked();
  await page.getByLabel("List name", { exact: true }).fill("Birthday thoughts");
  await page.getByRole("radio", { name: /Keep it a surprise/ }).check();
  await page.getByLabel("Morgan family", { exact: true }).check();
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review before sharing" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Keep it a surprise: recipients cannot see who reserves or buys their gifts.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("List name", { exact: true })).not.toBeVisible();
  expect(state.lists.some((l) => l.name === "Birthday thoughts")).toBe(false);
  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(page.getByLabel("List name", { exact: true })).toBeFocused();
  await expect(page.getByLabel("List name", { exact: true })).toHaveValue(
    "Birthday thoughts",
  );
  await expect(page.getByLabel("Morgan family", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(state.lists.find((l) => l.name === "Birthday thoughts")).toMatchObject(
    { mode: "surprise", modeLocked: true },
  );
});

test("Escape preserves dirty gift fields until the user chooses to discard", async ({
  page,
}) => {
  await preview(page);
  await page.goto("/lists");
  await page.getByRole("link", { name: /Alex's wishes/ }).click();
  const main = page.getByRole("main");
  const add = main.getByRole("button", { name: "Add item", exact: true });
  await expect(add).toBeVisible();
  await expect(main).toBeFocused();
  await add.click();
  await page.getByLabel("Item name", { exact: true }).fill("Do not lose this");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Discard your changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Item name", { exact: true })).toHaveValue(
    "Do not lose this",
  );
  await expect(page.getByLabel("Item name", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(add).toBeFocused();
});

test("dialogs return focus after Escape, close, save and removal of their opener", async ({
  page,
}) => {
  await preview(page);
  await page.goto("/lists");
  await page.getByRole("link", { name: /Alex's wishes/ }).click();
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Alex's wishes", exact: true }),
  ).toBeVisible();
  // Navigation focuses main after rendering. Wait for that handoff before
  // exercising keyboard focus, and exclude the always-present header action.
  await expect(main).toBeFocused();
  const add = main.getByRole("button", { name: "Add item", exact: true });
  for (const method of ["Escape", "Close dialog"]) {
    await add.focus();
    await expect(add).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    if (method === "Escape") await page.keyboard.press("Escape");
    else await page.getByRole("button", { name: method }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(add).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to content" }),
    ).not.toBeFocused();
  }
  await add.click();
  await page.getByLabel("Item name", { exact: true }).fill("Keyboard wish");
  await page
    .getByRole("button", { name: "Add to wish list", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeFocused();

  // Saving a device draft removes its invoking Review & add button.
  const { actor } = await preview(page);
  await page.evaluate((id) => {
    localStorage.setItem(`little-hint:draft-optin:${id}`, "yes");
    localStorage.setItem(
      `little-hint:drafts:${id}`,
      JSON.stringify([
        {
          id: "focus-draft",
          title: "Saved wish",
          url: "",
          description: "",
          savedAt: new Date().toISOString(),
        },
      ]),
    );
  }, actor.id);
  await page.goto("/settings?section=device");
  await page.getByRole("button", { name: "Review & add" }).click();
  await page.getByRole("button", { name: "Add to wish list" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review & add" })).toHaveCount(
    0,
  );
  await expect(page.locator("main")).toBeFocused();
});

test("editable field boundaries contrast with both themes without strengthening dividers", async ({
  page,
}) => {
  await preview(page);
  for (const theme of ["light", "dark"]) {
    await page.goto("/lists");
    await page.evaluate(
      (value) => localStorage.setItem("little-hint:theme", value),
      theme,
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Create a list", exact: true })
      .click();
    const ratios = await page
      .getByLabel("List name", { exact: true })
      .evaluate((input) => {
        const root = getComputedStyle(document.documentElement);
        const rgb = (color: string) =>
          color.startsWith("#")
            ? color
                .slice(1)
                .match(/../g)!
                .map((hex) => parseInt(hex, 16))
            : color
                .match(/[\d.]+/g)!
                .slice(0, 3)
                .map(Number);
        const luminance = (color: string) =>
          rgb(color)
            .map((v) => v / 255)
            .map((v) =>
              v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
            )
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        const border = getComputedStyle(input).borderTopColor;
        return {
          control: border,
          divider: root.getPropertyValue("--border").trim(),
          ratios: ["--paper", "--bg", "--soft"].map((name) => {
            const values = [
              luminance(border),
              luminance(root.getPropertyValue(name).trim()),
            ].sort((a, b) => b - a);
            return (values[0] + 0.05) / (values[1] + 0.05);
          }),
        };
      });
    expect(Math.min(...ratios.ratios)).toBeGreaterThanOrEqual(3);
    expect(ratios.divider).toBe(theme === "light" ? "#e6d9cf" : "#59453b");
    await page.keyboard.press("Escape");
  }
});

test("notification actions wrap with doubled text at phone widths", async ({
  page,
}, testInfo) => {
  await preview(page);
  for (const width of [320, 390])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/settings?section=notifications");
      await page.evaluate(
        (value) => localStorage.setItem("little-hint:theme", value),
        theme,
      );
      await page.reload();
      const save = page.getByRole("button", {
        name: "Save notification preferences",
      });
      await expect(save).toBeVisible();
      await page.evaluate(() => {
        const sizes = Array.from(
          document.querySelectorAll<HTMLElement>("body *"),
        ).map(
          (element) =>
            [element, parseFloat(getComputedStyle(element).fontSize)] as const,
        );
        for (const [element, size] of sizes)
          element.style.fontSize = `${size * 2}px`;
      });
      await save.scrollIntoViewIfNeeded();
      const bounds = await save.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        await save.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(`notifications-200-${width}-${theme}.png`),
      });
    }
});

test("secondary actions retain 44px touch targets on phones and desktop", async ({
  page,
}, testInfo) => {
  const { state, actor } = await preview(page, 1);
  const gift = world(state, actor).items.find(
    (item) => !item.isRecipient && !item.archived,
  )!;
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [route, selector] of [
      ["/buying", ".text-button"],
      [`/gift/${gift.id}`, ".back-link"],
      ["/exchanges", ".assignments a"],
      ["/settings?section=profile", 'button[aria-label^="Edit profile"]'],
    ]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      const targets = page.locator(selector).filter({ visible: true });
      expect(await targets.count()).toBeGreaterThan(0);
      for (const target of await targets.all()) {
        const box = await target.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(
          `targets-${width}-${new URL(route, "http://local").pathname.replaceAll("/", "_")}.png`,
        ),
      });
    }
  }
});

test("contribution rows identify the payer and purchaser", async ({ page }) => {
  await preview(page, 1);
  await page.goto("/buying");
  await expect(
    page.getByText("Jamie Chen contributing to Sam Morgan's purchase"),
  ).toBeVisible();
  await expect(
    page.getByText("Riley Morgan contributing to Sam Morgan's purchase"),
  ).toBeVisible();
});

test("draft deletion is reversible and disabling drafts requires confirmation", async ({
  page,
}) => {
  const { actor } = await preview(page);
  await page.addInitScript(
    ({ id }) => {
      localStorage.setItem(`little-hint:draft-optin:${id}`, "yes");
      localStorage.setItem(
        `little-hint:drafts:${id}`,
        JSON.stringify([
          {
            id: "draft1",
            title: "A saved thought",
            url: "",
            description: "",
            savedAt: new Date().toISOString(),
          },
        ]),
      );
    },
    { id: actor.id },
  );
  await page.goto("/settings?section=device");
  await page
    .getByRole("button", { name: "Delete draft A saved thought" })
    .click();
  await page.getByRole("button", { name: "Undo deletion" }).click();
  await expect(
    page.getByRole("button", { name: "Delete draft A saved thought" }),
  ).toBeVisible();
  await page.getByLabel("Save wish-list drafts on this device").click();
  await expect(page.getByRole("dialog")).toContainText("1 saved draft");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByLabel("Save wish-list drafts on this device"),
  ).toBeChecked();
  await page.getByLabel("Save wish-list drafts on this device").click();
  await page
    .getByRole("button", { name: "Delete drafts and turn off" })
    .click();
  await expect(
    page.getByLabel("Save wish-list drafts on this device"),
  ).not.toBeChecked();
});

test("invitation URLs show only the intended invitation and its authorized identity", async ({
  page,
}) => {
  const { state, actors } = await preview(page, 4);
  const invitation = command(state, actors[0], "groups.invite", {
    groupId: state.groups[0].id,
    email: actors[4].email,
  }) as { id: string };
  await page.goto(`/invite/${invitation.id}`);
  await expect(
    page.getByRole("heading", { name: "Join Morgan family" }),
  ).toBeVisible();
  await expect(page.getByText(/Alex Morgan invited you/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toHaveCount(1);
  await page.goto("/invite/unavailable");
  await expect(page.getByText(/may have expired/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toHaveCount(0);
});

test("exchange exclusions use IDs and drafts can be reviewed and edited", async ({
  page,
}) => {
  const { state } = await preview(page);
  state.people[2].name = "Sam Morgan";
  await page.goto("/exchanges");
  await page
    .getByRole("button", { name: "Create exchange", exact: true })
    .click();
  await page.getByLabel("Exchange name").fill("A reviewed draw");
  await page
    .getByLabel("Giver", { exact: true })
    .selectOption(state.people[1].id);
  await page.getByLabel("Will not give to").selectOption(state.people[2].id);
  await page.getByRole("button", { name: "Add rule" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create exchange", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your exchange" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const saved = state.exchanges.find((e) => e.name === "A reviewed draw")!;
  expect(saved.exclusions).toEqual([[state.people[1].id, state.people[2].id]]);
  await page.getByRole("button", { name: "Edit exchange" }).click();
  await page.getByLabel("Exchange name").fill("A revised draw");
  await page.getByRole("button", { name: "Save exchange" }).click();
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(saved.name).toBe("A revised draw");
});

test("sharing dialogs fit desktop and phone in both themes", async ({
  page,
}) => {
  await preview(page);
  for (const width of [1280, 390])
    for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await page.emulateMedia({ colorScheme });
      await page.goto("/lists");
      await page
        .getByRole("button", { name: "Create a list", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(
        await page
          .getByRole("dialog")
          .evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: `.local/critique-visual/p1-list-${width}-${colorScheme}.png`,
      });
      await page.getByRole("button", { name: "Close dialog" }).click();
    }
});

test("search recovery and person tabs work with a keyboard", async ({
  page,
}) => {
  const { state } = await preview(page);
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Search items and gift ideas" })
    .fill("no matching gifts xyz");
  await expect(
    page.getByRole("heading", { name: "No matches found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".gift-card").first()).toBeVisible();
  await page.goto(`/people/${state.people[1].id}`);
  await page.getByRole("tab", { name: "On their wish lists" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Ideas for Sam" })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "aria-labelledby",
    "person-tab-ideas",
  );
  await expect(
    page.getByRole("heading", { name: "No gift ideas for Sam Morgan yet" }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "On their wish lists" }),
  ).toBeFocused();
});

test("person pages link accessible wish lists and keep all items with their source", async ({
  page,
}) => {
  const { state, actor, actors } = await preview(page);
  const person = state.people.find((person) => person.userId === actors[2].id)!;
  const viewer = state.people.find((person) => person.userId === actor.id)!;
  const createList = (
    name: string,
    groupIds: string[],
    ownerIds = [person.id],
  ) =>
    command(state, actors[2], "lists.create", {
      name,
      ownerIds,
      groupIds,
      mode: "surprise",
      description: "Please choose something we can enjoy together.",
    }) as List;
  const empty = createList("Birthday plans", [state.groups[0].id]);
  const privateList = createList("Private plans", []);
  const pending = createList(
    "Pending shared ownership",
    [],
    [person.id, viewer.id],
  );
  const archived = createList("Past celebration", [state.groups[0].id]);
  archived.archived = true;
  // Pending invitations are present in the response but do not grant list access.
  expect(world(state, actor).lists.some((list) => list.id === pending.id)).toBe(
    true,
  );
  command(state, actor, "items.create", {
    title: "A private idea for Jamie",
    recipientIds: [person.id],
    visibility: "private",
  });
  await page.goto(`/people/${person.id}`);
  const links = page.getByRole("navigation", {
    name: "Wish lists for Jamie Chen",
  });
  await expect(links.getByRole("link")).toHaveCount(3);
  await expect(
    links.getByRole("link", { name: "Birthday plans", exact: true }),
  ).toHaveAttribute("href", `/lists/${empty.id}`);
  for (const list of [privateList, pending, archived])
    await expect(
      links.getByRole("link", { name: list.name, exact: true }),
    ).toHaveCount(0);
  const card = (title: string) =>
    page
      .locator(".gift-card")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card("Trail daypack")).toContainText("From Jamie's wishes");
  await expect(card("Celebration puzzle")).toContainText(
    "From Family celebration",
  );
  await expect(page.locator(".gift-card")).toHaveCount(2);
  await expect(page.locator(".gift-card a")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search items", exact: true })
    .fill("Trail");
  await expect(page.locator(".gift-card")).toHaveCount(1);
  await expect(links.getByRole("link")).toHaveCount(3);
  await page
    .getByRole("textbox", { name: "Search items", exact: true })
    .fill("");
  await expect(page.locator(".gift-card")).toHaveCount(2);
  await links
    .getByRole("link", { name: "Birthday plans", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("heading", { name: "Birthday plans", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(empty.description, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No items yet", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(links).toBeVisible();
  await card("Trail daypack").click();
  await expect(
    page.getByRole("heading", { name: "Trail daypack", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await page
    .getByRole("tab", { name: "Gift ideas for Jamie", exact: true })
    .click();
  await expect(links).toHaveCount(0);
  await expect(page.locator(".gift-source-list")).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "A private idea for Jamie",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.locator(".gift-card").first()).toBeVisible();
  await expect(page.locator(".gift-source-list")).toHaveCount(0);
});

test("person lists include private owned and managed lists and explain empty lists", async ({
  page,
}) => {
  const { state, actor } = await preview(page);
  const me = state.people.find((person) => person.userId === actor.id)!;
  const managed = command(state, actor, "people.create", { name: "Casey" }) as {
    id: string;
  };
  for (const person of [me, { ...managed, name: "Casey" }]) {
    const list = command(state, actor, "lists.create", {
      name: `${person.name}'s private list`,
      ownerIds: [person.id],
      groupIds: [],
      mode: "surprise",
    }) as List;
    await page.goto(`/people/${person.id}`);
    const nav = page.getByRole("navigation", {
      name: `Wish lists for ${person.name}`,
    });
    await expect(
      nav.getByRole("link", { name: list.name, exact: true }),
    ).toHaveAttribute("href", `/lists/${list.id}`);
    if (person.id === managed.id) {
      await expect(
        page.getByRole("heading", {
          name: "No items on these wish lists yet",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          "Open a wish list above to add an item or read its notes.",
          { exact: true },
        ),
      ).toBeVisible();
    }
  }
  const other = state.people.find((person) => person.name === "Riley Morgan")!;
  state.items
    .filter((item) => item.recipientIds.includes(other.id))
    .forEach((item) => {
      item.archived = true;
    });
  await page.goto(`/people/${other.id}`);
  await expect(
    page.getByRole("navigation", { name: "Wish lists for Riley Morgan" }),
  ).toBeVisible();
  await expect(
    page.getByText("Open a wish list above to read its notes.", {
      exact: true,
    }),
  ).toBeVisible();
  state.lists
    .filter((list) => list.ownerIds.includes(other.id))
    .forEach((list) => {
      list.archived = true;
    });
  await page.reload();
  await expect(
    page.getByRole("navigation", { name: "Wish lists for Riley Morgan" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "No wish-list items shared yet",
      exact: true,
    }),
  ).toBeVisible();
});

test("person list links and source names wrap across viewports and enlarged text", async ({
  page,
}, testInfo) => {
  const { state, actors } = await preview(page);
  const person = state.people.find((person) => person.userId === actors[2].id)!;
  const list = state.lists.find((list) => list.name === "Jamie's wishes")!;
  list.name = "Birthday wishes for our next adventure together";
  for (const name of [
    "Holiday plans",
    "A celebration with friends",
    "Holiday plans",
    "Weekend wishes",
    "Things for home",
    "Summer adventures",
    "A".repeat(100),
  ]) {
    command(state, actors[2], "lists.create", {
      name,
      ownerIds: [person.id],
      groupIds: [state.groups[0].id],
      mode: "surprise",
    });
  }
  for (const [width, theme] of [
    [1440, "light"],
    [768, "dark"],
    [390, "light"],
    [320, "dark"],
  ] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/people/${person.id}`);
    await page.evaluate(
      (theme) => localStorage.setItem("little-hint:theme", theme),
      theme,
    );
    await page.reload();
    const nav = page.getByRole("navigation", {
      name: "Wish lists for Jamie Chen",
    });
    // Exercise wider fallback-font metrics on macOS as well as Linux CI.
    if (width === 320)
      await page.addStyleTag({
        content: "body { font-family: Arial, sans-serif; }",
      });
    await expect(nav.getByRole("link")).toHaveCount(9);
    await expect(page.locator(".gift-source-list").first()).toHaveText(
      `From ${list.name}`,
    );
    for (const enlarged of [false, true]) {
      if (enlarged)
        await page.evaluate(() => {
          const sizes = Array.from(
            document.querySelectorAll<HTMLElement>("body *"),
          ).map(
            (element) =>
              [
                element,
                parseFloat(getComputedStyle(element).fontSize),
              ] as const,
          );
          for (const [element, size] of sizes)
            element.style.fontSize = `${size * 2}px`;
        });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      for (const link of await nav.getByRole("link").all()) {
        const bounds = await link.boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(44);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        expect(
          await link.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
          ),
        ).toBeLessThanOrEqual(1);
      }
      for (const source of await page.locator(".gift-source-list").all()) {
        expect(
          await source.evaluate(
            (element) => element.scrollWidth - element.clientWidth,
          ),
        ).toBeLessThanOrEqual(1);
      }
      if (!enlarged || width === 320)
        await page.screenshot({
          path: testInfo.outputPath(
            `person-lists-${width}-${theme}${enlarged ? "-200" : ""}.png`,
          ),
          fullPage: true,
        });
    }
  }
});

test("creating a group leads directly to invitations", async ({ page }) => {
  await preview(page);
  await page.goto("/settings?section=groups");
  await page
    .getByRole("button", { name: "Create family group", exact: true })
    .click();
  await page.getByLabel("Family group name").fill("New circle");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create family group", exact: true })
    .click();
  await expect(page).toHaveURL(/section=groups&group=.+&view=members/);
  await expect(
    page.getByRole("combobox", { name: "Family group", exact: true }),
  ).toContainText("New circle");
  await expect(
    page.getByRole("heading", { name: "Members & invitations" }),
  ).toBeVisible();
});

test("private note success clears the composer and offline actions are disabled", async ({
  page,
  context,
}) => {
  const { state, actor } = await preview(page, 1);
  const gift = world(state, actor).items.find(
    (i) => !i.isRecipient && !i.archived && i.available && i.comments,
  )!;
  await page.goto(`/gift/${gift.id}`);
  await page.getByLabel("Your note").fill("A useful private detail");
  await page.getByRole("button", { name: "Add private note" }).click();
  await expect(
    page.getByText("A useful private detail", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Your note")).toHaveValue("");
  await context.setOffline(true);
  await expect(
    page.getByRole("button", { name: "Reserve more", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Add private note" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Reconnect to save these changes."),
  ).toBeVisible();
});

test("photo upload blocks saving and reports completion", async ({ page }) => {
  await preview(page);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/v1/media", async (route) => {
    await pending;
    await route.fulfill({
      json: { url: "/brand/little-hint/symbols/little-hint-tag-color.svg" },
    });
  });
  await page.goto("/lists");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Item name", { exact: true })
    .fill("A gift with a photo");
  await expect(page.getByLabel("Price in USD")).not.toBeVisible();
  await page.getByText("More details", { exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "gift.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture"),
  });
  await expect(
    page.getByRole("button", { name: "Add to wish list", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "Uploading photo…" }),
  ).toBeVisible();
  finish();
  await expect(
    page.getByRole("status").filter({ hasText: "Photo uploaded." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add to wish list", exact: true }),
  ).toBeEnabled();
});

test("security identifies this device and admin failures never show zero pending", async ({
  page,
}) => {
  const { actor } = await preview(page);
  const session = {
    id: "this-session",
    token: "fixture-token",
    userId: actor.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    userAgent: "Mozilla/5.0 (Macintosh) Chrome/130 Safari/537",
  };
  await page.route("**/api/auth/list-sessions", (route) =>
    route.fulfill({ json: [session] }),
  );
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: { session, user: actor } }),
  );
  await page.route("**/api/v1/admin/jobs", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/settings?section=security");
  await expect(
    page.getByText("Chrome on Mac · This device", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Sign out Chrome on Mac, signed in.*on this device/,
    }),
  ).toBeVisible();
  await page.goto("/settings?section=admin");
  await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
  await expect(page.getByText(/0 shop lookups waiting/)).toHaveCount(0);
  await expect(
    page.getByText(/Updates and shop lookups: No recent activity reported/),
  ).toHaveCount(0);
});

test("SMS verification offers resend and number correction", async ({
  page,
}) => {
  await preview(page);
  const phones: string[] = [];
  await page.route("**/api/v1/channels/sms/start", (route) => {
    phones.push(route.request().postDataJSON().phone);
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/settings?section=notifications");
  await page.getByRole("button", { name: "Set up text messages" }).click();
  await page.getByLabel("US mobile number").fill("+13175551234");
  await page.getByRole("checkbox", { name: /I agree/ }).check();
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Code sent to +13175551234" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resend code" }).click();
  await expect(page.getByText(/Another code was sent/)).toBeVisible();
  expect(phones).toEqual(["+13175551234", "+13175551234"]);
  await page.getByRole("button", { name: "Change number" }).click();
  await expect(page.getByLabel("US mobile number")).toHaveValue("+13175551234");
});

test("adding a saved draft refreshes the device list", async ({ page }) => {
  const { actor } = await preview(page);
  await page.addInitScript((id) => {
    localStorage.setItem(`little-hint:draft-optin:${id}`, "yes");
    localStorage.setItem(
      `little-hint:drafts:${id}`,
      JSON.stringify([
        {
          id: "draft-to-add",
          title: "Remembered gift",
          url: "",
          description: "",
          savedAt: new Date().toISOString(),
        },
      ]),
    );
  }, actor.id);
  await page.goto("/settings?section=device");
  await page.getByRole("button", { name: "Review & add" }).click();
  await page.getByRole("button", { name: "Add to wish list" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(/No drafts saved on this device/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review & add" })).toHaveCount(
    0,
  );
});

test("P2 mobile and desktop surfaces retain layout and accessible names", async ({
  page,
}) => {
  const { state, actor } = await preview(page);
  const gift = world(state, actor).items.find(
    (i) => !i.isRecipient && !i.archived,
  )!;
  for (const width of [1280, 390])
    for (const colorScheme of ["light", "dark"] as const) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 844 });
      await page.emulateMedia({ colorScheme });
      for (const [name, route] of [
        ["gift", `/gift/${gift.id}`],
        ["notifications", "/settings?section=notifications"],
        ["security", "/settings?section=security"],
      ]) {
        await page.goto(route);
        await expect(page.locator("main h1")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(1);
        if (name === "gift" && width === 390)
          expect(
            await page
              .locator(".gift-detail > .gift-photo")
              .evaluate((el) => el.getBoundingClientRect().height),
          ).toBeLessThanOrEqual(100);
        await page.screenshot({
          path: `.local/critique-visual/p2-${name}-${width}-${colorScheme}.png`,
          fullPage: true,
        });
      }
    }
});

test("a single reserved gift can be marked purchased from Buying", async ({
  page,
}) => {
  const { state, actor } = await preview(page, 1);
  const reservation = world(state, actor).buying.find(
    (r) => r.quantity === 1 && r.purchased === 0,
  )!;
  await page.goto("/buying");
  await page
    .getByRole("button", {
      name: `Mark ${reservation.titleSnapshot} as purchased`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Marked as purchased." }),
  ).toBeVisible();
  expect(
    state.reservations.find((r) => r.id === reservation.id)?.purchased,
  ).toBe(1);
});

test("idea audience controls match the saved privacy choice", async ({
  page,
}) => {
  const { state, actors } = await preview(page);
  const recipient = state.people.find(
    (person) => person.userId === actors[1].id,
  )!;
  await page.goto(`/people/${recipient.id}`);
  await page
    .getByRole("button", { name: "Add gift idea", exact: true })
    .first()
    .click();
  const audience = page.getByLabel("Who can see this idea?");
  const groups = page.getByRole("group", {
    name: "Share with these family groups",
  });
  await page
    .getByLabel("Gift idea name", { exact: true })
    .fill("A thoughtful idea");
  await expect(groups).toBeHidden();
  await expect(
    page.getByText("Only you can see this idea.", { exact: true }),
  ).toBeVisible();
  await audience.selectOption("hidden");
  const save = page.getByRole("button", {
    name: "Save gift idea",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await expect(
    page.getByText("Choose at least one family group to share this idea."),
  ).toBeVisible();
  await groups.getByLabel("Morgan family", { exact: true }).check();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Visible to you and members of Morgan family." }),
  ).toContainText(
    "Hidden from the recipient and anyone managing their profile.",
  );
  await expect(save).toBeEnabled();
  await audience.selectOption("private");
  await expect(groups).toBeHidden();
  await audience.selectOption("hidden");
  await expect(
    groups.getByLabel("Morgan family", { exact: true }),
  ).toBeChecked();
  await audience.selectOption("private");
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const idea = state.items.find((item) => item.title === "A thoughtful idea")!;
  expect(idea).toMatchObject({ visibility: "private", groupIds: [] });
  expect(
    world(state, actors[1]).items.some((item) => item.id === idea.id),
  ).toBe(false);
  expect(
    world(state, actors[2]).items.some((item) => item.id === idea.id),
  ).toBe(false);

  await page.goto(`/gift/${idea.id}`);
  await page
    .getByRole("button", { name: "Edit gift idea", exact: true })
    .click();
  await audience.selectOption("hidden");
  await groups.getByLabel("Morgan family", { exact: true }).check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(idea.visibility).toBe("hidden");
  expect(
    world(state, actors[1]).items.some((item) => item.id === idea.id),
  ).toBe(false);
  expect(
    world(state, actors[2]).items.some((item) => item.id === idea.id),
  ).toBe(true);

  await page
    .getByRole("button", { name: "Edit gift idea", exact: true })
    .click();
  await expect(audience).toHaveValue("hidden");
  await expect(
    groups.getByLabel("Morgan family", { exact: true }),
  ).toBeChecked();
  await audience.selectOption("visible");
  await expect(
    page.getByText(
      "Visible to you, members of Morgan family, the recipient and anyone managing their profile.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    world(state, actors[1]).items.some((item) => item.id === idea.id),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Edit gift idea", exact: true })
    .click();
  await audience.selectOption("private");
  await expect(groups).toBeHidden();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(idea).toMatchObject({ visibility: "private", groupIds: [] });
  expect(
    world(state, actors[1]).items.some((item) => item.id === idea.id),
  ).toBe(false);
  expect(
    world(state, actors[2]).items.some((item) => item.id === idea.id),
  ).toBe(false);
});

test("gift availability keeps personal reservations and their next action in view", async ({
  page,
}) => {
  const { state, actor } = await preview(page, 1);
  const gift = state.items.find(
    (item) => item.title === "Ceramic pour-over set",
  )!;
  await page.goto(`/gift/${gift.id}`);
  const status = page.locator(".gift-detail .status");
  await expect(status).toHaveText(
    "1 available to reserve · You reserved 1 · 0 purchased",
  );
  await page
    .getByRole("link", { name: "Manage reservation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/buying$/);
  await expect(
    page.getByRole("heading", { name: gift.title, exact: true }),
  ).toBeVisible();
  await page.goto(`/gift/${gift.id}`);
  await expect(
    page.getByLabel("Additional quantity", { exact: true }),
  ).toHaveValue("1");
  await page.getByRole("button", { name: "Reserve more", exact: true }).click();
  await expect(status).toHaveText(
    "Taken care of · You reserved 2 · 0 purchased",
  );
  await expect(
    page.getByRole("button", { name: "Reserve more", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Manage reservations", exact: true }),
  ).toBeVisible();
  const mine = state.reservations.filter(
    (reservation) =>
      reservation.itemId === gift.id && reservation.buyerId === actor.id,
  );
  command(state, actor, "reservations.update", { ...mine[0], purchased: 1 });
  await page.reload();
  await expect(status).toHaveText(
    "Taken care of · You reserved 2 · 1 purchased",
  );
  gift.archived = true;
  await page.reload();
  await expect(status).toHaveText("Archived · You reserved 2 · 1 purchased");
  await expect(
    page.getByRole("link", { name: "Manage reservations", exact: true }),
  ).toBeVisible();
  gift.archived = false;
  for (const reservation of mine)
    command(state, actor, "reservations.update", {
      ...reservation,
      quantity: 0,
      purchased: 0,
    });
  await page.reload();
  await expect(status).toHaveText("2 available to reserve");
  await expect(
    page.getByRole("link", { name: /^Manage reservations?$/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reserve gift", exact: true }),
  ).toBeVisible();

  const recipientFixture = await preview(page);
  const ownGift = recipientFixture.state.items.find(
    (item) => item.title === "Ceramic pour-over set",
  )!;
  await page.goto(`/gift/${ownGift.id}`);
  await expect(status).toHaveText(
    "On your list · Buying plans stay a surprise",
  );
  await expect(page.getByText(/You reserved/)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /^Manage reservations?$/ }),
  ).toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 1000, theme: "light" },
  { width: 390, height: 844, theme: "dark" },
]) {
  test(`clarified guidance fits ${viewport.width}px ${viewport.theme} views`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    const { state, actor, actors } = await preview(page);
    const gift = state.items.find((item) => item.title === "Picnic blanket")!;
    await page.goto(`/gift/${gift.id}`);
    await page.evaluate(
      (theme) => localStorage.setItem("little-hint:theme", theme),
      viewport.theme,
    );
    await page.reload();
    await expect(
      page.getByRole("link", { name: "Manage reservation", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("reservation.png"),
      fullPage: true,
    });
    const person = state.people.find(
      (person) => person.userId === actors[1].id,
    )!;
    const idea = command(state, actor, "items.create", {
      title: "A gift idea",
      recipientIds: [person.id],
      visibility: "hidden",
      groupIds: state.groups.map((group) => group.id),
    }) as { id: string };
    await page.goto(`/gift/${idea.id}`);
    await page
      .getByRole("button", { name: "Edit gift idea", exact: true })
      .click();
    await expect(
      page.getByText(
        /Visible to you and members of Morgan family, Weekend friends/,
      ),
    ).toBeVisible();
    await page
      .getByRole("status")
      .filter({ hasText: "Visible to you" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("audience.png") });
    await page.goto("/settings?section=admin");
    const guidance = page.getByText(/Backups are managed outside Little Hint/);
    await expect(guidance).toBeVisible();
    await expect(
      page.getByText(/Updates and shop lookups: Running/),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Housewatch Digital manages backups|restore progress in Coolify/,
      ),
    ).toHaveCount(0);
    await guidance.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("backups.png") });
    await page.route("**/api/v1/admin/jobs", (route) =>
      route.fulfill({ status: 503, json: { error: "Unavailable" } }),
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Check again", exact: true }),
    ).toBeVisible();
    await expect(guidance).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
}

test("wish-list items and ideas for others keep distinct names through saving and editing", async ({
  page,
}) => {
  const { state, actor } = await preview(page);
  const mine = state.lists.find((list) => list.name === "Alex's wishes")!;
  const other = state.people.find((person) => person.name === "Sam Morgan")!;
  const managed = command(state, actor, "people.create", { name: "Casey" }) as {
    id: string;
  };
  const managedList = command(state, actor, "lists.create", {
    name: "Casey's wish list",
    ownerIds: [managed.id],
    groupIds: [state.groups[0].id],
    mode: "surprise",
  }) as { id: string };

  await page.goto(`/lists/${mine.id}`);
  await expect(
    page.getByRole("textbox", { name: "Search items", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByLabel("Item name", { exact: true }).fill("My new item");
  await page
    .getByRole("button", { name: "Add to wish list", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const item = state.items.find((entry) => entry.title === "My new item")!;
  expect(item.listId).toBe(mine.id);
  await page.goto(`/gift/${item.id}`);
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("My edited item");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My edited item", exact: true }),
  ).toBeVisible();

  await page.goto(`/lists/${managedList.id}`);
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByLabel("Item name", { exact: true }).fill("An item for Casey");
  await page
    .getByRole("button", { name: "Add to wish list", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    state.items.find((entry) => entry.title === "An item for Casey")
      ?.recipientIds,
  ).toEqual([managed.id]);

  await page.goto(`/people/${other.id}`);
  await page
    .getByRole("button", { name: "Add gift idea", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Gift idea name", { exact: true })
    .fill("A private idea for Sam");
  await page
    .getByRole("button", { name: "Save gift idea", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const idea = state.items.find(
    (entry) => entry.title === "A private idea for Sam",
  )!;
  expect(idea.listId).toBeUndefined();
  expect(idea.recipientIds).toEqual([other.id]);
  expect(idea.visibility).toBe("private");
  await page.goto(`/gift/${idea.id}`);
  await page
    .getByRole("button", { name: "Edit gift idea", exact: true })
    .click();
  await page
    .getByLabel("Gift idea name", { exact: true })
    .fill("An edited idea for Sam");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "An edited idea for Sam", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reserve gift", exact: true }),
  ).toBeVisible();
});
