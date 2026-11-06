import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world } from "../src/server/domain";
import { expectDialogFieldsToFit } from "./browser-helpers";

// These tests supply every API response; service-worker requests bypass routes.
test.use({ serviceWorkers: "block" });

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
        lineHeight: parseFloat(style.lineHeight),
        top: style.marginTop,
        bottom: style.marginBottom,
        gap: parent.rowGap,
      };
    });
    expect(spacing).toMatchObject({
      font: "13px",
      top: "0px",
      bottom: "0px",
      gap: "16px",
    });
    expect(spacing.lineHeight).toBeCloseTo(20.8, 2);
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

test("closure restart restores review focus without sending another code", async ({
  page,
}) => {
  const { calls } = await setup(page);
  await page.goto("/settings?section=security");
  const opener = page.getByRole("button", {
    name: "Close account",
    exact: true,
  });
  await opener.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Send closure code", exact: true })
    .click();
  await expect(page.getByLabel("Account closure code")).toBeFocused();
  await page
    .getByRole("button", { name: "Request a new closure code" })
    .click();
  await expect(
    page
      .locator("p")
      .filter({ hasText: /^This is permanent and cannot be undone\.$/ }),
  ).toBeFocused();
  expect(
    calls.filter((call) => call.path.endsWith("/closure/start")),
  ).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
});

for (const mode of [
  "short viewport",
  "keyboard viewport",
  "enlarged text",
] as const) {
  test(`closure fields and actions remain reachable with ${mode}`, async ({
    page,
  }, info) => {
    await setup(page);
    await page.setViewportSize({
      width: 320,
      height: mode === "keyboard viewport" ? 900 : 320,
    });
    if (mode === "keyboard viewport") {
      await page.addInitScript(() => {
        Object.defineProperty(window.visualViewport!, "height", {
          get: () => 320,
        });
      });
    }
    await page.goto("/settings?section=security");
    if (mode === "enlarged text") {
      // Apply doubled type before opening so every newly mounted step inherits it.
      await page.addStyleTag({
        content: `
        .dialog .dialog-heading h2 { font-size: 44px; }
        .dialog .form-content :is(p, li, label, input, select) { font-size: 26px; }
        .dialog :is(.button, .text-button) { font-size: 28px; }
      `,
      });
    }
    await page
      .getByRole("button", { name: "Close account", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Send closure code", exact: true })
      .click();
    const code = page.getByLabel("Account closure code");
    await code.fill("123456");
    // The field and its label must fit, not hide behind the heading or footer.
    const clippedHeight = () =>
      code.evaluate((el) => {
        let top = 0,
          bottom = innerHeight;
        for (
          let parent = el.parentElement;
          parent;
          parent = parent.parentElement
        ) {
          if (/(auto|scroll|hidden)/.test(getComputedStyle(parent).overflowY)) {
            const rect = parent.getBoundingClientRect();
            top = Math.max(top, rect.top);
            bottom = Math.min(bottom, rect.bottom);
          }
        }
        const rect = el.closest(".field")!.getBoundingClientRect();
        return (
          rect.height -
          (Math.min(bottom, rect.bottom) - Math.max(top, rect.top))
        );
      });
    await expect.poll(clippedHeight).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath("closure-short-viewport.png"),
    });
    expect(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
