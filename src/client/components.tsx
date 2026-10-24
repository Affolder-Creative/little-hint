import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  cloneElement,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  X,
  LoaderCircle,
  Gift,
  BookOpen,
  Coffee,
  Music,
  Mountain,
  Heart,
  Plus,
  ArrowUpRight,
  LockKeyhole,
  Eye,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { GiftView } from "../shared/model";
import { dollars, initials } from "./api";

export function MobileNavigation({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = ref.current!;
    const root = document.documentElement;
    const measure = () => {
      root.style.setProperty(
        "--mobile-nav-height",
        `${Math.ceil(nav.getBoundingClientRect().height)}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    // Include borders and safe-area padding, even when the links don't resize.
    observer.observe(nav, { box: "border-box" });
    return () => {
      observer.disconnect();
      root.style.removeProperty("--mobile-nav-height");
    };
  }, []);
  return (
    <nav ref={ref} className="mobile-nav" aria-label="Mobile navigation">
      {children}
    </nav>
  );
}

export function Logo({
  tagline = false,
  dark = false,
}: {
  tagline?: boolean;
  dark?: boolean;
}) {
  return (
    <picture className={tagline ? "logo tagline" : "logo"}>
      {tagline && (
        <source
          media="(max-width: 460px)"
          srcSet={`/brand/little-hint/logos/little-hint-horizontal-${dark ? "dark" : "color"}.svg`}
        />
      )}
      <img
        src={`/brand/little-hint/logos/little-hint-${tagline ? "tagline" : "horizontal"}-${dark ? "dark" : "color"}.svg`}
        alt={
          tagline
            ? "Little Hint. Gift ideas, shared thoughtfully."
            : "Little Hint"
        }
      />
    </picture>
  );
}
export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  const n = [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 4;
  return (
    <span
      className={`avatar color-${n} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
export function Privacy({ mode }: { mode: "surprise" | "transparent" }) {
  return (
    <span className={`privacy ${mode}`}>
      {mode === "surprise" ? <LockKeyhole size={13} /> : <Eye size={13} />}{" "}
      {mode === "surprise" ? "Surprise" : "Transparent"}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [discarding, setDiscarding] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const requestClose = () => {
    if (ref.current?.querySelector('form[data-busy="true"]')) return;
    if (ref.current?.querySelector('form[data-dirty="true"]')) {
      previousFocus.current = document.activeElement as HTMLElement;
      setDiscarding(true);
    } else onClose();
  };
  useEffect(() => {
    if (discarding) keepEditing.current?.focus();
    else previousFocus.current?.focus();
  }, [discarding]);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => {
      el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (discarding) setDiscarding(false);
        else requestClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={requestClose}
        >
          <X />
        </button>
      </div>
      {discarding && (
        <div className="dialog-body" role="alert">
          <h3>Discard your changes?</h3>
          <p>Your unfinished changes have not been saved.</p>
          <div className="actions">
            <button
              ref={keepEditing}
              className="button"
              onClick={() => setDiscarding(false)}
            >
              Keep editing
            </button>
            <button className="button secondary" onClick={onClose}>
              Discard changes
            </button>
          </div>
        </div>
      )}
      <div className="dialog-body" hidden={discarding}>
        {children}
      </div>
    </dialog>
  );
}
export function Form({
  onSubmit,
  children,
  submit = "Save",
  disabled = false,
  className = "",
  review,
}: {
  onSubmit: (data: FormData) => Promise<unknown>;
  children: ReactNode;
  submit?: string;
  disabled?: boolean;
  className?: string;
  review?: (data: FormData) => ReactNode | null;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<{
    data: FormData;
    content: ReactNode;
  } | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pending) reviewRef.current?.focus();
  }, [pending]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = pending?.data ?? new FormData(e.currentTarget);
    if (!pending && review) {
      const content = review(data);
      if (content) {
        setPending({ data, content });
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(data);
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`form ${className}`.trim()}
      onSubmit={send}
      onChange={() => setDirty(true)}
      data-dirty={dirty}
      data-busy={busy}
      onClick={(event) => {
        if ((event.target as Element).closest("[data-form-change]"))
          setDirty(true);
      }}
    >
      <fieldset disabled={busy} hidden={!!pending}>
        {children}
      </fieldset>
      {pending && (
        <div ref={reviewRef} tabIndex={-1} className="form-review">
          {pending.content}
          <button
            type="button"
            disabled={busy}
            className="text-button"
            onClick={() => setPending(null)}
          >
            Back to editing
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={busy || disabled} className="button" type="submit">
        {busy ? <LoaderCircle className="spin" size={17} /> : null}
        {busy ? "Saving…" : pending ? "Confirm and save" : submit}
      </button>
    </form>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": hint ? `${id}-hint` : undefined,
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <img
        src="/brand/little-hint/symbols/little-hint-tag-color.svg"
        width="56"
        height="64"
        alt=""
      />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function GiftPhoto({ gift }: { gift: GiftView }) {
  const [failed, setFailed] = useState(false);
  const t = gift.tags.join(" ").toLowerCase();
  const Icon = /book|journal|creative/.test(t)
    ? BookOpen
    : /coffee|kitchen/.test(t)
      ? Coffee
      : /music|vinyl/.test(t)
        ? Music
        : /outdoor|travel/.test(t)
          ? Mountain
          : Gift;
  return (
    <div className={`gift-photo photo-${gift.tags.join("").length % 4}`}>
      {gift.image && !failed ? (
        <img
          src={gift.image}
          alt={gift.title}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <Icon strokeWidth={1.1} aria-hidden="true" />
          <span>No photo yet</span>
        </>
      )}
    </div>
  );
}
export function GiftCard({ gift }: { gift: GiftView }) {
  return (
    <Link className="gift-card" to={`/gift/${gift.id}`}>
      <GiftPhoto gift={gift} />
      <div className="gift-card-content">
        <div className="gift-recipient">
          <Avatar small name={gift.recipientNames[0] ?? "Gift"} />
          <span>For {gift.recipientNames.join(" & ")}</span>
          <ArrowUpRight size={15} />
        </div>
        <h3>{gift.title}</h3>
        <div className="gift-meta">
          <span>{dollars(gift.priceCents)}</span>
          {gift.isRecipient ? (
            <span className="status quiet">On your list</span>
          ) : gift.available === 0 ? (
            <span className="status">Taken care of</span>
          ) : (
            <span className="status available">Available</span>
          )}
        </div>
        <div className="tags">
          {gift.tags.slice(0, 2).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}
export function Header({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
