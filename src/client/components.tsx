import { ProductImage } from "./ProductImage";
import { prefetchProductImage } from "./image-store";
import { priorityLabels } from "../shared/organization";
import "./mobile-repairs.css";
import { useDialogViewport } from "./useDialogViewport";
import { actionError } from "./copy";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  cloneElement,
  createContext,
  useContext,
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
import { useOnline } from "./pwa";
import { useApp } from "./context";
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
      {mode === "surprise" ? (
        <LockKeyhole size={13} aria-hidden="true" />
      ) : (
        <Eye size={13} aria-hidden="true" />
      )}
      <span className="privacy-label">
        {mode === "surprise" ? "Keep it a surprise" : "See the plans"}
      </span>
      {mode === "surprise" && (
        <span className="privacy-short-label" aria-hidden="true">
          Surprise
        </span>
      )}
    </span>
  );
}
const ModalDismissContext = createContext<
  ((afterClose?: () => void) => void) | null
>(null);
export const useModalDismiss = () => useContext(ModalDismissContext);

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
  useDialogViewport(ref);
  const [discarding, setDiscarding] = useState(false);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const afterDismiss = useRef<(() => void) | undefined>(undefined);
  const finishClose = () => {
    const afterClose = afterDismiss.current;
    afterDismiss.current = undefined;
    onClose();
    afterClose?.();
  };
  const keepChanges = () => {
    afterDismiss.current = undefined;
    setDiscarding(false);
  };
  const requestClose = (afterClose?: () => void) => {
    if (ref.current?.querySelector('[data-busy="true"]')) return;
    afterDismiss.current = afterClose;
    const saveEvent = new CustomEvent("draft-close", {
      cancelable: true,
      detail: finishClose,
    });
    ref.current?.querySelector("form")?.dispatchEvent(saveEvent);
    if (saveEvent.defaultPrevented) return;
    if (ref.current?.querySelector('form[data-dirty="true"]')) {
      previousFocus.current = document.activeElement as HTMLElement;
      setDiscarding(true);
    } else finishClose();
  };
  useEffect(() => {
    if (discarding) keepEditing.current?.focus();
    else previousFocus.current?.focus();
  }, [discarding]);
  useLayoutEffect(() => {
    const el = ref.current!;
    const opener = document.activeElement as HTMLElement | null;
    el.showModal();
    return () => {
      el.close();
      // Close before React removes the dialog so native focus restoration can
      // run. Explicitly restore the opener for browsers that lose it on removal.
      if (opener?.isConnected) {
        const disclosure = opener.closest("details");
        const target =
          disclosure && !disclosure.open
            ? disclosure.querySelector("summary")
            : opener;
        target?.focus({ preventScroll: true });
      }
      queueMicrotask(() => {
        // A successful action may also remove the opener or change routes.
        // Keep any focus chosen by that next view or a replacement dialog.
        if (
          document.activeElement === document.body &&
          !document.querySelector("dialog[open]")
        )
          document.getElementById("main")?.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (discarding) keepChanges();
        else requestClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={() => requestClose()}
        >
          <X />
        </button>
      </div>
      {discarding && (
        <div className="dialog-body" role="alert">
          <h3>Discard your changes?</h3>
          <p>Your unfinished changes have not been saved.</p>
          <div className="actions">
            <button ref={keepEditing} className="button" onClick={keepChanges}>
              Keep editing
            </button>
            <button className="button secondary" onClick={finishClose}>
              Discard changes
            </button>
          </div>
        </div>
      )}
      <div className="dialog-body" hidden={discarding}>
        <ModalDismissContext.Provider value={requestClose}>
          {children}
        </ModalDismissContext.Provider>
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
  resetOnSuccess = false,
  allowOffline = false,
  dirty: controlledDirty,
  cancel,
  busyLabel = "Saving…",
  cancelLabel = "Cancel",
  status,
  onBusyChange,
  onBeforeClose,
}: {
  onBeforeClose?: () => Promise<void>;
  onSubmit: (data: FormData) => Promise<unknown>;
  children: ReactNode;
  submit?: string;
  disabled?: boolean;
  className?: string;
  review?: (data: FormData) => ReactNode | null;
  resetOnSuccess?: boolean;
  allowOffline?: boolean;
  // Non-field editors can supply their actual unsaved state, including resets.
  dirty?: boolean;
  cancel?: () => void;
  busyLabel?: string;
  cancelLabel?: string;
  status?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [changed, setDirty] = useState(false);
  const dirty = controlledDirty ?? changed;
  const formRef = useRef<HTMLFormElement>(null);
  const beforeClose = useRef(onBeforeClose);
  beforeClose.current = onBeforeClose;
  useEffect(() => {
    const el = formRef.current;
    const listener = (event: Event) => {
      if (!beforeClose.current) return;
      event.preventDefault();
      void beforeClose
        .current()
        .then(() => (event as CustomEvent<() => void>).detail())
        .catch((e) => setError(actionError(e)));
    };
    el?.addEventListener("draft-close", listener);
    return () => el?.removeEventListener("draft-close", listener);
  }, []);

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  const [pending, setPending] = useState<{
    data: FormData;
    content: ReactNode;
  } | null>(null);
  const online = useOnline();
  const submitting = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const errorId = useId();
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const reviewRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef<HTMLFieldSetElement>(null);
  const wasReviewing = useRef(false);
  useLayoutEffect(() => {
    if (pending) {
      reviewRef.current?.focus();
      wasReviewing.current = true;
    } else if (wasReviewing.current) {
      wasReviewing.current = false;
      const field = Array.from(
        fieldsRef.current?.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)',
        ) ?? [],
      ).find((element) => element.getClientRects().length > 0);
      field?.focus();
    }
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
    const form = e.currentTarget;
    if (submitting.current || disabled || (!online && !allowOffline)) return;
    const data = pending?.data ?? new FormData(form);
    if (!pending && review) {
      const content = review(data);
      if (content) {
        setPending({ data, content });
        return;
      }
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await onSubmit(data);
      if (resetOnSuccess) form.reset();
      setDirty(false);
      setPending(null);
    } catch (e) {
      setError(actionError(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      ref={formRef}
      className={`form ${className}`.trim()}
      onSubmit={send}
      onChange={() => setDirty(true)}
      data-dirty={dirty}
      data-busy={busy}
      aria-busy={busy}
      aria-describedby={error ? errorId : undefined}
      onClick={(event) => {
        if ((event.target as Element).closest("[data-form-change]"))
          setDirty(true);
      }}
    >
      <fieldset ref={fieldsRef} disabled={busy} hidden={!!pending}>
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
        <p
          ref={errorRef}
          id={errorId}
          tabIndex={-1}
          role="alert"
          className="error form-error"
        >
          {error}
        </p>
      )}
      {!online && !allowOffline && (
        <p role="status">Reconnect to save these changes.</p>
      )}
      <div className="form-actions">
        <button
          disabled={busy || disabled || (!online && !allowOffline)}
          className="button"
          type="submit"
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : null}
          {busy ? busyLabel : pending ? "Confirm and save" : submit}
        </button>
        {cancel && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={cancel}
          >
            {cancelLabel}
          </button>
        )}
        {status && (
          <p className="muted form-status" role="status">
            {status}
          </p>
        )}
      </div>
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
  const child = children as ReactElement<Record<string, unknown>>;
  const description = [
    child.props["aria-describedby"],
    hint ? `${id}-hint` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(child, {
        id,
        "aria-describedby": description || undefined,
      })}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
  page = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  page?: boolean;
}) {
  const { dark } = useApp();
  const Heading = page ? "h1" : "h2";
  useEffect(() => {
    if (page) document.title = `${title} · Little Hint`;
  }, [page, title]);
  return (
    <div className="empty">
      <img
        src={`/brand/little-hint/symbols/little-hint-tag-${dark ? "dark" : "color"}.svg`}
        width="56"
        height="64"
        alt=""
      />
      <Heading>{title}</Heading>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function GiftPhoto({
  gift,
  size = "card",
}: {
  gift: GiftView;
  size?: "card" | "full";
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const failed = gift.image === failedImage;
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
    <div
      className={`gift-photo photo-${gift.tags.join("").length % 4} ${!gift.image || failed ? "without-photo" : ""}`}
    >
      {gift.image && !failed ? (
        <ProductImage
          url={gift.image}
          title={gift.title}
          full={size === "full"}
          onError={() => setFailedImage(gift.image)}
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
export const isPrivateIdea = (gift?: GiftView) =>
  !!gift && !gift.listId && gift.visibility === "private";

export const privateIdeaDescription =
  "Only you can see this idea, including reservations and purchases.";

export function PrivateIdeaBadge({ gift }: { gift?: GiftView }) {
  if (!isPrivateIdea(gift)) return null;
  return (
    <span className="private-idea-badge">
      <LockKeyhole size={14} aria-hidden="true" /> Only me
    </span>
  );
}

export function GiftCard({
  gift,
  sourceListName,
  headingLevel = 2,
}: {
  gift: GiftView;
  sourceListName?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Link
      onPointerEnter={() =>
        gift.image && prefetchProductImage(gift.image, true)
      }
      onFocus={() => gift.image && prefetchProductImage(gift.image, true)}
      onTouchStart={() => gift.image && prefetchProductImage(gift.image, true)}
      className="gift-card"
      to={`/gift/${gift.id}`}
      data-navigation-focus={`gift-${gift.id}`}
    >
      <GiftPhoto gift={gift} />
      <div className="gift-card-content">
        <div className="gift-recipient">
          <Avatar small name={gift.recipientNames[0] ?? "Gift"} />
          <span>For {gift.recipientNames.join(" & ")}</span>
          <ArrowUpRight size={15} />
        </div>
        <Heading className="gift-title">{gift.title}</Heading>
        <PrivateIdeaBadge gift={gift} />
        {gift.listId && gift.priority && (
          <span className={`item-priority priority-${gift.priority}`}>
            {priorityLabels[gift.priority]}
          </span>
        )}
        {sourceListName && (
          <p className="gift-source-list">From {sourceListName}</p>
        )}
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
  className = "",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`page-heading ${className}`}>
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}
