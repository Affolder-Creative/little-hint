import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Search, X } from "lucide-react";
import { useApp } from "./context";
import { Avatar } from "./components";
import { useNavigationState } from "./NavigationScroll";
import {
  directoryLetters,
  directoryPeople,
  personLetter,
} from "./people-directory";
import "./people-directory.css";

export function PeopleDirectory() {
  const { world, open, close } = useApp();
  const [query, setQuery] = useNavigationState<string>("directorySearch", "");
  const [helpOpen, setHelpOpen] = useNavigationState<boolean>(
    "directoryHelp",
    false,
  );
  const [active, setActive] = useState("");
  const [railFits, setRailFits] = useState(false);
  const searchAnchor = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const matches = useMemo(
    () => directoryPeople(world.people, query),
    [world.people, query],
  );
  const searching = !!query.trim();
  const sections = useMemo(
    () =>
      directoryLetters.flatMap((letter) => {
        const people = matches.filter((p) => personLetter(p.name) === letter);
        return people.length ? [{ letter, people }] : [];
      }),
    [matches],
  );
  const available = sections.map((s) => s.letter);
  const jump = (letter: string, focus = false) => {
    const heading = document.getElementById(`directory-${letter}`);
    if (!heading) return;
    const offset = parseFloat(
      root.current?.style.getPropertyValue("--directory-toolbar-height") || "0",
    );
    window.scrollTo({
      top: window.scrollY + heading.getBoundingClientRect().top - offset - 8,
      behavior: "instant",
    });
    if (focus) heading.focus({ preventScroll: true });
    setActive(letter);
  };
  useEffect(() => {
    const update = () => {
      const header = document.querySelector(".topbar");
      const headerHeight =
        header &&
        ["fixed", "sticky"].includes(getComputedStyle(header).position)
          ? header.getBoundingClientRect().height
          : 0;
      root.current?.style.setProperty("--directory-top", `${headerHeight}px`);
      const height = toolbar.current?.getBoundingClientRect().height ?? 0;
      root.current?.style.setProperty(
        "--directory-toolbar-height",
        `${height + headerHeight}px`,
      );
      const nav = document
        .querySelector(".mobile-nav")
        ?.getBoundingClientRect();
      const bottom = nav?.height ? nav.top : innerHeight;
      const top =
        Math.max(0, toolbar.current?.getBoundingClientRect().bottom ?? 0) + 8;
      const railHeight = rail.current?.scrollHeight ?? Infinity;
      setRailFits(bottom - top - 8 >= railHeight);
      if (rail.current) rail.current.style.top = `${top}px`;
      const current =
        sections
          .filter(
            ({ letter }) =>
              (document
                .getElementById(`directory-${letter}`)
                ?.getBoundingClientRect().top ?? Infinity) <=
              height + headerHeight + 24,
          )
          .at(-1)?.letter ??
        sections[0]?.letter ??
        "";
      setActive(current);
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    if (toolbar.current) observer.observe(toolbar.current);
    if (rail.current) observer.observe(rail.current);
    const header = document.querySelector(".topbar");
    if (header) observer.observe(header);
    const nav = document.querySelector(".mobile-nav");
    if (nav) observer.observe(nav);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [sections]);
  const changeSearch = (value: string) => {
    setQuery(value);
    if ((searchAnchor.current?.getBoundingClientRect().top ?? 0) < 0)
      searchAnchor.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
  };
  const pickFromPointer = (y: number) => {
    const bounds = rail.current!.getBoundingClientRect();
    const index = Math.max(
      0,
      Math.min(26, Math.floor(((y - bounds.top) / bounds.height) * 27)),
    );
    const letter =
      directoryLetters.slice(index).find((l) => available.includes(l)) ??
      available.at(-1);
    if (letter) jump(letter);
  };
  const renderPeople = (people: typeof matches) =>
    people.map((p) => (
      <Link
        className="person-row"
        key={p.id}
        data-navigation-focus={`directory-person-${p.id}`}
        to={`/people/${p.id}${world.friendEntries?.some((f) => f.personId === p.id && !f.connectedAt) ? "?tab=ideas" : ""}`}
      >
        <Avatar name={p.name} />
        <div>
          <h3>{p.name}</h3>
          <p>
            {p.userId === world.me.id
              ? "Your wish lists"
              : p.guardians.includes(world.me.id)
                ? "Managed by you"
                : world.coManagement?.arrangements.some(
                      (r) =>
                        r.personId === p.id &&
                        r.helperId === world.me.id &&
                        r.status === "active",
                    )
                  ? "Wishes co-managed by you"
                  : world.friendEntries?.some(
                        (f) => f.personId === p.id && !f.connectedAt,
                      )
                    ? "Gift ideas · Not connected"
                    : "Wishes & gift ideas"}
          </p>
        </div>
        <ArrowRight size={19} aria-hidden="true" />
      </Link>
    ));
  return (
    <div
      ref={root}
      className={`people-directory${railFits && !searching ? " has-letter-rail" : ""}`}
    >
      <details
        className="directory-help notice"
        open={helpOpen}
        onToggle={(e) => setHelpOpen(e.currentTarget.open)}
      >
        <summary>Inviting and managing people</summary>
        <p>
          <Link to="/settings?section=invitations">
            Invite someone to Little Hint
          </Link>{" "}
          so they can manage their own wishes. To share lists, send a separate{" "}
          <Link to="/settings?section=groups&view=members">
            family-group invitation
          </Link>
          . Create a managed profile for someone whose wishes you’ll look after.
        </p>
      </details>
      <div ref={searchAnchor} className="directory-search-anchor" />
      <div className="directory-toolbar" ref={toolbar}>
        <label htmlFor="directory-search">Search people</label>
        <div className="directory-search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={search}
            id="directory-search"
            type="search"
            placeholder="Search by name"
            value={query}
            onChange={(e) => changeSearch(e.target.value)}
          />
          {query && (
            <button
              className="icon-button"
              aria-label="Clear search"
              onClick={() => {
                changeSearch("");
                search.current?.focus();
                searchAnchor.current?.scrollIntoView({
                  block: "start",
                  behavior: "instant",
                });
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="directory-status">
          <span role="status">
            {matches.length}{" "}
            {searching
              ? matches.length === 1
                ? "match"
                : "matches"
              : matches.length === 1
                ? "person"
                : "people"}
          </span>
          {!searching && available.length > 0 && (
            <button
              className="button secondary small"
              onClick={() =>
                open(
                  "Jump to letter",
                  <div className="directory-letter-dialog">
                    {directoryLetters.map((letter) => (
                      <button
                        key={letter}
                        className="button secondary"
                        disabled={!available.includes(letter)}
                        aria-label={`Jump to ${letter === "#" ? "other names" : letter}`}
                        onClick={() => {
                          close();
                          requestAnimationFrame(() => jump(letter, true));
                        }}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>,
                )
              }
            >
              Jump to letter
            </button>
          )}
        </div>
        {!searching && available.length > 0 && (
          <nav className="directory-alphabet" aria-label="People by letter">
            {directoryLetters.map((letter) => (
              <button
                key={letter}
                disabled={!available.includes(letter)}
                aria-label={`Jump to ${letter === "#" ? "other names" : letter}`}
                aria-current={active === letter ? "location" : undefined}
                onClick={() => jump(letter, true)}
              >
                {letter}
              </button>
            ))}
          </nav>
        )}
      </div>
      {matches.length === 0 ? (
        <div className="empty">
          <h2>No people found</h2>
          {query && (
            <button
              className="text-button"
              onClick={() => {
                changeSearch("");
                search.current?.focus();
              }}
            >
              Clear search
            </button>
          )}
        </div>
      ) : searching ? (
        <div className="directory-results">{renderPeople(matches)}</div>
      ) : (
        sections.map(({ letter, people }) => (
          <section
            key={letter}
            className="directory-section"
            aria-labelledby={`directory-${letter}`}
          >
            <h2 id={`directory-${letter}`} tabIndex={-1}>
              {letter === "#" ? "Other names" : letter}
            </h2>
            {renderPeople(people)}
          </section>
        ))
      )}
      {!searching && available.length > 0 && (
        <div
          ref={rail}
          className="directory-rail"
          aria-hidden="true"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pickFromPointer(e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              pickFromPointer(e.clientY);
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          {directoryLetters.map((letter) => (
            <span
              key={letter}
              className={`${available.includes(letter) ? "" : "unavailable"} ${active === letter ? "active" : ""}`}
            >
              {letter}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
