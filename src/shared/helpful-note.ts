import { z } from "zod";
export interface NoteNode {
  type: string;
  text?: string;
  attrs?: { href?: string; start?: number };
  marks?: Array<{ type: string; attrs?: { href?: string } }>;
  content?: NoteNode[];
}
export interface NoteDocument extends NoteNode {
  type: "doc";
}
export function safeNoteUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function noteText(node: NoteNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? [])
    .map(noteText)
    .join(
      ["doc", "bulletList", "orderedList", "listItem"].includes(node.type)
        ? "\n"
        : "",
    );
}
export function plainNote(text: string): NoteDocument {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}
function validNote(value: unknown): value is NoteDocument {
  let count = 0;
  function check(n: any, depth: number): boolean {
    if (
      !n ||
      typeof n !== "object" ||
      Array.isArray(n) ||
      ++count > 10000 ||
      depth > 12
    )
      return false;
    if (
      Object.keys(n).some(
        (k) => !["type", "content", "text", "marks", "attrs"].includes(k),
      )
    )
      return false;
    if (n.type === "text") {
      if (typeof n.text !== "string" || !n.text || n.content || n.attrs)
        return false;
      if (
        n.marks &&
        (!Array.isArray(n.marks) ||
          n.marks.length > 4 ||
          !n.marks.every(
            (m: any) =>
              m &&
              Object.keys(m).every((k) => ["type", "attrs"].includes(k)) &&
              ["bold", "italic", "strike", "link"].includes(m.type) &&
              (m.type === "link"
                ? typeof m.attrs?.href === "string" &&
                  m.attrs.href.length <= 2048 &&
                  safeNoteUrl(m.attrs.href) &&
                  Object.keys(m.attrs).every((k) => k === "href")
                : !m.attrs),
          ))
      )
        return false;
      return true;
    }
    if (n.text !== undefined || n.marks) return false;
    if (n.type === "hardBreak") return !n.content && !n.attrs;
    const children: Record<string, string[]> = {
      doc: ["paragraph", "bulletList", "orderedList"],
      paragraph: ["text", "hardBreak"],
      bulletList: ["listItem"],
      orderedList: ["listItem"],
      listItem: ["paragraph", "bulletList", "orderedList"],
    };
    if (!Object.hasOwn(children, n.type) || (depth > 0 && n.type === "doc"))
      return false;
    if (
      n.attrs &&
      (n.type !== "orderedList" ||
        Object.keys(n.attrs).some((k) => k !== "start") ||
        !Number.isSafeInteger(n.attrs.start) ||
        n.attrs.start < 1)
    )
      return false;
    return (
      Array.isArray(n.content) &&
      (n.type === "paragraph" || n.content.length > 0) &&
      (n.type !== "listItem" || n.content[0]?.type === "paragraph") &&
      n.content.every(
        (c: any) => children[n.type].includes(c?.type) && check(c, depth + 1),
      )
    );
  }
  return (
    (value as any)?.type === "doc" &&
    check(value, 0) &&
    noteText(value as NoteDocument).length <= 5000
  );
}
export const noteDocumentSchema = z.custom<NoteDocument>(
  validNote,
  "Use a valid note of at most 5,000 characters.",
);
export function normalizeNote<
  T extends { description: string; descriptionRich?: NoteDocument | null },
>(value: T, previous?: T) {
  if (value.descriptionRich)
    value.description = noteText(value.descriptionRich);
  else if (value.descriptionRich === undefined && previous?.descriptionRich)
    value.descriptionRich =
      value.description === previous.description
        ? previous.descriptionRich
        : null;
  return value;
}
