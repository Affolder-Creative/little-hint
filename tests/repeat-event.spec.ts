import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { command, world } from "../src/server/domain";
import { peopleForGroup } from "../src/shared/group-events";
import { login, post, expectDialogFieldsToFit } from "./browser-helpers";

for (const [width, dark] of [
  [320, false],
  [768, true],
  [1440, false],
] as const)
  test(`repeat archived event at ${width}px${dark ? " dark" : ""}`, async ({
    page,
  }, info) => {
    const { state, actors } = stagingFixtures();
    const actor = actors[0];
    const group = state.groups.find((g) => g.ownerId === actor.id)!;
    const participants = peopleForGroup(state.people, group).slice(0, 2);
    const created = command(state, actor, "group-events.create", {
      groupId: group.id,
      name: "Winter gathering 2026",
      description: "A few wishes for the family",
      mode: "surprise",
      participantIds: participants.map((p) => p.id),
      spendingGuidelineCents: 5000,
      archiveAfter: "2099-12-31",
      revealAfter: "2099-12-26",
      timeZone: "America/New_York",
    }) as { id: string };
    const source = state.groupEvents.find((e) => e.id === created.id)!;
    command(state, actor, "group-events.update", { ...source, archived: true });
    const original = structuredClone(source);
    let writes = 0;
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/v1/world")
        return route.fulfill({
          json: {
            ...world(state, actor, true, true),
            spendingAvailable: false,
          },
        });
      if (path === "/api/v1/group-events/repeat") {
        writes++;
        try {
          return route.fulfill({
            json: command(
              state,
              actor,
              "group-events.repeat",
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
      return route.fulfill({ json: {} });
    });
    await page.addInitScript(
      (dark) =>
        localStorage.setItem("little-hint:theme", dark ? "dark" : "light"),
      dark,
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/events/${source.id}`);
    await page.getByLabel(/^Event actions for /).click();
    await page
      .getByRole("button", { name: "Repeat event", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await page.screenshot({
      path: info.outputPath("repeat-start.png"),
      fullPage: true,
    });
    await expect(dialog.getByLabel("Event name", { exact: true })).toHaveValue(
      "Winter gathering 2026 (new occasion)",
    );
    await expect(
      dialog.getByRole("radio", { name: /Keep it a surprise/ }),
    ).toBeChecked();
    await expect(
      dialog.getByRole("radio", { name: /See the plans/ }),
    ).toBeEnabled();
    await dialog
      .getByLabel("Event name", { exact: true })
      .fill("Winter gathering 2027");
    await dialog
      .getByText("Optional dates and gift summaries", { exact: true })
      .click();
    await expect(
      dialog.getByLabel("Archive after", { exact: true }),
    ).toHaveValue("");
    await expect(
      dialog.getByLabel("Reveal gifts after", { exact: true }),
    ).toHaveValue("");
    await expect(
      dialog.getByLabel("Event time zone", { exact: true }),
    ).toHaveValue("America/New_York");
    await dialog
      .getByLabel("Archive after", { exact: true })
      .fill("2099-12-31");
    await dialog.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Create 0 wish lists", exact: true }),
    ).toBeDisabled();
    await dialog
      .locator(`input[name="participantIds"][value="${participants[0].id}"]`)
      .check();
    await expectDialogFieldsToFit(page);
    await page.screenshot({
      path: info.outputPath("repeat-form.png"),
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
        .violations,
    ).toEqual([]);
    await dialog
      .getByRole("button", { name: "Create 1 wish list", exact: true })
      .click();
    await expect(
      dialog.getByText(/This creates a separate event with 1 empty wish list/),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("repeat-review.png"),
      fullPage: true,
    });
    await dialog
      .getByRole("button", { name: "Confirm and save", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Winter gathering 2027" }),
    ).toBeVisible();
    expect(writes).toBe(1);
    const next = state.groupEvents.find(
      (e) => e.name === "Winter gathering 2027",
    )!;
    expect(next.id).not.toBe(source.id);
    expect(next.archived).toBe(false);
    expect(next.participantIds).toEqual([participants[0].id]);
    expect(source).toEqual(original);
  });

test("ordinary members cannot repeat events", async ({ page }) => {
  const { state, actors } = stagingFixtures();
  const owner = actors[0];
  const group = state.groups.find((g) => g.ownerId === owner.id)!;
  const member = actors.find(
    (a) => a.id !== owner.id && group.memberIds.includes(a.id),
  )!;
  group.eventLeaderIds = [];
  const created = command(state, owner, "group-events.create", {
    groupId: group.id,
    name: "Members event",
    mode: "surprise",
    participantIds: peopleForGroup(state.people, group)
      .slice(0, 1)
      .map((p) => p.id),
  }) as { id: string };
  await page.route("**/api/**", (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/v1/world"
          ? { ...world(state, member, true, true), spendingAvailable: false }
          : {},
    }),
  );
  await page.goto(`/events/${created.id}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Members event" }),
  ).toBeVisible();
  await expect(page.getByLabel(/^Event actions for /)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Repeat event", exact: true }),
  ).toHaveCount(0);
});

test("repeat event persists through the authenticated API with empty new wish lists", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_BROWSER_TEST_SERVER !== "1",
    "Requires the isolated app/database browser suite",
  );
  await login(page, "alex@example.test");
  const initial = await (await page.request.get("/api/v1/world")).json();
  const group = initial.groups.find((g: any) => g.ownerId === initial.me.id);
  const person = initial.people.find((p: any) => p.userId === initial.me.id);
  const name = `Annual API ${Date.now()}`;
  const source = await post(page, "group-events", {
    groupId: group.id,
    name,
    mode: "surprise",
    participantIds: [person.id],
  });
  const before = await (await page.request.get("/api/v1/world")).json();
  const oldList = before.lists.find((l: any) => l.groupEventId === source.id);
  await post(page, "items", {
    listId: oldList.id,
    title: "Keep this with the original",
    quantity: 1,
  });
  await page.goto(`/events/${source.id}`);
  await page.getByLabel(/^Event actions for /).click();
  await page.getByRole("button", { name: "Repeat event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Event name", { exact: true })
    .fill(`${name} next year`);
  await dialog
    .getByRole("button", { name: "Create 1 wish list", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const after = await (await page.request.get("/api/v1/world")).json();
  const next = after.groupEvents.find(
    (e: any) => e.name === `${name} next year`,
  );
  expect(next.id).not.toBe(source.id);
  const list = after.lists.find((l: any) => l.groupEventId === next.id);
  expect(after.items.filter((i: any) => i.listId === list.id)).toEqual([]);
  expect(after.items.some((i: any) => i.listId === oldList.id)).toBe(true);
});

test("stale source errors preserve the new occasion details", async ({
  page,
}) => {
  const { state, actors } = stagingFixtures();
  const actor = actors[0];
  const group = state.groups.find((g) => g.ownerId === actor.id)!;
  const result = command(state, actor, "group-events.create", {
    groupId: group.id,
    name: "Source event",
    mode: "surprise",
    participantIds: peopleForGroup(state.people, group)
      .slice(0, 1)
      .map((p) => p.id),
  }) as { id: string };
  const source = state.groupEvents.find((e) => e.id === result.id)!;
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/world")
      return route.fulfill({
        json: { ...world(state, actor, true, true), spendingAvailable: false },
      });
    if (path === "/api/v1/group-events/repeat") {
      try {
        return route.fulfill({
          json: command(
            state,
            actor,
            "group-events.repeat",
            route.request().postDataJSON(),
          ),
        });
      } catch (error) {
        return route.fulfill({
          status: 409,
          json: { error: (error as Error).message },
        });
      }
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(`/events/${source.id}`);
  await page.getByLabel(/^Event actions for /).click();
  await page.getByRole("button", { name: "Repeat event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Event name", { exact: true })
    .fill("My new occasion");
  command(state, actor, "group-events.update", {
    ...source,
    name: "Changed elsewhere",
  });
  await dialog
    .getByRole("button", { name: "Create 1 wish list", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Confirm and save", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("changed since");
  await dialog
    .getByRole("button", { name: "Back to editing", exact: true })
    .click();
  await expect(dialog.getByLabel("Event name", { exact: true })).toHaveValue(
    "My new occasion",
  );
  expect(
    state.groupEvents.filter((e) => e.name === "My new occasion"),
  ).toHaveLength(0);
});
