import {
  actionError,
  contributionStatus,
  settingLabels,
  settingSources,
} from "./copy";
import { SettingsNavigation, settingsSections } from "./SettingsNavigation";
import { Confirm } from "./Confirm";
import { familyGroupLabel } from "../shared/households";
import { HouseholdSettings } from "./Households";
/* Little Hint operates as a quiet, practical gift notebook. Approved heart-tag artwork anchors the shell; product content leads. */
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  NavLink,
  Link,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Heart,
  Users,
  ListChecks,
  ShoppingBag,
  Shuffle,
  Settings,
  Plus,
  Search,
  ArrowRight,
  ArrowLeft,
  Check,
  ExternalLink,
  LockKeyhole,
  MessageCircle,
  LogOut,
  Sun,
  Moon,
  Monitor,
  KeyRound,
  Gift,
  WifiOff,
  Trash2,
  Download,
  LoaderCircle,
  Mail,
} from "lucide-react";
import type { World, GiftView, Reservation } from "../shared/model";
import { api, ApiError, authClient, clearPersonalData, dollars } from "./api";
import { AppContext, useApp } from "./context";
import {
  Logo,
  Avatar,
  Privacy,
  Modal,
  Form,
  Field,
  Empty,
  GiftPhoto,
  GiftCard,
  Header,
  MobileNavigation,
} from "./components";
import {
  GroupForm,
  PersonForm,
  ListForm,
  GiftForm,
  ExchangeForm,
  value,
  getDrafts,
  saveDraft,
  draftKey,
} from "./forms";
import { Install, UpdateNotice, useOnline } from "./pwa";
import { Login } from "./Login";
import { RevealPolicy, GiftSummaryPanel } from "./ListFeatures";
import {
  EventPage,
  GroupEventsSection,
  GroupEventSettings,
  ManagedEventNotice,
} from "./GroupEvents";
import { ExchangeReview, exchangeMissingLists } from "./ExchangeReview";
import { scrapingProviders } from "../shared/scraping-providers";
const nav = [
  { to: "/", label: "Home", icon: Heart },
  { to: "/people", label: "People", icon: Users },
  { to: "/lists", label: "My lists", icon: ListChecks },
  { to: "/buying", label: "Buying", icon: ShoppingBag },
  { to: "/exchanges", label: "Exchanges", icon: Shuffle },
];
export function App() {
  const location = useLocation();
  const client = useQueryClient();
  const online = useOnline();
  const [theme, setTheme] = useState(
    localStorage.getItem("little-hint:theme") ?? "system",
  );
  const [systemDark, setSystemDark] = useState(
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const dark = theme === "dark" || (theme === "system" && systemDark);
  const [modal, setModal] = useState<{ title: string; body: ReactNode } | null>(
      null,
    ),
    [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["world"],
    queryFn: async (): Promise<World | null> => {
      try {
        return await api<World>("world");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    refetchInterval: (q) =>
      q.state.data?.imports.some((j) =>
        ["pending", "running"].includes(j.status),
      )
        ? 2000
        : q.state.data
          ? 20000
          : false,
  });
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(mq.matches);
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#2B201D" : "#AA4D37");
    // Match explicit app appearance as well as the system preference.
    document
      .getElementById("app-favicon")
      ?.setAttribute(
        "href",
        `/brand/little-hint/favicons/little-hint-favicon-${dark ? "dark" : "color"}.svg`,
      );
    document
      .getElementById("app-favicon-fallback")
      ?.setAttribute(
        "href",
        `/brand/little-hint/favicons/favicon-${dark ? "dark" : "color"}.ico`,
      );
    localStorage.setItem("little-hint:theme", theme);
  }, [theme, dark]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (query.data)
      localStorage.setItem("little-hint:last-account", query.data.me.id);
  }, [query.data?.me.id]);
  useEffect(() => {
    if (!query.data) return;
    const main = document.getElementById("main");
    const heading = main?.querySelector<HTMLElement>("h1");
    document.title = `${heading?.textContent ?? "Little Hint"} · Little Hint`;
    main?.focus({ preventScroll: true });
  }, [location.pathname, location.search, !!query.data]);
  const mutate = async <T = any,>(path: string, body: unknown): Promise<T> => {
    if (!navigator.onLine)
      throw new Error("Go online to complete this action.");
    const result = await api<T>(path, body);
    if (["items", "reservations"].includes(path) && !(result as any)?.duplicate)
      localStorage.setItem("little-hint:engaged", "yes");
    await client.invalidateQueries({ queryKey: ["world"] });
    return result;
  };
  if (!online && query.data === undefined)
    return (
      <>
        <OfflineDrafts dark={dark} />
        <UpdateNotice />
      </>
    );
  if (query.isPending)
    return (
      <div
        className="loading-screen"
        role="status"
        aria-label="Loading Little Hint"
      >
        <Logo dark={dark} />
        <LoaderCircle className="spin" aria-label="Loading Little Hint" />
      </div>
    );
  if (query.data === null)
    return (
      <>
        <Login
          dark={dark}
          online={online}
          onSuccess={() => client.resetQueries({ queryKey: ["world"] })}
        />
        <UpdateNotice />
      </>
    );
  if (!query.data)
    return (
      <div className="loading-screen">
        <Logo dark={dark} />
        <h1>We couldn’t open Little Hint.</h1>
        <p>{actionError(query.error)}</p>
        <button className="button" onClick={() => query.refetch()}>
          Try again
        </button>
      </div>
    );
  const world = query.data;
  return (
    <AppContext.Provider
      value={{
        world,
        mutate,
        open: (title, body) => setModal({ title, body }),
        close: () => setModal(null),
        toast: setMessage,
        dark,
      }}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="app-shell">
        <aside className="sidebar">
          <Link to="/" className="brand-link" aria-label="Little Hint home">
            <Logo dark={dark} />
          </Link>
          <nav aria-label="Main navigation">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  isActive ||
                  (to === "/lists" && location.pathname.startsWith("/events/"))
                    ? "active"
                    : undefined
                }
              >
                <Icon size={21} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-note">
            <img
              src={`/brand/little-hint/symbols/little-hint-tag-${dark ? "dark" : "color"}.svg`}
              width="31"
              height="36"
              alt=""
            />
            <p>
              A little hint.
              <br />A thoughtful gift.
            </p>
          </div>
          <NavLink className="settings-link" to="/settings">
            <Avatar name={world.me.name} small />
            <span>
              {world.me.name.split(" ")[0]}
              <small>Settings & your family groups</small>
            </span>
            <Settings size={18} />
          </NavLink>
        </aside>
        <div className="main-wrap">
          <header className="topbar">
            <Link to="/" className="mobile-brand">
              <Logo dark={dark} />
            </Link>
            <span className="topbar-message">
              Gift ideas, shared thoughtfully.
            </span>
            <div className="actions">
              <button
                className="icon-button"
                aria-label={
                  dark ? "Switch to light theme" : "Switch to dark theme"
                }
                onClick={() => setTheme(dark ? "light" : "dark")}
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <Link
                className="mobile-settings icon-button"
                to="/settings"
                aria-label="Settings"
              >
                <Settings size={20} />
              </Link>
              <button
                aria-label="Add item"
                className="button small"
                onClick={() =>
                  world.lists.some((l) => l.canEdit && !l.archived)
                    ? setModal({
                        title: "Add item",
                        body: <GiftForm />,
                      })
                    : setModal({
                        title: "Your first wish list",
                        body: <ListForm />,
                      })
                }
              >
                <Plus size={18} />
                <span>Add item</span>
              </button>
            </div>
          </header>
          {!online && (
            <div className="offline-banner">
              <WifiOff size={17} />
              You are offline. Lists and gift plans may have changed. Reconnect
              to reserve gifts, update purchases, or save changes.
            </div>
          )}
          {(world.environment === "staging" ||
            world.me.email.endsWith("@example.test")) && (
            <div className="demo-banner">
              {world.environment === "staging"
                ? "Test version · Sample data · Emails go to a test inbox"
                : "Demo version · Sample data"}
            </div>
          )}
          <main id="main" tabIndex={-1}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/people" element={<People />} />
              <Route path="/people/:id" element={<PersonPage />} />
              <Route path="/lists" element={<Lists />} />
              <Route path="/lists/:id" element={<Lists />} />
              <Route path="/events/:id" element={<EventPage />} />
              <Route path="/gift/:id" element={<GiftDetail />} />
              <Route path="/buying" element={<Buying />} />
              <Route path="/exchanges" element={<Exchanges />} />
              <Route
                path="/settings"
                element={<SettingsPage theme={theme} setTheme={setTheme} />}
              />
              <Route path="/invite/:id" element={<Invitations />} />
              <Route
                path="*"
                element={
                  <Empty
                    title="This page isn’t here"
                    action={
                      <Link className="button" to="/">
                        Back home
                      </Link>
                    }
                  >
                    Try opening the link again or return to your lists.
                  </Empty>
                }
              />
            </Routes>
          </main>
          <footer className="app-footer">
            <span>Little Hint</span>
            <span>Made for the people you know best.</span>
          </footer>
        </div>
        <MobileNavigation>
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                isActive ||
                (to === "/lists" && location.pathname.startsWith("/events/"))
                  ? "active"
                  : undefined
              }
            >
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
        </MobileNavigation>
      </div>
      {modal && (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          {modal.body}
        </Modal>
      )}
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          {message}
        </div>
      )}
      <UpdateNotice />
    </AppContext.Provider>
  );
}
function OfflineDrafts({ dark }: { dark: boolean }) {
  const account = localStorage.getItem("little-hint:last-account");
  const enabled =
    account && localStorage.getItem(`little-hint:draft-optin:${account}`);
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);
  return (
    <div className="offline-page">
      <Logo dark={dark} />
      <h1>A little pause.</h1>
      <p>
        You’re offline. Shared lists and buying details are available when you
        reconnect.
      </p>
      {enabled ? (
        <Form
          submit="Save personal draft"
          allowOffline
          resetOnSuccess
          onSubmit={async (f) => {
            saveDraft(account!, {
              title: value(f, "title"),
              url: value(f, "url"),
              description: value(f, "description"),
            });
            setSaved(true);
          }}
        >
          <h2>Keep a thought for later</h2>
          <Field label="Item name">
            <input name="title" required />
          </Field>
          <Field label="Product link">
            <input name="url" type="url" />
          </Field>
          <Field label="Notes">
            <textarea name="description" />
          </Field>
          {saved && (
            <p role="status">
              Saved on this device. Sign in online to review and add it.
            </p>
          )}
        </Form>
      ) : (
        <p>
          Turn on personal drafts in Settings while online to save items for
          your own wish lists here.
        </p>
      )}
      <button className="button secondary" onClick={() => location.reload()}>
        Try connecting again
      </button>
      <button className="text-button" onClick={() => setClearing(true)}>
        Clear personal data on this device
      </button>
      {clearing && (
        <Modal title="Clear this device?" onClose={() => setClearing(false)}>
          <p>
            This deletes personal drafts saved on this device. Your account and
            saved wish lists are kept.
          </p>
          <div className="actions">
            <button
              className="button secondary"
              onClick={() => setClearing(false)}
            >
              Keep personal data
            </button>
            <button
              className="button"
              onClick={() => {
                clearPersonalData();
                location.reload();
              }}
            >
              Delete saved drafts
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Invitations() {
  const { world, mutate, toast } = useApp();
  const { id } = useParams();
  const mine = world.invitations.filter(
    (i) => i.email === world.me.email.toLowerCase() && (!id || i.id === id),
  );
  return (
    <section className="invitations">
      {id && <h1>Family group invitation</h1>}
      {mine.length ? (
        mine.map((i) => (
          <div className="invitation" key={i.id}>
            <Mail size={22} />
            <div>
              <h3>Join {i.groupName ?? "your family group"}</h3>
              <p>
                {i.inviterName ? `${i.inviterName} invited you. ` : ""}Accept to
                see lists shared with this family group.
              </p>
              <p className="muted">
                For {i.email} · Expires{" "}
                {new Date(i.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <Action
              onClick={async () => {
                await mutate("invitations/accept", { id: i.id });
                toast("You’re in. Welcome to the family group.");
              }}
            >
              Accept invitation
            </Action>
          </div>
        ))
      ) : (
        <div>
          <p>No pending invitations for {world.me.email}.</p>
          <p>
            This invitation may have expired, been accepted, or be for another
            email. Ask the inviter for a new invitation, or sign out in Settings
            and use the invited email.
          </p>
          <Link className="button secondary" to="/settings">
            Open Settings
          </Link>
        </div>
      )}
    </section>
  );
}
function Action({
  onClick,
  children,
  secondary = false,
  label,
}: {
  label?: string;
  onClick: () => Promise<unknown>;
  children: ReactNode;
  secondary?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const online = useOnline();
  return (
    <span className="action-wrap">
      <button
        className={`button small ${secondary ? "secondary" : ""}`}
        type="button"
        aria-label={label}
        title={!online ? "Reconnect to complete this action" : undefined}
        disabled={busy || !online}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onClick();
          } catch (e) {
            setError(actionError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <LoaderCircle size={16} className="spin" /> : null}
        {children}
      </button>
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </span>
  );
}
function Browser({
  items,
  emptyTitle = "No items to show yet",
  emptyText = "Add an item to your wish list, or ask your people to share theirs.",
  emptyAction,
  searchLabel = "Search items and gift ideas",
}: {
  items: GiftView[];
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: ReactNode;
  searchLabel?: string;
}) {
  const [search, setSearch] = useState(""),
    [tag, setTag] = useState(""),
    [available, setAvailable] = useState(false);
  const showAvailability = items.some((item) => item.available !== undefined);
  const tags = [...new Set(items.flatMap((i) => i.tags))].sort();
  const filtered = items.filter(
    (i) =>
      `${i.title} ${i.recipientNames.join(" ")} ${i.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!tag || i.tags.includes(tag)) &&
      (!showAvailability ||
        !available ||
        (i.available !== undefined && i.available > 0)),
  );
  return (
    <>
      <div className="filters">
        <label className="search">
          <Search size={18} />
          <input
            aria-label={searchLabel}
            placeholder="Search by name, person, or tag"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter by tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        {showAvailability && (
          <label className="check filter-check">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            Available to give
          </label>
        )}
      </div>
      {filtered.length ? (
        <div className="gift-grid">
          {filtered.map((i) => (
            <GiftCard key={i.id} gift={i} />
          ))}
        </div>
      ) : (
        <Empty
          title={items.length ? "No matches found" : emptyTitle}
          action={
            items.length ? (
              <button
                className="button secondary"
                onClick={() => {
                  setSearch("");
                  setTag("");
                  setAvailable(false);
                }}
              >
                Clear filters
              </button>
            ) : (
              emptyAction
            )
          }
        >
          {items.length
            ? "Try another search, or clear your filters to see everything."
            : emptyText}
        </Empty>
      )}
    </>
  );
}
function Home() {
  const { world, open } = useApp();
  const incoming = world.invitations.some(
    (i) => i.email === world.me.email.toLowerCase(),
  );
  const others = world.items.filter((i) => !i.archived && !i.isRecipient);
  return (
    <>
      <Header
        title={`Hi, ${world.me.name.split(" ")[0]}.`}
        description="A few hints from your favorite people."
      />
      <Install />
      {incoming && <Invitations />}
      <div className="home-intro">
        <div>
          <h2>
            {!world.groups.length
              ? "Start with your people"
              : others.length
                ? "From your people"
                : "Your wish lists"}
          </h2>
          <p>
            {!world.groups.length
              ? "Create a family group to share wishes and plan gifts together."
              : others.length
                ? "A few things they’ve been wishing for."
                : "A little hint about what you would love."}
          </p>
        </div>
        <Link className="text-button" to="/people">
          View your people <ArrowRight size={16} />
        </Link>
      </div>
      {!world.groups.length ? (
        <Empty
          title="Good gifts start with your people"
          action={
            <button
              className="button"
              onClick={() => open("Create a family group", <GroupForm />)}
            >
              <Plus size={17} />
              Create a family group
            </button>
          }
        >
          Bring your family or friends together in a private family group, then
          share your first wish list.
        </Empty>
      ) : (
        <Browser
          items={
            others.length ? others : world.items.filter((i) => !i.archived)
          }
        />
      )}
    </>
  );
}
function People() {
  const { world, open } = useApp();
  return (
    <>
      <Header
        title="Your people"
        description="Take a hint from their wish lists, or save an idea for them."
      >
        <button
          className="button secondary"
          onClick={() => open("A profile you manage", <PersonForm />)}
        >
          <Plus size={17} />
          Managed profile
        </button>
      </Header>
      <p className="notice">
        Invite adults who manage their own wishes from{" "}
        <Link to="/settings?section=groups&view=members">
          family-group invitations
        </Link>
        . Create a managed profile for someone whose wishes you’ll look after.
      </p>
      <div className="people-list">
        {world.people.map((p) => (
          <Link className="person-row" key={p.id} to={`/people/${p.id}`}>
            <Avatar name={p.name} />
            <div>
              <h2>{p.name}</h2>
              <p>
                {p.userId === world.me.id
                  ? "Your wish lists"
                  : p.guardians.includes(world.me.id)
                    ? "Managed by you"
                    : "Wishes & gift ideas"}
              </p>
            </div>
            <ArrowRight size={19} />
          </Link>
        ))}
      </div>
    </>
  );
}
function PersonPage() {
  const { id } = useParams();
  const { world, open } = useApp();
  const [tab, setTab] = useState("wishes");
  const person = world.people.find((p) => p.id === id);
  if (!person)
    return (
      <Empty
        title="Person not found"
        action={
          <Link className="button secondary" to="/people">
            Back to your people
          </Link>
        }
      >
        This profile may no longer be shared with you.
      </Empty>
    );
  const own =
    person.userId === world.me.id || person.guardians.includes(world.me.id);
  return (
    <>
      <Link className="back-link" to="/people">
        <ArrowLeft size={16} />
        Your people
      </Link>
      <Header
        title={person.name}
        description={
          own
            ? person.userId === world.me.id
              ? "Help your people choose something you would love."
              : `Manage wish lists for ${person.name}.`
            : `A few hints about what ${person.name} would love.`
        }
      >
        {own ? (
          <button
            className="button secondary"
            onClick={() => open("Edit profile", <PersonForm id={id} />)}
          >
            Edit profile
          </button>
        ) : (
          <button
            className="button"
            onClick={() =>
              open(
                `Gift idea for ${person.name}`,
                <GiftForm recipientId={id} />,
              )
            }
          >
            <Plus size={17} />
            Add gift idea
          </button>
        )}
      </Header>
      <div
        className="tabs"
        role="tablist"
        aria-label="Items and gift ideas"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? "wishes"
              : event.key === "End"
                ? "ideas"
                : tab === "wishes"
                  ? "ideas"
                  : "wishes";
          setTab(next);
          document.getElementById(`person-tab-${next}`)?.focus();
        }}
      >
        {["wishes", "ideas"].map((key) => (
          <button
            key={key}
            id={`person-tab-${key}`}
            role="tab"
            aria-controls="person-gifts"
            tabIndex={tab === key ? 0 : -1}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {key === "ideas"
              ? `Gift ideas for ${person.name.split(" ")[0]}`
              : person.userId === world.me.id
                ? "On my wish lists"
                : "On their wish lists"}
          </button>
        ))}
      </div>
      <div
        id="person-gifts"
        role="tabpanel"
        aria-labelledby={`person-tab-${tab}`}
        tabIndex={0}
      >
        <Browser
          key={`${id}-${tab}`}
          searchLabel={tab === "ideas" ? "Search gift ideas" : "Search items"}
          emptyTitle={
            tab === "ideas"
              ? `No gift ideas for ${person.name} yet`
              : "No wish-list items shared yet"
          }
          emptyText={
            tab === "ideas"
              ? "Save an idea here and choose who can see it."
              : own
                ? "Add an item to a wish list to get started."
                : "Ask them to share a wish list with your family group."
          }
          emptyAction={
            tab === "ideas" && !own ? (
              <button
                className="button"
                onClick={() =>
                  open(
                    `Gift idea for ${person.name}`,
                    <GiftForm recipientId={id} />,
                  )
                }
              >
                Add gift idea
              </button>
            ) : undefined
          }
          items={world.items.filter(
            (i) =>
              !i.archived &&
              i.recipientIds.includes(id!) &&
              (tab === "wishes" ? !!i.listId : !i.listId),
          )}
        />
      </div>
    </>
  );
}
function Lists() {
  const { id } = useParams();
  const { world, open, mutate } = useApp();
  const [showArchived, setShowArchived] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  useEffect(() => setShowSummary(false), [id]);
  const mine = world.lists.filter(
    (l) => l.canEdit && l.archived === showArchived,
  );
  const list = world.lists.find((l) => l.id === id);
  const pending = world.lists.filter((l) =>
    l.pendingOwnerIds.some((id) =>
      world.people.some(
        (p) =>
          p.id === id &&
          (p.userId === world.me.id || p.guardians.includes(world.me.id)),
      ),
    ),
  );
  if (id && !list)
    return (
      <Empty
        title="List not found"
        action={
          <Link className="button secondary" to="/lists">
            Back to my lists
          </Link>
        }
      >
        This list may no longer be shared with you.
      </Empty>
    );
  if (list)
    return (
      <>
        <Link
          className="back-link"
          to={list.canEdit ? "/lists" : `/people/${list.ownerIds[0]}`}
        >
          <ArrowLeft size={16} />
          {list.canEdit
            ? "My lists"
            : (world.people.find((p) => p.id === list.ownerIds[0])?.name ??
              "On their wish lists")}
        </Link>
        <Header title={list.name} description={list.description}>
          <Privacy mode={list.mode} />
          {list.canManageSettings && (
            <>
              <button
                className="button secondary"
                onClick={() => open("List settings", <ListForm list={list} />)}
              >
                List settings
              </button>
              <Action
                secondary
                onClick={() =>
                  mutate("lists/update", {
                    ...list,
                    archived: !list.archived,
                    ...(list.archived ? { archiveAfter: null } : {}),
                  })
                }
              >
                {list.archived ? "Restore list" : "Archive list"}
              </Action>
            </>
          )}
          {list.canEdit && (
            <>
              {!list.archived && (
                <button
                  className="button"
                  onClick={() =>
                    open("Add item", <GiftForm listId={list.id} />)
                  }
                >
                  <Plus size={17} />
                  Add item
                </button>
              )}
            </>
          )}
        </Header>
        {list.archived && (
          <p className="notice">
            This list is archived. Existing purchase history is preserved.
          </p>
        )}
        {list.groupEventId && <ManagedEventNotice list={list} />}
        <RevealPolicy list={list} />
        {list.canEdit && list.revealAvailable && (
          <div className="tabs" role="group" aria-label="List view">
            <button
              aria-pressed={!showSummary}
              onClick={() => setShowSummary(false)}
            >
              Items
            </button>
            <button
              aria-pressed={showSummary}
              onClick={() => setShowSummary(true)}
            >
              Gift summary
            </button>
          </div>
        )}
        {showSummary && list.canEdit && list.revealAvailable ? (
          <GiftSummaryPanel listId={list.id} />
        ) : (
          <Browser
            items={world.items.filter((i) => i.listId === list.id)}
            searchLabel="Search items"
            emptyTitle={
              list.canEdit && !list.archived
                ? "Something in mind?"
                : "No items yet"
            }
            emptyText={
              list.archived
                ? "This archived wish list has no items."
                : list.canEdit
                  ? "Add your first item to this wish list."
                  : "Check back when they have added a few hints."
            }
          />
        )}
      </>
    );
  return (
    <>
      <Header
        title="Your wish lists"
        description="A little hint about what you’d love."
      >
        {(mine.length > 0 || showArchived) && (
          <button
            className="button"
            onClick={() => open("A new wish list", <ListForm />)}
          >
            <Plus size={17} />
            Create a list
          </button>
        )}
      </Header>
      <div className="tabs" role="group" aria-label="List status">
        <button
          aria-pressed={!showArchived}
          onClick={() => setShowArchived(false)}
        >
          Active
        </button>
        <button
          aria-pressed={showArchived}
          onClick={() => setShowArchived(true)}
        >
          Archived
        </button>
      </div>
      <GroupEventsSection archived={showArchived} />
      {!!world.groups.length && <h2>Your lists</h2>}
      {pending
        .filter((l) => l.archived === showArchived)
        .map((l) => (
          <div className="invitation" key={l.id}>
            <p>You are invited to share ownership of “{l.name}”.</p>
            <Action onClick={() => mutate("lists/accept", { id: l.id })}>
              Accept shared ownership
            </Action>
          </div>
        ))}
      {mine.length ? (
        <div className="list-index">
          {mine.map((l) => (
            <Link to={`/lists/${l.id}`} key={l.id} className="list-row">
              <span className="list-symbol">
                <ListChecks size={24} />
              </span>
              <div>
                <h2>{l.name}</h2>
                {l.groupEventId && (
                  <p>
                    For{" "}
                    {l.ownerIds
                      .map(
                        (id) =>
                          world.people.find((p) => p.id === id)?.name ??
                          "Recipient",
                      )
                      .join(", ")}
                  </p>
                )}
                <p>
                  {l.archived
                    ? "Archived"
                    : l.groupIds.length
                      ? l.groupIds
                          .map(
                            (id) =>
                              world.groups.find((g) => g.id === id)?.name ??
                              "Shared family group",
                          )
                          .join(" · ")
                      : "Only you for now"}
                </p>
              </div>
              <Privacy mode={l.mode} />
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
      ) : showArchived ? (
        <Empty title="No archived lists">
          Finished occasions can go here. Restore a list whenever you need it.
        </Empty>
      ) : (
        <Empty
          title="Start your first wish list"
          action={
            <button
              className="button"
              onClick={() => open("Your first wish list", <ListForm />)}
            >
              Create a list
            </button>
          }
        >
          Create a wish list, then add a few things you would love.
        </Empty>
      )}
    </>
  );
}
function GiftDetail() {
  const { id } = useParams();
  const { world, open, mutate, toast, close } = useApp();
  const gift = world.items.find((i) => i.id === id);
  const [quantity, setQuantity] = useState(1),
    [exchange, setExchange] = useState("");
  if (!gift)
    return (
      <Empty
        title="Item not found"
        action={
          <Link className="button secondary" to="/">
            Browse wish lists
          </Link>
        }
      >
        It may no longer be shared with you.
      </Empty>
    );
  const choices = world.exchanges.flatMap((e) =>
    e.status === "drawn"
      ? e.myAssignments
          .filter(([, r]) => gift.recipientIds.includes(r))
          .map(([g]) => ({
            key: `${e.id}:${g}`,
            label: e.name,
            id: e.id,
            giver: g,
          }))
      : [],
  );
  return (
    <>
      <Link
        className="back-link"
        to={gift.listId ? `/lists/${gift.listId}` : "/"}
      >
        <ArrowLeft size={16} />
        {gift.listId ? "Back to wish list" : "Back to Home"}
      </Link>
      <div className="gift-detail">
        <GiftPhoto gift={gift} />
        <section>
          <div className="gift-recipient">
            <Avatar name={gift.recipientNames[0]} small />
            <span>For {gift.recipientNames.join(" & ")}</span>
          </div>
          <h1>{gift.title}</h1>
          <p className="status">
            {gift.archived
              ? "Archived"
              : gift.isRecipient
                ? gift.mode === "surprise"
                  ? "On your list · Buying plans stay a surprise"
                  : "On your list · You can see the gift plans"
                : gift.available
                  ? `${gift.available} available to reserve`
                  : "Taken care of"}
          </p>
          <p className="detail-price">{dollars(gift.priceCents)}</p>
          {gift.description && (
            <p className="description">{gift.description}</p>
          )}
          {gift.tags.length > 0 && (
            <div className="tags">
              {gift.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
          <p className="muted">
            Quantity wanted: {gift.quantity}
            {gift.importedAt && (
              <>
                {" "}
                · Price checked {new Date(gift.importedAt).toLocaleDateString()}
              </>
            )}
          </p>
          {gift.url && (
            <a
              className="button secondary"
              href={gift.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit shop <ExternalLink size={16} />
            </a>
          )}
          {gift.canEdit && (
            <button
              className="text-button"
              onClick={() =>
                open(
                  gift.listId ? "Edit item" : "Edit gift idea",
                  <GiftForm gift={gift} />,
                )
              }
            >
              {gift.listId ? "Edit item" : "Edit gift idea"}
            </button>
          )}
          {gift.archived ? (
            <p className="notice">
              {gift.listId
                ? "This item is archived."
                : "This gift idea is archived."}
            </p>
          ) : gift.isRecipient ? (
            <p className="privacy-note">
              <LockKeyhole size={18} />
              {gift.mode === "surprise"
                ? "The rest is a surprise. Your people will take it from here."
                : "You can see who is reserving and buying this gift below."}
            </p>
          ) : (
            <div className="reserve-panel">
              <h2>{gift.available ? "Make their day" : "Taken care of"}</h2>
              {gift.listId && world.lists.find((l) => l.id === gift.listId) && (
                <RevealPolicy
                  list={world.lists.find((l) => l.id === gift.listId)!}
                />
              )}
              <p>
                {gift.available
                  ? `${gift.available} available to reserve. Let your people know you have this one covered.`
                  : "All requested items have been reserved."}
              </p>
              {!!gift.available && (
                <>
                  <div className="form-row">
                    <Field label="Quantity">
                      <input
                        type="number"
                        min="1"
                        max={gift.available}
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </Field>
                    {choices.length > 0 && (
                      <Field label="Buying for">
                        <select
                          value={exchange}
                          onChange={(e) => setExchange(e.target.value)}
                        >
                          <option value="">Not part of an exchange</option>
                          {choices.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </div>
                  <Action
                    onClick={async () => {
                      const c = choices.find((c) => c.key === exchange);
                      await mutate("reservations", {
                        itemId: gift.id,
                        quantity,
                        exchangeId: c?.id,
                        giverId: c?.giver,
                      });
                      toast(
                        "Gift reserved. Open Buying to mark it as purchased or cancel your reservation.",
                      );
                    }}
                  >
                    <ShoppingBag size={16} />
                    Reserve gift
                  </Action>
                </>
              )}
            </div>
          )}
        </section>
      </div>
      {gift.reservations && gift.reservations.length > 0 && (
        <section className="detail-section">
          <h2>Gift plans</h2>
          {gift.reservations.map((r) => (
            <div className="reservation-row" key={r.id}>
              <Avatar name={r.buyerName} small />
              <div>
                <strong>
                  {r.buyerName}
                  {r.mine ? " · You" : ""}
                </strong>
                <p>
                  {r.quantity} reserved
                  {r.purchased !== undefined
                    ? ` · ${r.purchased} purchased`
                    : ""}
                </p>
                {r.reservedAt && (
                  <p className="muted">
                    Reserved {new Date(r.reservedAt).toLocaleString()}
                    {r.purchasedAt &&
                      ` · Purchase updated ${new Date(r.purchasedAt).toLocaleString()}`}
                  </p>
                )}
                {r.poolTargetCents && (
                  <p>
                    Contribution goal {dollars(r.poolTargetCents)} ·{" "}
                    {dollars(
                      (r.contributions ?? [])
                        .filter((c) => c.status !== "cancelled")
                        .reduce((n, c) => n + c.amountCents, 0),
                    )}{" "}
                    pledged
                  </p>
                )}
              </div>
              {r.mine ? (
                <Link to="/buying" className="text-button">
                  Manage
                </Link>
              ) : r.poolTargetCents && !gift.isRecipient && !gift.archived ? (
                <button
                  className="button secondary small"
                  onClick={() =>
                    open(
                      "Contribute to this gift",
                      <Form
                        submit="Save contribution"
                        onSubmit={async (f) => {
                          await mutate("contributions", {
                            reservationId: r.id,
                            amountCents: Math.round(
                              Number(value(f, "amount")) * 100,
                            ),
                          });
                          toast(
                            "Contribution saved. Send your payment to the person buying the gift.",
                          );
                          close();
                        }}
                      >
                        <p>
                          <strong>{gift.title}</strong> · For{" "}
                          {gift.recipientNames.join(" & ")} · Person buying the
                          gift: {r.buyerName}
                        </p>
                        <Field label="Contribution in USD">
                          <input
                            name="amount"
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                          />
                        </Field>
                        <p>
                          Little Hint does not send money. Pay the person buying
                          the gift separately, then mark your contribution as
                          sent.
                        </p>
                      </Form>,
                    )
                  }
                >
                  Contribute
                </button>
              ) : null}
            </div>
          ))}
        </section>
      )}
      {gift.comments && (
        <section className="detail-section discussion">
          <h2>
            <MessageCircle size={21} />
            Private notes
          </h2>
          <p className="muted">
            The recipient cannot see this conversation. Notes from an exchange
            giver are visible only to that giver and anyone managing their
            profile.
          </p>
          {gift.comments.length ? (
            gift.comments.map((c) => (
              <div className="comment" key={c.id}>
                <Avatar name={c.author} small />
                <div>
                  <strong>{c.author}</strong>
                  <small>{new Date(c.createdAt).toLocaleDateString()}</small>
                  <p>{c.body}</p>
                </div>
              </div>
            ))
          ) : (
            <p>No notes yet. Sizes, plans, and helpful details go here.</p>
          )}
          {!gift.archived && (
            <Form
              submit="Add private note"
              resetOnSuccess
              onSubmit={async (f) => {
                await mutate("comments", {
                  itemId: gift.id,
                  body: value(f, "body"),
                });
                toast("Private note added.");
              }}
            >
              <Field label="Your note">
                <textarea name="body" required maxLength={4000} rows={2} />
              </Field>
            </Form>
          )}
        </section>
      )}
    </>
  );
}
function Buying() {
  const { world, open, mutate, toast, close } = useApp();
  const contributions = world.contributionHistory;
  return (
    <>
      <Header
        title="Your gift plans"
        description="Keep track of gifts you’re buying and helping pay for."
      />
      {world.buying.some((r) => r.quantity > 0) ? (
        <div className="buying-list">
          {world.buying
            .filter((r) => r.quantity > 0)
            .map((r) => (
              <div className="buying-row" key={r.id}>
                {r.item ? (
                  <Link
                    to={`/gift/${r.item.id}`}
                    aria-label={`View ${r.titleSnapshot}`}
                  >
                    <GiftPhoto gift={r.item} />
                  </Link>
                ) : (
                  <Gift size={36} />
                )}
                <div>
                  <h2>{r.titleSnapshot}</h2>
                  <p>
                    {r.item
                      ? `For ${r.item.recipientNames.join(" & ")}`
                      : "Access to the original gift has changed."}
                  </p>
                  <span className="status">
                    {r.purchased === r.quantity
                      ? "Purchased"
                      : r.purchased
                        ? `${r.purchased} of ${r.quantity} purchased`
                        : "Reserved"}
                  </span>
                  {r.exchangeId && (
                    <p className="muted">Secret gift exchange</p>
                  )}
                </div>
                <div className="actions">
                  {r.quantity === 1 && r.purchased === 0 && (
                    <Action
                      secondary
                      onClick={async () => {
                        await mutate("reservations/update", {
                          id: r.id,
                          revision: r.revision,
                          quantity: 1,
                          purchased: 1,
                        });
                        toast(
                          "Marked as purchased. Use Update purchase if your plans change.",
                        );
                      }}
                      label={`Mark ${r.titleSnapshot} as purchased`}
                    >
                      Mark as purchased
                    </Action>
                  )}
                  <button
                    className="button secondary small"
                    onClick={() =>
                      open(
                        "Update purchase",
                        <Form
                          submit="Save purchase status"
                          onSubmit={async (f) => {
                            await mutate("reservations/update", {
                              id: r.id,
                              revision: r.revision,
                              quantity: r.quantity,
                              purchased: Number(value(f, "purchased")),
                            });
                            close();
                            toast("Purchase status updated.");
                          }}
                        >
                          <p>
                            <strong>{r.titleSnapshot}</strong>
                            {r.item
                              ? ` · For ${r.item.recipientNames.join(" & ")}`
                              : ""}
                          </p>
                          <Field label="Quantity purchased">
                            <input
                              name="purchased"
                              type="number"
                              min="0"
                              max={r.quantity}
                              defaultValue={r.purchased}
                              required
                            />
                          </Field>
                          <p>
                            Mark what you have bought so others know it is
                            covered. If your plans change, choose Cancel
                            reservation.
                          </p>
                        </Form>,
                      )
                    }
                  >
                    Update purchase
                  </button>
                  {!r.exchangeId && r.item && !r.item.archived && (
                    <button
                      className="text-button"
                      onClick={() =>
                        open(
                          "Share the cost",
                          <Form
                            submit="Save contribution goal"
                            onSubmit={async (f) => {
                              await mutate("reservations/update", {
                                id: r.id,
                                revision: r.revision,
                                quantity: r.quantity,
                                purchased: r.purchased,
                                poolTargetCents: Math.round(
                                  Number(value(f, "amount")) * 100,
                                ),
                              });
                              close();
                            }}
                          >
                            <p>
                              <strong>{r.titleSnapshot}</strong>
                              {r.item
                                ? ` · For ${r.item.recipientNames.join(" & ")}`
                                : ""}
                            </p>
                            <Field label="Target amount in USD">
                              <input
                                name="amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                required
                                defaultValue={
                                  r.poolTargetCents
                                    ? r.poolTargetCents / 100
                                    : ""
                                }
                              />
                            </Field>
                            <p>
                              You buy the gift and confirm when you receive each
                              contribution. Little Hint does not collect or send
                              money.
                            </p>
                          </Form>,
                        )
                      }
                    >
                      {r.poolTargetCents
                        ? "Edit contribution goal"
                        : "Share the cost"}
                    </button>
                  )}
                  <button
                    className="text-button muted"
                    onClick={() =>
                      open(
                        "Cancel reservation",
                        <Form
                          submit="Cancel selected quantity"
                          onSubmit={async (f) => {
                            const release = Number(value(f, "release"));
                            const qty = r.quantity - release;
                            await mutate("reservations/update", {
                              id: r.id,
                              revision: r.revision,
                              quantity: qty,
                              purchased: Math.min(r.purchased, qty),
                            });
                            close();
                          }}
                        >
                          <p>
                            <strong>{r.titleSnapshot}</strong>
                            {r.item
                              ? ` · For ${r.item.recipientNames.join(" & ")}`
                              : ""}
                          </p>
                          <Field label="Quantity to cancel">
                            <input
                              name="release"
                              type="number"
                              min="1"
                              max={r.quantity}
                              defaultValue={r.quantity}
                              required
                            />
                          </Field>
                          <p>
                            The quantity you cancel becomes available for others
                            to reserve. This also reduces the quantity marked as
                            purchased if it is higher than your remaining
                            reservation. It does not cancel a shop order or
                            refund a payment.
                          </p>
                        </Form>,
                      )
                    }
                  >
                    Cancel reservation
                  </button>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <Empty
          title="No gift plans yet"
          action={
            <Link className="button" to="/people">
              View wish lists <ArrowRight size={16} />
            </Link>
          }
        >
          Reserve a gift from someone’s list and you’ll find it here.
        </Empty>
      )}
      {world.buying.some((r) => !r.quantity) && (
        <details className="detail-section">
          <summary>Cancelled reservations</summary>
          {world.buying
            .filter((r) => !r.quantity)
            .map((r) => (
              <div className="reservation-row" key={r.id}>
                <div>
                  <strong>{r.titleSnapshot}</strong>
                  <p>
                    Cancelled · first reserved{" "}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
        </details>
      )}
      {contributions.length > 0 && (
        <section className="detail-section">
          <h2>Contributions</h2>
          {contributions.map(
            ({
              contribution: c,
              purchaser,
              title,
              contributorName,
              purchaserName,
            }) => (
              <div className="reservation-row" key={c.id}>
                <div>
                  <strong>{title}</strong>
                  <p>
                    {contributorName} contributing to {purchaserName}'s purchase
                  </p>
                  <p>
                    {dollars(c.amountCents)} · {contributionStatus[c.status]}
                    {c.userId === world.me.id ? " · Your contribution" : ""}
                  </p>
                </div>
                {c.status === "pledged" && c.userId === world.me.id && (
                  <>
                    <Action
                      onClick={() =>
                        mutate("contributions/update", {
                          id: c.id,
                          revision: c.revision,
                          status: "sent",
                        })
                      }
                    >
                      Mark as sent
                    </Action>
                    <Action
                      secondary
                      onClick={() =>
                        mutate("contributions/update", {
                          id: c.id,
                          revision: c.revision,
                          status: "cancelled",
                        })
                      }
                    >
                      Cancel contribution
                    </Action>
                  </>
                )}
                {c.status === "sent" && purchaser && (
                  <Action
                    onClick={() =>
                      mutate("contributions/update", {
                        id: c.id,
                        revision: c.revision,
                        status: "received",
                      })
                    }
                  >
                    Confirm {contributorName}'s {dollars(c.amountCents)}{" "}
                    received
                  </Action>
                )}
              </div>
            ),
          )}
        </section>
      )}
    </>
  );
}
function Exchanges() {
  const { world, open, mutate, toast, close } = useApp();
  return (
    <>
      <Header
        title="Gift exchanges"
        description="Draw names and give them something to smile about."
      >
        <button
          className="button"
          disabled={!world.groups.length}
          onClick={() => open("Secret gift exchange", <ExchangeForm />)}
        >
          <Plus size={17} />
          Create exchange
        </button>
      </Header>
      {world.exchanges.length ? (
        <div className="exchange-list">
          {world.exchanges.map((e) => (
            <section className="exchange-panel" key={e.id}>
              <div className="section-heading">
                <div>
                  <h2>{e.name}</h2>
                  <p>
                    {e.participantIds.length} participants · Each person gives
                    to {e.count} {e.count === 1 ? "person" : "people"} and
                    receives from {e.count}
                  </p>
                </div>
                <span className="status">
                  {e.status === "drawn"
                    ? "Names drawn"
                    : e.status === "draft"
                      ? "Getting ready"
                      : "Cancelled"}
                </span>
              </div>
              {e.myAssignments.length > 0 && (
                <div className="assignments">
                  <h3>Who you’re giving to</h3>
                  {e.myAssignments.map(([g, r]) => (
                    <Link to={`/people/${r}`} key={`${g}:${r}`}>
                      <Avatar
                        name={
                          world.people.find((p) => p.id === r)?.name ??
                          "Recipient"
                        }
                        small
                      />
                      <span>
                        {world.people.find((p) => p.id === g)?.name} is giving
                        to{" "}
                        <strong>
                          {world.people.find((p) => p.id === r)?.name}
                        </strong>
                      </span>
                      <ArrowRight size={17} />
                    </Link>
                  ))}
                </div>
              )}
              {e.canManage && (
                <div className="actions">
                  {e.status === "draft" && (
                    <>
                      <ExchangeReview world={world} exchange={e} />
                      <button
                        className="button secondary"
                        onClick={() =>
                          open("Edit exchange", <ExchangeForm exchange={e} />)
                        }
                      >
                        Edit exchange
                      </button>
                      <button
                        className="button"
                        disabled={exchangeMissingLists(world, e).length > 0}
                        onClick={() =>
                          open(
                            "Review before drawing names",
                            <Form
                              submit="Draw names"
                              onSubmit={async () => {
                                await mutate("exchanges/draw", {
                                  id: e.id,
                                  revision: e.revision,
                                });
                                close();
                                toast(
                                  "Names drawn. Each person can see who they are giving to.",
                                );
                              }}
                            >
                              <ExchangeReview world={world} exchange={e} />
                              <p>
                                After drawing, you cannot change the people or
                                rules. Each giver will receive an update. Check
                                the details before you continue.
                              </p>
                            </Form>,
                          )
                        }
                      >
                        <Shuffle size={16} />
                        Draw names
                      </button>
                    </>
                  )}
                  {e.status !== "cancelled" && (
                    <button
                      className="text-button muted"
                      onClick={() =>
                        open(
                          "Cancel this exchange?",
                          <Confirm
                            onConfirm={() =>
                              mutate("exchanges/cancel", {
                                id: e.id,
                                revision: e.revision,
                              })
                            }
                            label="Cancel exchange"
                          >
                            People will no longer see who they drew. Purchase
                            history will be kept.
                          </Confirm>,
                        )
                      }
                    >
                      Cancel exchange
                    </button>
                  )}
                  {e.status === "drawn" && (
                    <p className="muted">
                      Updates: {e.delivery.sent} completed, {e.delivery.pending}{" "}
                      waiting, {e.delivery.failed} could not be sent.
                    </p>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <Empty
          title="Start a little surprise"
          action={
            !world.groups.length ? (
              <Link className="button" to="/settings?section=groups">
                Create or join a family group
              </Link>
            ) : undefined
          }
        >
          Create a family group, choose participants, and let Little Hint draw
          the names. It works any time of year.
        </Empty>
      )}
    </>
  );
}
function SettingsPage({
  theme,
  setTheme,
}: {
  theme: string;
  setTheme: (v: string) => void;
}) {
  const { world, open, mutate, close, toast } = useApp();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requestedSection = params.get("section");
  const section = settingsSections.some(
    (s) => s.id === requestedSection && (s.id !== "admin" || world.me.admin),
  )
    ? requestedSection!
    : "profile";
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [section]);
  const selectedGroup =
    world.groups.find((g) => g.id === params.get("group")) ?? world.groups[0];
  const groupView = ["members", "households", "events"].includes(
    params.get("view") ?? "",
  )
    ? params.get("view")!
    : "members";
  const groupDestination = (view: string) => {
    const next = new URLSearchParams(params);
    next.set("section", "groups");
    next.set("view", view);
    if (selectedGroup) next.set("group", selectedGroup.id);
    return `?${next}`;
  };
  const pendingGroupRequests =
    world.invitations.filter((i) => i.email === world.me.email.toLowerCase())
      .length + world.links.filter((l) => l.kind === "ownership").length;
  const [draftsEnabled, setDraftsEnabled] = useState(
    !!localStorage.getItem(`little-hint:draft-optin:${world.me.id}`),
  );
  const [drafts, setDrafts] = useState(getDrafts(world.me.id));
  useEffect(() => {
    const refresh = () => setDrafts(getDrafts(world.me.id));
    window.addEventListener("little-hint:drafts-changed", refresh);
    return () =>
      window.removeEventListener("little-hint:drafts-changed", refresh);
  }, [world.me.id]);
  const [deletedDraft, setDeletedDraft] = useState<
    ReturnType<typeof getDrafts>[number] | null
  >(null);
  const disableDrafts = () => {
    localStorage.removeItem(`little-hint:draft-optin:${world.me.id}`);
    localStorage.removeItem(draftKey(world.me.id));
    setDraftsEnabled(false);
    setDrafts([]);
    setDeletedDraft(null);
  };
  const mine = world.people.filter(
    (p) => p.userId === world.me.id || p.guardians.includes(world.me.id),
  );
  return (
    <>
      <Header
        title="Settings"
        description="Manage your account, family groups, and preferences."
      />
      <div className="settings-layout">
        <SettingsNavigation
          section={section}
          admin={world.me.admin}
          pendingRequests={pendingGroupRequests}
        />
        {/* Keep panels mounted so switching sections preserves unsaved form values. */}
        <div className="settings-content">
          {pendingGroupRequests > 0 && section !== "groups" && (
            <p className="notice">
              <Link to="?section=groups">
                Review {pendingGroupRequests} pending family-group{" "}
                {pendingGroupRequests === 1 ? "request" : "requests"}
              </Link>
            </p>
          )}
          <section
            className="settings-section"
            hidden={section !== "profile"}
            aria-labelledby="settings-profile-title"
          >
            <h2 id="settings-profile-title">Profile &amp; appearance</h2>
            <p>Edit your details and the profiles you manage.</p>
            {mine.map((p) => (
              <div className="setting-row" key={p.id}>
                <Avatar name={p.name} small />
                <div>
                  <strong>{p.name}</strong>
                  <p>{p.userId ? "Your account" : "Managed profile"}</p>
                </div>
                <button
                  className="text-button"
                  aria-label={`Edit profile for ${p.name}`}
                  onClick={() => open("Edit profile", <PersonForm id={p.id} />)}
                >
                  Edit
                </button>
                {!p.userId && (
                  <button
                    className="text-button"
                    onClick={() =>
                      open(
                        "Let them manage their profile",
                        <Form
                          submit="Invite to take over"
                          onSubmit={async (f) => {
                            await mutate("people/link", {
                              id: p.id,
                              email: value(f, "email"),
                            });
                            close();
                            toast(
                              "Invitation ready. They can accept it in Settings after signing in.",
                            );
                          }}
                        >
                          <Field label="Email they use to sign in">
                            <input type="email" name="email" required />
                          </Field>
                          <p>
                            They must verify this email and accept in Settings.
                            You will stop managing their profile when they
                            accept. Invite them to the family group separately
                            if needed.
                          </p>
                        </Form>,
                      )
                    }
                  >
                    Invite to take over
                  </button>
                )}
              </div>
            ))}
            {world.links
              .filter((l) => l.kind === "profile")
              .map((l) => (
                <div className="notice" key={l.id}>
                  <p>
                    Take over this profile:{" "}
                    <strong>
                      {l.targetName ?? "Profile no longer available"}
                    </strong>
                    . Requested by{" "}
                    {l.requesterName ?? "the person managing this profile"} for{" "}
                    {l.email}. Expires{" "}
                    {new Date(l.expiresAt).toLocaleDateString()}.
                  </p>
                  {l.email === world.me.email && (
                    <Action
                      onClick={() => mutate("links/accept", { id: l.id })}
                    >
                      Accept request
                    </Action>
                  )}
                </div>
              ))}
            <Field label="Appearance">
              <select value={theme} onChange={(e) => setTheme(e.target.value)}>
                <option value="system">Follow this device</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </Field>
          </section>
          <section
            className="settings-section"
            hidden={section !== "groups"}
            aria-labelledby="settings-groups-title"
          >
            <div className="section-heading">
              <h2 id="settings-groups-title">Family groups</h2>
              <button
                className="text-button"
                onClick={() =>
                  open(
                    "Create a family group",
                    <GroupForm
                      onCreated={(id) =>
                        setParams({
                          section: "groups",
                          group: id,
                          view: "members",
                        })
                      }
                    />,
                  )
                }
              >
                <Plus size={16} />
                Create family group
              </button>
            </div>
            <p className="muted">
              A family group brings friends or family together to share wish
              lists and plan gifts. You can belong to more than one.
            </p>
            {!!world.invitations.some(
              (i) => i.email === world.me.email.toLowerCase(),
            ) && <Invitations />}
            {world.links
              .filter((l) => l.kind === "ownership")
              .map((l) => (
                <div className="notice" key={l.id}>
                  <p>
                    Take ownership of{" "}
                    <strong>
                      {l.targetName ?? "Family group no longer available"}
                    </strong>
                    . Requested by {l.requesterName ?? "the group owner"} for{" "}
                    {l.email}. Expires{" "}
                    {new Date(l.expiresAt).toLocaleDateString()}.
                  </p>
                  {(l.email === world.me.email || l.userId === world.me.id) && (
                    <Action
                      onClick={() => mutate("links/accept", { id: l.id })}
                    >
                      Accept request
                    </Action>
                  )}
                </div>
              ))}
            {selectedGroup ? (
              <Field label="Family group">
                <select
                  value={selectedGroup.id}
                  onChange={(e) => {
                    const next = new URLSearchParams(params);
                    next.set("section", "groups");
                    next.set("group", e.target.value);
                    setParams(next);
                  }}
                >
                  {world.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {familyGroupLabel(g, world)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p>
                No family groups yet. Create one or accept an invitation to get
                started.
              </p>
            )}
            {world.groups.map((g) => (
              <div
                className="group-settings"
                key={g.id}
                data-group-id={g.id}
                hidden={g.id !== selectedGroup?.id}
              >
                <h3 className="selected-group-heading">
                  {familyGroupLabel(g, world)}
                </h3>
                <p>
                  {g.ownerId === world.me.id
                    ? "You own this family group."
                    : "You’re a member of this family group."}
                </p>
                <nav
                  className="group-settings-nav"
                  aria-label="Family group settings"
                >
                  {[
                    ["members", "Members"],
                    ["households", "Households"],
                    ["events", "Events"],
                  ].map(([id, label]) => (
                    <Link
                      key={id}
                      to={groupDestination(id)}
                      aria-current={groupView === id ? "page" : undefined}
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
                <div hidden={groupView !== "households"}>
                  <HouseholdSettings group={g} />
                </div>
                <div hidden={groupView !== "events"}>
                  <GroupEventSettings group={g} />
                </div>
                <div hidden={groupView !== "members"}>
                  <h4>Members &amp; invitations</h4>
                  <p className="muted">
                    Members can access lists shared with this family group.
                  </p>
                  <div className="member-list">
                    {g.memberIds.map((uid) => {
                      const person = world.people.find((p) => p.userId === uid);
                      return (
                        <div key={uid}>
                          <Avatar name={person?.name ?? "Member"} small />
                          <span>
                            {person?.name ?? "Member"}
                            {uid === g.ownerId
                              ? " · Owner"
                              : g.eventLeaderIds?.includes(uid)
                                ? " · Event leader"
                                : ""}
                          </span>
                          {g.ownerId === world.me.id && uid !== world.me.id && (
                            <>
                              <button
                                className="text-button"
                                aria-label={`Transfer ownership to ${person?.name ?? "member"}`}
                                onClick={() =>
                                  open(
                                    "Transfer family-group ownership",
                                    <Form
                                      submit="Request transfer"
                                      onSubmit={async (f) => {
                                        await mutate("groups/transfer", {
                                          groupId: g.id,
                                          userId: uid,
                                          email: value(f, "email"),
                                        });
                                        close();
                                      }}
                                    >
                                      <p>
                                        Transfer <strong>{g.name}</strong> to{" "}
                                        <strong>
                                          {person?.name ?? "this member"}
                                        </strong>
                                        .
                                      </p>
                                      <Field label="New owner’s verified email">
                                        <input
                                          type="email"
                                          name="email"
                                          required
                                        />
                                      </Field>
                                      <p>
                                        The new owner must accept in Settings
                                        before ownership changes.
                                      </p>
                                    </Form>,
                                  )
                                }
                              >
                                Transfer ownership
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Remove ${person?.name ?? "member"}`}
                                onClick={() =>
                                  open(
                                    "Remove this member?",
                                    <Confirm
                                      label="Remove member"
                                      onConfirm={() =>
                                        mutate("groups/remove", {
                                          groupId: g.id,
                                          userId: uid,
                                        })
                                      }
                                    >
                                      They will lose access through this family
                                      group. If they can no longer see an item,
                                      any unpurchased quantity they reserved
                                      will become available to others.
                                    </Confirm>,
                                  )
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {g.ownerId === world.me.id ? (
                    <>
                      <button
                        className="button secondary small"
                        onClick={() =>
                          open(
                            `Invite someone to ${familyGroupLabel(g, world)}`,
                            <Form
                              submit="Send invitation"
                              onSubmit={async (f) => {
                                await mutate("groups/invite", {
                                  groupId: g.id,
                                  email: value(f, "email"),
                                });
                                close();
                                toast(
                                  "Your invitation is waiting to be emailed.",
                                );
                              }}
                            >
                              <Field label="Email address">
                                <input type="email" name="email" required />
                              </Field>
                              <p>
                                The invitation is tied to this address and
                                expires in seven days.
                              </p>
                            </Form>,
                          )
                        }
                      >
                        <Mail size={16} />
                        Invite someone
                      </button>
                      {world.invitations
                        .filter((i) => i.groupId === g.id)
                        .map((i) => (
                          <div className="setting-row" key={i.id}>
                            <span>{i.email} · Pending</span>
                            <Action
                              secondary
                              onClick={() =>
                                mutate("invitations/revoke", { id: i.id })
                              }
                            >
                              Cancel invitation
                            </Action>
                          </div>
                        ))}
                    </>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() =>
                        open(
                          "Leave this family group?",
                          <Confirm
                            label="Leave family group"
                            onConfirm={() =>
                              mutate("groups/remove", {
                                groupId: g.id,
                                userId: world.me.id,
                              })
                            }
                          >
                            You’ll lose access to lists shared only through this
                            family group.
                          </Confirm>,
                        )
                      }
                    >
                      Leave family group
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
          <section
            className="settings-section"
            hidden={section !== "notifications"}
            aria-labelledby="settings-notifications-title"
          >
            <h2 id="settings-notifications-title">Notifications</h2>
            <p>Choose which updates you receive and where they arrive.</p>
            <Form
              submit="Save notification preferences"
              onSubmit={async (f) => {
                await mutate("preferences", {
                  email: f.get("email") === "on",
                  telegram: f.get("telegram") === "on",
                  sms: f.get("sms") === "on",
                  events: f.getAll("events"),
                  recipientUpdates: f.get("recipientUpdates") === "on",
                });
                toast("Notification preferences saved.");
              }}
            >
              <fieldset className="choice-group">
                <legend>Where to send updates</legend>
                <label className="check">
                  <input
                    type="checkbox"
                    name="email"
                    defaultChecked={world.preferences.email}
                  />
                  Email
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="telegram"
                    defaultChecked={world.preferences.telegram}
                    disabled={!world.preferences.chatId}
                  />
                  Telegram{" "}
                  {world.preferences.chatId ? "· Linked" : "· Not linked"}
                </label>
                {!world.preferences.chatId && <TelegramSetup />}
                <label className="check">
                  <input
                    type="checkbox"
                    name="sms"
                    defaultChecked={world.preferences.sms}
                    disabled={
                      !world.preferences.phoneVerified ||
                      world.preferences.smsOptOut
                    }
                  />
                  Text messages{" "}
                  {world.preferences.phoneVerified
                    ? `· ${world.preferences.phone}`
                    : "· Not verified"}
                </label>
                {(!world.preferences.phoneVerified ||
                  world.preferences.smsOptOut) && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => open("Verify your phone", <SmsForm />)}
                  >
                    Set up text messages
                  </button>
                )}
                {world.preferences.smsOptOut && (
                  <p className="muted">
                    Text updates are turned off. Reply START to the sender to
                    turn them back on, then verify your number here.
                  </p>
                )}
              </fieldset>
              <div className="notification-topics">
                {[
                  {
                    title: "People & access",
                    events: ["invitation", "access"],
                  },
                  {
                    title: "Gift coordination",
                    events: [
                      "reservation",
                      "purchase",
                      "discussion",
                      "contribution",
                    ],
                  },
                  { title: "Exchanges", events: ["exchange"] },
                ].map((group) => (
                  <fieldset className="choice-group" key={group.title}>
                    <legend>{group.title}</legend>
                    {group.events.map((event) => (
                      <label className="check" key={event}>
                        <input
                          type="checkbox"
                          name="events"
                          value={event}
                          defaultChecked={world.preferences.events.includes(
                            event,
                          )}
                        />
                        {
                          {
                            invitation: "Invitations",
                            reservation: "Reservations",
                            purchase: "Purchases",
                            discussion: "Private notes",
                            contribution: "Contributions",
                            exchange: "Names drawn for exchanges",
                            access: "Access changes",
                          }[
                            event as
                              | "invitation"
                              | "reservation"
                              | "purchase"
                              | "discussion"
                              | "contribution"
                              | "exchange"
                              | "access"
                          ]
                        }
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  name="recipientUpdates"
                  defaultChecked={world.preferences.recipientUpdates ?? false}
                />
                Notify me about gifts for me on lists set to See the plans
              </label>
              <p className="muted">
                Buying plans stay hidden on lists set to Keep it a surprise.
                Notifications ask you to sign in without showing gift details.
              </p>
            </Form>
          </section>
          <section
            className="settings-section"
            hidden={section !== "device"}
            aria-labelledby="settings-device-title"
          >
            <h2 id="settings-device-title">Device &amp; drafts</h2>
            <Install manual />
            <label className="check">
              <input
                type="checkbox"
                checked={draftsEnabled}
                onChange={(e) => {
                  if (e.target.checked) {
                    localStorage.setItem(
                      `little-hint:draft-optin:${world.me.id}`,
                      "yes",
                    );
                    setDraftsEnabled(true);
                  } else {
                    const count = getDrafts(world.me.id).length;
                    if (count)
                      open(
                        "Delete saved drafts?",
                        <Confirm
                          label="Delete drafts and turn off"
                          allowOffline
                          onConfirm={async () => disableDrafts()}
                        >
                          Turning off personal drafts permanently deletes{" "}
                          {count} saved {count === 1 ? "draft" : "drafts"} on
                          this device. Keep this setting on to retain them.
                        </Confirm>,
                      );
                    else disableDrafts();
                  }
                }}
              />
              Save wish-list drafts on this device
            </label>
            <p className="muted">
              Only your own draft titles, links, and notes are stored offline.
              Turning this off deletes saved drafts. Signing out clears them.
              Shared lists and purchases stay online.
            </p>
            {deletedDraft && (
              <p role="status">
                Deleted “{deletedDraft.title}”.{" "}
                <button
                  className="text-button"
                  onClick={() => {
                    const current = getDrafts(world.me.id);
                    const restored = current.some(
                      (d) => d.id === deletedDraft.id,
                    )
                      ? current
                      : [...current, deletedDraft];
                    localStorage.setItem(
                      draftKey(world.me.id),
                      JSON.stringify(restored),
                    );
                    setDrafts(restored);
                    setDeletedDraft(null);
                  }}
                >
                  Undo deletion
                </button>
              </p>
            )}
            {draftsEnabled && !drafts.length && (
              <p className="notice">
                No drafts saved on this device. When you are offline, save an
                item for your own wish list and add it after reconnecting.
              </p>
            )}
            {drafts.map((d) => (
              <div className="setting-row" key={d.id}>
                <div>
                  <strong>{d.title}</strong>
                  <p>Draft saved {new Date(d.savedAt).toLocaleDateString()}</p>
                </div>
                <button
                  className="text-button"
                  onClick={() =>
                    open("Review personal draft", <GiftForm draft={d} />)
                  }
                >
                  Review & add
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete draft ${d.title}`}
                  onClick={() => {
                    const rows = getDrafts(world.me.id).filter(
                      (x) => x.id !== d.id,
                    );
                    setDeletedDraft(d);
                    localStorage.setItem(
                      draftKey(world.me.id),
                      JSON.stringify(rows),
                    );
                    setDrafts(rows);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </section>
          <div hidden={section !== "security"}>
            <Security />
          </div>
          {world.me.admin && (
            <div hidden={section !== "admin"}>
              <Admin />
            </div>
          )}
          <section className="settings-sign-out">
            <h2>Sign out</h2>
            <p>
              Your account and saved wish lists are kept. Signing out deletes
              personal drafts saved on this device.
            </p>
            <Action
              secondary
              onClick={async () => {
                const result = await authClient.signOut();
                if (result.error)
                  throw new Error(
                    "We could not complete this account action. Check your connection and try again.",
                  );
                clearPersonalData();
                client.clear();
                location.assign("/");
              }}
            >
              <LogOut size={17} />
              Sign out
            </Action>
          </section>
        </div>
      </div>
    </>
  );
}
function TelegramSetup() {
  const { open, close, toast } = useApp();
  const client = useQueryClient();
  return (
    <Action
      secondary
      onClick={async () => {
        const result = await api<{ url: string }>("channels/telegram", {});
        open(
          "Link Telegram",
          <>
            <p>
              Open your personal bot link and tap Start. This link expires in 15
              minutes and can be used once.
            </p>
            <a
              className="button"
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Telegram <ExternalLink size={16} />
            </a>
            <p>
              Return here after tapping Start to check the connection. If the
              link expires, close this dialog and choose Link Telegram again.
            </p>
            <Action
              secondary
              onClick={async () => {
                const latest = await api<World>("world");
                if (!latest.preferences.chatId)
                  throw new Error(
                    "Telegram is not linked yet. Tap Start in the bot, then check again.",
                  );
                await client.invalidateQueries({ queryKey: ["world"] });
                close();
                toast(
                  "Telegram linked. Choose your notification preferences and save them.",
                );
              }}
            >
              Check Telegram connection
            </Action>
          </>,
        );
      }}
    >
      Link Telegram
    </Action>
  );
}
function SmsForm() {
  const { mutate, close, toast } = useApp();
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState("");
  const [resendNotice, setResendNotice] = useState("");
  return (
    <Form
      key={sent ? "code" : "phone"}
      submit={
        sent ? "Verify and turn on text updates" : "Send verification code"
      }
      onSubmit={async (f) => {
        if (sent) {
          await api("channels/sms/verify", { code: value(f, "code") });
          await mutate(
            "preferences",
            await api<World>("world").then((w) => ({
              email: w.preferences.email,
              telegram: w.preferences.telegram,
              sms: true,
              events: w.preferences.events,
              recipientUpdates: w.preferences.recipientUpdates,
            })),
          );
          close();
          toast("Phone verified. Text updates are on.");
        } else {
          await api("channels/sms/start", {
            phone: value(f, "phone"),
            consent: f.get("consent") === "on",
          });
          setPhone(value(f, "phone"));
          setSent(true);
        }
      }}
    >
      {sent ? (
        <>
          <p role="status">
            Code sent to {phone}. Codes expire; request another if yours no
            longer works.
          </p>
          <Field
            label="Verification code"
            hint="Enter the digits from the text message."
          >
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{4,10}"
              minLength={4}
              maxLength={10}
              autoFocus
            />
          </Field>
          <div className="actions">
            <Action
              secondary
              onClick={async () => {
                await api("channels/sms/start", { phone, consent: true });
                setResendNotice(
                  "Another code was sent. Use the latest text message. If too many requests are made, wait before trying again.",
                );
              }}
            >
              Resend code
            </Action>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setSent(false);
                setResendNotice("");
              }}
            >
              Change number
            </button>
          </div>
          <p role="status">{resendNotice}</p>
        </>
      ) : (
        <>
          <Field label="US mobile number">
            <input
              name="phone"
              type="tel"
              defaultValue={phone}
              placeholder="+15551234567"
              pattern="\+1[2-9][0-9]{9}"
              required
            />
          </Field>
          <label className="check">
            <input type="checkbox" name="consent" required />I agree to receive
            Little Hint text messages. Message/data rates may apply. Reply STOP
            to unsubscribe.
          </label>
        </>
      )}
    </Form>
  );
}
function PasskeyLabelForm({
  passkey,
  onSaved,
}: {
  passkey?: { id: string; name?: string | null };
  onSaved: () => Promise<void>;
}) {
  return (
    <Form
      submit={passkey ? "Save name" : "Create passkey"}
      onSubmit={async (form) => {
        const name = value(form, "name").trim();
        if (!name || name.length > 80)
          throw new Error("Use a name between 1 and 80 characters.");
        const result = passkey
          ? await authClient.passkey.updatePasskey({ id: passkey.id, name })
          : await authClient.passkey.addPasskey({ name });
        if (result?.error)
          throw new Error(
            "We could not save this passkey. Try again, or use an email code to sign in.",
          );
        if (!result?.data)
          throw new Error("Passkey setup was not completed. Try again.");
        await onSaved();
      }}
    >
      <Field
        label="Passkey name"
        hint="A name to recognize it in Little Hint, such as 1Password or Work laptop."
      >
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={passkey?.name || "Little Hint"}
          autoComplete="off"
          autoFocus
        />
      </Field>
      <p className="muted">
        This label helps you recognize the passkey in Little Hint. Your password
        manager chooses its own item title, which you can rename there.
      </p>
    </Form>
  );
}
function sessionName(agent?: string | null) {
  const ua = agent ?? "";
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /Firefox|FxiOS/.test(ua)
      ? "Firefox"
      : /Chrome|CriOS/.test(ua)
        ? "Chrome"
        : /Safari/.test(ua)
          ? "Safari"
          : "Browser";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "unknown device";
  return `${browser} on ${device}`;
}
function Security() {
  const { open, close, toast } = useApp();
  const client = useQueryClient();
  const current = useQuery({
    queryKey: ["current-session"],
    queryFn: async () => {
      const result = await authClient.getSession();
      if (result.error)
        throw new Error(
          "We could not complete this account action. Check your connection and try again.",
        );
      return result.data;
    },
  });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const r = await authClient.listSessions();
      if (r.error)
        throw new Error(
          "We could not update your sign-in settings. Check your connection and try again.",
        );
      return r.data;
    },
  });
  const keys = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const r = await authClient.passkey.listUserPasskeys();
      if (r.error)
        throw new Error(
          "We could not update your sign-in settings. Check your connection and try again.",
        );
      return r.data;
    },
  });
  return (
    <section className="settings-section">
      <h2>Sign-in & security</h2>
      <p>
        Email codes are always available. Add a passkey for a quicker sign-in on
        trusted devices.
      </p>
      <button
        className="button secondary"
        onClick={() =>
          open(
            "Add a passkey",
            <PasskeyLabelForm
              onSaved={async () => {
                await client.invalidateQueries({ queryKey: ["passkeys"] });
                close();
                toast("Passkey added.");
              }}
            />,
          )
        }
      >
        <KeyRound size={17} /> Add a passkey
      </button>
      {keys.isPending && <p role="status">Loading passkeys…</p>}
      {keys.isSuccess && !keys.data?.length && (
        <p>No passkeys yet. Add one on a trusted device.</p>
      )}
      {keys.data?.map((k) => (
        <div className="setting-row" key={k.id}>
          <span className="passkey-label">{k.name || "Passkey"}</span>
          <button
            className="button secondary"
            aria-label={`Rename ${k.name || "passkey"}`}
            onClick={() =>
              open(
                "Rename passkey",
                <PasskeyLabelForm
                  passkey={k}
                  onSaved={async () => {
                    await client.invalidateQueries({ queryKey: ["passkeys"] });
                    close();
                    toast("Passkey renamed.");
                  }}
                />,
              )
            }
          >
            Rename
          </button>
          <Action
            secondary
            label={`Remove passkey ${k.name || "Passkey"}`}
            onClick={async () => {
              const r = await authClient.passkey.deletePasskey({ id: k.id });
              if (r.error)
                throw new Error(
                  "We could not update your sign-in settings. Check your connection and try again.",
                );
              await client.invalidateQueries({ queryKey: ["passkeys"] });
            }}
          >
            Remove
          </Action>
        </div>
      ))}
      <h3>Devices you’re signed in on</h3>
      {sessions.isPending && <p role="status">Checking signed-in devices…</p>}
      {sessions.isSuccess && !sessions.data?.length && (
        <p>No signed-in devices to show. Refresh to check again.</p>
      )}
      {current.error && (
        <p role="status">
          We could not identify this device. You can still see your other
          sign-ins below.
        </p>
      )}
      {sessions.data?.map((s) => (
        <div className="setting-row" key={s.id}>
          <div>
            <strong>
              {sessionName(s.userAgent)}
              {s.id === current.data?.session.id ? " · This device" : ""}
            </strong>
            <p>
              Started {new Date(s.createdAt).toLocaleString()} · Expires{" "}
              {new Date(s.expiresAt).toLocaleDateString()}
            </p>
            <details>
              <summary>Browser details</summary>
              <p className="session-agent">
                {s.userAgent || "Browser details unavailable"}
              </p>
            </details>
          </div>
          <Action
            secondary
            label={`Sign out ${sessionName(s.userAgent)}, signed in ${new Date(s.createdAt).toLocaleString()}${s.id === current.data?.session.id ? " on this device" : ""}`}
            onClick={async () => {
              const r = await authClient.revokeSession({ token: s.token });
              if (r.error)
                throw new Error(
                  "We could not update your sign-in settings. Check your connection and try again.",
                );
              await client.invalidateQueries({ queryKey: ["sessions"] });
              await client.invalidateQueries({ queryKey: ["world"] });
              await client.invalidateQueries({ queryKey: ["current-session"] });
            }}
          >
            {s.id === current.data?.session.id
              ? "Sign out this device"
              : "Sign out device"}
          </Action>
        </div>
      ))}
      {(keys.error || sessions.error) && (
        <div role="alert" className="error">
          <p>Some security settings could not be loaded.</p>
          <button
            className="button secondary"
            onClick={() => {
              keys.refetch();
              sessions.refetch();
              current.refetch();
            }}
          >
            Retry security settings
          </button>
        </div>
      )}
    </section>
  );
}
function integrationGroup(key: string) {
  if (key.startsWith("SMTP_")) return "Email delivery";
  if (key.startsWith("TELEGRAM_")) return "Telegram";
  if (key.startsWith("TWILIO_")) return "Text messages";
  if (key.startsWith("OPENAI_")) return "AI assistance";
  if (key.includes("SCRAP")) return "Details from shop links";
  return "Daily limits";
}
function Admin() {
  const { toast } = useApp();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () =>
      api<
        Array<{
          key: string;
          configured: boolean;
          source: string;
          default: string | null;
          value?: string;
          effectiveProvider?: string | null;
        }>
      >("admin/settings"),
  });
  const jobs = useQuery({
    queryKey: ["admin-jobs"],
    queryFn: () =>
      api<{
        workerLastSeen: number | null;
        backupProvider: string;
        imports: Array<{ id: string; status: string; error?: string }>;
        notifications: Array<{
          id: string;
          status: string;
          error?: string;
          attempts: number;
        }>;
      }>("admin/jobs"),
  });
  const photos = settings.data?.find(
    (s) => s.key === "AUTO_IMPORT_PRODUCT_PHOTOS",
  );
  return (
    <section className="settings-section">
      <h2>Administration</h2>
      {settings.isPending && (
        <p role="status">Loading administration settings…</p>
      )}
      <h3>Details from shop links</h3>
      {photos && (
        <Form
          key={`${photos.source}-${photos.value}`}
          submit="Save photo preference"
          disabled={photos.source === "environment"}
          onSubmit={async (f) => {
            await api("admin/settings", {
              key: photos.key,
              value: String(f.has("automaticPhotos")),
            });
            await client.invalidateQueries({ queryKey: ["admin-settings"] });
            toast("Photo preference saved.");
          }}
        >
          <label className="check">
            <input
              type="checkbox"
              name="automaticPhotos"
              defaultChecked={photos.value === "true"}
              disabled={photos.source === "environment"}
              aria-describedby="automatic-photos-help"
            />
            Add photos from shop links automatically
          </label>
          <p id="automatic-photos-help" className="muted">
            Save a photo when looking up a shop link. Turn this off to save
            storage space. You can still upload photos yourself. Existing photos
            are kept, and lookups already running may still add a photo.
          </p>
          <p className="muted">
            {photos.source === "environment"
              ? "Set on the server with AUTO_IMPORT_PRODUCT_PHOTOS. Change it there to update this choice."
              : photos.source === "default"
                ? "Off by default. This choice applies to everyone using this Little Hint app."
                : "Saved. This choice applies to everyone using this Little Hint app."}
          </p>
        </Form>
      )}
      <h3>Connected services</h3>
      <p>
        Connect services for email, text messages, and shop details. Secret keys
        are stored encrypted. Values set on the server must be changed there.
        Saving a blank value removes the value saved here.
      </p>
      <div className="integration-settings">
        {[
          "Email delivery",
          "Telegram",
          "Text messages",
          "Details from shop links",
          "AI assistance",
          "Daily limits",
        ].map((group) => {
          const entries =
            settings.data?.filter(
              (s) =>
                s.key !== "AUTO_IMPORT_PRODUCT_PHOTOS" &&
                integrationGroup(s.key) === group,
            ) ?? [];
          return (
            entries.length > 0 && (
              <section
                className="integration-group"
                key={group}
                aria-label={group}
              >
                <h4>{group}</h4>
                {entries.map((s) => (
                  <details key={s.key}>
                    <summary>
                      <span>
                        {s.key === "SCRAPING_PROVIDER"
                          ? "Service for shop details"
                          : scrapingProviders.find((p) => p.key === s.key)?.name
                            ? `${scrapingProviders.find((p) => p.key === s.key)!.name} API key`
                            : (settingLabels[s.key] ?? "Service setting")}
                      </span>
                      <small>
                        {s.configured ? "Set up" : "Not set up"} ·{" "}
                        {settingSources[s.source] ?? "Setting unavailable"}
                      </small>
                    </summary>
                    <p className="muted">
                      Setup key: <code>{s.key}</code>
                    </p>
                    <Form
                      submit="Save setting"
                      disabled={s.source === "environment"}
                      onSubmit={async (f) => {
                        await api("admin/settings", {
                          key: s.key,
                          value: value(f, "value"),
                        });
                        await client.invalidateQueries({
                          queryKey: ["admin-settings"],
                        });
                        toast("Setting saved.");
                      }}
                    >
                      {s.key === "SCRAPING_PROVIDER" ? (
                        <>
                          <Field
                            label="Paid service for shop details"
                            hint="Little Hint tries the shop directly for free, then one paid service if needed. Automatic selection prefers Scraping Fish."
                          >
                            <select
                              name="value"
                              defaultValue={s.value || "auto"}
                              disabled={s.source === "environment"}
                            >
                              <option value="auto">Automatic selection</option>
                              <option value="none">Shop website only</option>
                              {scrapingProviders.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <p className="muted">
                            Current paid service:{" "}
                            {scrapingProviders.find(
                              (p) => p.id === s.effectiveProvider,
                            )?.name ?? "None set up"}
                            . Requests count toward the daily limit. If this
                            service fails, Little Hint does not try another paid
                            service.
                          </p>
                        </>
                      ) : (
                        <Field
                          label="New value"
                          hint={s.default ? `Default: ${s.default}` : undefined}
                        >
                          <input
                            name="value"
                            type={
                              /KEY|TOKEN|PASS/.test(s.key) ? "password" : "text"
                            }
                            autoComplete="off"
                            disabled={s.source === "environment"}
                            placeholder={
                              s.source === "environment"
                                ? "Change this value on the server"
                                : "Enter a replacement value"
                            }
                          />
                        </Field>
                      )}
                    </Form>
                  </details>
                ))}
              </section>
            )
          );
        })}
      </div>
      <h3>Updates & backups</h3>
      {jobs.isPending && (
        <p role="status">Checking updates and shop lookups…</p>
      )}
      {jobs.error && (
        <div role="alert">
          <p className="error">
            We could not check updates or shop lookups. Try again to see whether
            they are running.
          </p>
          <button className="button secondary" onClick={() => jobs.refetch()}>
            Check again
          </button>
        </div>
      )}
      {jobs.data && !jobs.error && (
        <>
          <p>
            Updates and shop lookups:{" "}
            {jobs.data?.workerLastSeen &&
            Date.now() - jobs.data.workerLastSeen < 60000
              ? "Running"
              : "No recent activity reported"}
            . Housewatch Digital manages backups separately. Check backups and
            restore progress in Coolify.
          </p>
          <p>
            {jobs.data?.imports.filter(
              (j) => j.status === "pending" || j.status === "running",
            ).length ?? 0}{" "}
            shop lookups waiting ·{" "}
            {jobs.data?.notifications.filter((j) => j.status === "pending")
              .length ?? 0}{" "}
            updates waiting
          </p>
        </>
      )}
      {jobs.data?.notifications
        .filter((j) => j.status === "failed")
        .map((j) => (
          <div className="setting-row" key={j.id}>
            <span>
              {j.error ?? "Delivery failed"} · {j.attempts} attempts
            </span>
            <Action
              secondary
              onClick={async () => {
                await api("admin/jobs/retry", { id: j.id });
                await client.invalidateQueries({ queryKey: ["admin-jobs"] });
              }}
            >
              Retry
            </Action>
          </div>
        ))}
      {settings.error && (
        <div role="alert">
          <p className="error">We could not load app settings. Try again.</p>
          <button
            className="button secondary"
            onClick={() => settings.refetch()}
          >
            Retry administration settings
          </button>
        </div>
      )}
    </section>
  );
}
