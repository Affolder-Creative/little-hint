import { expect, type Page, type BrowserContext } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
const loginCookies = new Map<
  string,
  Awaited<ReturnType<BrowserContext["cookies"]>>
>();
export async function login(page: Page, email: string) {
  if (loginCookies.has(email))
    await page.context().addCookies(loginCookies.get(email)!);
  await page.goto("/");
  if (
    await page
      .getByRole("heading", { name: /A little thought,/ })
      .isVisible()
      .catch(() => false)
  )
    return;
  const before = new Set(await readdir(".local/mail").catch(() => []));
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Send me a code", exact: true })
    .click();
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
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /A little thought,/ }),
  ).toBeVisible();
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
