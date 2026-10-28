// Manual acceptance against an already running preview. No TLS bypasses.
// Run with the repository's Playwright dependencies and installed browsers.
import assert from "node:assert/strict";
import { chromium, webkit, devices } from "playwright";
import { mkdir } from "node:fs/promises";
const origin = process.argv[2];
if (!origin || new URL(origin).origin !== origin)
  throw new Error("Usage: node scripts/preview/browser.mjs <preview origin>");
await mkdir(".local/preview-acceptance", { recursive: true });
for (const [name, engine, profile, email] of [
  [
    "desktop-chrome",
    chromium,
    { viewport: { width: 1440, height: 1000 } },
    "alex@example.test",
  ],
  ["mobile-webkit", webkit, devices["iPhone 13"], "sam@example.test"],
]) {
  const browser = await engine.launch({
    headless: true,
    ...(name === "desktop-chrome" ? { channel: "chrome" } : {}),
  });
  const context = await browser.newContext({
    ...profile,
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  try {
    await page.goto(origin);
    await page.getByLabel("Email address", { exact: true }).fill(email);
    const sent = page.waitForResponse((r) =>
      r.url().includes("/email-otp/send-verification-otp"),
    );
    await page
      .getByRole("button", { name: "Send me a code", exact: true })
      .click();
    assert.equal((await sent).status(), 200);
    const messages = await (
      await context.request.get(origin + "/__preview/inbox/api/v1/messages")
    ).json();
    let code;
    for (const m of messages.messages) {
      if (!m.To.some((t) => t.Address === email)) continue;
      const full = await (
        await context.request.get(
          origin + "/__preview/inbox/api/v1/message/" + m.ID,
        )
      ).json();
      code = full.Text.match(/sign-in code is (\d{6})/)?.[1];
      if (code) break;
    }
    assert.ok(code, "Mailpit captured a real email code");
    await page.getByLabel("Six-digit code").fill(code);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByText(
        "Synthetic preview · Sample data · Emails go to the test inbox",
        { exact: true },
      )
      .waitFor();
    const world = await page.evaluate(async () =>
      (await fetch("/api/v1/world")).json(),
    );
    assert.equal(world.environment, "preview");
    assert.equal(world.me.email, email);
    const listName = `${name} acceptance ${Date.now()}`;
    const status = await page.evaluate(
      async ({ name, personId }) =>
        (
          await fetch("/api/v1/lists", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify({
              name,
              ownerIds: [personId],
              groupIds: [],
              mode: "surprise",
            }),
          })
        ).status,
      {
        name: listName,
        personId: world.people.find((p) => p.userId === world.me.id).id,
      },
    );
    assert.equal(status, 200);
    await page.goto(origin + "/lists");
    await page.getByText(listName, { exact: true }).first().waitFor();
    await page.getByText(listName, { exact: true }).first().click();
    await page.getByRole("heading", { name: listName, exact: true }).waitFor();
    await page.reload();
    await page.getByRole("heading", { name: listName, exact: true }).waitFor();
    await page.screenshot({
      path: `.local/preview-acceptance/${name}-app.png`,
      fullPage: true,
    });
    // Visit inbox after the app's service worker has taken control. It must not
    // return the app shell, intercept its API, or cache captured mail.
    await page.evaluate(async () => {
      if ("serviceWorker" in navigator) await navigator.serviceWorker.ready;
    });
    await page.goto(origin + "/__preview/inbox/");
    await page
      .getByText("Mailpit", { exact: true })
      .first()
      .waitFor({ state: "attached" });
    assert.match(await page.title(), /Mailpit/);
    const cache = await page.evaluate(async () => {
      const names = await caches.keys();
      for (const name of names)
        for (const request of await (await caches.open(name)).keys())
          if (request.url.includes("/__preview/")) return true;
      return false;
    });
    assert.equal(cache, false);
    await page.reload();
    assert.match(await page.title(), /Mailpit/);
    await page.screenshot({
      path: `.local/preview-acceptance/${name}-inbox.png`,
      fullPage: true,
    });
    console.log(
      `${name}: ${browser.version()}, sign-in, authenticated data, mutation, navigation, persistence, and inbox passed; TLS verification enabled.`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}
