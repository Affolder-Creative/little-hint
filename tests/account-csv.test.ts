import { describe, it, expect } from "vitest";
import { accountCsv, csv } from "../src/server/account-csv";
import { stagingFixtures } from "../src/server/staging-fixtures";
import { stamp } from "../src/server/domain";

describe("spreadsheet exports", () => {
  it("writes Excel-compatible Unicode, quotes commas/newlines, and neutralizes formula text", () => {
    expect(
      csv([
        [
          "Café, tea",
          'A "quote"\nand a line',
          "=SUM(A1)",
          "  +cmd",
          "\tvalue",
          "@SUM(A1)",
          "-formula",
          -12.5,
          null,
          "plain",
        ],
      ]),
    ).toBe(
      '\uFEFF"Café, tea","A ""quote""\nand a line","\'=SUM(A1)","\'  +cmd","\'\tvalue","\'@SUM(A1)","\'-formula","-12.5","","plain"\r\n',
    );
  });
  it("exports readable wishes with decimal amounts and explicit status without surprise gifts", () => {
    const { state: s, actors } = stagingFixtures();
    const a = actors[0];
    const own = s.items.find((i) => i.creatorId === a.id)!;
    own.title = '=HYPERLINK("https://example.test")';
    own.priceCents = 12345;
    own.deletedAt = new Date().toISOString();
    s.items.push({
      ...own,
      ...stamp(),
      listId: undefined,
      creatorId: actors[1].id,
      title: "Secret surprise",
      visibility: "hidden",
    });
    const output = accountCsv(s, a, "wishes");
    expect(output.filename).toBe("little-hint-wishes.csv");
    expect(output.content).toContain('"123.45"');
    expect(output.content).toContain('"Deleted"');
    expect(output.content).toContain("\"'=HYPERLINK");
    expect(output.content).not.toContain("Secret surprise");
    expect(output.content).toContain(a.name);
  });
  it("restricts buying and spending rows to the caller and leaves unknown amounts blank", () => {
    const { state: s, actors } = stagingFixtures();
    const a = actors[0];
    const item = s.items.find((i) => i.creatorId === a.id)!;
    s.reservations.push({
      ...stamp(),
      itemId: item.id,
      buyerId: actors[1].id,
      quantity: 1,
      purchased: 1,
      former: false,
      titleSnapshot: "Secret purchase",
    });
    s.spendingRecords.push({
      ...stamp(),
      ownerId: a.id,
      title: "Unpriced plan",
      recipientIds: [],
      recipientNames: [],
      quantity: 1,
      amountCents: null,
      planningYear: 2026,
      date: null,
      kind: "plan",
      sharing: "private",
      splits: [],
      history: [],
    });
    s.spendingRecords.push({
      ...s.spendingRecords.at(-1)!,
      ...stamp(),
      ownerId: actors[1].id,
      title: "Secret spending",
    });
    expect(accountCsv(s, a, "buying").content).not.toContain("Secret purchase");
    const spending = accountCsv(s, a, "spending").content;
    expect(spending).toContain('"Unpriced plan","","","","","","1"');
    expect(spending).not.toContain("Secret spending");
  });
  it("exports headers for empty tables", () => {
    const { state, actors } = stagingFixtures();
    state.items = [];
    state.reservations = [];
    state.contributions = [];
    state.spendingRecords = [];
    for (const table of ["wishes", "buying", "spending"] as const) {
      const { content } = accountCsv(state, actors[0], table);
      expect(content.split("\r\n")).toHaveLength(2);
      expect(content).toContain('"Type"');
    }
  });
});
