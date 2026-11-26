import { test, expect, type Locator } from "@playwright/test";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { world, stamp } from "../src/server/domain";
import type { ContributionOfferView } from "../src/shared/model";

async function expectPairedActions(dialog: Locator) {
  const primary = await dialog
    .locator('.form-actions > button[type="submit"]')
    .boundingBox();
  const cancel = await dialog
    .getByRole("button", { name: "Cancel", exact: true })
    .boundingBox();
  expect(primary).not.toBeNull();
  expect(cancel).not.toBeNull();
  expect(primary!.x + primary!.width).toBeLessThanOrEqual(cancel!.x);
  expect(Math.abs(primary!.y - cancel!.y)).toBeLessThan(1);
  expect(Math.abs(primary!.height - cancel!.height)).toBeLessThan(1);
}

for (const width of [320, 390, 768, 1440]) {
  test(`offers can be made without buying and accepted explicitly at ${width}px`, async ({
    page,
  }, info) => {
    const { state, actors } = stagingFixtures();
    const data = world(state, actors[1]);
    const gift = data.items.find(
      (gift) => !gift.isRecipient && gift.kind !== "group" && !gift.archived,
    )!;
    gift.available = 1;
    gift.quantity = 1;
    gift.canShop = true;
    gift.canOfferContribution = true;
    gift.reservations = [];
    gift.comments = undefined;
    gift.contributionOffers = [];
    data.exchanges = [];
    data.spendingAvailable = false;
    data.spendingEnabled = true;
    data.paged = false;
    const writes: { path: string; body: any }[] = [];
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        writes.push({ path, body });
        if (path.endsWith("/contribution-offers")) {
          gift.contributionOffers = [
            {
              ...stamp(),
              itemId: gift.id,
              userId: data.me.id,
              contributorName: data.me.name,
              mine: true,
              amountCents: body.amountCents,
              status: "open",
              titleSnapshot: gift.title,
              recipientIds: gift.recipientIds,
              recipientNames: gift.recipientNames,
            },
          ];
        }
        if (path.endsWith("/contribution-offers/update"))
          gift.contributionOffers = [];
      }
      await route.fulfill({
        json: path.endsWith("/world")
          ? data
          : path.includes("/spending")
            ? { settings: { enabled: false } }
            : { rows: [], nextCursor: null },
      });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/gift/${gift.id}`);
    await page
      .getByRole("button", { name: "Offer to contribute", exact: true })
      .click();
    await page.getByLabel("Your offer in USD").fill("50");
    await expectPairedActions(page.getByRole("dialog"));
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Offer to contribute", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Edit your offer" }),
    ).toBeVisible();
    expect(
      writes.filter((write) => write.path.endsWith("/reservations")),
    ).toHaveLength(0);
    expect(
      writes.find((write) => write.path.endsWith("/contribution-offers"))!.body
        .amountCents,
    ).toBe(5000);
    await page
      .getByRole("button", { name: "Reserve gift", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByText(/Your .* offer will close when you become the buyer/),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel offer", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Offer to contribute", exact: true }),
    ).toBeVisible();
    gift.available = 0;
    gift.reservations = [
      {
        id: "other-reservation",
        buyerName: "Alex Example",
        mine: false,
        quantity: 1,
        exchange: false,
      },
    ];
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Offer to contribute", exact: true }),
    ).toBeVisible();
    gift.available = 1;
    gift.reservations = [];
    const offer: ContributionOfferView = {
      ...stamp(),
      itemId: gift.id,
      userId: actors[0].id,
      contributorName: "Alex Example",
      mine: false,
      amountCents: 5000,
      status: "open",
      titleSnapshot: gift.title,
      recipientIds: gift.recipientIds,
      recipientNames: gift.recipientNames,
    };
    gift.contributionOffers = [offer];
    await page.reload();
    await page
      .getByRole("button", { name: "Reserve gift", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox")).not.toBeChecked();
    await dialog.getByRole("checkbox").check();
    await dialog.getByLabel("Total gift cost in USD").fill("200");
    await dialog.getByLabel("Your contribution in USD").fill("150");
    await expectPairedActions(dialog);
    await page.screenshot({
      path: info.outputPath(`offer-review-${width}-light.png`),
    });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    await page.screenshot({
      path: info.outputPath(`offer-review-${width}-dark.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dialog
      .getByRole("button", { name: "Reserve and accept offers", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const reservation = writes.find((write) =>
      write.path.endsWith("/reservations"),
    )!.body;
    expect(reservation.acceptedOffers).toEqual([
      { id: offer.id, revision: offer.revision },
    ]);
    expect(reservation.poolTotalCents).toBe(20000);
    expect(reservation.poolOwnContributionCents).toBe(15000);
  });
}

test("existing buyers accept offers through Share the cost", async ({
  page,
}, info) => {
  const { state, actors } = stagingFixtures();
  const data = world(state, actors[1]);
  const reservation = data.buying.find(
    (r) => r.item && !r.exchangeId && !r.item.archived,
  )!;
  const gift = reservation.item!;
  gift.contributionOffers = [
    {
      ...stamp(),
      itemId: gift.id,
      userId: actors[0].id,
      contributorName: "Alex Example",
      mine: false,
      amountCents: 5000,
      status: "open",
      titleSnapshot: gift.title,
      recipientIds: gift.recipientIds,
      recipientNames: gift.recipientNames,
    },
  ];
  gift.reservations = [];
  reservation.poolTargetCents = undefined;
  reservation.poolTotalCents = undefined;
  reservation.poolOwnContributionCents = undefined;
  data.buying = [reservation];
  data.paged = false;
  data.spendingAvailable = false;
  let payload: any;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/reservations/update"))
      payload = route.request().postDataJSON();
    await route.fulfill({
      json: path.endsWith("/world") ? data : { rows: [], nextCursor: null },
    });
  });
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/buying");
  await page.locator(".buying-row summary").click();
  await page
    .getByRole("button", {
      name: /Review contribution offers|Share the cost/,
      exact: false,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Total gift cost in USD").fill("200");
  await dialog.getByLabel("Your contribution in USD").fill("150");
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByText("Offers selected: $50", { exact: true }),
  ).toBeVisible();
  await expectPairedActions(dialog);
  await page.screenshot({
    path: info.outputPath("existing-buyer-offer-review.png"),
  });
  await dialog
    .getByRole("button", { name: "Save and accept offers", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(payload.id).toBe(reservation.id);
  expect(payload.acceptedOffers).toEqual(
    gift.contributionOffers.map(({ id, revision }) => ({ id, revision })),
  );
});
