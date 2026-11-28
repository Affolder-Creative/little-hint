import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  isListIconKey,
  listIconLabel,
  listIcons,
  type ListIconKey,
} from "../shared/list-icons";
import { ListIcon } from "./ListIcon";
import "./list-policy.css";

export function ListIconPicker({ initial }: { initial?: string | null }) {
  const [selected, setSelected] = useState<ListIconKey | null>(
    isListIconKey(initial) ? initial : null,
  );
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const matches = listIcons.filter((icon) =>
    `${icon.label} ${icon.category} ${icon.key} ${icon.keywords}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const close = () => {
    setExpanded(false);
    setQuery("");
    trigger.current?.focus();
  };
  const choose = (key: ListIconKey | null) => {
    setSelected(key);
    close();
  };
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = [
      "ArrowRight",
      "ArrowLeft",
      "ArrowDown",
      "ArrowUp",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) return;
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      ),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const columns = buttons.filter(
      (button) => button.offsetTop === buttons[0].offsetTop,
    ).length;
    const offset =
      event.key === "ArrowDown"
        ? columns
        : event.key === "ArrowUp"
          ? -columns
          : event.key === "ArrowLeft"
            ? -1
            : 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : (index + offset + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  return (
    <div className="list-icon-field">
      <span className="field-label" id={`${panelId}-label`}>
        List icon
      </span>
      <input type="hidden" name="iconKey" value={selected ?? ""} />
      <button
        type="button"
        className="button secondary list-icon-trigger"
        ref={trigger}
        aria-labelledby={`${panelId}-label ${panelId}-selection`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded(!expanded)}
      >
        <ListIcon iconKey={selected} size={20} />
        <span id={`${panelId}-selection`}>
          {selected ? listIconLabel(selected) : "Checklist (default)"}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {expanded && (
        <div
          id={panelId}
          className="list-icon-picker"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <label className="list-icon-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search list icons</span>
            <input
              autoFocus
              type="search"
              value={query}
              placeholder="Search icons"
              onChange={(event) => {
                event.stopPropagation();
                setQuery(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="text-button"
            data-form-change={selected ? "true" : undefined}
            onClick={() => choose(null)}
          >
            <ListIcon size={18} /> Use default checklist
            {!selected && <Check size={16} aria-label="Selected" />}
          </button>
          <div
            className="list-icon-grid"
            role="listbox"
            aria-label="List icons"
            onKeyDown={navigate}
          >
            {matches.map((icon, index) => (
              <button
                key={icon.key}
                type="button"
                role="option"
                aria-selected={selected === icon.key}
                data-form-change={selected !== icon.key ? "true" : undefined}
                tabIndex={
                  selected === icon.key ||
                  (index === 0 &&
                    !matches.some((match) => match.key === selected))
                    ? 0
                    : -1
                }
                aria-label={icon.label}
                title={icon.label}
                onClick={() => choose(icon.key)}
              >
                <ListIcon iconKey={icon.key} size={22} />
                {selected === icon.key && (
                  <Check
                    className="list-icon-check"
                    size={12}
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
          <p className="muted list-icon-results" role="status">
            {matches.length
              ? `${matches.length} icons`
              : "No matching icons. Try another word."}
          </p>
        </div>
      )}
    </div>
  );
}
