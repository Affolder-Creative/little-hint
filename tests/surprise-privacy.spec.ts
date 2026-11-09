import { test, expect } from "@playwright/test";
import { login, post } from "./browser-helpers";

for (const width of [1440, 393]) {
  test(`exchange privacy at ${width}px`, async ({ browser }) => {
    const contexts = await Promise.all(
      Array.from({ length: 4 }, () =>
        browser.newContext({ viewport: { width, height: 900 } }),
      ),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    try {
      const emails = ["alex", "sam", "jamie", "riley"].map(
        (s) => `${s}@example.test`,
      );
      for (const [index, page] of pages.entries()) {
        await login(page, emails[index]);
      }
      const world = async (page: (typeof pages)[number]) =>
        (await page.request.get("/api/v1/world")).json();
      const users = await Promise.all(pages.map(world));
      const group = await post(pages[0], "groups", {
        name: `Privacy audit ${Date.now()}`,
      });
      for (let i = 1; i < pages.length; i++) {
        const invitation = await post(pages[0], "groups/invite", {
          groupId: group.id,
          email: emails[i],
        });
        await post(pages[i], "invitations/accept", { id: invitation.id });
      }
      const people = users.map((w) =>
        w.people.find((p: any) => p.userId === w.me.id),
      );
      const items: any[] = [];
      for (const [i, page] of pages.entries()) {
        const list = await post(page, "lists", {
          name: `Audit wishes ${i}`,
          ownerIds: [people[i].id],
          groupIds: [group.id],
          mode: "surprise",
        });
        items.push(
          await post(page, "items", {
            listId: list.id,
            title: `Audit secret gift ${i}`,
            quantity: 3,
            allowDuplicate: true,
          }),
        );
      }
      const created = await post(pages[0], "exchanges", {
        name: "Privacy audit exchange",
        groupId: group.id,
        participantIds: people.map((p: any) => p.id),
        count: 1,
        excludeHousehold: false,
      });
      let e = (await world(pages[0])).exchanges.find(
        (e: any) => e.id === created.id,
      );
      await post(pages[0], "exchanges/draw", {
        id: e.id,
        revision: e.revision,
      });
      e = (await world(pages[1])).exchanges.find(
        (e: any) => e.id === created.id,
      );
      const recipientId = e.myAssignments[0][1];
      const recipientIndex = people.findIndex((p: any) => p.id === recipientId);
      const item = items[recipientIndex];
      const observerIndex = [0, 2, 3].find((i) => i !== recipientIndex)!;
      const giver = pages[1],
        observer = pages[observerIndex];
      await giver.goto("/exchanges");
      await giver.locator(`#exchange-${e.id} .assignments a`).click();
      await expect(giver).toHaveURL(
        new RegExp(`/people/${recipientId}\\?shopping=`),
      );
      if (width === 1440) {
        await giver
          .locator("a.person-list-link")
          .filter({ hasText: `Audit wishes ${recipientIndex}` })
          .click();
        await expect(giver).toHaveURL(/\/lists\/.*\?shopping=/);
      }
      await giver.locator(`a.gift-card[href^="/gift/${item.id}?"]`).click();
      await expect(giver).toHaveURL(new RegExp(`/gift/${item.id}\\?shopping=`));
      await giver.reload();
      await expect(
        giver.getByRole("heading", { level: 1, name: item.title, exact: true }),
      ).toBeVisible();
      await expect(giver.getByLabel("Buying for", { exact: true })).toHaveValue(
        `${e.id}:${e.myAssignments[0][0]}:${recipientId}`,
      );
      await expect(
        giver.getByText("New notes are visible only to", { exact: false }),
      ).toBeVisible();
      await giver
        .locator("textarea")
        .fill("Unsent note survives audience selection");
      await giver
        .getByLabel("Buying for", { exact: true })
        .selectOption("ordinary");
      await expect(giver.locator("textarea")).toHaveValue(
        "Unsent note survives audience selection",
      );
      await giver.locator("textarea").fill("");
      await giver.reload();
      await expect(giver.getByLabel("Buying for", { exact: true })).toHaveValue(
        "ordinary",
      );
      await giver
        .getByLabel("Buying for", { exact: true })
        .selectOption(`${e.id}:${e.myAssignments[0][0]}:${recipientId}`);
      const extraTab = await contexts[1].newPage();
      await extraTab.goto(giver.url());
      await expect(
        extraTab.getByLabel("Buying for", { exact: true }),
      ).toHaveValue(`${e.id}:${e.myAssignments[0][0]}:${recipientId}`);
      await extraTab.close();
      await giver.screenshot({
        path: `test-results/privacy-${width}.png`,
        fullPage: true,
      });
      const composer = giver.locator("textarea");
      await composer.fill(
        "Audit note: I drew this person in the secret exchange.",
      );
      await giver
        .getByRole("button", { name: "Add private note", exact: true })
        .click();
      await observer.goto(`/gift/${item.id}`);
      await expect(
        observer.getByText(
          "Audit note: I drew this person in the secret exchange.",
          { exact: true },
        ),
      ).toHaveCount(0);
      // A click starts the save; the observer must reload after it commits.
      const [savedReservation] = await Promise.all([
        giver.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/v1/reservations" &&
            response.request().method() === "POST",
        ),
        giver
          .getByRole("button", { name: "Reserve gift", exact: true })
          .click(),
      ]);
      expect(savedReservation.ok(), await savedReservation.text()).toBe(true);
      await observer.reload();
      await expect(
        observer
          .locator(".reservation-row")
          .getByText("Exchange giver", { exact: true }),
      ).toBeVisible();
      const response = await observer.request.get(`/api/v1/items/${item.id}`);
      const exposed = await response.json();
      expect(exposed.reservations[0].exchange).toBe(true);
      expect(exposed.reservations[0].buyerName).toBe("Exchange giver");
      expect(exposed.reservations[0]).not.toHaveProperty("reservedAt");
      expect(exposed.comments).toEqual([]);
      const own = await (
        await giver.request.get(`/api/v1/items/${item.id}`)
      ).json();
      const reservation = own.reservations.find((r: any) => r.mine);
      await post(giver, "reservations/update", {
        id: reservation.id,
        revision: reservation.revision,
        quantity: 0,
        purchased: 0,
      });
      await giver.reload();
      await giver.locator("textarea").fill("Still private after release");
      await giver
        .getByRole("button", { name: "Add private note", exact: true })
        .click();
      await expect(
        giver.getByText("Still private after release", { exact: true }),
      ).toBeVisible();
      expect(
        (await (await observer.request.get(`/api/v1/items/${item.id}`)).json())
          .comments,
      ).toEqual([]);
    } finally {
      for (const context of contexts) await context.close();
    }
  });
}

