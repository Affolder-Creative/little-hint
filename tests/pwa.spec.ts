import { test, expect } from "@playwright/test";
import { login, post } from "./browser-helpers";
test.skip(
  process.env.E2E_BUILT !== "1",
  "Requires the built service worker; use E2E_BUILT=1 against the built app.",
);
test("static-only offline caching, private draft review, and sign-out cleanup", async ({
  page,
  context,
}) => {
  await login(page, "sam@example.test");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.goto("/settings?section=device");
  await page
    .getByLabel("Save wish-list drafts on this device", { exact: true })
    .check();
  const me = (await (await page.request.get("/api/v1/world")).json()).me;
  await page.evaluate(() => fetch("/api/v1/world"));
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (n) =>
          (await (await caches.open(n)).keys()).map(
            (r) => new URL(r.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(cached).toContain("/");
  expect(cached.some((p) => p.startsWith("/api/"))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A little pause." }),
  ).toBeVisible();
  await page
    .getByLabel("Item name", { exact: true })
    .fill("Offline personal thought");
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Keep this until I review it.");
  await page
    .getByRole("button", { name: "Save personal draft", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved on this device");
  const drafts = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem(`little-hint:drafts:${id}`) || "[]"),
    me.id,
  );
  expect(drafts[0].title).toBe("Offline personal thought");
  await context.setOffline(false);
  await page.goto("/settings?section=device");
  await expect(
    page.getByText("Offline personal thought", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/v1/world")).json()).items.some(
      (i: any) => i.title === "Offline personal thought",
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Review & add", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        k.startsWith("little-hint:draft"),
      ),
    ),
  ).toEqual([]);
  await login(page, "jamie@example.test");
  await page.goto("/settings?section=device");
  await expect(
    page.getByText("Offline personal thought", { exact: true }),
  ).toHaveCount(0);
});
test("install reminders respect dismissal and standalone mode", async ({
  page,
}) => {
  await login(page, "alex@example.test");
  const w = await (await page.request.get("/api/v1/world")).json();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByLabel("Item name", { exact: true })
    .fill(`Install trigger ${Date.now()}`);
  await page
    .getByLabel("Wish list", { exact: true })
    .selectOption(w.lists.find((l: any) => l.canEdit).id);
  await page
    .getByRole("button", { name: "Add to wish list", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Keep Little Hint handy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Keep Little Hint handy" }),
  ).toHaveCount(0);
  const until = await page.evaluate(() =>
    Number(localStorage.getItem("little-hint:install")),
  );
  expect(until - Date.now()).toBeGreaterThan(29 * 86400000);
  await page.goto("/settings?section=device");
  await expect(
    page.getByRole("heading", { name: "Keep Little Hint handy" }),
  ).toBeVisible();
  await page.evaluate(() => localStorage.removeItem("little-hint:install"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Don’t remind me", exact: true })
    .click();
  expect(
    await page.evaluate(() => localStorage.getItem("little-hint:install")),
  ).toBe("never");
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { value: true });
    localStorage.removeItem("little-hint:install");
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Keep Little Hint handy" }),
  ).toHaveCount(0);
  await page.goto("/settings?section=device");
  await expect(
    page.getByText("You’re using the installed Little Hint app."),
  ).toBeVisible();
});
