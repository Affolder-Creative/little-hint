import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { wishlistFixture } from "./wishlist-fixture";
import { command, idempotent } from "../src/server/domain";
import { itemVisible } from "../src/server/domain-access";
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("persisted drafts", () => {
  let db: typeof import("../src/server/db");
  const f = wishlistFixture();
  beforeAll(async () => {
    if (!/little_hint_test(?:\?|$)/.test(url!))
      throw new Error("Separate little_hint_test database required.");
    process.env.DATABASE_URL = url;
    db = await import("../src/server/db");
    await db.migrate();
    await db.pool.query("DELETE FROM app_record");
    await db.transact((s) => Object.assign(s, f.s));
  });
  afterAll(async () => {
    await db?.pool.end();
  });
  it("migrates price sources without changing saved amounts", async () => {
    const cases = [
      { priceCents: 10900, priceMaxCents: null, source: "shops" },
      { priceCents: 100, priceMaxCents: null, source: "custom" },
      { priceCents: 0, priceMaxCents: null, source: "custom" },
      { priceCents: null, priceMaxCents: null, source: "custom" },
      { priceCents: 40000, priceMaxCents: 70000, source: "custom" },
    ];
    const ids = await db.transact((s) =>
      cases.map((entry, index) => {
        const created = command(s, f.john, "items.create", {
          title: `Legacy price ${index}`,
          listId: f.list.id,
          priceCents: 10900,
          shoppingOffers: [
            {
              id: "shop",
              url: "https://shop.example/product",
              label: "Shop",
              priceCents: 10900,
            },
          ],
        }) as import("../src/shared/model").GiftView;
        const item = s.items.find((value) => value.id === created.id)!;
        delete item.priceSource;
        item.priceCents = entry.priceCents;
        item.priceMaxCents = entry.priceMaxCents;
        return item.id;
      }),
    );
    await db.pool.query("DELETE FROM schema_migration WHERE version=16");
    await db.migrate();
    const migrated = await db.readState();
    for (const [index, id] of ids.entries()) {
      const { source, ...price } = cases[index];
      const item = migrated.items.find((value) => value.id === id)!;
      expect(item).toMatchObject({ ...price, priceSource: source });
      if (source === "custom") expect(item.pricing?.paused).toBe(true);
    }
    await db.migrate();
    expect((await db.readState()).items).toEqual(migrated.items);
    await db.transact((s) => {
      s.items = s.items.filter((item) => !ids.includes(item.id));
    });
  });
  it("persists draft privacy and publishes once under concurrent replay", async () => {
    const draft: any = await db.transact((s) =>
      command(s, f.john, "items.create", {
        title: "Database draft",
        listId: f.list.id,
        publicationState: "draft",
      }),
    );
    const saved = await db.readState();
    expect(itemVisible(saved, f.reader, saved.items[0])).toBe(false);
    expect(itemVisible(saved, f.john, saved.items[0])).toBe(true);
    const payload = { ...draft, archived: false };
    await Promise.all(
      [1, 2].map(() =>
        db.transact((s) =>
          idempotent(
            s,
            f.john,
            "draft-publish-integration",
            "items.publish",
            payload,
          ),
        ),
      ),
    );
    const published = await db.readState();
    expect(published.items).toHaveLength(1);
    expect(published.items[0].publicationState).toBe("published");
    expect(itemVisible(published, f.reader, published.items[0])).toBe(true);
  });
  it("persists and hydrates grouped products without duplicate browse entries", async () => {
    const { itemPage, buyingPage } = await import("../src/server/collections");
    const group = (await db.transact((s) =>
      command(s, f.john, "items.create", {
        title: "Silverware integration",
        kind: "group",
        listId: f.list.id,
        products: [
          {
            title: "Dinner forks",
            description: "Fork details",
            priceCents: 3200,
            shoppingOffers: [
              {
                id: "fork-shop",
                url: "https://shop.example/forks",
                label: "Shop",
                priceCents: 3200,
              },
            ],
          },
          { title: "Teaspoons", priceCents: 2400 },
        ],
      }),
    )) as import("../src/shared/model").GiftView;
    const state = await db.readCollectionState();
    expect(state.items.find((i) => i.id === group.id)?.kind).toBe("group");
    const page = await itemPage(state, f.reader, {
      scope: "list",
      id: f.list.id,
      search: "Dinner forks",
    });
    expect(page.rows.map((i) => i.id)).toEqual([group.id]);
    expect(page.rows[0].priceCents).toBe(5600);
    expect(page.rows[0].products?.[0].shoppingOffers?.[0].url).toBe(
      "https://shop.example/forks",
    );
    await db.transact((s) =>
      command(s, f.reader, "reservations.create", {
        itemId: group.products![0].id,
        quantity: 1,
        ordinary: true,
      }),
    );
    const buying = await buyingPage(
      await db.readBuyingState(f.reader.id),
      f.reader,
      {},
    );
    expect(
      buying.rows.find((r) => r.itemId === group.products![0].id)?.item
        ?.parentTitle,
    ).toBe("Silverware integration");
    const recipientPage = await itemPage(
      await db.readCollectionState(),
      f.john,
      { scope: "list", id: f.list.id, search: "Dinner forks" },
    );
    expect(recipientPage.rows[0].available).toBeUndefined();
    expect(
      recipientPage.rows[0].products?.every(
        (p) => p.reservations === undefined && p.available === undefined,
      ),
    ).toBe(true);
    expect(
      Number(
        (
          await db.pool.query(
            "SELECT max(version) AS version FROM schema_migration",
          )
        ).rows[0].version,
      ),
    ).toBe(19);
  });
  it("persists range bounds, pauses published ranges and rolls back invalid pairs", async () => {
    const draft = (await db.transact((state) =>
      command(state, f.john, "items.create", {
        title: "TV range integration",
        listId: f.list.id,
        publicationState: "draft",
        priceCents: 40000,
        priceMaxCents: 70000,
        url: "https://shop.example/tv-range",
      }),
    )) as import("../src/shared/model").GiftView;
    const persisted = (await db.readState()).items.find(
      (item) => item.id === draft.id,
    )!;
    expect(persisted).toMatchObject({
      priceCents: 40000,
      priceMaxCents: 70000,
      pricing: { paused: true },
    });
    await expect(
      db.transact((state) =>
        command(state, f.john, "items.update", {
          ...persisted,
          title: "Must not persist",
          priceMaxCents: 30000,
        }),
      ),
    ).rejects.toThrow(/higher/);
    expect(
      (await db.readState()).items.find((item) => item.id === draft.id),
    ).toMatchObject({
      title: "TV range integration",
      priceCents: 40000,
      priceMaxCents: 70000,
    });
    await db.transact((state) =>
      command(state, f.john, "items.publish", { ...persisted }),
    );
    const { itemPage } = await import("../src/server/collections");
    const page = await itemPage(await db.readCollectionState(), f.reader, {
      scope: "list",
      id: f.list.id,
      search: "TV range integration",
    });
    expect(page.rows[0]).toMatchObject({
      priceCents: 40000,
      priceMaxCents: 70000,
      publicationState: "published",
      pricing: { paused: true },
    });
    await db.migrate();
    expect(
      (await db.readState()).items.find((item) => item.id === draft.id)
        ?.priceMaxCents,
    ).toBe(70000);
  });
  it("round-trips typed nested product and offer draft fields", async () => {
    const fields = {
      title: "Imported set",
      kind: "group",
      shoppingOffers: [
        {
          id: "primary",
          url: "https://shop.example/a",
          label: "Shop A",
          priceCents: 1000,
        },
      ],
      products: [
        {
          title: "Forks",
          price: "400-",
          priceCents: null,
          priceMaxCents: null,
          shoppingOffers: [
            {
              id: "forks",
              url: "https://shop.example/forks",
              label: "Shop B",
              priceCents: 3200,
            },
          ],
        },
      ],
    };
    const job = (await db.transact((s) =>
      command(s, f.john, "imports.create", {
        url: "https://shop.example/a",
        draft: {
          listId: f.list.id,
          fields,
          touched: ["shoppingOffers", "products"],
        },
      }),
    )) as import("../src/shared/model").ImportJob;
    expect(
      (await db.readState()).imports.find((i) => i.id === job.id)?.draft
        ?.fields,
    ).toEqual(fields);
    await db.transact((s) =>
      command(s, f.john, "imports.update", {
        id: job.id,
        revision: job.draft!.revision,
        fields: { products: [{ title: "Spoons" }] },
        touched: ["products"],
      }),
    );
    expect(
      (await db.readState()).imports.find((i) => i.id === job.id)?.draft?.fields
        .products,
    ).toEqual([{ title: "Spoons" }]);
    await expect(
      db.transact((s) =>
        command(s, f.john, "imports.update", {
          id: job.id,
          fields: { shoppingOffers: [{ title: "Not an offer" }] },
        }),
      ),
    ).rejects.toThrow(/Invalid shoppingOffers/);
  });
});
