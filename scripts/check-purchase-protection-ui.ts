/** Domain-backed purchase-protection acceptance with synthetic fixture data only. */
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { mkdir } from "node:fs/promises";
import { fixture } from "../tests/privacy-fixture";
import { commandWithAudience as command } from "../tests/discussion-command";
import { discussionAudience } from "../src/server/discussion-access";
import { giftView, world } from "../src/server/domain";
import { withRemovalOverride } from "../src/server/purchase-protection";

const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--no-sandbox"],
});
const out = "/tmp/purchase-protection-review";
await mkdir(out, { recursive: true });
try {
  for (const width of [393, 768, 1440])
    for (const theme of ["light", "dark"]) {
      const f = fixture(),
        s = f.state;
      let a = f.actors[0];
      const list = s.lists.find((l) => l.id === f.item.listId)!;
      const created = command(s, f.actors[1], "reservations.create", {
        itemId: f.item.id,
        quantity: 1,
      }) as { id: string };
      const reservation = s.reservations.find((r) => r.id === created.id)!;
      command(s, f.actors[1], "reservations.update", {
        ...reservation,
        purchased: 1,
      });
      let rejectOverride = true;
      const context = await browser.newContext({
        viewport: { width, height: 960 },
      });
      await context.addInitScript((t) => {
        localStorage.setItem("little-hint:install", "never");
        localStorage.setItem("little-hint:theme", t);
      }, theme);
      await context.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname.replace(
          "/api/v1/",
          "",
        );
        try {
          if (path === "world") return route.fulfill({ json: world(s, a) });
          if (path === `items/${f.item.id}/discussion-audience`)
            return route.fulfill({ json: discussionAudience(s, a, f.item.id) });
          if (path === `items/${f.item.id}`)
            return route.fulfill({ json: giftView(s, a, f.item) });
          if (path === "admin/gift-protection/review")
            return route.fulfill({
              json: {
                token: "synthetic-review",
                name: f.item.title,
                revision: f.item.revision,
              },
            });
          if (path === "admin/gift-protection/override") {
            if (rejectOverride) {
              rejectOverride = false;
              return route.fulfill({
                status: 409,
                json: {
                  message:
                    "This entry changed. Review the admin override again.",
                },
              });
            }
            const body = route.request().postDataJSON();
            expect(body.reason).toBe("Synthetic recovery check");
            expect(body.confirmation).toBe("OVERRIDE");
            withRemovalOverride(s, "items", f.item.id, () =>
              command(s, a, "items.archive", {
                id: f.item.id,
                revision: body.revision,
                archived: true,
              }),
            );
            return route.fulfill({ json: { ok: true } });
          }
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
            json: { message: "Unavailable in synthetic preview" },
          });
        } catch (error) {
          return route.fulfill({
            status: 400,
            json: { message: (error as Error).message },
          });
        }
      });
      const page = await context.newPage(),
        errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const url = server.resolvedUrls!.local[0] + `gift/${f.item.id}`;
      const menu = () =>
        page.locator(`summary[aria-label="Actions for ${f.item.title}"]`);
      const screenshot = async (name: string) => {
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `${out}/${width}-${theme}-${name}.png`,
          fullPage: true,
        });
      };
      await page.goto(url);
      await menu().click();
      await expect(
        page.getByRole("button", { name: "Archive item", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Move to Trash", exact: true }),
      ).toHaveCount(0);
      await screenshot("surprise-actions");
      await page
        .getByRole("button", { name: "Edit item", exact: true })
        .first()
        .click();
      await expect(
        page.getByLabel("Archive this item", { exact: true }),
      ).toHaveCount(0);
      const title = page.getByRole("textbox", {
        name: "Item name",
        exact: true,
      });
      await title.fill("Synthetic edited wish");
      await expect(title).toHaveValue("Synthetic edited wish");
      await expect(
        page.getByText("Loading note editor…", { exact: true }),
      ).toHaveCount(0);
      await screenshot("surprise-editor");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(page.getByRole("dialog")).not.toBeVisible();
      expect(f.item.title).toBe("Synthetic edited wish");
      list.mode = "transparent";
      await page.reload();
      await menu().click();
      await expect(
        page.getByRole("button", { name: "Archive item", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Move to Trash", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByText(
          "This gift is marked as purchased and cannot be archived or removed.",
          { exact: true },
        ),
      ).toBeVisible();
      await screenshot("transparent-actions");
      list.mode = "surprise";
      s.people.find((p) => p.userId === a.id)!.admin = true;
      await page.reload();
      await menu().click();
      await page
        .getByRole("button", { name: "Admin override: archive", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).not.toContainText("marked as purchased");
      const submit = dialog.getByRole("button", {
        name: "Archive with override",
        exact: true,
      });
      await expect(submit).toBeDisabled();
      await dialog
        .getByRole("textbox", { name: "Reason for override" })
        .fill("Synthetic recovery check");
      await expect(submit).toBeDisabled();
      await dialog.getByRole("checkbox").focus();
      await page.keyboard.press("Space");
      await expect(submit).toBeEnabled();
      await screenshot("admin-review");
      await submit.click();
      await expect(
        dialog.getByRole("textbox", { name: "Reason for override" }),
      ).toHaveValue("Synthetic recovery check");
      await dialog
        .getByRole("button", { name: "Review again", exact: true })
        .click();
      await expect(dialog.getByRole("checkbox")).not.toBeChecked();
      await dialog.getByRole("checkbox").check();
      await submit.click();
      await expect(dialog).not.toBeVisible();
      expect(f.item.archived).toBe(true);
      expect(errors).toEqual([]);
      await context.close();
    }
  console.log(
    "Purchase protection browser acceptance passed; screenshots:",
    out,
  );
} finally {
  await browser.close();
  await server.close();
}
