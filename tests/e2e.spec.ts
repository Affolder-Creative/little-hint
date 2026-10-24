import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { login, post } from "./browser-helpers";
test("real email-code sign-in, gift creation, buyer reservation, and surprise privacy", async ({
  browser,
}) => {
  const alice = await browser.newContext();
  const ap = await alice.newPage();
  await login(ap, "alex@example.test");
  let w = await (await ap.request.get("/api/v1/world")).json();
  const list = w.lists.find((l: any) => l.canEdit && !l.archived);
  const title = `A thoughtful test gift ${Date.now()}`;
  await ap.getByRole("button", { name: "Add item", exact: true }).click();
  await ap.getByLabel("Item name", { exact: true }).fill(title);
  await ap.getByLabel("Wish list", { exact: true }).selectOption(list.id);
  await ap.getByText("More details", { exact: true }).click();
  await ap.getByLabel("Price in USD", { exact: true }).fill("29.50");
  await ap.getByLabel("Quantity wanted", { exact: true }).fill("2");
  await ap
    .getByRole("button", { name: "Add to wish list", exact: true })
    .click();
  await expect(ap.getByRole("dialog")).not.toBeVisible();
  w = await (await ap.request.get("/api/v1/world")).json();
  const before = w.items.find((i: any) => i.title === title);
  expect(before).not.toHaveProperty("reservations");
  const sam = await browser.newContext();
  const sp = await sam.newPage();
  await login(sp, "sam@example.test");
  await sp.goto(`/gift/${before.id}`);
  await expect(
    sp.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await sp.getByRole("button", { name: "Reserve gift", exact: true }).click();
  await expect(
    sp.getByRole("status").filter({
      hasText:
        "Gift reserved. Open Buying to mark it as purchased or cancel your reservation.",
    }),
  ).toBeVisible();
  await sp
    .getByLabel("Your note", { exact: true })
    .fill("Please keep this private.");
  await sp
    .getByRole("button", { name: "Add private note", exact: true })
    .click();
  await expect(
    sp.getByText("Please keep this private.", { exact: true }),
  ).toBeVisible();
  const after = (
    await (await ap.request.get("/api/v1/world")).json()
  ).items.find((i: any) => i.id === before.id);
  expect(after).toEqual(before);
  await ap.goto(`/gift/${before.id}`);
  await expect(
    ap.getByRole("heading", { name: "A quiet word with the givers" }),
  ).toHaveCount(0);
  await expect(
    ap.getByText("Please keep this private.", { exact: true }),
  ).toHaveCount(0);
  await alice.close();
  await sam.close();
});
test("unauthenticated and cross-origin mutations are rejected", async ({
  request,
}) => {
  expect((await request.get("/api/v1/world")).status()).toBe(401);
  expect(
    (
      await request.post("/api/v1/groups", {
        headers: { Origin: "https://attacker.invalid" },
        data: { name: "Bad group" },
      })
    ).status(),
  ).toBe(403);
});
test("desktop and mobile screens are usable without overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await mkdir("test-results/visual", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Come on in" })).toBeVisible();
  await page.screenshot({
    path: "test-results/visual/login-desktop.png",
    fullPage: true,
  });
  await login(page, "alex@example.test");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/visual/home-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "My lists", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Your wish lists" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create a list", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/visual/list-form-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Hi,/ })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/visual/home-mobile.png",
    fullPage: true,
  });
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/visual/settings-mobile.png",
    fullPage: true,
  });
  await page
    .getByLabel("Settings section", { exact: true })
    .selectOption("device");
  await page.getByRole("button", { name: "Show me how", exact: true }).click();
  await expect(
    page.getByText("Choose Install app or Add to Home Screen, if available."),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByLabel("Settings section", { exact: true })
    .selectOption("profile");
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await page.goto("/");
  await expect(
    page.getByLabel("Available to give", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/visual/home-mobile-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/visual/home-desktop-dark.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("invitation verification, explicit profile linking, joint ownership, and ownership transfer", async ({
  browser,
}) => {
  const owner = await browser.newContext(),
    op = await owner.newPage();
  await login(op, "alex@example.test");
  const group = await post(op, "groups", {
    name: `Verification circle ${Date.now()}`,
  });
  const email = `invited-${Date.now()}@example.test`;
  const invitation = await post(op, "groups/invite", {
    groupId: group.id,
    email,
  });
  const guest = await browser.newContext(),
    gp = await guest.newPage();
  await login(gp, email);
  let gw = await (await gp.request.get("/api/v1/world")).json();
  expect(gw.groups).toHaveLength(0);
  await post(gp, "invitations/accept", { id: invitation.id });
  gw = await (await gp.request.get("/api/v1/world")).json();
  expect(gw.groups.map((g: any) => g.id)).toContain(group.id);
  const managed = await post(op, "people", {
    name: "Managed recipient",
  });
  await post(op, "people/link", { id: managed.id, email });
  gw = await (await gp.request.get("/api/v1/world")).json();
  expect(
    gw.people.find((p: any) => p.id === managed.id).userId,
  ).toBeUndefined();
  await post(gp, "links/accept", {
    id: gw.links.find((l: any) => l.kind === "profile").id,
  });
  gw = await (await gp.request.get("/api/v1/world")).json();
  expect(gw.people.find((p: any) => p.id === managed.id).userId).toBe(gw.me.id);
  const ow = await (await op.request.get("/api/v1/world")).json();
  const list = await post(op, "lists", {
    name: "A joint wish list",
    ownerIds: [
      ow.people.find((p: any) => p.userId === ow.me.id).id,
      managed.id,
    ],
    groupIds: [],
    mode: "surprise",
  });
  await post(gp, "lists/accept", { id: list.id });
  const refreshed = await (await op.request.get("/api/v1/world")).json();
  const l = refreshed.lists.find((l: any) => l.id === list.id);
  await post(op, "lists/update", { ...l, groupIds: [group.id] });
  await post(op, "groups/transfer", {
    groupId: group.id,
    userId: gw.me.id,
    email,
  });
  gw = await (await gp.request.get("/api/v1/world")).json();
  await post(gp, "links/accept", {
    id: gw.links.find((l: any) => l.kind === "ownership").id,
  });
  expect(
    (await (await gp.request.get("/api/v1/world")).json()).groups.find(
      (g: any) => g.id === group.id,
    ).ownerId,
  ).toBe(gw.me.id);
  await owner.close();
  await guest.close();
});

test("passkey registration and sign-in through a virtual platform authenticator", async ({
  page,
  context,
  browser,
}) => {
  const label = `1Password personal ${Date.now()}`;
  await login(page, "sam@example.test");
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto("/settings?section=security");
  await page
    .getByRole("button", { name: "Add a passkey", exact: true })
    .click();
  await expect(page.getByLabel("Passkey name", { exact: true })).toHaveValue(
    "Little Hint",
  );
  await page.getByLabel("Passkey name", { exact: true }).fill("1Password");
  await mkdir("test-results/visual", { recursive: true });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.getByRole("dialog").screenshot({
      path: `test-results/visual/passkey-label-${name}.png`,
    });
    expect(
      (await new AxeBuilder({ page }).include("dialog").analyze()).violations,
    ).toEqual([]);
  }
  const registration = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname ===
      "/api/auth/passkey/generate-register-options",
  );

  await page
    .getByRole("button", { name: "Create passkey", exact: true })
    .click();
  expect((await (await registration).json()).rp.name).toBe("Little Hint");
  await expect(
    page.getByRole("status").filter({ hasText: "Passkey added." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rename 1Password", exact: true })
    .click();
  await page.getByLabel("Passkey name", { exact: true }).fill(label);
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: `Rename ${label}`,
      exact: true,
    }),
  ).toBeVisible();
  const saved = (
    await (
      await page.request.get("/api/auth/passkey/list-user-passkeys")
    ).json()
  ).find((key: any) => key.name === label);
  expect(saved).toBeTruthy();
  const stranger = await browser.newContext();
  try {
    const outsider = await stranger.newPage();
    await login(outsider, "alex@example.test");
    const denied = await outsider.request.post(
      "/api/auth/passkey/update-passkey",
      {
        headers: { Origin: new URL(page.url()).origin },
        data: { id: saved.id, name: "Not yours" },
      },
    );
    expect([401, 403, 404]).toContain(denied.status());
  } finally {
    await stranger.close();
  }
  const invalid = await page.request.post("/api/auth/passkey/update-passkey", {
    headers: { Origin: new URL(page.url()).origin },
    data: { id: saved.id, name: "x".repeat(81) },
  });
  expect(invalid.status()).toBe(400);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in with a passkey", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Hi,/ })).toBeVisible();
  expect(
    (await (await page.request.get("/api/v1/world")).json()).me.email,
  ).toBe("sam@example.test");
  await page.goto("/settings?section=security");
  await page.evaluate(() => {
    navigator.credentials.create = async () => {
      throw new DOMException("Cancelled", "NotAllowedError");
    };
  });
  await page
    .getByRole("button", { name: "Add a passkey", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create passkey", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .locator(".setting-row")
    .filter({ hasText: label })
    .getByRole("button", { name: `Remove passkey ${label}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Rename ${label}`, exact: true }),
  ).toHaveCount(0);
});

test("the worker safely fails a private-network import without blocking manual entry", async ({
  page,
}) => {
  await login(page, "alex@example.test");
  const job = await post(page, "imports", {
    url: "http://127.0.0.1/private-product",
  });
  await expect
    .poll(
      async () => {
        const w = await (await page.request.get("/api/v1/world")).json();
        return w.imports.find((j: any) => j.id === job.id)?.status;
      },
      { timeout: 20000 },
    )
    .toBe("failed");
  const w = await (await page.request.get("/api/v1/world")).json();
  const gift = await post(page, "items", {
    title: `Manual fallback ${Date.now()}`,
    listId: w.lists.find((l: any) => l.canEdit).id,
  });
  expect(gift.title).toMatch(/^Manual fallback/);
});

test("administrators control automatic photos without affecting manual uploads", async ({
  page,
  browser,
}) => {
  const key = "AUTO_IMPORT_PRODUCT_PHOTOS";
  await login(page, "alex@example.test");
  await page.goto("/settings?section=admin");
  const toggle = page.getByRole("checkbox", {
    name: "Add photos from shop links automatically",
    exact: true,
  });
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toBeEnabled();
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const upload = await page.request.post("/api/v1/media", {
    headers: {
      Origin: new URL(page.url()).origin,
      "Content-Type": "application/octet-stream",
    },
    data: png,
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const image = (await upload.json()).url;
  const world = await (await page.request.get("/api/v1/world")).json();
  const gift = await post(page, "items", {
    title: `Manual photo ${Date.now()}`,
    listId: world.lists.find((l: any) => l.canEdit && !l.archived).id,
    image,
  });
  try {
    await toggle.check();
    await page
      .getByRole("button", { name: "Save photo preference", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Photo preference saved." }),
    ).toBeVisible();
    await page.reload();
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page
      .getByRole("button", { name: "Save photo preference", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Photo preference saved." }),
    ).toBeVisible();
    await page.reload();
    await expect(toggle).not.toBeChecked();
    expect((await page.request.get(image)).ok()).toBe(true);
    await page.goto(`/gift/${gift.id}`);
    await expect(
      page.getByRole("img", { name: gift.title, exact: true }),
    ).toBeVisible();
    const member = await browser.newContext();
    try {
      const memberPage = await member.newPage();
      await login(memberPage, "sam@example.test");
      await memberPage.goto("/settings?section=admin");
      await expect(
        memberPage.getByRole("checkbox", {
          name: "Add photos from shop links automatically",
        }),
      ).toHaveCount(0);
      expect(
        (await memberPage.request.get("/api/v1/admin/settings")).status(),
      ).toBe(403);
      expect(
        (
          await memberPage.request.post("/api/v1/admin/settings", {
            headers: { Origin: new URL(memberPage.url()).origin },
            data: { key, value: "true" },
          })
        ).status(),
      ).toBe(403);
    } finally {
      await member.close();
    }
  } finally {
    await post(page, "admin/settings", { key, value: "false" });
  }
});
