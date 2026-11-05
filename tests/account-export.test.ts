import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { stamp } from "../src/server/domain";
import {
  accountExport,
  registerAccountExport,
} from "../src/server/account-export";
vi.mock("../src/server/db", () => ({ readState: vi.fn() }));
import { readState } from "../src/server/db";

describe("personal data export", () => {
  it("includes owned data while excluding other buyers and surprise ideas", () => {
    const { state: s, actors } = stagingFixtures();
    const a = actors[0];
    const own = s.people.find((p) => p.userId === a.id)!;
    const list = s.lists.find((l) => l.ownerIds.includes(own.id))!;
    const item = s.items.find((i) => i.listId === list.id)!;
    s.items.push({
      ...item,
      ...stamp(),
      title: "SECRET SURPRISE",
      listId: undefined,
      creatorId: actors[1].id,
      recipientIds: [own.id],
      visibility: "hidden",
    });
    s.comments.push({
      ...stamp(),
      itemId: item.id,
      authorId: actors[1].id,
      body: "SECRET DISCUSSION",
    });
    s.reservations.push({
      ...stamp(),
      itemId: item.id,
      buyerId: actors[1].id,
      quantity: 1,
      purchased: 1,
      former: false,
      titleSnapshot: "SECRET PURCHASE",
    });
    s.imports.push({
      ...stamp(),
      userId: a.id,
      url: "https://example.test/draft",
      status: "done",
      providerState: { secret: "PROVIDER SECRET" },
      draft: {
        state: "active",
        revision: 1,
        fields: { title: "My draft" },
        touched: [],
      },
    } as any);
    s.pushDevices.push({
      ...stamp(),
      userId: a.id,
      sessionId: "SESSION SECRET",
      endpoint: "ENDPOINT SECRET",
      keys: { auth: "AUTH SECRET", p256dh: "KEY SECRET" },
      label: "Phone",
    });
    const output = accountExport(s, a);
    expect(output.account).toEqual(a);
    expect(output.lists.some((l) => l.id === list.id)).toBe(true);
    expect(output.items.some((i) => i.id === item.id)).toBe(true);
    expect(output.drafts.at(-1)?.draft?.fields.title).toBe("My draft");
    for (const secret of [
      "SECRET SURPRISE",
      "SECRET DISCUSSION",
      "SECRET PURCHASE",
      "PROVIDER SECRET",
      "SESSION SECRET",
      "ENDPOINT SECRET",
      "AUTH SECRET",
      "KEY SECRET",
    ])
      expect(JSON.stringify(output)).not.toContain(secret);
    expect(output.spending.records.every((r) => r.ownerId === a.id)).toBe(true);
    expect(output.comments.every((c) => c.authorId === a.id)).toBe(true);
    expect(output.reservations.every((r) => r.buyerId === a.id)).toBe(true);
  });
  it("includes managed profiles and archived/deleted own content without mutating state", () => {
    const { state: s, actors } = stagingFixtures();
    const a = actors[0];
    const managed = { ...stamp(), name: "Managed child", guardians: [a.id] };
    s.people.push(managed);
    const item = s.items.find((i) => i.creatorId === a.id)!;
    item.deletedAt = new Date().toISOString();
    const before = JSON.stringify(s);
    const output = accountExport(s, a);
    expect(output.profiles).toContainEqual(
      expect.objectContaining({ id: managed.id, managed: true }),
    );
    expect(output.items).toContainEqual(
      expect.objectContaining({ id: item.id, deletedAt: item.deletedAt }),
    );
    expect(JSON.stringify(s)).toBe(before);
  });
  it("authenticates the caller and sends a non-cacheable attachment", async () => {
    const { state, actors } = stagingFixtures();
    vi.mocked(readState).mockResolvedValue(state);
    const app = Fastify();
    registerAccountExport(app, async (req) => {
      if (!req.headers.authorization)
        throw Object.assign(new Error("Sign in"), { statusCode: 401 });
      return actors[0];
    });
    try {
      expect(
        (await app.inject({ method: "POST", url: "/api/v1/account/export" }))
          .statusCode,
      ).toBe(401);
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/account/export",
        headers: { authorization: "test" },
        payload: { userId: actors[1].id },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["content-disposition"]).toContain("attachment;");
      expect(response.json().account.id).toBe(actors[0].id);
    } finally {
      await app.close();
    }
  });
});
