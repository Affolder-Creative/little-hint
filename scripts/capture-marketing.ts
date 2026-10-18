/** Real app UI, isolated demonstration records. Never connects to a database. */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import sharp from "sharp";
import { emptyState, type Actor, type List } from "../src/shared/model";
import { stamp, command, world } from "../src/server/domain";

const out = "marketing/assets/screens";
await mkdir(out, { recursive: true });
const state = emptyState();
const actors: Actor[] = [
  "Alex Morgan",
  "Sam Morgan",
  "Jamie Chen",
  "Riley Morgan",
].map((name) => ({
  id: stamp().id,
  name,
  email: `${name.split(" ")[0].toLowerCase()}@example.test`,
}));
const people = actors.map((a) => ({
  ...stamp(),
  name: a.name,
  userId: a.id,
  guardians: [],
  household: "",
}));
state.people.push(...people);
const group = {
  ...stamp(),
  name: "Our favorite people",
  ownerId: actors[0].id,
  memberIds: actors.map((a) => a.id),
};
state.groups.push(group);
const lists = actors.map(
  (a, i) =>
    command(state, a, "lists.create", {
      name: [
        "A few little hints",
        "Slow Sunday mornings",
        "Out and about",
        "Everyday favorites",
      ][i],
      description: "A few ideas for the next little celebration.",
      ownerIds: [people[i].id],
      groupIds: [group.id],
      mode: "surprise",
    }) as List,
);
const gifts = [
  {
    person: 1,
    title: "A ceramic pour-over set",
    description: "For slow mornings and a really good cup of coffee.",
    priceCents: 4800,
    tags: ["Coffee", "Kitchen"],
  },
  {
    person: 2,
    title: "A weekend daypack",
    description: "A little room for the next adventure.",
    priceCents: 8500,
    tags: ["Outdoors", "Travel"],
  },
  {
    person: 3,
    title: "A linen-bound journal",
    description: "For ideas, plans, and things worth remembering.",
    priceCents: 2400,
    tags: ["Creative", "Journaling"],
  },
  {
    person: 1,
    title: "A record for Sunday",
    description: "Something lovely to listen to over breakfast.",
    priceCents: 3200,
    tags: ["Music", "Vinyl"],
  },
  {
    person: 2,
    title: "A book for the trail",
    description: "New places to explore together.",
    priceCents: 1800,
    tags: ["Books", "Outdoors"],
  },
  {
    person: 3,
    title: "A little coffee ritual",
    description: "A favorite blend to start the day.",
    priceCents: 1600,
    tags: ["Coffee"],
  },
];
const items = gifts.map(
  ({ person, ...gift }) =>
    command(state, actors[person], "items.create", {
      ...gift,
      listId: lists[person].id,
      quantity: 1,
    }) as { id: string },
);
const reservation = command(state, actors[0], "reservations.create", {
  itemId: items[0].id,
  quantity: 1,
}) as { id: string };
const reserved = state.reservations.find((r) => r.id === reservation.id)!;
command(state, actors[0], "reservations.update", {
  id: reserved.id,
  revision: reserved.revision,
  quantity: 1,
  purchased: 1,
  poolTargetCents: 4800,
});
command(state, actors[2], "contributions.create", {
  reservationId: reserved.id,
  amountCents: 2400,
});
command(state, actors[0], "reservations.create", {
  itemId: items[1].id,
  quantity: 1,
});
const exchange = command(state, actors[1], "exchanges.create", {
  name: "A little holiday exchange",
  groupId: group.id,
  participantIds: people.map((p) => p.id),
  count: 1,
  excludeHousehold: false,
  exclusions: [],
}) as { id: string };
const drawn = state.exchanges.find((e) => e.id === exchange.id)!;
command(state, actors[1], "exchanges.draw", {
  id: drawn.id,
  revision: drawn.revision,
});
// A fixed, valid cycle keeps captures reproducible. Only the viewer's assignment is projected.
drawn.assignments = people.map((p, i) => [
  p.id,
  people[(i + 1) % people.length].id,
]);
const demo = world(state, actors[0]);
assert.equal(demo.exchanges[0].myAssignments.length, 1);
assert.ok(
  !(
    "reservations" in
    world(state, actors[1]).items.find((i) => i.id === items[0].id)!
  ),
);

const server = await createServer({
  server: { host: "127.0.0.1", port: 0, strictPort: false },
  logLevel: "error",
});
await server.listen();
const origin = server.resolvedUrls!.local[0];
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    localStorage.setItem("little-hint:theme", "light");
    localStorage.setItem("little-hint:install", "never");
  });
  // All API reads are local projections; unknown requests fail closed.
  await context.route("**/api/**", (route) =>
    route.request().url().endsWith("/api/v1/world")
      ? route.fulfill({ json: demo })
      : route.fulfill({
          status: 404,
          json: { error: "Not available in screenshot capture" },
        }),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function visit(path: string) {
    await page.goto(new URL(path, origin).href);
    await page.locator("main h1").waitFor();
    await page.evaluate(() => document.fonts.ready);
  }
  async function save(name: string, selector?: string) {
    const buffer = selector
      ? await page.locator(selector).screenshot()
      : await page.screenshot();
    await sharp(buffer)
      .resize({
        width: selector ? 1500 : name.includes("mobile") ? 780 : 1920,
        withoutEnlargement: true,
      })
      .webp({ quality: 88 })
      .toFile(`${out}/${name}.webp`);
  }
  await visit("/");
  await page.locator(".gift-card").first().waitFor();
  await save("home-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await visit("/");
  await save("home-mobile");
  await page.setViewportSize({ width: 720, height: 820 });
  await visit("/buying");
  await save("buying", ".buying-list");
  await visit("/exchanges");
  await save("exchange", ".exchange-panel");
  await page.setViewportSize({ width: 390, height: 844 });
  await visit("/buying");
  await save("buying-mobile", ".buying-list");
  await save("buying-detail", ".buying-row:first-child");
  await visit("/exchanges");
  await save("exchange-mobile", ".exchange-panel");
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/capture.json`,
    JSON.stringify(
      {
        source: "Unmodified React app rendered by Playwright",
        data: "Isolated example.test fixtures using domain commands and world projection; no database",
        command: "npm run marketing:capture",
        screenshots: [
          "home-desktop.webp",
          "home-mobile.webp",
          "buying.webp",
          "exchange.webp",
          "buying-mobile.webp",
          "buying-detail.webp",
          "exchange-mobile.webp",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Captured seven real app views in ${out}`);
} finally {
  await browser.close();
  await server.close();
}
