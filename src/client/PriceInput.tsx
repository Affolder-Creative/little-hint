import { useId, useLayoutEffect, useRef, useState } from "react";
import { Minus } from "lucide-react";
import { normalizePriceInput, parsePriceInput } from "../shared/price";
import "./price-input.css";

/** Raw editor text stays intact until the enclosing form saves numeric bounds. */
export function PriceInput({
  value,
  onChange,
  allowIncomplete = false,
}: {
  value: string;
  allowIncomplete?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<number | null>(null);
  const [showError, setShowError] = useState(false);
  const parsed = parsePriceInput(value);
  const error = parsed.ok ? "" : parsed.error;
  const normalized = normalizePriceInput(value);
  const first = parsePriceInput(normalized.split("-")[0]);
  const canAddRange = first.ok && first.value.priceCents !== null;
  useLayoutEffect(() => {
    input.current?.setCustomValidity(allowIncomplete ? "" : error);
    if (pendingSelection.current !== null) {
      input.current?.setSelectionRange(
        pendingSelection.current,
        pendingSelection.current,
      );
      pendingSelection.current = null;
    }
  }, [error, allowIncomplete, value]);
  const insertRange = () => {
    const separator = normalized.indexOf("-");
    const position = separator < 0 ? normalized.length + 1 : separator + 1;
    pendingSelection.current = position;
    if (separator < 0) onChange(`${normalized}-`);
    else if (normalized !== value) onChange(normalized);
    setShowError(false);
    input.current?.focus({ preventScroll: true });
    if (separator >= 0 && normalized === value) {
      input.current?.setSelectionRange(position, position);
      pendingSelection.current = null;
    }
  };
  return (
    <div className="field price-field">
      <label htmlFor={id}>Price in USD</label>
      <div className="price-input-controls">
        <input
          ref={input}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="Optional"
          value={value}
          aria-describedby={`${id}-hint${showError && error ? ` ${id}-error` : ""}`}
          aria-invalid={showError && !!error}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => setShowError(true)}
          onInvalid={() => setShowError(true)}
          onPaste={(event) => {
            event.preventDefault();
            const target = event.currentTarget;
            const next =
              value.slice(0, target.selectionStart ?? 0) +
              event.clipboardData.getData("text") +
              value.slice(target.selectionEnd ?? value.length);
            onChange(normalizePriceInput(next));
          }}
        />
        <button
          type="button"
          className="button secondary price-range-button"
          aria-label="Add price range"
          disabled={!canAddRange}
          data-form-change={normalized.includes("-") ? undefined : true}
          onPointerDown={(event) => event.preventDefault()}
          onClick={insertRange}
        >
          <Minus size={16} aria-hidden="true" />
          Range
        </button>
      </div>
      <small id={`${id}-hint`}>
        Enter a price or range, such as 25 or 25-50.
      </small>
      {showError && error && (
        <small id={`${id}-error`} className="error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
