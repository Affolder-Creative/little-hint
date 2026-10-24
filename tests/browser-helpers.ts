import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
const loginCookies = new Map<
  string,
  Awaited<ReturnType<BrowserContext["cookies"]>>
>();

export async function expectDialogFieldsToFit(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const layout = await dialog.evaluate((el) => {
    const body = el.querySelector<HTMLElement>(".dialog-body")!;
    const bounds = body.getBoundingClientRect();
    const padding = getComputedStyle(body);
    return {
      overflow: el.scrollWidth - el.clientWidth,
      fields: [
        ...el.querySelectorAll<HTMLElement>(
          ".field input, .field select, .field textarea",
        ),
      ]
        .filter((input) => input.getClientRects().length > 0)
        .map((input) => {
          const rect = input.getBoundingClientRect();
          const field = input.closest(".field")!.getBoundingClientRect();
          return {
            name: input.getAttribute("name"),
            fits:
              rect.left >=
                Math.max(
                  field.left,
                  bounds.left + parseFloat(padding.paddingLeft),
                ) -
                  1 &&
              rect.right <=
                Math.min(
                  field.right,
                  bounds.right - parseFloat(padding.paddingRight),
                ) +
                  1,
          };
        }),
    };
  });
  expect(layout.overflow, "dialog horizontal overflow").toBeLessThanOrEqual(1);
  expect(layout.fields.length).toBeGreaterThan(0);
  expect(layout.fields.filter((field) => !field.fits)).toEqual([]);
}

async function submitAuth(page: Page, button: string, path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === path),
      page.getByRole("button", { name: button, exact: true }).click(),
    ]);
    if (response.status() !== 429 || attempt === 1) {
      expect(response.ok(), await response.text()).toBe(true);
      return;
    }
    // Real auth limits remain enabled. Respect the server's cooldown between
    // fixture sign-ins instead of turning protection off for the test suite.
    const seconds = Number(response.headers()["retry-after"]);
    const delay =
      (Number.isFinite(seconds) && seconds > 0 ? seconds : 60) * 1000 + 1000;
    test.setTimeout(test.info().timeout + delay);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
export async function login(page: Page, email: string) {
  if (loginCookies.has(email))
    await page.context().addCookies(loginCookies.get(email)!);
  await page.goto("/");
  // Wait for the session check before deciding which sign-in path to take.
  // isVisible() alone can race the initial loading screen with cached cookies.
  await expect(
    page
      .getByRole("heading", { name: /Hi,/ })
      .or(page.getByLabel("Email address", { exact: true })),
  ).toBeVisible();
  if (
    await page
      .getByRole("heading", { name: /Hi,/ })
      .isVisible()
      .catch(() => false)
  )
    return;
  const before = new Set(await readdir(".local/mail").catch(() => []));
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await submitAuth(
    page,
    "Send me a code",
    "/api/auth/email-otp/send-verification-otp",
  );
  await expect(page.getByLabel("Six-digit code")).toBeVisible();
  let code = "";
  await expect
    .poll(
      async () => {
        for (const file of await readdir(".local/mail"))
          if (!before.has(file)) {
            const mail = JSON.parse(
              await readFile(`.local/mail/${file}`, "utf8"),
            );
            if (mail.to === email)
              code = mail.text.match(/\b\d{6}\b/)?.[0] ?? "";
          }
        return code;
      },
      { timeout: 10000 },
    )
    .toHaveLength(6);
  await page.getByLabel("Six-digit code").fill(code);
  await submitAuth(page, "Sign in", "/api/auth/sign-in/email-otp");
  await expect(page.getByRole("heading", { name: /Hi,/ })).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("little-hint:pending-sign-in"),
    ),
  ).toBeNull();
  loginCookies.set(email, await page.context().cookies());
}
export const post = async (page: Page, path: string, body: unknown) => {
  const response = await page.request.post(`/api/v1/${path}`, {
    headers: {
      Origin: new URL(page.url()).origin,
      "Idempotency-Key": crypto.randomUUID(),
    },
    data: body,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
};
