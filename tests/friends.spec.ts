import { discussionAudience } from "../src/server/discussion-access";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { activateAccount, command, stamp, world } from "../src/server/domain";
import { spendingView } from "../src/server/spending";
import { discoveryFixture } from "./gift-discovery-fixture";

async function fixture(page: Page) {
  const f = discoveryFixture();
  let actor = f.actors[0];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1/", "");
    try {
      if (/^items\/[^/]+\/discussion-audience$/.test(path)) {
        const q = Object.fromEntries(url.searchParams);
        return route.fulfill({
          json: discussionAudience(
            f.state,
            actor,
            path.split("/")[1],
            q.commentId,
            { ...q, ordinary: q.ordinary === "true" },
          ),
        });
      }
      if (path === "world")
        return route.fulfill({
          json: {
            ...world(f.state, actor),
            environment: "development",
            giftDiscovery: { available: false, mode: "off" },
          },
        });
      if (path.startsWith("imports/") && route.request().method() === "GET")
        return route.fulfill({
          json: f.state.imports.find((j) => j.id === path.split("/")[1]),
        });
      if (path.startsWith("buying/"))
        return route.fulfill({ json: { rows: [], nextCursor: null } });
      if (path === "spending")
        return route.fulfill({ json: spendingView(f.state, actor) });
      if (route.request().method() === "POST") {
        const action =
          path === "friends"
            ? "friends.create"
            : path === "items"
              ? "items.create"
              : path === "reservations"
                ? "reservations.create"
                : path.replace("/", ".");
        return route.fulfill({
          json: command(f.state, actor, action, route.request().postDataJSON()),
        });
      }
      return route.fulfill({ json: [] });
    } catch (error) {
      return route.fulfill({
        status: 400,
        json: { error: (error as Error).message },
      });
    }
  });
  return {
    ...f,
    actor,
    setActor(next: typeof actor) {
      actor = next;
    },
  };
}

