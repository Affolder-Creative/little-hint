import { test, expect } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import { login, post, submitAuth } from "./browser-helpers";

test("lost reservation responses retry once and account changes cannot display the previous inbox", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const a = await browser.newContext(),
    b = await browser.newContext();
  try {
    const owner = await a.newPage(),
      buyer = await b.newPage();
    await login(owner, "alex@example.test");
    await login(buyer, "sam@example.test");
    const world = await (await owner.request.get("/api/v1/world")).json();
    const list = world.lists.find(
      (l: any) => l.canEdit && !l.archived && l.groupIds.length,
    );
    const gift = await post(owner, "items", {
      listId: list.id,
      title: `Retry regression ${Date.now()}`,
      quantity: 10,
    });
    await buyer.goto(`/gift/${gift.id}`);
    const keys: string[] = [];
    let loseResponse = true;
    await buyer.route("**/api/v1/reservations", async (route) => {
      keys.push(route.request().headers()["idempotency-key"]);
      if (loseResponse) {
        loseResponse = false;
        await route.fetch();
        await route.abort("connectionreset");
      } else await route.continue();
    });
    await buyer
      .getByRole("button", { name: "Reserve gift", exact: true })
      .click();
    await expect(
      buyer.getByRole("alert").filter({ hasText: "could not reach" }),
    ).toBeVisible();
    await buyer
      .getByRole("button", { name: "Reserve gift", exact: true })
      .click();
    await expect.poll(() => keys.length).toBe(2);
    expect(keys[0]).toBe(keys[1]);
    await expect
      .poll(
        async () =>
          (
            await (await buyer.request.get("/api/v1/world")).json()
          ).buying.filter((r: any) => r.itemId === gift.id).length,
      )
      .toBe(1);
    await post(owner, "items/update", {
      ...gift,
      title: "Buyer-only notification marker",
      archived: false,
      visibility: gift.visibility || "private",
      groupIds: gift.groupIds || [],
    });
    await buyer.goto("/notifications");
    await expect(buyer.locator(".notification-list")).toContainText(
      "Buyer-only notification marker",
    );
    await b.clearCookies();
    await buyer.evaluate(() =>
      window.dispatchEvent(new Event("product-images-cleared")),
    );
    await expect(
      buyer.getByLabel("Email address", { exact: true }),
    ).toBeVisible();
    const before = new Set(await readdir(".local/mail"));
    await buyer
      .getByLabel("Email address", { exact: true })
      .fill("alex@example.test");
    await submitAuth(
      buyer,
      "Send me a code",
      "/api/auth/email-otp/send-verification-otp",
    );
    let code = "";
    await expect
      .poll(async () => {
        for (const file of await readdir(".local/mail")) {
          if (before.has(file)) continue;
          const mail = JSON.parse(
            await readFile(`.local/mail/${file}`, "utf8"),
          );
          if (
            mail.to === "alex@example.test" &&
            mail.subject === "Your Little Hint sign-in code"
          )
            code = mail.text.match(/\b\d{6}\b/)[0];
        }
        return code;
      })
      .toHaveLength(6);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await buyer.route("**/api/v1/notifications?**", async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    try {
      await buyer.getByLabel("Six-digit code").fill(code);
      await submitAuth(buyer, "Sign in", "/api/auth/sign-in/email-otp");
      await expect(
        buyer.getByRole("heading", { name: "Notifications", exact: true }),
      ).toBeVisible();
      await expect(
        buyer.getByText("Buyer-only notification marker", { exact: true }),
      ).toHaveCount(0);
      await expect(
        buyer.getByRole("status").filter({ hasText: "Loading notifications" }),
      ).toBeVisible();
    } finally {
      release();
    }
  } finally {
    await a.close();
    await b.close();
  }
});
