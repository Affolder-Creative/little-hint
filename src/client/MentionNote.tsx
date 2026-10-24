import { moveMentions } from "./mention-state";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "./context";
import { api } from "./api";
import { Form } from "./components";
import type { Mention } from "../shared/model";

type Candidate = { userId: string; name: string; detail: string };
export function MentionNote({ itemId }: { itemId: string }) {
  const { mutate, toast } = useApp();
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [caret, setCaret] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState(0);
  const [composing, setComposing] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    const position = pendingCaret.current;
    pendingCaret.current = null;
    textarea.current?.focus();
    textarea.current?.setSelectionRange(position, position);
    setCaret(position);
  }, [body]);
  const match = body.slice(0, caret).match(/(?:^|\s)@([^@\n]{0,80})$/u);
  const start = match ? caret - match[1].length - 1 : -1;
  const active =
    !!match &&
    !dismissed &&
    !composing &&
    !mentions.some((m) => m.start === start);
  useLayoutEffect(() => {
    const input = textarea.current;
    if (!active || !input) return;
    const measure = () => {
      const style = getComputedStyle(input);
      const mirror = document.createElement("div");
      for (const key of [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "padding",
        "border",
        "boxSizing",
        "wordSpacing",
        "tabSize",
      ] as const)
        mirror.style[key] = style[key];
      Object.assign(mirror.style, {
        position: "fixed",
        visibility: "hidden",
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        width: `${input.clientWidth}px`,
      });
      mirror.textContent = body.slice(0, caret);
      const marker = document.createElement("span");
      marker.textContent = "\u200b";
      mirror.append(marker);
      document.body.append(mirror);
      const bounds = input.getBoundingClientRect();
      const line =
        parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
      const top = Math.max(0, marker.offsetTop - input.scrollTop) + line;
      const width = Math.min(320, input.clientWidth);
      const left = Math.max(
        0,
        Math.min(
          marker.offsetLeft - input.scrollLeft,
          input.clientWidth - width,
        ),
      );
      const viewportBottom =
        (window.visualViewport?.height ?? innerHeight) +
        (window.visualViewport?.offsetTop ?? 0);
      const below = viewportBottom - bounds.top - top - 16;
      setMenuStyle({
        position: "absolute",
        left,
        width,
        zIndex: 10,
        maxHeight: Math.max(
          100,
          Math.min(240, below < 120 ? bounds.top : below),
        ),
        ...(below < 120
          ? { bottom: input.clientHeight - top + line }
          : { top }),
      });
      mirror.remove();
    };
    measure();
    input.addEventListener("scroll", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      input.removeEventListener("scroll", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [active, body, caret]);
  const candidates = useQuery({
    queryKey: ["mention-candidates", itemId, match?.[1]],
    queryFn: () =>
      api<Candidate[]>(
        `items/${itemId}/mention-candidates?q=${encodeURIComponent(match?.[1] ?? "")}`,
      ),
    enabled: active,
  });
  const choices = candidates.data ?? [];
  const index = Math.min(selected, Math.max(0, choices.length - 1));
  const choose = (c: Candidate) => {
    const text = `@${c.name}`;
    const next = body.slice(0, start) + text + " " + body.slice(caret);
    if (next.length > 4000) return;
    const shifted = moveMentions(body, next, mentions);
    setMentions([
      ...shifted,
      { userId: c.userId, start, end: start + text.length },
    ]);
    pendingCaret.current = start + text.length + 1;
    setBody(next);
    setDismissed(true);
  };
  return (
    <Form
      submit="Add private note"
      onSubmit={async () => {
        await mutate("comments", { itemId, body, mentions });
        setBody("");
        setMentions([]);
        setCaret(0);
        toast("Private note added.");
      }}
    >
      <div className="field">
        <label htmlFor={`${listId}-input`}>Your note</label>
        <div className="mention-composer">
          <textarea
            id={`${listId}-input`}
            ref={textarea}
            name="body"
            required
            maxLength={4000}
            rows={3}
            value={body}
            aria-describedby={`${listId}-help`}
            aria-controls={active ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              active && choices.length ? `${listId}-${index}` : undefined
            }
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onChange={(e) => {
              setMentions(moveMentions(body, e.target.value, mentions));
              setBody(e.target.value);
              setCaret(e.target.selectionStart);
              setDismissed(false);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (!active || e.nativeEvent.isComposing) return;
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setDismissed(true);
              }
              if (
                choices.length &&
                ["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(e.key)
              ) {
                e.preventDefault();
                if (e.key === "Enter" || e.key === "Tab")
                  choose(choices[index]);
                else
                  setSelected(
                    (index +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      choices.length) %
                      choices.length,
                  );
              }
            }}
          />
          {active && (
            <div className="mention-menu" style={menuStyle}>
              {candidates.isPending ? (
                <p role="status">Finding people…</p>
              ) : candidates.isError ? (
                <p role="status">
                  Couldn’t load people. Keep writing, or try @ again.
                </p>
              ) : choices.length ? (
                <ul
                  id={listId}
                  role="listbox"
                  aria-label="People who can read this note"
                >
                  {choices.map((c, i) => (
                    <li
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === index}
                      key={c.userId}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        choose(c);
                      }}
                      className={i === index ? "selected" : ""}
                    >
                      <span>{c.name}</span>
                      <small>{c.detail}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p role="status">No matching people can read this note.</p>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="muted" id={`${listId}-help`}>
        Type @ to mention someone who can read this note. Select their name to
        notify them.
      </p>
    </Form>
  );
}
export function MentionText({
  body,
  mentions = [],
}: {
  body: string;
  mentions?: Mention[];
}) {
  let end = 0;
  const pieces = [...mentions]
    .sort((a, b) => a.start - b.start)
    .flatMap((m, i) => {
      const before = body.slice(end, m.start);
      end = m.end;
      return [
        before,
        <strong className="note-mention" key={i}>
          {body.slice(m.start, m.end)}
        </strong>,
      ];
    });
  return (
    <>
      {pieces}
      {body.slice(end)}
    </>
  );
}
