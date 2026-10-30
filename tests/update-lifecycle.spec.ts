import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

test.skip(process.env.E2E_BUILT !== "1", "Requires built assets");
test("real workers activate across tabs and both tabs can update", async ({
  browser,
}) => {
  let version = 1;
  const root = path.resolve("dist/client");
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end('{"error":"Sign in"}');
        return;
      }
      const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const resolved = path.resolve(root, file);
      if (!resolved.startsWith(root + path.sep)) {
        res.writeHead(404).end();
        return;
      }
      let data = await readFile(resolved);
      if (file === "sw.js")
        data = Buffer.from(
          data
            .toString()
            .replace("little-hint-static-", `little-hint-static-v${version}-`),
        );
      res.writeHead(200, {
        "Content-Type": file.endsWith(".js")
          ? "application/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : file.endsWith(".png")
                ? "image/png"
                : file.endsWith(".html")
                  ? "text/html"
                  : "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as any).port}`;
  const context = await browser.newContext();
  try {
    const first = await context.newPage();
    await first.goto(origin);
    await first.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await first.reload();
    const second = await context.newPage();
    await second.goto(origin);
    await expect(
      second.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    version = 2;
    await first.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(
      first.getByRole("button", { name: "Update now" }),
    ).toBeVisible();
    await expect(
      second.getByRole("button", { name: "Update now" }),
    ).toBeVisible();
    await Promise.all([
      second.waitForEvent("framenavigated"),
      second.getByRole("button", { name: "Update now" }).click(),
    ]);
    await expect(
      first.getByRole("button", { name: "Update now" }),
    ).toBeVisible();
    await Promise.all([
      first.waitForEvent("framenavigated"),
      first.getByRole("button", { name: "Update now" }).click(),
    ]);
    await expect(
      first.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    await expect(first.getByRole("button", { name: "Update now" })).toHaveCount(
      0,
    );
    expect(await first.evaluate(() => caches.keys())).toEqual([
      expect.stringContaining("little-hint-static-v2-"),
    ]);
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
