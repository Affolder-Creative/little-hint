import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { login, post } from "./browser-helpers";
import { renderEmail } from "../src/server/email";
import type { World } from "../src/shared/model";

test("main views and email templates retain readable responsive layouts", async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 300000 : 120000);
  page.setDefaultTimeout(10000);
  await mkdir("test-results/polish", { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (viewport.width === 1280) {
      expect(
        await page
          .locator(".login-footer")
          .evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight),
      ).toBe(true);
    }
    await page.screenshot({
      path: `test-results/polish/login-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await login(page, "alex@example.test");
  const world: World = await (await page.request.get("/api/v1/world")).json();
  const mine = world.people.find((p) => p.userId === world.me.id)!;
  const otherGift = world.items.find(
    (item) => !item.isRecipient && item.available,
  )!;
  const ownList = world.lists.find(
    (list) =>
      list.canEdit && world.items.some((item) => item.listId === list.id),
  )!;
  await page.goto(`/people/${mine.id}`);
  await expect(
    page.getByRole("tab", { name: "My wishes", exact: true }),
  ).toBeVisible();
  await page.goto(`/lists/${ownList.id}`);
  await expect(
    page.getByLabel("Available to give", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".gift-card").first()).toBeVisible();
  await page.goto("/");
  await page.getByLabel("Available to give", { exact: true }).check();
  await page
    .getByRole("link", { name: "My lists", exact: true })
    .last()
    .click();
  await page
    .locator(".list-row")
    .filter({
      has: page.getByRole("heading", { name: ownList.name, exact: true }),
    })
    .click();
  await expect(page.locator(".gift-card").first()).toBeVisible();
  await expect(
    page.getByLabel("Available to give", { exact: true }),
  ).toHaveCount(0);

  await page.goto(`/gift/${otherGift.id}`);
  const controls = await page
    .locator(".reserve-panel > .form-row")
    .boundingBox();
  const action = await page
    .getByRole("button", { name: "I’ll get this", exact: true })
    .boundingBox();
  expect(action!.y - (controls!.y + controls!.height)).toBeGreaterThanOrEqual(
    16,
  );
  await page.screenshot({
    path: "test-results/polish/gift-available-mobile.png",
    fullPage: true,
  });

  // Populated states are real, explicitly local test fixtures.
  const reservation = await post(page, "reservations", {
    itemId: otherGift.id,
    quantity: 1,
  });
  const group = world.groups.find((g) => g.memberIds.length >= 3)!;
  const participants = world.people
    .filter((p) => p.userId && group.memberIds.includes(p.userId))
    .map((p) => p.id);
  const exchange = await post(page, "exchanges", {
    name: "Illustrative polish exchange",
    groupId: group.id,
    participantIds: participants,
    count: 1,
    excludeHousehold: false,
    exclusions: [],
  });
  const views = [
    ["home", "/"],
    ["people", "/people"],
    ["profile", `/people/${mine.id}`],
    ["lists", "/lists"],
    ["list", `/lists/${ownList.id}`],
    ["gift", `/gift/${otherGift.id}`],
    ["buying", "/buying"],
    ["exchanges", "/exchanges"],
    ["settings", "/settings"],
  ];
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 844 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const [name, route] of views) {
        await page.goto(route);
        await expect(page.locator("main h1")).toHaveCount(1);
        await expect(page.locator("#app-favicon")).toHaveAttribute(
          "href",
          new RegExp(
            `favicon-${colorScheme === "dark" ? "dark" : "color"}\\.svg$`,
          ),
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${name} at ${width}`,
        ).toBe(true);
        await page.screenshot({
          path: `test-results/polish/${name}-${width}-${colorScheme}.png`,
          fullPage: true,
        });
      }
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page
        .getByRole("button", { name: "Add a gift", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.screenshot({
        path: `test-results/polish/gift-form-${width}-${colorScheme}.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Close dialog" }).click();
    }
  }
  // Release this test's reservation so repeated visual runs do not consume
  // the seeded gifts. Existing reservations and exchanges are untouched.
  const after: World = await (await page.request.get("/api/v1/world")).json();
  const reserved = after.buying.find((item) => item.id === reservation.id)!;
  const createdExchange = after.exchanges.find(
    (item) => item.id === exchange.id,
  )!;
  await post(page, "reservations/update", {
    id: reserved.id,
    revision: reserved.revision,
    quantity: 0,
    purchased: 0,
  });
  await post(page, "exchanges/cancel", {
    id: createdExchange.id,
    revision: createdExchange.revision,
  });

  // Explicit appearance also controls the favicon independently of the OS.
  await page.goto("/settings");
  await page.getByLabel("Appearance", { exact: true }).selectOption("light");
  await expect(page.locator("#app-favicon")).toHaveAttribute(
    "href",
    /favicon-color\.svg$/,
  );
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(page.locator("#app-favicon-fallback")).toHaveAttribute(
    "href",
    /favicon-dark\.ico$/,
  );
  await page.goto("about:blank");
  const emailLogo = `data:image/png;base64,${(await readFile("public/brand/little-hint/logos/png/little-hint-horizontal-color.png")).toString("base64")}`;
  for (const width of [600, 320]) {
    await page.setViewportSize({ width, height: 740 });
    for (const kind of ["sign-in", "invitation", "update"] as const) {
      const message =
        kind === "sign-in"
          ? { kind, code: "123456" }
          : {
              kind,
              text:
                kind === "invitation"
                  ? "You've been invited to Little Hint. Sign in with this email address and accept your invitation."
                  : "You have an update in Little Hint. Sign in to view it.",
              actionPath: "/",
            };
      const html = renderEmail(
        message,
        "https://littlehint.example.test",
      ).html.replace("cid:little-hint-logo", emailLogo);
      await page.setContent(html);
      expect(
        await page
          .locator("img")
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/polish/email-${kind}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.setViewportSize({ width: 640, height: 200 });
  const faviconImages: Record<string, string> = {};
  for (const theme of ["color", "dark"])
    for (const size of [16, 32, 48]) {
      faviconImages[`${theme}-${size}`] =
        `data:image/png;base64,${(await readFile(`public/brand/little-hint/favicons/favicon-${theme}-${size}.png`)).toString("base64")}`;
    }
  await page.setContent(
    `<body style="margin:0;display:flex;font:14px Arial">${["color", "dark"].map((theme) => `<section style="width:50%;padding:24px;background:${theme === "color" ? "#fff8f0" : "#2b201d"};color:${theme === "color" ? "#2b201d" : "#fff8f0"}"><p>${theme === "color" ? "Light" : "Dark"} favicon</p>${[16, 32, 48].map((size) => `<img width="${size}" height="${size}" style="margin:12px" src="${faviconImages[`${theme}-${size}`]}">`).join("")}</section>`).join("")}</body>`,
  );
  expect(
    await page
      .locator("img")
      .evaluateAll((images) =>
        images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
      ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/polish/favicons.png" });
  expect(errors).toEqual([]);
});
