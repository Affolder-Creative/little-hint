import { test, expect, type Page } from "@playwright/test";
import { login, post } from "./browser-helpers";
import sharp from "sharp";

async function openImport(page: Page) {
  await login(page, "alex@example.test");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page
    .getByPlaceholder("Paste a link from your favorite shop")
    .fill("https://shop.example/product");
}
const job = (id: string, status = "running") => ({
  id,
  userId: "synthetic",
  url: "https://shop.example/product",
  revision: 1,
  createdAt: new Date().toISOString(),
  status,
  ...(status === "complete"
    ? {
        result: {
          title: "Acme ceramic mug, blue, 12 oz",
          description: "A blue 12 oz ceramic mug from Acme.",
          priceCents: 2500,
          source: "shop.example",
          importedAt: "2026-01-01T12:00:00.000Z",
        },
      }
    : {}),
});

test("polls only the active import, refreshes explicitly, and preserves manual edits", async ({
  page,
}) => {
  await openImport(page);
  let polls = 0;
  let worlds = 0;
  let complete = false;
  const bodies: Array<{ forceRefresh: boolean }> = [];
  await page.route("**/api/v1/imports", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: job(`job-${bodies.length}`, "pending") });
  });
  await page.route("**/api/v1/imports/*", async (route) => {
    polls++;
    await route.fulfill({
      json: job(
        new URL(route.request().url()).pathname.split("/").pop()!,
        complete ? "complete" : "running",
      ),
    });
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/world") worlds++;
  });
  await page.getByRole("button", { name: "Get details", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("My own title");
  await page.getByText("More details", { exact: true }).click();
  await page
    .getByLabel("A helpful note", { exact: true })
    .fill("My own description");
  await expect.poll(() => polls, { timeout: 12000 }).toBeGreaterThanOrEqual(4);
  expect(worlds).toBe(0);
  complete = true;
  await expect(
    page.getByRole("button", { name: "Refresh from shop" }),
  ).toBeVisible();
  await expect(page.getByLabel("Item name", { exact: true })).toHaveValue(
    "My own title",
  );
  await expect(page.getByLabel("A helpful note", { exact: true })).toHaveValue(
    "My own description",
  );
  await page.getByRole("button", { name: "Refresh from shop" }).click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(bodies.map((body) => body.forceRefresh)).toEqual([false, true]);
  await expect(
    page.getByRole("button", { name: "Refresh from shop" }),
  ).toBeVisible();
  await expect(page.getByLabel("Item name", { exact: true })).toHaveValue(
    "My own title",
  );
  await expect(page.getByLabel("A helpful note", { exact: true })).toHaveValue(
    "My own description",
  );
  await page.screenshot({
    path: test.info().outputPath("import-refresh.png"),
    fullPage: true,
  });
  const stopped = polls;
  await page.waitForTimeout(2500);
  expect(polls).toBe(stopped);
  await expect.poll(() => worlds, { timeout: 25000 }).toBe(1);
});

test("shows cleaned imported copy for review before saving", async ({
  page,
}) => {
  await openImport(page);
  await page.route("**/api/v1/imports", (route) =>
    route.fulfill({ json: job("cleaned-copy", "pending") }),
  );
  await page.route("**/api/v1/imports/*", (route) =>
    route.fulfill({ json: job("cleaned-copy", "complete") }),
  );
  await page.getByRole("button", { name: "Get details", exact: true }).click();
  await expect(page.getByLabel("Item name", { exact: true })).toHaveValue(
    "Acme ceramic mug, blue, 12 oz",
  );
  await expect(page.getByLabel("A helpful note", { exact: true })).toHaveValue(
    "A blue 12 oz ceramic mug from Acme.",
  );
  await expect(
    page.getByText("Details found. Check them before saving."),
  ).toBeVisible();
  await page.getByLabel("Item name", { exact: true }).fill("My preferred mug");
  await expect(page.getByLabel("Item name", { exact: true })).toHaveValue(
    "My preferred mug",
  );
});

test("retries status failures and ignores late results after the product URL changes", async ({
  page,
}) => {
  await openImport(page);
  await page.route("**/api/v1/imports", (route) =>
    route.fulfill({ json: job("pending-job", "pending") }),
  );
  let fail = true;
  let finish: (() => void) | undefined;
  await page.route("**/api/v1/imports/*", async (route) => {
    if (fail) {
      await route.fulfill({
        status: 503,
        json: { error: "Temporary failure." },
      });
      return;
    }
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    await route
      .fulfill({ json: job("pending-job", "complete") })
      .catch(() => {});
  });
  await page.getByRole("button", { name: "Get details", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retry status" }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry status" }).click();
  await expect.poll(() => !!finish).toBe(true);
  await page
    .getByPlaceholder("Paste a link from your favorite shop")
    .fill("https://shop.example/different");
  finish!();
  await expect(
    page.getByRole("button", { name: "Get details", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Item name", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Refresh from shop" }),
  ).toHaveCount(0);
});

test("stops polling on close and resumes a pending import after reconnect", async ({
  page,
  context,
}) => {
  await openImport(page);
  await page.route("**/api/v1/imports", (route) =>
    route.fulfill({ json: job("offline-job", "pending") }),
  );
  let polls = 0;
  let complete = false;
  await page.route("**/api/v1/imports/*", async (route) => {
    polls++;
    await route.fulfill({
      json: job("offline-job", complete ? "complete" : "running"),
    });
  });
  await page.getByRole("button", { name: "Get details", exact: true }).click();
  await expect.poll(() => polls).toBeGreaterThan(0);
  await context.setOffline(true);
  const paused = polls;
  await page.waitForTimeout(2500);
  expect(polls).toBe(paused);
  complete = true;
  await context.setOffline(false);
  await expect(
    page.getByRole("button", { name: "Refresh from shop" }),
  ).toBeVisible();
  complete = false;
  await page.getByRole("button", { name: "Refresh from shop" }).click();
  await expect(
    page.getByRole("button", { name: "Finding details…", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const stopped = polls;
  await page.waitForTimeout(2500);
  expect(polls).toBe(stopped);
});

test("cards use thumbnails, details use originals, and neither enters the PWA cache", async ({
  page,
}) => {
  await login(page, "alex@example.test");
  const png = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const upload = await page.request.post("/api/v1/media", {
    headers: {
      Origin: new URL(page.url()).origin,
      "Content-Type": "application/octet-stream",
    },
    data: png,
  });
  expect(upload.ok()).toBe(true);
  const { url } = await upload.json();
  const world = await (await page.request.get("/api/v1/world")).json();
  const list = world.lists.find((l: any) => l.canEdit && !l.archived);
  const gift = await post(page, "items", {
    title: "Thumbnail test gift",
    listId: list.id,
    image: url,
  });
  await page.goto(`/lists/${list.id}`);
  const card = page.getByRole("img", { name: gift.title, exact: true });
  await expect(card).toHaveAttribute("data-image-size", "card");
  await expect(card).toHaveAttribute("data-product-image", url);
  await expect
    .poll(() => card.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(480);
  await page.goto(`/gift/${gift.id}`);
  await expect(
    page.getByRole("img", { name: gift.title, exact: true }),
  ).toHaveAttribute("data-image-size", "full");
  for (const suffix of ["", "?size=card"]) {
    const response = await page.request.get(url + suffix);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    return (
      await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (request) => new URL(request.url).pathname,
          ),
        ),
      )
    ).flat();
  });
  expect(cached.some((name) => name.startsWith("/api/"))).toBe(false);
});
