import { test, expect, type Page } from "@playwright/test";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { command, world } from "../src/server/domain";

async function preview(page: Page, actorIndex = 0) {
  const fixture = stagingFixtures();
  const actor = fixture.actors[actorIndex];
  const paths: Record<string, string> = {
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
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .last()
    .click();
  await page.getByLabel("Item name", { exact: true }).fill("Do not lose this");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "Discard your changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(page.getByLabel("Item name", { exact: true })).toHaveValue(
    "Do not lose this",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
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
    page.getByRole("button", { name: "Reserve gift" }),
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
