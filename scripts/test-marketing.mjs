import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { marketingServer } from "./preview-marketing.mjs";

const server = marketingServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/little-hint/`;
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
await mkdir("test-results/marketing", { recursive: true });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const failures = [];
  page.on("pageerror", (e) => failures.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
  });
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}`,
    );
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      axe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      [],
      `Accessibility at ${width}`,
    );
    await page.evaluate(() => scrollTo(0, 0));
    if ([1440, 390].includes(width))
      await page.screenshot({
        path: `test-results/marketing/page-${width}.png`,
        fullPage: true,
      });
    await page.getByRole("link", { name: "Features", exact: true }).click();
    assert.ok(page.url().endsWith("#features"));
    await page.getByRole("link", { name: "Self-host", exact: true }).click();
    assert.ok(page.url().endsWith("#self-host"));
  }
  await page.goto(url);
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(":focus").textContent(), "Skip to content");
  await page.keyboard.press("Enter");
  assert.ok(page.url().endsWith("#main"));
  const noJS = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const plain = await noJS.newPage();
  await plain.goto(url);
  assert.ok(await plain.getByRole("heading", { level: 1 }).isVisible());
  await plain.getByRole("link", { name: "Self-host", exact: true }).click();
  assert.ok(plain.url().endsWith("#self-host"));
  assert.deepEqual(failures, []);
  console.log(
    "Marketing browser checks passed at 1440, 768, 390, and 320px; no broken assets, overflow, WCAG A/AA violations, or JavaScript dependency.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
