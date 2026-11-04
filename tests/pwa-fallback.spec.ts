import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

test.describe("cached PWA connection screens", () => {
  test.skip(process.env.E2E_BUILT !== "1", "Requires a production build");
  let server: Server;
  let origin: string;
  let documentStatus = 200;
  let apiStatus = 401;
  let stall = false;
  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      const pathname = new URL(req.url!, "http://localhost").pathname;
      if (pathname.startsWith("/api/")) {
        if (stall) return;
        res.writeHead(apiStatus, { "Content-Type": "text/html" });
        res.end("Unavailable");
        return;
      }
      const file =
        pathname.startsWith("/assets/") ||
        pathname.startsWith("/brand/") ||
        pathname === "/sw.js"
          ? pathname
          : "/index.html";
      if (file === "/index.html" && documentStatus !== 200) {
        res.writeHead(documentStatus);
        res.end("Proxy error");
        return;
      }
      try {
        const data = await readFile(
          path.join(process.cwd(), "dist/client", file),
        );
        const type = file.endsWith(".js")
          ? "application/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : file.endsWith(".png")
                ? "image/png"
                : file.endsWith(".webmanifest")
                  ? "application/manifest+json"
                  : "text/html";
        res.writeHead(200, {
          "Content-Type": type,
          "Cache-Control": "no-store",
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  test.afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  test.beforeEach(async ({ page }) => {
    documentStatus = 200;
    apiStatus = 401;
    stall = false;
    await page.goto(origin);
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => resolve(),
            { once: true },
          ),
        );
    });
  });
  test("proxy failure, retries, and recovery preserve the requested URL", async ({
    page,
  }) => {
    documentStatus = 502;
    apiStatus = 503;
    await page.goto(`${origin}/settings?section=device`);
    await expect(
      page.getByRole("heading", {
        name: "Well, this wasn't on the wish list.",
      }),
    ).toBeVisible();
    stall = true;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Trying again…" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", {
        name: "Well, this wasn't on the wish list.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    stall = false;
    apiStatus = 401;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    expect(page.url()).toBe(`${origin}/settings?section=device`);
  });
  test("stalled startup has a bounded wait", async ({ page }) => {
    stall = true;
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Well, this wasn't on the wish list.",
      }),
    ).toBeVisible({ timeout: 15000 });
  });
  test("offline launch keeps opted-in personal drafts and excludes private API data", async ({
    page,
    context,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem("little-hint:last-account", "test-account");
      localStorage.setItem("little-hint:draft-optin:test-account", "yes");
    });
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "A little out of touch." }),
    ).toBeVisible();
    await page
      .getByLabel("Item name", { exact: true })
      .fill("A thoughtful gift");
    await page.getByRole("button", { name: "Save personal draft" }).click();
    await expect(
      page.getByText(
        "Saved on this device. Sign in online to review and add it.",
      ),
    ).toBeVisible();
    const paths = await page.evaluate(async () =>
      (
        await Promise.all(
          (await caches.keys()).map(async (name) =>
            (await (await caches.open(name)).keys()).map(
              (r) => new URL(r.url).pathname,
            ),
          ),
        )
      ).flat(),
    );
    expect(paths.some((p) => p.startsWith("/api/"))).toBe(false);
  });
  for (const width of [390, 1280])
    for (const colorScheme of ["light", "dark"] as const) {
      test(`appearance ${width} ${colorScheme}`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        apiStatus = 503;
        await page.reload();
        await expect(
          page.getByRole("heading", {
            name: "Well, this wasn't on the wish list.",
          }),
        ).toBeVisible();
        await page.keyboard.press("Tab");
        await expect(
          page.getByRole("button", { name: "Try again" }),
        ).toBeFocused();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `/tmp/little-hint-outage-${width}-${colorScheme}.png`,
          fullPage: true,
        });
        await context.setOffline(true);
        await page.reload();
        await expect(
          page.getByRole("heading", { name: "A little out of touch." }),
        ).toBeVisible();
        await page.screenshot({
          path: `/tmp/little-hint-offline-${width}-${colorScheme}.png`,
          fullPage: true,
        });
      });
    }
});
