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
