import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { command, world } from "../src/server/domain";
import {
  createDiscovery,
  startDiscovery,
  discoveryContext,
  discoveryJob,
  prepareDiscoveryReview,
  saveDiscoveryReview,
  newPreference,
} from "../src/server/gift-discovery";
import {
  discoveryFixture,
  discoveryConfig,
  candidate,
} from "./gift-discovery-fixture";

async function preview(page: Page, own = false) {
  const f = discoveryFixture(),
    actor = f.actors[own ? 0 : 1];
  const cfg = {
    ...discoveryConfig,
    mode: "givers" as typeof discoveryConfig.mode,
  };
  const counts = { search: 0, save: 0 };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/",
      "",
    );
    try {
      let value: unknown;
      if (path === "world")
        value = {
          ...world(f.state, actor),
          giftDiscovery: cfg,
          environment: "development",
        };
      else if (path.startsWith("gift-discovery/context/"))
        value = discoveryContext(f.state, actor, cfg, path.split("/").at(-1)!);
      else if (path === "gift-discovery") {
        counts.search++;
        const j = createDiscovery(
          f.state,
          actor,
          cfg,
          route.request().postDataJSON(),
        );
        startDiscovery(f.state, actor, cfg, j.id);
        j.status = "complete";
        j.candidates = Array.from({ length: 12 }, (_, i) => candidate(i));
        value = j;
      } else if (path.startsWith("gift-discovery/")) {
        const [, id, action] = path.split("/");
        if (action === "review")
          value = prepareDiscoveryReview(
            f.state,
            actor,
            cfg,
            id,
            route.request().postDataJSON(),
          );
        else if (action === "save") {
          counts.save++;
          value = saveDiscoveryReview(
            f.state,
            actor,
            cfg,
            id,
            route.request().postDataJSON(),
          );
        } else value = discoveryJob(f.state, actor, cfg, id);
      } else if (path === "gift-preferences")
        value = command(
          f.state,
          actor,
          "gift-preferences.update",
          route.request().postDataJSON(),
        );
      else if (
        path.includes("list-sessions") ||
        path.includes("list-user-passkeys")
      )
        value = [];
      else
        return route.fulfill({
          status: 404,
          json: { error: "Not in this fixture" },
        });
      return route.fulfill({ json: value });
    } catch (error) {
      return route.fulfill({
        status: 400,
        json: { error: (error as Error).message },
      });
    }
  });
  return { ...f, cfg, counts };
}
for (const width of [1440, 390]) {
  test(`gift suggestions, free shuffle and explicit confirmation at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 960 });
    const f = await preview(page);
    await page.goto(`/people/${f.people[0].id}/gift-ideas`);
    await expect(
      page.getByRole("heading", { name: "Find gift ideas for Receiver" }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "Coffee & tea" }),
    ).toBeChecked();
    await page.getByLabel("Maximum price per gift", { exact: true }).fill("50");
    await page
      .getByRole("button", { name: "Find gift ideas", exact: true })
      .click();
    await expect(page.locator(".discovery-product")).toHaveCount(6);
    expect(f.counts.search).toBe(1);
    expect(f.state.items).toHaveLength(1);
    await page.getByRole("button", { name: "Show different ideas" }).click();
    await expect(
      page.getByRole("heading", { name: "Coffee brewer 6", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Show earlier ideas" }).click();
    expect(f.counts.search).toBe(1);
    await expect(
      page.getByRole("heading", { name: "Coffee brewer 0", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`discovery-${width}.png`),
      fullPage: true,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
      .getByRole("checkbox", { name: "Select Coffee brewer 0", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Review 1 gift", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Confirm your gifts" }),
    ).toBeFocused();
    await expect(
      page.getByText("Gift idea for Receiver. Only you can see this idea."),
    ).toBeVisible();
    expect(f.counts.save).toBe(0);
    expect(f.state.items).toHaveLength(1);
    await page.screenshot({
      path: info.outputPath(`confirmation-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Confirm and add gifts" }).click();
    await expect(
      page.getByText("Your selected gifts were saved."),
    ).toBeVisible();
    expect(f.counts.save).toBe(1);
    expect(f.state.items).toHaveLength(2);
    expect(f.state.items[1].visibility).toBe("private");
    expect(f.state.reservations).toHaveLength(0);
  });
}
test("preferences work while AI is off, require sharing review, and hide discovery", async ({
  page,
}) => {
  const f = await preview(page, true);
  f.cfg.mode = "off";
  f.cfg.available = false;
  await page.goto(`/people/${f.people[0].id}`);
  await expect(page.getByRole("link", { name: "Find gift ideas" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Gift preferences", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Coffee & tea" }).check();
  await page.getByRole("checkbox", { name: "Family", exact: true }).check();
  await page.getByRole("button", { name: "Save gift preferences" }).click();
  await expect(
    page.getByRole("heading", { name: "Share these gift preferences?" }),
  ).toBeVisible();
  expect(f.state.giftPreferences).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm and save" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.state.giftPreferences[0].groupIds).toEqual([f.group.id]);
  expect(f.counts.search).toBe(0);
  await page.goto(`/people/${f.people[0].id}/gift-ideas`);
  await expect(
    page.getByRole("heading", { name: "Gift suggestions are unavailable" }),
  ).toBeVisible();
});
test("new users can skip preferences without sharing unfinished edits", async ({
  page,
}) => {
  const f = await preview(page, true);
  f.state.giftPreferences.push(newPreference(f.people[0].id));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What would you love?" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Coffee & tea" }).check();
  await page.getByRole("checkbox", { name: "Family", exact: true }).check();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(
    page.getByRole("heading", { name: "Hi, Receiver." }),
  ).toBeVisible();
  expect(f.state.giftPreferences[0]).toMatchObject({
    setup: "skipped",
    categoryIds: [],
    groupIds: [],
  });
});

