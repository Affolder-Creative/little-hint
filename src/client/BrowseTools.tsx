import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Modal, useModalDismiss } from "./components";
import "./browsing.css";

const BrowseSaving = createContext({
  busy: false,
  setBusy: (_busy: boolean) => {},
});
export const useBrowseSaving = () => useContext(BrowseSaving);

function Done() {
  const { busy } = useBrowseSaving();
  const dismiss = useModalDismiss();
  return (
    <button className="button" disabled={busy} onClick={() => dismiss?.()}>
      Done
    </button>
  );
}

/** Immediate controls stay mounted with their owner, so changes never go stale. */
export function BrowseTools({
  search,
  setSearch,
  searchLabel,
  placeholder = "Search by name",
  searchHint,
  summary,
  activeCount,
  clear,
  children,
}: {
  search: string;
  setSearch: (value: string) => void;
  searchLabel: string;
  placeholder?: string;
  searchHint?: string;
  summary: string[];
  activeCount: number;
  clear: () => void;
  children: ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const hintId = useId();
  return (
    <div className="browse-tools">
      <div className="browse-toolbar">
        <label className="search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label={searchLabel}
            aria-describedby={searchHint ? hintId : undefined}
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {searchHint && (
          <span id={hintId} className="sr-only">
            {searchHint}
          </span>
        )}
        <button
          className="button secondary"
          aria-haspopup="dialog"
          aria-expanded={opened}
          onClick={() => setOpened(true)}
        >
          <SlidersHorizontal size={17} />
          Sort &amp; filter{activeCount > 0 && <span>({activeCount})</span>}
        </button>
      </div>
      {summary.length > 0 && (
        <div className="browse-summary">
          <span>{summary.join(" · ")}</span>
          {activeCount > 0 && (
            <button className="text-button" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
      )}
      {opened && (
        <BrowseSaving.Provider value={{ busy, setBusy }}>
          <Modal title="Sort & filter" onClose={() => setOpened(false)}>
            <fieldset
              disabled={busy}
              className="browse-options"
              onClick={(event) => {
                if (
                  (event.target as Element).closest("[data-browse-reorder]")
                ) {
                  setOpened(false);
                }
              }}
            >
              {children}
            </fieldset>
            <div className="browse-dialog-actions">
              <button
                className="text-button"
                disabled={!activeCount || busy}
                onClick={clear}
              >
                Clear filters
              </button>
              <Done />
            </div>
          </Modal>
        </BrowseSaving.Provider>
      )}
    </div>
  );
}