test("name-only friend saves a private idea and can be archived and restored", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("/people");
  await page.getByRole("button", { name: "Add a friend", exact: true }).click();
  await page.getByLabel("Friend's name").fill("Taylor");
  await page.getByRole("button", { name: "Add friend", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Taylor", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Private friend entry", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add gift idea", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Who can see this idea?")).toHaveValue(
    "private",
  );
  await expect(
    page
      .getByLabel("Who can see this idea?")
      .locator('option[value="visible"]'),
  ).toHaveCount(0);
  await page
    .getByLabel("Gift idea name", { exact: true })
    .fill("Christmas coffee set");
  await page
    .getByRole("button", { name: "Save gift idea", exact: true })
    .click();
  await expect(
    page.getByText("Christmas coffee set", { exact: true }),
  ).toBeVisible();
  expect(
    f.state.items.find((i) => i.title === "Christmas coffee set")?.visibility,
  ).toBe("private");
  await page.getByLabel("Friend actions for Taylor", { exact: true }).click();

  await page
    .getByRole("button", { name: "Archive friend", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Archive friend", exact: true })
    .click();
  await expect(
    page.getByText("Archived planning entry", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add gift idea", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Restore friend", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore friend", exact: true })
    .click();
  await expect(
    page.getByText("Private friend entry", { exact: true }),
  ).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  for (const mobile of [false, true]) {
    test(`friend planning renders accessibly ${theme} ${mobile ? "mobile" : "desktop"}`, async ({
      page,
    }, info) => {
      const f = await fixture(page);
      const friend = command(f.state, f.actor, "friends.create", {
        name: "Taylor",
      }) as { personId: string };
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
      );
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`/people/${friend.personId}?tab=ideas`);
      await expect(
        page.getByRole("heading", { name: "Taylor", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(
          `friend-${theme}-${mobile ? "mobile" : "desktop"}.png`,
        ),
        fullPage: true,
      });
      const menu = page.getByLabel("Friend actions for Taylor", {
        exact: true,
      });
      await expect(
        page.getByRole("button", { name: "Archive friend", exact: true }),
      ).not.toBeVisible();
      await menu.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("button", { name: "Archive friend", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(
          `friend-actions-${theme}-${mobile ? "mobile" : "desktop"}.png`,
        ),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await menu.click();
      await page
        .getByRole("button", { name: "Manage friend", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({
        path: info.outputPath(
          `friend-manage-${theme}-${mobile ? "mobile" : "desktop"}.png`,
        ),
        fullPage: true,
      });
      const results = await new AxeBuilder({ page })
        .include("dialog")
        .analyze();
      expect(results.violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}

test("sharing requires review and unsharing preserves private ideas", async ({
  page,
}) => {
  const f = await fixture(page);
  const friend = command(f.state, f.actor, "friends.create", {
    name: "Taylor",
  }) as { id: string; personId: string };
  await page.goto(`/people/${friend.personId}?tab=ideas`);
  await page.getByLabel("Friend actions for Taylor", { exact: true }).click();

  await page
    .getByRole("button", { name: "Manage friend", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Family", exact: true }).check();
  await page.getByRole("button", { name: "Save friend", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review who can plan gifts" }),
  ).toBeFocused();
  expect(f.state.friendEntries[0].groupIds).toEqual([]);
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    page.getByText("Shared for gift planning with Family", { exact: true }),
  ).toBeVisible();
  const idea = command(f.state, f.actor, "items.create", {
    title: "Shared coffee gift",
    recipientIds: [friend.personId],
    visibility: "hidden",
    groupIds: [f.group.id],
  }) as { id: string };
  expect(world(f.state, f.actors[1]).items.some((i) => i.id === idea.id)).toBe(
    true,
  );
  await page.getByLabel("Friend actions for Taylor", { exact: true }).click();

  await page
    .getByRole("button", { name: "Manage friend", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Family", exact: true }).uncheck();
  await page.getByRole("button", { name: "Save friend", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    page.getByText("Private friend entry", { exact: true }),
  ).toBeVisible();
  expect(world(f.state, f.actors[1]).items.some((i) => i.id === idea.id)).toBe(
    false,
  );
  expect(world(f.state, f.actor).items.some((i) => i.id === idea.id)).toBe(
    true,
  );
});

for (const accept of [true, false]) {
  test(`friend invitation ${accept ? "accepts a new account" : "declines an existing account"} without sharing ideas`, async ({
    page,
  }) => {
    const f = await fixture(page);
    const friend = command(f.state, f.actor, "friends.create", {
      name: "Taylor",
    }) as { id: string; personId: string };
    const target = accept
      ? { id: "new-taylor", name: "Taylor", email: "taylor@example.test" }
      : f.actors[2];
    command(f.state, f.actor, "items.create", {
      title: "Secret coffee gift",
      recipientIds: [friend.personId],
    });
    await page.goto(`/people/${friend.personId}?tab=ideas`);
    await page
      .getByRole("button", { name: "Invite to connect", exact: true })
      .click();
    await page.getByLabel("Email address", { exact: true }).fill(target.email);
    await page
      .getByRole("button", { name: "Send connection invitation", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "waiting to be emailed" }),
    ).toBeVisible();
    const invitation = f.state.invitations.find(
      (i) => i.friendEntryId === friend.id,
    )!;
    if (accept) activateAccount(f.state, target);
    expect(f.state.friendEntries[0].connectedAt).toBeUndefined();
    f.setActor(target);
    await page.goto(`/invite/${invitation.id}`);
    await expect(
      page.getByRole("heading", { name: "Friend connection invitation" }),
    ).toBeVisible();
    await expect(
      page.getByText("Secret coffee gift", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: accept ? "Accept connection" : "Decline",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: accept ? "You're connected" : "Connection declined",
        exact: true,
      }),
    ).toBeVisible();
    expect(!!f.state.friendEntries[0].connectedAt).toBe(accept);
    expect(
      world(f.state, target).items.some(
        (i) => i.title === "Secret coffee gift",
      ),
    ).toBe(false);
  });
}

test("a private friend idea can be reserved and marked purchased", async ({
  page,
}) => {
  const f = await fixture(page);
  const friend = command(f.state, f.actor, "friends.create", {
    name: "Taylor",
  }) as { personId: string };
  const idea = command(f.state, f.actor, "items.create", {
    title: "Coffee gift",
    recipientIds: [friend.personId],
  }) as { id: string };
  await page.goto(`/gift/${idea.id}`);
  await expect(page.locator(".discussion form")).toContainText(
    "Visible to: Only you",
  );
  await page.getByRole("button", { name: "Reserve gift", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Gift reserved" }),
  ).toBeVisible();
  await page.goto("/buying");
  await page
    .getByRole("button", { name: "Mark Coffee gift as purchased", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Marked as purchased" }),
  ).toBeVisible();
  expect(
    f.state.reservations.find((r) => r.itemId === idea.id)?.purchased,
  ).toBe(1);
});

test("accepting one inline connection leaves the other invitation available", async ({
  page,
}) => {
  const f = await fixture(page);
  for (const name of ["Taylor at work", "Taylor at school"]) {
    const friend = command(f.state, f.actor, "friends.create", { name }) as {
      id: string;
    };
    command(f.state, f.actor, "friends.invite", {
      id: friend.id,
      email: f.actors[2].email,
    });
  }
  f.setActor(f.actors[2]);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Accept connection", exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole("button", { name: "Accept connection", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Accept connection", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Accept connection", exact: true }),
  ).toHaveCount(0);
});

test("recovered friend draft switches recipient without retaining the previous context", async ({
  page,
}) => {
  const f = await fixture(page);
  const friend = command(f.state, f.actor, "friends.create", {
    name: "Taylor",
  }) as { id: string; personId: string };
  const next = command(f.state, f.actor, "friends.create", {
    name: "Morgan",
  }) as { id: string; personId: string };
  const draft = {
    ...stamp(),
    userId: f.actor.id,
    url: "https://example.test/coffee",
    status: "complete" as const,
    draft: {
      kind: "idea" as const,
      recipientId: friend.personId,
      friendEntryId: friend.id,
      visibility: "private" as const,
      groupIds: [],
      revision: 1,
      state: "active" as const,
      fields: {
        title: "Draft coffee gift",
        url: "https://example.test/coffee",
      },
      touched: ["title"],
    },
  };
  f.state.imports.push(draft);
  await page.goto(`/people/${friend.personId}?tab=ideas&draft=${draft.id}`);
  await page
    .getByLabel("Who is this idea for?", { exact: true })
    .selectOption(next.personId);
  await page
    .getByRole("button", { name: "Save gift idea", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = f.state.items.find((i) => i.title === "Draft coffee gift")!;
  expect(saved.recipientIds).toEqual([next.personId]);
  expect(saved.friendEntryId).toBe(next.id);
});

test("long friend names and enlarged text fit a narrow phone", async ({
  page,
}) => {
  const f = await fixture(page);
  const name = "Taylor Alexandra Montgomery and the Christmas planning friends";
  const friend = command(f.state, f.actor, "friends.create", { name }) as {
    personId: string;
  };
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto(`/people/${friend.personId}?tab=ideas`);
  await page.addStyleTag({ content: "html { font-size: 125%; }" });
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Invite to connect", exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        document.querySelector("dialog")!.scrollWidth <=
        document.querySelector("dialog")!.clientWidth,
    ),
  ).toBe(true);
});

test("connected account sharing and gift controls polish", async ({
  page,
}, info) => {
  const f = await fixture(page);
  const entry = command(f.state, f.actor, "friends.create", {
    name: "Taylor",
  }) as any;
  const privateIdea = command(f.state, f.actor, "items.create", {
    title: "Private book",
    recipientIds: [entry.personId],
  }) as any;
  const inv = command(f.state, f.actor, "friends.invite", {
    id: entry.id,
    email: f.actors[2].email,
  }) as any;
  command(f.state, f.actors[2], "invitations.accept", { id: inv.id });
  await page.goto(`/people/${entry.personId}?tab=ideas`);
  await expect(
    page.getByRole("region", { name: "Friend planning" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Sort & filter/ }).click();
  await page
    .getByRole("combobox", { name: "Visibility", exact: true })
    .selectOption("shared");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No matches found" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Sort & filter/ }).click();
  await page
    .getByRole("combobox", { name: "Visibility", exact: true })
    .selectOption("only-me");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("Private book", { exact: true })).toBeVisible();
  for (const width of [390, 768, 1280])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 950 });
      await page
        .locator("html")
        .evaluate((el, t) => (el.dataset.theme = t), theme);
      await page.screenshot({
        path: info.outputPath(`connected-${width}-${theme}.png`),
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  await page
    .getByRole("button", { name: "Add gift idea", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByLabel("Who can see this idea?")
      .locator('option[value="visible"]'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto(`/gift/${privateIdea.id}`);
  await page
    .getByRole("button", { name: "Edit gift idea", exact: true })
    .click();
  const note = page.getByRole("textbox", {
    name: "A helpful note",
    exact: true,
  });
  await note.fill("A useful book");
  await note.press("ControlOrMeta+a");
  await page
    .getByRole("button", { name: "Add or edit link", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove link", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Link address").fill("https://example.com/book");
  await page.getByRole("button", { name: "Apply link", exact: true }).click();
  await page
    .getByRole("button", { name: "Add or edit link", exact: true })
    .click();
  for (const width of [320, 390, 768, 1280])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 950 });
      await page
        .locator("html")
        .evaluate((el, t) => (el.dataset.theme = t), theme);
      await page
        .getByRole("button", { name: "Remove link", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`link-${width}-${theme}.png`),
        fullPage: true,
      });
      expect(
        await page
          .getByRole("dialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
  await page.getByRole("button", { name: "Remove link", exact: true }).click();
  await expect(note.locator("a")).toHaveCount(0);
  await expect(note).toHaveText("A useful book");
});

test("reservation summary help and event icon polish", async ({
  page,
}, info) => {
  const f = await fixture(page);
  f.list.revealAfter = "2030-12-26";
  f.list.timeZone = "America/Indiana/Indianapolis";
  f.setActor(f.actors[1]);
  await page.goto(`/gift/${f.wish.id}`);
  await expect(
    page.getByText(
      "List owners can view the gift summary after Dec 26, 2030.",
      { exact: true },
    ),
  ).toBeVisible();
  for (const width of [390, 1280])
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 950 });
      await page
        .locator("html")
        .evaluate((el, t) => (el.dataset.theme = t), theme);
      const trigger = page.getByRole("button", {
        name: "About gift summary privacy",
      });
      await trigger.click();
      await expect(
        page.getByRole("dialog", { name: "Gift summary privacy", exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`reservation-${width}-${theme}.png`),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
  f.setActor(f.actors[0]);
  await page.goto("/lists");
  await expect(
    page
      .getByRole("button", { name: "Create event", exact: true })
      .locator("svg.lucide-calendar-plus"),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("create-event.png"),
    fullPage: true,
  });
});
