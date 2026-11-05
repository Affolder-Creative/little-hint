import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world } from "../src/server/domain";
import { expectDialogFieldsToFit } from "./browser-helpers";

async function setup(
  page: import("@playwright/test").Page,
  blockers: unknown[] = [],
) {
  const f = stagingFixtures();
  const calls: { path: string; body: any }[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/world"))
      return route.fulfill({
        json: { ...world(f.state, f.actors[0]), environment: "test" },
      });
    if (path.endsWith("/account/closure"))
      return route.fulfill({
        json: {
          blockers,
          candidates: [{ id: f.actors[1].id, name: "Sam Morgan" }],
          requests: [],
        },
      });
    if (path.endsWith("/push"))
      return route.fulfill({ json: { publicKey: null, devices: [] } });
    if (path.includes("list-sessions") || path.includes("list-user-passkeys"))
      return route.fulfill({ json: [] });
    if (path.includes("/account/")) {
      calls.push({ path, body: route.request().postDataJSON() });
      if (path.endsWith("/closure/start"))
        return route.fulfill({
          json: { challenge: "00000000-0000-4000-8000-000000000001" },
        });
      if (path.endsWith("/closure/confirm"))
        return route.fulfill({
          status: 409,
          json: { error: "Code not accepted. Check your email and try again." },
        });
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Unavailable in fixture" },
    });
  });
  return { f, calls };
}

test("account closure requires review, an email code, and typed DELETE, with safe cancellation", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 393, height: 900 });
  const { calls } = await setup(page);
  await page.goto("/settings?section=security");
  await page
    .getByRole("button", { name: "Close account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "permanent and cannot be undone",
  );
  expect(calls).toEqual([]);
  for (const [width, theme] of [
    [320, "dark"],
    [393, "light"],
    [768, "light"],
    [1440, "dark"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    const list = page.locator(".closure-consequences");
    const spacing = await list.evaluate((el) => {
      const style = getComputedStyle(el),
        parent = getComputedStyle(el.parentElement!);
      return {
        font: style.fontSize,
        lineHeight: style.lineHeight,
        top: style.marginTop,
        bottom: style.marginBottom,
        gap: parent.rowGap,
      };
    });
    expect(spacing).toEqual({
      font: "13px",
      lineHeight: "20.8px",
      top: "0px",
      bottom: "0px",
      gap: "16px",
    });
    expect(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`closure-review-${width}-${theme}.png`),
    });
  }
  expect(
    (await new AxeBuilder({ page }).include("dialog").analyze()).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(calls).toEqual([]);
  await page
    .getByRole("button", { name: "Close account", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Send closure code", exact: true })
    .click();
  await expect(page.getByLabel("Account closure code")).toBeVisible();
  const confirm = page.getByRole("button", {
    name: "Permanently close my account",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Account closure code").fill("123456");
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(confirm).toBeEnabled();
  for (const width of [320, 393, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectDialogFieldsToFit(page);
    const primary = await confirm.boundingBox(),
      cancel = await page
        .getByRole("button", { name: "Cancel", exact: true })
        .boundingBox();
    expect(Math.abs(primary!.y - cancel!.y)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`closure-${width}.png`) });
  }
  await confirm.click();
  await expect(page.getByRole("alert")).toContainText("Code not accepted");
  expect(calls.at(-1)?.body).toMatchObject({
    code: "123456",
    confirmation: "DELETE",
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("unresolved responsibilities disable closure and offer a handoff", async ({
  page,
}) => {
  const { f, calls } = await setup(page, [
    {
      kind: "guardian",
      id: "00000000-0000-4000-8000-000000000002",
      title: "Hand off Child's profile",
      detail: "Another trusted member must accept responsibility.",
      href: "/settings?section=security",
    },
  ]);
  await page.goto("/settings?section=security");
  await page
    .getByRole("button", { name: "Close account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Send closure code", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Choose someone to take over" })
    .click();
  await page.getByLabel("Trusted member").selectOption(f.actors[1].id);
  await page
    .getByRole("button", { name: "Request handoff", exact: true })
    .click();
  expect(calls.at(-1)).toMatchObject({
    path: "/api/v1/account/handoff",
    body: { kind: "guardian", userId: f.actors[1].id },
  });
  expect(calls.some((c) => c.path.includes("/closure/confirm"))).toBe(false);
});
