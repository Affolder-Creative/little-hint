import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture, connect } from "./privacy-fixture";
import { command, giftView, idempotent, stamp } from "../src/server/domain";
import { accountExport } from "../src/server/account-export";
import { accountCsv } from "../src/server/account-csv";
import {
  acceptHandoff,
  closeAccountData,
  requestHandoff,
} from "../src/server/account-closure-domain";
import { spendingView } from "../src/server/spending";
import { repeatEventDefaults } from "../src/shared/group-events";
import type { GroupEvent, ImportJob, Item, List } from "../src/shared/model";

afterEach(() => vi.unstubAllEnvs());

describe("critical workflow transitions", () => {
  it.each([false, true])(
    "keeps buyer details out of a new guardian's exports after handoff, closing prior guardian: %s",
    (closePrior) => {
      const f = fixture();
      const [prior, buyer, nextGuardian, organizer] = f.actors;
      f.group.ownerId = organizer.id;
      const child = {
        ...stamp(),
        name: "Managed recipient",
        guardians: [prior.id],
      };
      f.state.people.push(child);
      const list = command(f.state, prior, "lists.create", {
        name: "Child wishes",
        ownerIds: [child.id],
        groupIds: [f.group.id],
        mode: "surprise",
      }) as List;
      const gift = command(f.state, prior, "items.create", {
        listId: list.id,
        title: "Child's wish",
        quantity: 1,
        priceCents: 6000,
      }) as Item;
      const item = f.state.items.find((i) => i.id === gift.id)!;
      connect(f, 1, 2, child.id);
      const reservation = command(f.state, buyer, "reservations.create", {
        itemId: item.id,
        quantity: 1,
      }) as { id: string };
      const record = f.state.spendingRecords.find(
        (r) => r.reservationId === reservation.id,
      )!;
      command(f.state, buyer, "spending.purchase", {
        reservationId: reservation.id,
        planRevision: record.revision,
        title: "PRIVATE BUYER RECEIPT",
        recipientIds: [child.id],
        quantity: 1,
        amountCents: 5432,
        date: "2026-11-05",
      });
      expect(
        spendingView(f.state, nextGuardian).records.length,
      ).toBeGreaterThan(0);
      requestHandoff(f.state, prior, "guardian", child.id, nextGuardian.id);
      acceptHandoff(f.state, nextGuardian, f.state.links.at(-1)!.id);
      if (closePrior) closeAccountData(f.state, prior);
      expect(child.guardians).toEqual([nextGuardian.id]);
      expect(
        giftView(f.state, nextGuardian, item).reservations,
      ).toBeUndefined();
      expect(spendingView(f.state, nextGuardian).records).toEqual([]);
      const exported = accountExport(f.state, nextGuardian);
      expect(exported.profiles).toContainEqual(
        expect.objectContaining({ id: child.id }),
      );
      expect(exported.items).toContainEqual(
        expect.objectContaining({ id: item.id, title: "Child's wish" }),
      );
      expect(exported.reservations).toEqual([]);
      expect(exported.spending.records).toEqual([]);
      for (const output of [
        JSON.stringify(exported),
        ...(["wishes", "buying", "spending"] as const).map(
          (table) => accountCsv(f.state, nextGuardian, table).content,
        ),
      ]) {
        expect(output).not.toContain("PRIVATE BUYER RECEIPT");
        expect(output).not.toContain("54.32");
        expect(output).not.toContain(reservation.id);
      }
      expect(accountExport(f.state, buyer).spending.records).toContainEqual(
        expect.objectContaining({ kind: "purchase", amountCents: 5432 }),
      );
      expect(accountCsv(f.state, buyer, "spending").content).toContain("54.32");
    },
  );

  it("recovers a failed capture into a repeated event without copying purchases or saving twice", () => {
    vi.stubEnv("SCRAPING_PROVIDER", "auto");
    vi.stubEnv("AI_ENABLED", "false");
    const f = fixture();
    const actor = f.actors[0];
    const eventId = (
      command(f.state, actor, "group-events.create", {
        name: "Annual celebration",
        groupId: f.group.id,
        mode: "surprise",
        participantIds: [f.state.people[0].id],
      }) as { id: string }
    ).id;
    const event = f.state.groupEvents.find((e) => e.id === eventId)!;
    const oldList = f.state.lists.find((l) => l.groupEventId === event.id)!;
    const oldGift = command(f.state, actor, "items.create", {
      listId: oldList.id,
      title: "Previous gift",
      quantity: 1,
    }) as Item;
    const reservation = command(f.state, f.actors[1], "reservations.create", {
      itemId: oldGift.id,
      quantity: 1,
    }) as { id: string };
    command(f.state, f.actors[1], "reservations.update", {
      ...f.state.reservations.find((r) => r.id === reservation.id)!,
      purchased: 1,
    });
    const link = "https://example.test/new-gift";
    const imported = command(f.state, actor, "imports.create", {
      url: link,
      draft: {
        listId: oldList.id,
        fields: { title: "My edited capture" },
        touched: ["title"],
      },
    }) as ImportJob;
    const job = f.state.imports.find((j) => j.id === imported.id)!;
    job.status = "failed";
    job.error = "Shop unavailable";
    vi.stubEnv("SCRAPING_PROVIDER", "none");
    expect(() =>
      command(f.state, actor, "imports.retry", { id: job.id }),
    ).toThrow();
    command(f.state, actor, "group-events.update", {
      ...event,
      archived: true,
    });
    const input = {
      listId: oldList.id,
      title: "My edited capture",
      url: link,
      importId: job.id,
      importDraftRevision: job.draft!.revision,
    };
    const before = structuredClone(f.state);
    expect(() => command(f.state, actor, "items.create", input)).toThrow(
      "List not found",
    );
    expect(f.state).toEqual(before);
    const next = command(f.state, actor, "group-events.repeat", {
      ...repeatEventDefaults(event, f.state.people, f.group),
      sourceId: event.id,
      sourceRevision: event.revision,
      name: "Next celebration",
    }) as GroupEvent;
    const list = f.state.lists.find((l) => l.groupEventId === next.id)!;
    expect(f.state.items.filter((i) => i.listId === list.id)).toEqual([]);
    expect(f.state.reservations).toEqual(before.reservations);
    command(f.state, actor, "imports.update", {
      id: job.id,
      revision: job.draft!.revision,
      listId: list.id,
    });
    const key = stamp().id;
    const stale = { ...input, listId: list.id };
    const pending = structuredClone(f.state);
    expect(() =>
      idempotent(f.state, actor, key, "items.create", stale),
    ).toThrow(/draft changed/);
    expect(f.state).toEqual(pending);
    const current = { ...stale, importDraftRevision: job.draft!.revision };
    const saved = idempotent(
      f.state,
      actor,
      key,
      "items.create",
      current,
    ) as Item;
    expect(
      idempotent(f.state, actor, key, "items.create", current),
    ).toMatchObject({ id: saved.id, replayed: true });
    expect(f.state.items.filter((i) => i.listId === list.id)).toHaveLength(1);
    expect(job.draft!.state).toBe("published");
    expect(accountExport(f.state, actor).drafts).toEqual([]);
    expect(accountCsv(f.state, actor, "wishes").content).toContain(
      "My edited capture",
    );
    expect(f.state.reservations).toEqual(before.reservations);
  });
});
