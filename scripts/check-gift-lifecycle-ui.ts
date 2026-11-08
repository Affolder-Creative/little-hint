/** Domain-backed browser acceptance using only synthetic fixture data. */
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";
import { fixture } from "../tests/privacy-fixture";
import { command, world } from "../src/server/domain";
import {
  contributionHistory,
  cancelledBuying,
} from "../src/server/buying-history";
import type { Contribution } from "../src/shared/model";
const f = fixture(),
  s = f.state;
let a = f.actors[1];
const created = command(s, a, "reservations.create", {
  itemId: f.item.id,
  quantity: 1,
}) as { id: string };
const r = s.reservations.find((r) => r.id === created.id)!;
command(s, a, "reservations.update", { ...r, poolTargetCents: 10000 });
const c = command(s, f.actors[2], "contributions.create", {
  reservationId: r.id,
  amountCents: 4000,
}) as Contribution;
command(s, f.actors[2], "contributions.update", { ...c, status: "sent" });
command(s, a, "contributions.update", { ...c, status: "received" });
command(s, f.actors[0], "items.trash", {
  id: f.item.id,
  revision: f.item.revision,
});
command(s, f.actors[0], "items.purge", {
  id: f.item.id,
  revision: f.item.revision,
});
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const out = "/tmp/gift-lifecycle-review";
await mkdir(out, { recursive: true });
try {
  const context = await browser.newContext();
  await context.addInitScript(() =>
    localStorage.setItem("little-hint:install", "never"),
  );
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/api/v1/",
      "",
    );
    try {
      if (path === "world") return route.fulfill({ json: world(s, a) });
      if (path === "buying/contributions")
        return route.fulfill({ json: contributionHistory(s, a, {}) });
      if (path === "buying/cancelled")
        return route.fulfill({ json: cancelledBuying(s, a, {}) });
      if (path === `buying/contribution/${c.id}`)
        return route.fulfill({
          json: {
            contribution: c,
            reservation: r,
            purchaser: a.id === r.buyerId,
          },
        });
      if (path === `buying/reservations/${r.id}`)
        return route.fulfill({ json: r });
      if (route.request().method() === "POST")
        return route.fulfill({
          json: command(
            s,
            a,
            path.replace("/", "."),
            route.request().postDataJSON(),
          ),
        });
      return route.fulfill({
        status: 404,
        json: { error: "Unavailable in synthetic preview" },
      });
    } catch (e) {
      return route.fulfill({
        status: 400,
        json: { error: (e as Error).message },
      });
    }
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = server.resolvedUrls!.local[0] + `buying?contribution=${c.id}`;
  await page.goto(url);
  await expect(
    page.getByRole("region", { name: "Selected gift plan" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Record money returned", exact: true })
    .click();
  await page.getByLabel("Amount returned (USD)").fill("15");
  await page
    .getByRole("button", { name: "Record return sent", exact: true })
    .click();
  await expect(
    page.getByText("Awaiting receipt confirmation", { exact: false }),
  ).toBeVisible();
  for (const [name, width, height] of [
    ["desktop", 1280, 960],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const)
    for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        (t) => localStorage.setItem("little-hint:theme", t),
        theme,
      );
      await page.reload();
      await expect(
        page.getByRole("region", { name: "Selected gift plan" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `${out}/${name}-${theme}.png`,
        fullPage: true,
      });
    }
  a = f.actors[2];
  await page.reload();
  await page
    .getByRole("button", { name: "Confirm return received", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm received", exact: true })
    .click();
  await expect(
    page.getByText("Receipt confirmed", { exact: false }),
  ).toBeVisible();
  expect(c.returns?.[0].status).toBe("received");
  expect(errors).toEqual([]);
  console.log("Gift lifecycle browser acceptance passed; screenshots:", out);
} finally {
  await browser.close();
  await server.close();
}
