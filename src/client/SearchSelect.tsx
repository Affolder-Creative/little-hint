import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Gift, Plus, Users, X } from "lucide-react";
import { Avatar } from "./components";
import "./spending-purchase.css";

export type Choice = { id: string; label: string; detail?: string };

/** Input focus stays in the combobox while the active option is announced. */
export function SearchSelect({
  label,
  value,
  onChange,
  choices,
  onChoose,
  hint,
  required = false,
  placeholder,
  multiple = false,
  selected = [],
  minSearchLength = 0,
  optionKind = "person",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  choices: Choice[];
  onChoose: (id: string) => void;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  multiple?: boolean;
  selected?: string[];
  minSearchLength?: number;
  optionKind?: "person" | "group";
}) {
  const id = useId();
  const [requestedOpen, setOpen] = useState(false);
  const open = requestedOpen && value.trim().length >= minSearchLength;
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const pointerInside = useRef(false);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      pointerInside.current = !!popup.current?.contains(event.target as Node);
      if (
        !pointerInside.current &&
        !root.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [bounds, setBounds] = useState({
    left: 0,
    top: 0,
    width: 0,
    maxHeight: 240,
  });
  useLayoutEffect(() => {
    if (!open || !input.current) return;
    const element = input.current;
    setAnchor(element.closest("dialog") ?? document.body);
    const measure = () => {
      const b = element.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + (viewport?.height ?? innerHeight);
      const below = bottom - b.bottom - 12;
      const above = b.top - top - 12;
      const flip = below < 160 && above > below;
      const height = Math.max(44, Math.min(240, flip ? above : below));
      setBounds({
        left: b.left,
        width: b.width,
        top: flip ? b.top - height - 4 : b.bottom + 4,
        maxHeight: height,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element.closest("dialog") ?? element);
    window.visualViewport?.addEventListener("scroll", measure);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("scroll", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [open]);
  const index = Math.min(active, Math.max(choices.length - 1, 0));
  useEffect(() => {
    if (open)
      document.getElementById(`${id}-option-${index}`)?.scrollIntoView({
        block: "nearest",
        container: "nearest",
      } as ScrollIntoViewOptions);
  }, [open, index, id]);
  const choose = (choice: Choice) => {
    onChoose(choice.id);
    if (!multiple) setOpen(false);
    input.current?.focus();
  };
  return (
    <div
      ref={root}
      className="purchase-search field"
      onKeyDownCapture={(e) => {
        if (e.key === "Tab") pointerInside.current = false;
      }}
      onBlur={(e) => {
        if (
          !pointerInside.current &&
          !e.currentTarget.contains(e.relatedTarget as Node | null) &&
          !popup.current?.contains(e.relatedTarget as Node | null)
        )
          setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="purchase-search-anchor">
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-activedescendant={
            open && choices.length ? `${id}-option-${index}` : undefined
          }
          aria-describedby={hint ? `${id}-hint` : undefined}
          autoComplete="off"
          value={value}
          maxLength={multiple ? 150 : 200}
          required={required}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setActive((i) =>
                Math.max(
                  0,
                  Math.min(
                    choices.length - 1,
                    i + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            }
            if (e.key === "Enter" && open && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (choices[index]) choose(choices[index]);
            }
          }}
        />
        {open &&
          anchor &&
          createPortal(
            <div
              ref={popup}
              style={bounds}
              className="purchase-options"
              id={`${id}-options`}
              role="listbox"
              aria-label={label}
              aria-multiselectable={multiple || undefined}
            >
              {choices.map((choice, i) => (
                <button
                  type="button"
                  tabIndex={-1}
                  data-form-change
                  key={choice.id}
                  id={`${id}-option-${i}`}
                  role="option"
                  aria-selected={
                    multiple ? selected.includes(choice.id) : index === i
                  }
                  className={`purchase-option ${multiple ? "purchase-option-person" : "purchase-option-gift"} ${index === i ? "active" : ""} ${choice.id === "manual" ? "purchase-option-manual" : ""}`}
                  onPointerDown={(e) => {
                    pointerInside.current = true;
                    if (e.pointerType === "mouse") e.preventDefault();
                  }}
                  onClick={() => {
                    choose(choice);
                    pointerInside.current = false;
                  }}
                >
                  <span>
                    {multiple && (
                      <span aria-hidden="true" className="purchase-check">
                        {selected.includes(choice.id) ? (
                          <Check size={14} />
                        ) : null}
                      </span>
                    )}
                    {multiple ? (
                      optionKind === "group" ? (
                        <Users size={18} aria-hidden="true" />
                      ) : (
                        <Avatar small name={choice.label} />
                      )
                    ) : choice.id === "manual" ? (
                      <Plus size={18} aria-hidden="true" />
                    ) : (
                      <Gift size={18} aria-hidden="true" />
                    )}
                    <span className="purchase-option-copy">
                      <span className="purchase-option-title">
                        {choice.label}
                      </span>
                      {choice.detail && <small>{choice.detail}</small>}
                    </span>
                  </span>
                </button>
              ))}
              {!choices.length && (
                <p className="purchase-hint">
                  {multiple
                    ? optionKind === "group"
                      ? "No matching family groups."
                      : "No matching people."
                    : "No matching items. Enter any gift name."}
                </p>
              )}
            </div>,
            anchor,
          )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="purchase-hint">
          {hint}
        </p>
      )}
      <span className="sr-only" role="status">
        {open
          ? `${choices.length} options shown${multiple ? `, ${selected.length} selected` : ""}.`
          : ""}
      </span>
    </div>
  );
}

export function SelectionTags({
  choices,
  onRemove,
}: {
  choices: Choice[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="selection-tags">
      {choices.map((choice) => (
        <span className="purchase-chip" key={choice.id}>
          <span>{choice.label}</span>
          <button
            type="button"
            data-form-change
            aria-label={`Remove ${choice.label}`}
            onClick={() => onRemove(choice.id)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
