import { Plugin, PluginKey } from "@tiptap/pm/state";
import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  Strikethrough,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";
import {
  noteText,
  plainNote,
  safeNoteUrl,
  type NoteDocument,
  type NoteNode,
} from "../shared/helpful-note";
import "./helpful-note.css";
function clean(node: any): NoteNode {
  return {
    type: node.type,
    ...(node.text !== undefined ? { text: node.text } : {}),
    ...(node.type === "orderedList"
      ? { attrs: { start: node.attrs?.start ?? 1 } }
      : {}),
    ...(node.marks?.length
      ? {
          marks: node.marks.map((m: any) => ({
            type: m.type,
            ...(m.type === "link" ? { attrs: { href: m.attrs.href } } : {}),
          })),
        }
      : {}),
    ...(node.content
      ? { content: node.content.map(clean) }
      : ["doc", "paragraph", "listItem", "bulletList", "orderedList"].includes(
            node.type,
          )
        ? { content: [] }
        : {}),
  };
}
export function HelpfulNoteEditor({
  value,
  rich,
  onChange,
  disabled = false,
  label = "A helpful note",
}: {
  value: string;
  rich?: NoteDocument | null;
  onChange: (text: string, doc: NoteDocument) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const callback = useRef(onChange);
  callback.current = onChange;
  const last = useRef({ value, rich });
  const [linkOpen, setLinkOpen] = useState(false),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        underline: false,
        link: {
          openOnClick: false,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
          isAllowedUri: safeNoteUrl,
        },
      }),
    ],
    content: rich ?? plainNote(value),
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": `${id}-label`,
        "aria-describedby": `${id}-help`,
        class: "helpful-note-prose helpful-note-input",
      },
    },
    onUpdate: ({ editor }) => {
      const doc = clean(editor.getJSON()) as NoteDocument;
      const text = noteText(doc);
      setError(
        text.length > 5000
          ? "Keep your note to 5,000 characters or fewer."
          : "",
      );
      last.current = { value: text, rich: doc };
      callback.current(text, doc);
      editor.view.dom.closest("form")?.dispatchEvent(new Event("note-change"));
    },
  });
  useEditorState({ editor, selector: ({ editor }) => editor?.state });
  useEffect(() => {
    if (!editor) return;
    const key = new PluginKey("helpful-note-limit");
    const plugin = new Plugin({
      key,
      filterTransaction: (transaction) => {
        if (
          !transaction.docChanged ||
          noteText(clean(transaction.doc.toJSON())).length <= 5000
        )
          return true;
        setError(
          "Keep your note to 5,000 characters or fewer. This change was not added.",
        );
        return false;
      },
    });
    editor.registerPlugin(plugin);
    return () => {
      editor.unregisterPlugin(key);
    };
  }, [editor]);
  useEffect(() => {
    // A busy-state change is not a user edit and must not mark imports touched.
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    if (
      editor &&
      (last.current.value !== value ||
        JSON.stringify(last.current.rich) !== JSON.stringify(rich))
    ) {
      editor.commands.setContent(rich ?? plainNote(value), {
        emitUpdate: false,
      });
      last.current = { value, rich };
    }
  }, [editor, value, rich]);
  function openLink() {
    if (!editor || disabled) return;
    setUrl(editor.getAttributes("link").href ?? "");
    setLinkOpen(true);
    setError("");
  }
  return (
    <div className="field helpful-note-editor">
      <span id={`${id}-label`} className="helpful-note-label">
        {label}
      </span>
      <div className="helpful-note-shell" aria-disabled={disabled}>
        <div
          className="helpful-note-toolbar"
          role="group"
          aria-label="Note formatting"
        >
          {(
            [
              ["bold", "Bold", Bold],
              ["italic", "Italic", Italic],
              ["strike", "Strikethrough", Strikethrough],
              ["link", "Add or edit link", LinkIcon],
              ["bulletList", "Bulleted list", List],
              ["orderedList", "Numbered list", ListOrdered],
            ] as const
          ).map(([name, title, Icon]) => (
            <button
              key={name}
              type="button"
              aria-label={title}
              title={title}
              aria-pressed={editor?.isActive(name) ?? false}
              disabled={disabled || !editor}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (!editor) return;
                if (name === "link") return openLink();
                const c = editor.chain().focus();
                if (name === "bold") c.toggleBold().run();
                else if (name === "italic") c.toggleItalic().run();
                else if (name === "strike") c.toggleStrike().run();
                else if (name === "bulletList") c.toggleBulletList().run();
                else c.toggleOrderedList().run();
              }}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
        {linkOpen && (
          <div
            className="helpful-note-link"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setLinkOpen(false);
                editor?.commands.focus();
              }
            }}
          >
            <label htmlFor={`${id}-url`}>Link address</label>
            <input
              id={`${id}-url`}
              autoFocus
              type="url"
              value={url}
              disabled={disabled}
              placeholder="https://example.com"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
            />
            <div className="actions">
              <button
                type="button"
                className="button small"
                disabled={disabled}
                onClick={() => {
                  if (!safeNoteUrl(url.trim())) {
                    setError("Enter a full HTTP or HTTPS link.");
                    return;
                  }
                  const chain = editor!.chain().focus().extendMarkRange("link");
                  if (
                    editor!.state.selection.empty &&
                    !editor!.isActive("link")
                  )
                    chain
                      .insertContent({
                        type: "text",
                        text: url.trim(),
                        marks: [{ type: "link", attrs: { href: url.trim() } }],
                      })
                      .run();
                  else chain.setLink({ href: url.trim() }).run();
                  setError("");
                  setLinkOpen(false);
                }}
              >
                Apply link
              </button>
              <button
                type="button"
                className="text-button"
                disabled={disabled}
                onClick={() => {
                  editor
                    ?.chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run();
                  setLinkOpen(false);
                }}
              >
                Remove link
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setLinkOpen(false);
                  editor?.commands.focus();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
              e.preventDefault();
              openLink();
            }
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
      <small id={`${id}-help`}>
        Select text to format it. Links open in a new tab when viewing the item.
      </small>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
