import { describe, it, expect } from "vitest";
import { fixture, draw } from "./privacy-fixture";
import { command, giftView, giftSummary } from "../src/server/domain";
import { mentionCandidates } from "../src/server/activity";
describe("explicit exchange privacy", () => {
  it("requires deliberate classification and excludes exchange gifts from summaries", () => {
    const f = fixture("2020-01-01");
    const { exchange, giver, giverId, observer } = draw(f);
    expect(() =>
      command(f.state, giver, "reservations.create", {
        itemId: f.item.id,
        quantity: 1,
      }),
    ).toThrow("Choose an exchange");
    const context = {
      exchangeId: exchange.id,
      giverId,
      exchangeRecipientId: f.state.people[0].id,
    };
    const created = command(f.state, giver, "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
      ...context,
    }) as { id: string };
    const r = f.state.reservations.find((r) => r.id === created.id)!;
    command(f.state, giver, "reservations.update", {
      id: r.id,
      revision: r.revision,
      quantity: 1,
      purchased: 1,
    });
    const view = giftView(f.state, observer, f.item).reservations![0];
    expect(view.buyerName).toBe("Exchange giver");
    expect(view).not.toHaveProperty("purchased");
    expect(view).not.toHaveProperty("reservedAt");
    expect(giftSummary(f.state, f.actors[0], f.lists[0].id).gifts).toEqual([]);
    command(f.state, giver, "reservations.create", {
      itemId: f.item.id,
      quantity: 1,
      ordinary: true,
    });
    expect(giftView(f.state, observer, f.item).reservations![1].buyerName).toBe(
      giver.name,
    );
  });
  it("persists note audience before reserving and after release, and validates mentions", () => {
    const f = fixture();
    const { exchange, giver, giverId, observer } = draw(f);
    const context = {
      exchangeId: exchange.id,
      giverId,
      exchangeRecipientId: f.state.people[0].id,
    };
    expect(() =>
      command(f.state, giver, "comments.create", {
        itemId: f.item.id,
        body: "No choice",
      }),
    ).toThrow();
    for (const body of ["Before", "After"]) {
      command(f.state, giver, "comments.create", {
        itemId: f.item.id,
        body,
        ...context,
      });
      if (body === "Before") {
        const created = command(f.state, giver, "reservations.create", {
          itemId: f.item.id,
          quantity: 1,
          ...context,
        }) as { id: string };
        const r = f.state.reservations.find((r) => r.id === created.id)!;
        command(f.state, giver, "reservations.update", {
          id: r.id,
          revision: r.revision,
          quantity: 0,
          purchased: 0,
        });
      }
    }
    expect(giftView(f.state, observer, f.item).comments).toEqual([]);
    expect(giftView(f.state, giver, f.item).comments).toHaveLength(2);
    expect(
      mentionCandidates(f.state, giver, f.item.id, "", undefined, context),
    ).toEqual([]);
    expect(() =>
      command(f.state, giver, "comments.create", {
        itemId: f.item.id,
        body: `@${observer.name}`,
        mentions: [
          { userId: observer.id, start: 0, end: observer.name.length + 1 },
        ],
        ...context,
      }),
    ).toThrow();
    exchange.archived = true;
    expect(giftView(f.state, observer, f.item).comments).toEqual([]);
    expect(() =>
      command(f.state, giver, "comments.create", {
        itemId: f.item.id,
        body: "Stale context",
        ...context,
      }),
    ).toThrow();
  });
  it("tags direct-item purchases and rejects forged assignments", () => {
    const f = fixture();
    const { exchange, giver, giverId, observer } = draw(f);
    command(f.state, giver, "spending.settings", {
      enabled: true,
      summaries: true,
    });
    const payload = {
      itemId: f.item.id,
      itemRevision: f.item.revision,
      title: f.item.title,
      recipientIds: f.item.recipientIds,
      quantity: 1,
      amountCents: 5000,
      date: "2026-11-05",
    };
    expect(() =>
      command(f.state, giver, "spending.purchase", payload),
    ).toThrow();
    expect(() =>
      command(f.state, observer, "spending.purchase", {
        ...payload,
        exchangeId: exchange.id,
        giverId,
      }),
    ).toThrow();
    command(f.state, giver, "spending.purchase", {
      ...payload,
      exchangeId: exchange.id,
      giverId,
      exchangeRecipientId: f.state.people[0].id,
    });
    expect(f.state.reservations[0].exchangeId).toBe(exchange.id);
    expect(
      giftView(f.state, observer, f.item).reservations![0],
    ).not.toHaveProperty("purchased");
  });
});

it("preserves ambiguous legacy content until its owner confirms an audience", async () => {
  const { privacyPreflight } = await import("../src/server/privacy-review");
  const { stamp } = await import("../src/server/domain");
  const f = fixture("2020-01-01");
  const { giver, observer } = draw(f);
  const result = command(f.state, giver, "reservations.create", {
    itemId: f.item.id,
    quantity: 1,
    ordinary: true,
  }) as { id: string };
  const r = f.state.reservations.find((r) => r.id === result.id)!;
  delete r.ordinary;
  const note = {
    ...stamp(),
    itemId: f.item.id,
    authorId: giver.id,
    body: "Preserve this older note",
    mentions: [],
  };
  f.state.comments.push(note);
  expect(privacyPreflight(f.state)).toMatchObject({
    reservationsNeedingOwnerReview: 1,
    notesNeedingAuthorReview: 1,
  });
  expect(giftView(f.state, observer, f.item).comments).toEqual([]);
  expect(giftView(f.state, observer, f.item).reservations![0].buyerName).toBe(
    "Exchange giver",
  );
  expect(() =>
    command(f.state, observer, "privacy.review", {
      id: note.id,
      revision: note.revision,
      kind: "note",
      ordinary: true,
    }),
  ).toThrow();
  command(f.state, giver, "privacy.review", {
    id: note.id,
    revision: note.revision,
    kind: "note",
    authorOnly: true,
  });
  command(f.state, giver, "privacy.review", {
    id: r.id,
    revision: r.revision,
    kind: "reservation",
    ordinary: true,
  });
  expect(f.state.comments[0].body).toBe(note.body);
  expect(giftView(f.state, observer, f.item).comments).toEqual([]);
  expect(giftView(f.state, observer, f.item).reservations![0].buyerName).toBe(
    giver.name,
  );
  expect(privacyPreflight(f.state)).toMatchObject({
    reservationsNeedingOwnerReview: 0,
    notesNeedingAuthorReview: 0,
  });
  expect(f.state.reservations[0].quantity).toBe(1);
});
