import type { ReactNode } from "react";
import {
  safeNoteUrl,
  type NoteDocument,
  type NoteNode,
} from "../shared/helpful-note";
import "./helpful-note.css";
export function HelpfulNote({
  text,
  rich,
}: {
  text: string;
  rich?: NoteDocument | null;
}) {
  function render(n: NoteNode, key: number): ReactNode {
    if (n.type === "text") {
      let result: ReactNode = n.text;
      for (const m of n.marks ?? []) {
        if (m.type === "bold") result = <strong>{result}</strong>;
        if (m.type === "italic") result = <em>{result}</em>;
        if (m.type === "strike") result = <s>{result}</s>;
        if (m.type === "link" && safeNoteUrl(m.attrs?.href ?? ""))
          result = (
            <a href={m.attrs!.href} target="_blank" rel="noopener noreferrer">
              {result}
            </a>
          );
      }
      return <span key={key}>{result}</span>;
    }
    const children = n.content?.map(render);
    switch (n.type) {
      case "hardBreak":
        return <br key={key} />;
      case "paragraph":
        return <p key={key}>{children?.length ? children : <br />}</p>;
      case "bulletList":
        return <ul key={key}>{children}</ul>;
      case "orderedList":
        return (
          <ol key={key} start={n.attrs?.start}>
            {children}
          </ol>
        );
      case "listItem":
        return <li key={key}>{children}</li>;
      default:
        return children;
    }
  }
  return rich ? (
    <div className="description helpful-note-prose">{render(rich, 0)}</div>
  ) : (
    <p className="description">{text}</p>
  );
}