test("a spending partner who manages the recipient cannot see the plan", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const [guardian, giver] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await login(guardian, "alex@example.test");
    await login(giver, "sam@example.test");
    const gw = await (await guardian.request.get("/api/v1/world")).json();
    const bw = await (await giver.request.get("/api/v1/world")).json();
    const group = await post(guardian, "groups", {
      name: "Guardian privacy check",
    });
    const invitation = await post(guardian, "groups/invite", {
      groupId: group.id,
      email: "sam@example.test",
    });
    await post(giver, "invitations/accept", { id: invitation.id });
    const child = await post(guardian, "people", {
      name: "Managed privacy recipient",
    });
    const list = await post(guardian, "lists", {
      name: "Managed privacy wishes",
      ownerIds: [child.id],
      groupIds: [group.id],
      mode: "surprise",
    });
    const item = await post(guardian, "items", {
      listId: list.id,
      title: "Managed surprise test bicycle",
      priceCents: 15000,
    });
    for (const page of [guardian, giver])
      await post(page, "spending/settings", { enabled: true, summaries: true });
    await post(giver, "spending/connect", { userId: gw.me.id });
    let spending = await (
      await guardian.request.get("/api/v1/spending")
    ).json();
    await post(guardian, "spending/connection", {
      id: spending.connection.id,
      revision: spending.connection.revision,
      operation: "accept",
    });
    spending = await (await giver.request.get("/api/v1/spending")).json();
    await post(giver, "spending/connection", {
      id: spending.connection.id,
      revision: spending.connection.revision,
      operation: "rules",
      rules: [`person:${child.id}`],
    });
    await post(giver, "reservations", {
      itemId: item.id,
      quantity: 1,
      ordinary: true,
    });
    await guardian.goto("/spending");
    await expect(guardian.getByText(item.title, { exact: true })).toHaveCount(
      0,
    );
    const response = await (
      await guardian.request.get("/api/v1/spending")
    ).json();
    expect(
      response.records.some(
        (r: any) => r.title === item.title && r.ownerId === bw.me.id,
      ),
    ).toBe(false);
  } finally {
    for (const c of contexts) await c.close();
  }
});