test("discovery departure preserves item edits until discard is confirmed", async ({
  page,
}) => {
  const f = await preview(page, true);
  f.cfg.mode = "both";
  await page.goto(`/lists/${f.list.id}`);
  const add = page
    .getByRole("main")
    .getByRole("button", { name: "Add item", exact: true });
  await add.click();
  const name = page.getByLabel("Item name", { exact: true });
  await name.fill("Keep this unfinished wish");
  const discovery = page
    .getByRole("dialog")
    .getByRole("link", { name: "Find gift ideas" });
  await discovery.click();
  await expect(
    page.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/lists/${f.list.id}$`));
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(name).toHaveValue("Keep this unfinished wish");
  await expect(discovery).toBeFocused();

  // Cancelling the navigation must also clear its pending destination.
  await discovery.click();
  await page.keyboard.press("Escape");
  await expect(name).toHaveValue("Keep this unfinished wish");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/lists/${f.list.id}$`));
  await expect(add).toBeFocused();

  await add.click();
  await name.fill("Discard only after asking");
  await discovery.click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(
    new RegExp(`/people/${f.people[0].id}/gift-ideas\\?list=${f.list.id}$`),
  );
  expect(f.state.items).toHaveLength(1);

  // A clean form still follows the link immediately.
  await page.goto(`/lists/${f.list.id}`);
  await add.click();
  await discovery.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Find gift ideas for Receiver" }),
  ).toBeVisible();
});

test("discovery cannot interrupt a gift idea while it is saving", async ({
  page,
}) => {
  const f = await preview(page);
  await page.goto(`/people/${f.people[0].id}`);
  await page
    .getByRole("button", { name: "Add gift idea", exact: true })
    .click();
  await page
    .getByLabel("Gift idea name", { exact: true })
    .fill("Save this idea");
  const discovery = page
    .getByRole("dialog")
    .getByRole("link", { name: "Find gift ideas" });
  await discovery.click();
  await page.getByRole("button", { name: "Keep editing" }).click();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/items", async (route) => {
    await pending;
    await route.fulfill({
      json: command(
        f.state,
        f.actors[1],
        "items.create",
        route.request().postDataJSON(),
      ),
    });
  });
  try {
    await page
      .getByRole("button", { name: "Save gift idea", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Saving…", exact: true }),
    ).toBeVisible();
    await discovery.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Discard your changes?" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/people/${f.people[0].id}$`));
  } finally {
    release();
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    f.state.items.find((item) => item.title === "Save this idea"),
  ).toBeDefined();
});

for (const width of [1280, 390]) {
  test(`optional onboarding keeps Skip visible and navigation usable at ${width}px`, async ({
    page,
  }, info) => {
    const f = await preview(page, true);
    f.state.giftPreferences.push(newPreference(f.people[0].id));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 720 });
    await page.emulateMedia({ colorScheme: width === 390 ? "dark" : "light" });
    await page.goto("/");
    const skip = page.getByRole("button", { name: "Skip for now" });
    await expect(skip).toBeInViewport();
    await page.screenshot({
      path: info.outputPath(`onboarding-${width}.png`),
      fullPage: false,
    });
    await page.getByRole("checkbox", { name: "Coffee & tea" }).check();
    await page
      .getByLabel("Specific interests", { exact: true })
      .fill("Unpublished interests");
    await page.getByRole("checkbox", { name: "Family", exact: true }).check();
    const nav = page.getByRole("navigation", {
      name: width === 390 ? "Mobile navigation" : "Main navigation",
      exact: true,
    });
    await nav.getByRole("link", { name: "My lists", exact: true }).click();
    await expect(page).toHaveURL(/\/lists$/);
    await expect(
      page.getByRole("heading", { name: "Your wish lists", exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Hi, Receiver." }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What would you love?" }),
    ).toHaveCount(0);
    expect(f.state.giftPreferences[0]).toMatchObject({
      setup: "new",
      categoryIds: [],
      interests: "",
      groupIds: [],
    });
    await nav.getByRole("link", { name: "My lists", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your wish lists", exact: true }),
    ).toBeVisible();
  });
}

