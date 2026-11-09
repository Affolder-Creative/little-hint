import { test, expect } from "@playwright/test";
import { login, post } from "./browser-helpers";
test("helpful notes format, save, reopen, and fit both themes", async ({
  page,
}) => {
  if (process.env.E2E_PREVIEW) {
    const origin = process.env.E2E_BASE_URL!;
    await page.request.post("/api/auth/email-otp/send-verification-otp", {
      headers: { Origin: origin },
      data: { email: "alex@example.test", type: "sign-in" },
    });
    let code = "";
    await expect
      .poll(async () => {
        const inbox = await (
          await page.request.get("/__preview/inbox/api/v1/messages")
        ).json();
        for (const m of inbox.messages) {
          if (!m.To.some((t: any) => t.Address === "alex@example.test"))
            continue;
          const full = await (
            await page.request.get("/__preview/inbox/api/v1/message/" + m.ID)
          ).json();
          code = full.Text.match(/sign-in code is (\d{6})/)?.[1] ?? "";
          if (code) break;
        }
        return code;
      })
      .toHaveLength(6);
    const result = await page.request.post("/api/auth/sign-in/email-otp", {
      headers: { Origin: origin },
      data: { email: "alex@example.test", otp: code },
    });
    expect(result.ok()).toBe(true);
    await page.goto("/");
  } else await login(page, "alex@example.test");
  const world = await (await page.request.get("/api/v1/world")).json();
  const list = world.lists.find((l: any) => l.canEdit && !l.archived);
  const item = await post(page, "items", {
    title: "Rich note test " + Date.now(),
    listId: list.id,
    description: "**literal**\nSecond line",
  });
  await page.goto("/gift/" + item.id);
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  const note = page.getByRole("textbox", {
    name: "A helpful note",
    exact: true,
  });
  await expect(note).toContainText("**literal**");
  await note.fill("x".repeat(5001));
  await expect(page.getByRole("alert")).toContainText("5,000");
  await expect(note).toContainText("**literal**");
  await note.fill("Medium in green");
  await note.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Discard your changes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await note.press("ControlOrMeta+a");
  await expect(note.locator("strong")).toHaveText("Medium in green");
  await page.getByRole("button", { name: "Italic", exact: true }).click();
  await page
    .getByRole("button", { name: "Strikethrough", exact: true })
    .click();
  await expect(note.locator("em s, s em")).toHaveText("Medium in green");
  await page
    .getByRole("button", { name: "Add or edit link", exact: true })
    .click();
  await page.getByLabel("Link address").fill("https://example.com/size");
  await page.getByRole("button", { name: "Apply link", exact: true }).click();
  await expect(note.locator("a")).toHaveAttribute(
    "href",
    "https://example.com/size",
  );
  for (const width of [1280, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 950 });
    for (const theme of ["light", "dark"]) {
      await page
        .locator("html")
        .evaluate((el, t) => (el.dataset.theme = t), theme);
      expect(
        await page
          .getByRole("dialog")
          .evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: test.info().outputPath(`note-${width}-${theme}.png`),
        fullPage: false,
      });
    }
  }
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".description strong")).toHaveText(
    "Medium in green",
  );
  await expect(page.locator(".description a")).toHaveAttribute(
    "target",
    "_blank",
  );
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await expect(note.locator("strong")).toHaveText("Medium in green");
  await page
    .getByRole("button", { name: "Bulleted list", exact: true })
    .click();
  await expect(note.locator("ul li")).toContainText("Medium in green");
  await page
    .getByRole("button", { name: "Numbered list", exact: true })
    .click();
  await expect(note.locator("ol li")).toContainText("Medium in green");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".description strong")).toHaveText(
    "Medium in green",
  );
});
