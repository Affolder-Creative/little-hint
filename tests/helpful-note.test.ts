import { describe, it, expect } from "vitest";
import {
  noteDocumentSchema,
  noteText,
  plainNote,
  normalizeNote,
  safeNoteUrl,
  type NoteDocument,
} from "../src/shared/helpful-note";
import { command } from "../src/server/domain";
import { wishlistFixture } from "./wishlist-fixture";
const rich: NoteDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Medium",
          marks: [
            { type: "bold" },
            { type: "italic" },
            { type: "strike" },
            { type: "link", attrs: { href: "https://example.com/size" } },
          ],
        },
      ],
    },
  ],
};
describe("helpful notes", () => {
  it("keeps legacy text literal and preserves blank lines", () => {
    const text = "**literal**\n\n<hello> & friends";
    expect(noteText(plainNote(text))).toBe(text);
    expect(noteDocumentSchema.parse(plainNote(text))).toEqual(plainNote(text));
  });
  it("accepts supported formatting and derives plain text", () => {
    expect(noteDocumentSchema.parse(rich)).toEqual(rich);
    expect(
      normalizeNote({ description: "wrong", descriptionRich: rich })
        .description,
    ).toBe("Medium");
  });
  it("rejects unsafe URLs, unsupported content and oversized notes", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,test",
      "/relative",
      "https://user:pass@example.com",
    ])
      expect(safeNoteUrl(href)).toBe(false);
    expect(
      noteDocumentSchema.safeParse(plainNote("x".repeat(5001))).success,
    ).toBe(false);
    expect(
      noteDocumentSchema.safeParse({
        type: "doc",
        content: [{ type: "image", attrs: { src: "x" } }],
      }).success,
    ).toBe(false);
    const bad = structuredClone(rich);
    bad.content![0].content![0].marks![3].attrs!.href = "javascript:alert(1)";
    expect(noteDocumentSchema.safeParse(bad).success).toBe(false);
  });
  it("persists formatting and supports older clients", () => {
    const f = wishlistFixture();
    const item: any = command(f.s, f.john, "items.create", {
      title: "Sweater",
      listId: f.list.id,
      description: "wrong",
      descriptionRich: rich,
    });
    expect(item.description).toBe("Medium");
    expect(item.descriptionRich).toEqual(rich);
    const { descriptionRich, ...legacy } = item;
    const unchanged: any = command(f.s, f.john, "items.update", {
      ...legacy,
      title: "New name",
    });
    expect(unchanged.descriptionRich).toEqual(rich);
    const replaced: any = command(f.s, f.john, "items.update", {
      ...unchanged,
      descriptionRich: undefined,
      description: "Large",
    });
    expect(replaced.descriptionRich).toBeNull();
    expect(replaced.description).toBe("Large");
  });
  it("retains formatting when publishing drafts", () => {
    const f = wishlistFixture();
    const draft: any = command(f.s, f.john, "items.create", {
      title: "Draft",
      listId: f.list.id,
      descriptionRich: rich,
      publicationState: "draft",
    });
    const result: any = command(f.s, f.john, "items.publish", draft);
    expect(result.descriptionRich).toEqual(rich);
    expect(result.description).toBe("Medium");
  });
});

it("preserves formatted import drafts across updates", () => {
  const f = wishlistFixture();
  const job: any = command(f.s, f.john, "imports.create", {
    url: "https://example.com/product",
    draft: {
      listId: f.list.id,
      fields: { title: "Draft", description: "wrong" },
      descriptionRich: rich,
      touched: ["description"],
    },
  });
  expect(job.draft.fields.description).toBe("Medium");
  const updated: any = command(f.s, f.john, "imports.update", {
    id: job.id,
    revision: job.draft.revision,
    fields: { ...job.draft.fields, title: "New title" },
  });
  expect(updated.draft.descriptionRich).toEqual(rich);
  const cleared: any = command(f.s, f.john, "imports.update", {
    id: job.id,
    revision: updated.draft.revision,
    fields: { ...updated.draft.fields, description: "" },
    descriptionRich: null,
  });
  expect(cleared.draft.descriptionRich).toBeNull();
  expect(cleared.draft.fields.description).toBe("");
});

it("rejects inherited node names without throwing", () => {
  for (const type of ["constructor", "toString", "__proto__"])
    expect(
      noteDocumentSchema.safeParse({
        type: "doc",
        content: [{ type, content: [] }],
      }).success,
    ).toBe(false);
});
