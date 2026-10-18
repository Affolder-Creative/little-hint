import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

const inline = async (path, mime) =>
  `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
const logo = await inline("marketing/assets/brand/logo.svg", "image/svg+xml");
const tag = await inline("marketing/assets/brand/tag.svg", "image/svg+xml");
const font = await inline(
  "marketing/assets/fonts/Fraunces-variable.ttf",
  "font/ttf",
);
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    @font-face{font-family:Fraunces;src:url("${font}");font-weight:100 900}
    *{box-sizing:border-box}body{margin:0;background:#fff8f0;color:#2b201d;padding:58px 70px;font-family:Arial,sans-serif}
    .logo{width:230px;height:auto}h1{font:600 69px/1.08 Fraunces,serif;letter-spacing:-2px;margin:54px 0 20px;font-variation-settings:"SOFT" 65,"WONK" 1}
    p{font-size:24px;line-height:1.5;margin:0;max-width:650px}.tag{position:absolute;width:220px;right:80px;top:195px}
    footer{position:absolute;left:70px;right:70px;bottom:40px;border-top:1px solid #e6d9cf;padding-top:20px;font-size:18px;color:#746057;display:flex;justify-content:space-between}
  </style></head><body><img class="logo" src="${logo}" alt="Little Hint"><h1>A little thought.<br>A lovely surprise.</h1><p>Wish lists, gift ideas, and quiet coordination<br>for your favorite people.</p><img class="tag" src="${tag}" alt=""><footer><span>Self-hosted. Invite-only.</span><span>Gift ideas, shared thoughtfully.</span></footer></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "marketing/assets/social-preview.png" });
  console.log("Created marketing/assets/social-preview.png (1200 × 630)");
} finally {
  await browser.close();
}