test("new-account deep links open directly and preference setup remains available", async ({
  page,
}) => {
  const f = await preview(page, true);
  f.state.giftPreferences.push(newPreference(f.people[0].id));
  await page.goto(`/lists/${f.list.id}`);
  await expect(
    page.getByRole("heading", { name: "Wishes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hi, Receiver." }),
  ).toBeVisible();
  await page.goto("/settings?section=profile");
  await page
    .getByRole("button", { name: "Gift preferences", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Specific interests", { exact: true }),
  ).toHaveValue("");
});

test("failed onboarding skip keeps edits and retry never shares them", async ({
  page,
}) => {
  const f = await preview(page, true);
  f.state.giftPreferences.push(newPreference(f.people[0].id));
  await page.goto("/");
  await page
    .getByLabel("Specific interests", { exact: true })
    .fill("Keep until I choose to leave");
  await page.getByRole("checkbox", { name: "Family", exact: true }).check();
  await page.route(
    "**/api/v1/gift-preferences",
    (route) =>
      route.fulfill({ status: 503, json: { error: "Please try again." } }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page.getByRole("alert")).toContainText("Please try again.");
  await expect(
    page.getByLabel("Specific interests", { exact: true }),
  ).toHaveValue("Keep until I choose to leave");
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(
    page.getByRole("heading", { name: "Hi, Receiver." }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Hi, Receiver. · Little Hint");
  await expect(page.getByRole("main")).toBeFocused();
  expect(f.state.giftPreferences[0]).toMatchObject({
    setup: "skipped",
    interests: "",
    groupIds: [],
  });
});

test("onboarding still reviews sharing and completes after saving preferences", async ({
  page,
}) => {
  const f = await preview(page, true);
  f.state.giftPreferences.push(newPreference(f.people[0].id));
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Coffee & tea" }).check();
  await page.getByRole("checkbox", { name: "Family", exact: true }).check();
  await page
    .getByRole("button", { name: "Save gift preferences", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Share these gift preferences?" }),
  ).toBeVisible();
  expect(f.state.giftPreferences[0].groupIds).toEqual([]);
  await page.getByRole("button", { name: "Back to editing" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Coffee & tea" }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Save gift preferences", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Hi, Receiver." }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Hi, Receiver. · Little Hint");
  expect(f.state.giftPreferences[0]).toMatchObject({
    setup: "done",
    categoryIds: ["coffee"],
    groupIds: [f.group.id],
  });
});
test("own-list discovery confirms each destination and saves the batch together", async ({
  page,
}) => {
  const f = await preview(page, true);
  f.cfg.mode = "both";
  const second = command(f.state, f.actors[0], "lists.create", {
    name: "Birthday",
    mode: "surprise",
    ownerIds: [f.people[0].id],
    groupIds: [],
  }) as { id: string };
  await page.goto(`/people/${f.people[0].id}/gift-ideas`);
  await page
    .getByRole("button", { name: "Find gift ideas", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Select Coffee brewer 0", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Coffee brewer 1", exact: true })
    .check();
  await page
    .getByLabel("Save to wish list", { exact: true })
    .nth(1)
    .selectOption(second.id);
  await page.getByRole("button", { name: "Review 2 gifts" }).click();
  await expect(
    page.getByText("Wish list: Wishes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Wish list: Birthday", { exact: true }),
  ).toBeVisible();
  expect(f.state.items).toHaveLength(1);
  await page.getByRole("button", { name: "Confirm and add gifts" }).click();
  await expect(page.getByText("Your selected gifts were saved.")).toBeVisible();
  expect(f.state.items.find((i) => i.title === "Coffee brewer 0")?.listId).toBe(
    f.list.id,
  );
  expect(f.state.items.find((i) => i.title === "Coffee brewer 1")?.listId).toBe(
    second.id,
  );
});
