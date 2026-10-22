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
      <div className="loading-screen">
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
        <p>{query.error?.message}</p>
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
              A little thought.
              <br />A lovely surprise.
            </p>
          </div>
          <NavLink className="settings-link" to="/settings">
            <Avatar name={world.me.name} small />
            <span>
              {world.me.name.split(" ")[0]}
              <small>Settings & your groups</small>
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
                aria-label="Add a gift"
                className="button small"
                onClick={() =>
                  world.lists.some((l) => l.canEdit && !l.archived)
                    ? setModal({
                        title: "Drop a little hint",
                        body: <GiftForm />,
                      })
                    : setModal({
                        title: "Your first wish list",
                        body: <ListForm />,
                      })
                }
              >
                <Plus size={18} />
                <span>Add a gift</span>
              </button>
            </div>
          </header>
          {!online && (
            <div className="offline-banner">
              <WifiOff size={17} />
              You’re offline. Buying actions will be available when you
              reconnect.
            </div>
          )}
          {(world.environment === "staging" ||
            world.me.email.endsWith("@example.test")) && (
            <div className="demo-banner">
              {world.environment === "staging"
                ? "Staging · Synthetic data · Email captured in test inbox"
                : "Illustrative demo data · Development instance"}
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
          <Field label="Gift name">
            <input name="title" required />
          </Field>
          <Field label="Product URL">
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
          Enable personal drafts in Settings while online to save your own gift
          ideas here.
        </p>
      )}
      <button className="button secondary" onClick={() => location.reload()}>
        Try connecting again
      </button>
      <button
        className="text-button"
        onClick={() => {
          clearPersonalData();
          location.reload();
        }}
      >
        Clear personal data on this device
      </button>
    </div>
  );
}
function Invitations() {
  const { world, mutate, toast } = useApp();
  const mine = world.invitations.filter(
    (i) => i.email === world.me.email.toLowerCase(),
  );
  return (
    <section className="invitations">
      {mine.length ? (
        mine.map((i) => (
          <div className="invitation" key={i.id}>
            <Mail size={22} />
            <div>
              <h3>You’re invited to a circle.</h3>
              <p>Accept to see the lists shared with this group.</p>
            </div>
            <Action
              onClick={async () => {
                await mutate("invitations/accept", { id: i.id });
                toast("You’re in. Welcome to the circle.");
              }}
            >
              Accept invitation
            </Action>
          </div>
        ))
      ) : (
        <p className="muted">No pending invitations for this email address.</p>
      )}
    </section>
  );
}
function Action({
  onClick,
  children,
  secondary = false,
}: {
  onClick: () => Promise<unknown>;
  children: ReactNode;
  secondary?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="action-wrap">
      <button
        className={`button small ${secondary ? "secondary" : ""}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onClick();
          } catch (e) {
            setError((e as Error).message);
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
function Browser({ items }: { items: GiftView[] }) {
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
            aria-label="Search gifts"
            placeholder="Find a gift, person, or idea"
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
          title={
            items.length
              ? "Nothing here just yet"
              : "A little inspiration starts here"
          }
        >
          {items.length
            ? "Try another search or filter."
            : "Add a wish or ask your people to share their lists."}
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
        title={`A little thought, ${world.me.name.split(" ")[0]}.`}
        description="Good things for the people you know best."
      />
      <Install />
      {incoming && <Invitations />}
      <div className="home-intro">
        <div>
          <h2>From your circle</h2>
          <p>A few things they’ve been wishing for.</p>
        </div>
        <Link className="text-button" to="/people">
          Meet your people <ArrowRight size={16} />
        </Link>
      </div>
      {!world.groups.length ? (
        <Empty
          title="Good gifts start with your people"
          action={
            <button
              className="button"
              onClick={() => open("Create your circle", <GroupForm />)}
            >
              <Plus size={17} />
              Create a group
            </button>
          }
        >
          Bring your family or friends together in a private group, then share
          your first wish list.
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
        description="A little closer to finding their perfect gift."
      >
        <button
          className="button secondary"
          onClick={() => open("A profile you manage", <PersonForm />)}
        >
          <Plus size={17} />
          Managed profile
        </button>
      </Header>
      <div className="people-list">
        {world.people.map((p) => (
          <Link className="person-row" key={p.id} to={`/people/${p.id}`}>
            <Avatar name={p.name} />
            <div>
              <h2>{p.name}</h2>
              <p>
                {p.userId === world.me.id
                  ? "Your wishes"
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
      <Empty title="Person not found">
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
            ? "Make it easier for your people to choose something you’ll love."
            : "Thoughtful gifts begin with knowing someone."
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
              open(`An idea for ${person.name}`, <GiftForm recipientId={id} />)
            }
          >
            <Plus size={17} />
            Add an idea
          </button>
        )}
      </Header>
      <div className="tabs" role="tablist" aria-label="Gift types">
        <button
          role="tab"
          aria-selected={tab === "wishes"}
          onClick={() => setTab("wishes")}
        >
          {person.userId === world.me.id ? "My wishes" : "Their wishes"}
        </button>
        <button
          role="tab"
          aria-selected={tab === "ideas"}
          onClick={() => setTab("ideas")}
        >
          Ideas for {person.name.split(" ")[0]}
        </button>
      </div>
      <Browser
        items={world.items.filter(
          (i) =>
            !i.archived &&
            i.recipientIds.includes(id!) &&
            (tab === "wishes" ? !!i.listId : !i.listId),
        )}
      />
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
      <Empty title="List not found">
        This list may no longer be shared with you.
      </Empty>
    );
  if (list)
    return (
      <>
        <Link className="back-link" to="/lists">
          <ArrowLeft size={16} />
          My lists
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
                    open("Drop a little hint", <GiftForm listId={list.id} />)
                  }
                >
                  <Plus size={17} />
                  Add a gift
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
              Wishes
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
          <Browser items={world.items.filter((i) => i.listId === list.id)} />
        )}
      </>
    );
  return (
    <>
      <Header
        title="Your little hints"
        description="Things you’d love, in lists that feel like you."
      >
        <button
          className="button"
          onClick={() => open("A new wish list", <ListForm />)}
        >
          <Plus size={17} />
          Create a list
        </button>
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
            <p>You’re invited to co-own “{l.name}”.</p>
            <Action onClick={() => mutate("lists/accept", { id: l.id })}>
              Accept co-ownership
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
                              "Shared group",
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
          title="Leave your first little hint"
          action={
            <button
              className="button"
              onClick={() => open("Your first wish list", <ListForm />)}
            >
              Create a wish list
            </button>
          }
        >
          A book you’ve been meaning to read. Something for a hobby. A small
          everyday joy.
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
      <Empty title="Gift not found">It may no longer be shared with you.</Empty>
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
        Back to gifts
      </Link>
      <div className="gift-detail">
        <GiftPhoto gift={gift} />
        <section>
          <div className="gift-recipient">
            <Avatar name={gift.recipientNames[0]} small />
            <span>For {gift.recipientNames.join(" & ")}</span>
          </div>
          <h1>{gift.title}</h1>
          <p className="detail-price">{dollars(gift.priceCents)}</p>
          {gift.description && (
            <p className="description">{gift.description}</p>
          )}
          <div className="tags">
            {gift.tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
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
              onClick={() => open("Edit this gift", <GiftForm gift={gift} />)}
            >
              Edit gift
            </button>
          )}
          {gift.archived ? (
            <p className="notice">This gift is archived.</p>
          ) : gift.isRecipient ? (
            <p className="privacy-note">
              <LockKeyhole size={18} />
              {gift.mode === "surprise"
                ? "The rest is a surprise. Your people will take it from here."
                : "You can follow purchase activity below."}
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
                  : "Your circle has reserved the requested quantity."}
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
                          <option value="">An ordinary gift</option>
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
                      toast("Reserved. You’ve got this one.");
                    }}
                  >
                    <ShoppingBag size={16} />
                    I’ll get this
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
                    Pool target {dollars(r.poolTargetCents)} ·{" "}
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
                        submit="Pledge contribution"
                        onSubmit={async (f) => {
                          await mutate("contributions", {
                            reservationId: r.id,
                            amountCents: Math.round(
                              Number(value(f, "amount")) * 100,
                            ),
                          });
                          toast(
                            "Contribution pledged. Arrange payment with the purchaser.",
                          );
                          close();
                        }}
                      >
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
                          Arrange payment outside Little Hint. The purchaser
                          will confirm receipt.
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
            <MessageCircle size={21} />A quiet word with the givers
          </h2>
          <p className="muted">
            The recipient cannot see this conversation. Notes from an exchange
            giver are visible only to that giver and their guardians.
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
        title="A little something for them"
        description="Your reserved gifts and contributions, all in one place."
      />
      {world.buying.some((r) => r.quantity > 0) ? (
        <div className="buying-list">
          {world.buying
            .filter((r) => r.quantity > 0)
            .map((r) => (
              <div className="buying-row" key={r.id}>
                {r.item ? (
                  <Link to={`/gift/${r.item.id}`}>
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
                            Purchased units remain reserved until you explicitly
                            release them.
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
                            submit="Open contribution pool"
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
                              You’ll purchase the gift and confirm contributions
                              received outside Little Hint.
                            </p>
                          </Form>,
                        )
                      }
                    >
                      {r.poolTargetCents ? "Edit pool" : "Share the cost"}
                    </button>
                  )}
                  <button
                    className="text-button muted"
                    onClick={() =>
                      open(
                        "Release reserved units",
                        <Form
                          submit="Release units"
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
                          <Field label="Units to release">
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
                            These units will become available to other buyers.
                            This can also release units you previously marked
                            purchased.
                          </p>
                        </Form>,
                      )
                    }
                  >
                    Release
                  </button>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <Empty
          title="Something thoughtful is waiting"
          action={
            <Link className="button" to="/people">
              Browse your people <ArrowRight size={16} />
            </Link>
          }
        >
          Reserve a gift from someone’s list and you’ll find it here.
        </Empty>
      )}
      {world.buying.some((r) => !r.quantity) && (
        <details className="detail-section">
          <summary>Released gift history</summary>
          {world.buying
            .filter((r) => !r.quantity)
            .map((r) => (
              <div className="reservation-row" key={r.id}>
                <div>
                  <strong>{r.titleSnapshot}</strong>
                  <p>
                    Released · originally reserved{" "}
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
          {contributions.map(({ contribution: c, purchaser, title }) => (
            <div className="reservation-row" key={c.id}>
              <div>
                <strong>{title}</strong>
                <p>
                  {dollars(c.amountCents)} · {c.status}
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
                    Mark sent
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
                    Cancel pledge
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
                  Confirm receipt
                </Action>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function Exchanges() {
  const { world, open, mutate, toast } = useApp();
  return (
    <>
      <Header
        title="A shared little secret"
        description="Give thoughtfully. Keep the mystery."
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
                  <h3>Your little secret</h3>
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
                    <Action
                      onClick={async () => {
                        await mutate("exchanges/draw", {
                          id: e.id,
                          revision: e.revision,
                        });
                        toast(
                          "Names drawn. Each giver can see their own assignments.",
                        );
                      }}
                    >
                      <Shuffle size={16} />
                      Draw names
                    </Action>
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
                            Assignments will stop being shown. Existing purchase
                            history will remain.
                          </Confirm>,
                        )
                      }
                    >
                      Cancel exchange
                    </button>
                  )}
                  {e.status === "drawn" && (
                    <p className="muted">
                      Notifications: {e.delivery.sent} completed,{" "}
                      {e.delivery.pending} pending, {e.delivery.failed} failed.
                    </p>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : (
        <Empty title="A reason to surprise each other">
          Create a group, choose participants, and let Little Hint draw the
          names. It works any time of year.
        </Empty>
      )}
    </>
  );
}
function Confirm({
  children,
  onConfirm,
  label,
}: {
  children: ReactNode;
  onConfirm: () => Promise<unknown>;
  label: string;
}) {
  const { close } = useApp();
  return (
    <Form
      submit={label}
      onSubmit={async () => {
        await onConfirm();
        close();
      }}
    >
      <p>{children}</p>
    </Form>
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
  const [draftsEnabled, setDraftsEnabled] = useState(
    !!localStorage.getItem(`little-hint:draft-optin:${world.me.id}`),
  );
  const [drafts, setDrafts] = useState(getDrafts(world.me.id));
  const mine = world.people.filter(
    (p) => p.userId === world.me.id || p.guardians.includes(world.me.id),
  );
  return (
    <>
      <Header
        title="Make yourself at home"
        description="Your profile, your circle, and the little details."
      />
      <div className="settings-layout">
        <section className="settings-section">
          <h2>Your profile</h2>
          {mine.map((p) => (
            <div className="setting-row" key={p.id}>
              <Avatar name={p.name} small />
              <div>
                <strong>{p.name}</strong>
                <p>{p.userId ? "Your account" : "Managed profile"}</p>
              </div>
              <button
                className="text-button"
                onClick={() => open("Edit profile", <PersonForm id={p.id} />)}
              >
                Edit
              </button>
              {!p.userId && (
                <button
                  className="text-button"
                  onClick={() =>
                    open(
                      "Link a profile to an account",
                      <Form
                        submit="Create claim request"
                        onSubmit={async (f) => {
                          await mutate("people/link", {
                            id: p.id,
                            email: value(f, "email"),
                          });
                          close();
                          toast(
                            "Claim request ready. They can accept it in Settings after signing in.",
                          );
                        }}
                      >
                        <Field label="Their verified account email">
                          <input type="email" name="email" required />
                        </Field>
                        <p>
                          They must sign in with this email and accept. Your
                          guardian access will end when they claim the profile.
                          Invite them to the group separately if needed.
                        </p>
                      </Form>,
                    )
                  }
                >
                  Link account
                </button>
              )}
            </div>
          ))}
          {world.links
            .filter((l) => l.kind !== "telegram")
            .map((l) => (
              <div className="notice" key={l.id}>
                <p>
                  {l.kind === "profile"
                    ? "A profile claim request"
                    : "A group ownership request"}{" "}
                  is pending.
                </p>
                {(l.email === world.me.email ||
                  (l.kind === "ownership" && l.userId === world.me.id)) && (
                  <Action onClick={() => mutate("links/accept", { id: l.id })}>
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
        <section className="settings-section">
          <div className="section-heading">
            <h2>Your groups</h2>
            <button
              className="text-button"
              onClick={() => open("Create a group", <GroupForm />)}
            >
              <Plus size={16} />
              Create group
            </button>
          </div>
          <Invitations />
          {world.groups.map((g) => (
            <div className="group-settings" key={g.id}>
              <h3>{g.name}</h3>
              <p>
                {g.ownerId === world.me.id
                  ? "You own this group."
                  : "You’re a member of this group."}
              </p>
              <GroupEventSettings group={g} />
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
                            onClick={() =>
                              open(
                                "Transfer group ownership",
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
                                  <Field label="New owner’s verified email">
                                    <input type="email" name="email" required />
                                  </Field>
                                  <p>
                                    The new owner must accept in Settings before
                                    ownership changes.
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
                                  They will lose this group’s access.
                                  Unpurchased reservations with no remaining
                                  access will be released.
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
                        `Invite someone to ${g.name}`,
                        <Form
                          submit="Send invitation"
                          onSubmit={async (f) => {
                            await mutate("groups/invite", {
                              groupId: g.id,
                              email: value(f, "email"),
                            });
                            close();
                            toast("Invitation queued for delivery.");
                          }}
                        >
                          <Field label="Email address">
                            <input type="email" name="email" required />
                          </Field>
                          <p>
                            The invitation is tied to this address and expires
                            in seven days.
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
                          Revoke
                        </Action>
                      </div>
                    ))}
                </>
              ) : (
                <button
                  className="text-button"
                  onClick={() =>
                    open(
                      "Leave this group?",
                      <Confirm
                        label="Leave group"
                        onConfirm={() =>
                          mutate("groups/remove", {
                            groupId: g.id,
                            userId: world.me.id,
                          })
                        }
                      >
                        You’ll lose access to lists shared only through this
                        group.
                      </Confirm>,
                    )
                  }
                >
                  Leave group
                </button>
              )}
            </div>
          ))}
        </section>
        <section className="settings-section">
          <h2>Keep me in the loop</h2>
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
                {world.preferences.chatId ? "· Linked" : "· Link below"}
              </label>
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
                SMS{" "}
                {world.preferences.phoneVerified
                  ? `· ${world.preferences.phone}`
                  : "· Verify below"}
              </label>
            </fieldset>
            <fieldset className="choice-group">
              <legend>Which updates?</legend>
              {[
                "invitation",
                "reservation",
                "purchase",
                "discussion",
                "contribution",
                "exchange",
                "access",
              ].map((event) => (
                <label className="check" key={event}>
                  <input
                    type="checkbox"
                    name="events"
                    value={event}
                    defaultChecked={world.preferences.events.includes(event)}
                  />
                  {
                    {
                      invitation: "Invitations",
                      reservation: "Reservations",
                      purchase: "Purchases",
                      discussion: "Private discussions",
                      contribution: "Contributions",
                      exchange: "Exchange assignments",
                      access: "Access changes",
                    }[event]
                  }
                </label>
              ))}
            </fieldset>
            <label className="check">
              <input
                type="checkbox"
                name="recipientUpdates"
                defaultChecked={world.preferences.recipientUpdates ?? false}
              />
              Notify me about gifts for me on Transparent lists
            </label>
            <p className="muted">
              Surprise gifts stay private regardless of your preferences.
              Message previews contain a generic update and a sign-in link.
            </p>
          </Form>
          <div className="actions">
            <Action
              secondary
              onClick={async () => {
                const r = await api<{ url: string }>("channels/telegram", {});
                open(
                  "Link Telegram",
                  <>
                    <p>
                      Open your personal bot link and tap Start. This link
                      expires in 15 minutes and can be used once.
                    </p>
                    <a
                      className="button"
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Telegram <ExternalLink size={16} />
                    </a>
                  </>,
                );
              }}
            >
              Link Telegram
            </Action>
            <button
              className="button secondary small"
              onClick={() => open("Verify your phone", <SmsForm />)}
            >
              Set up SMS
            </button>
          </div>
        </section>
        <section className="settings-section">
          <h2>Little Hint on your device</h2>
          <Install manual />
          <label className="check">
            <input
              type="checkbox"
              checked={draftsEnabled}
              onChange={(e) => {
                setDraftsEnabled(e.target.checked);
                if (e.target.checked)
                  localStorage.setItem(
                    `little-hint:draft-optin:${world.me.id}`,
                    "yes",
                  );
                else {
                  localStorage.removeItem(
                    `little-hint:draft-optin:${world.me.id}`,
                  );
                  localStorage.removeItem(draftKey(world.me.id));
                  setDrafts([]);
                }
              }}
            />
            Keep personal gift drafts on this device
          </label>
          <p className="muted">
            Only your own draft titles, links, and notes are stored offline.
            Signing out clears them. Shared lists and purchases stay online.
          </p>
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
                  const rows = drafts.filter((x) => x.id !== d.id);
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
        <Security />
        {world.me.admin && <Admin />}
        <section className="settings-section">
          <h2>Signing out</h2>
          <p>
            Your account stays safe on the server. Local personal drafts and
            cached screen data will be cleared.
          </p>
          <Action
            secondary
            onClick={async () => {
              const result = await authClient.signOut();
              if (result.error) throw new Error(result.error.message);
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
    </>
  );
}
function SmsForm() {
  const { mutate, close, toast } = useApp();
  const [sent, setSent] = useState(false);
  return (
    <Form
      submit={sent ? "Verify & enable SMS" : "Send verification code"}
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
            })),
          );
          close();
          toast("Phone verified. SMS notifications enabled.");
        } else {
          await api("channels/sms/start", {
            phone: value(f, "phone"),
            consent: f.get("consent") === "on",
          });
          setSent(true);
        }
      }}
    >
      {sent ? (
        <Field label="Verification code">
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </Field>
      ) : (
        <>
          <Field label="US mobile number">
            <input
              name="phone"
              type="tel"
              placeholder="+15551234567"
              pattern="\+1[2-9][0-9]{9}"
              required
            />
          </Field>
          <label className="check">
            <input type="checkbox" name="consent" required />I agree to receive
            Little Hint SMS notifications. Message/data rates may apply. Reply
            STOP to unsubscribe.
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
      submit={passkey ? "Save label" : "Create passkey"}
      onSubmit={async (form) => {
        const name = value(form, "name").trim();
        if (!name || name.length > 80)
          throw new Error("Use a label between 1 and 80 characters.");
        const result = passkey
          ? await authClient.passkey.updatePasskey({ id: passkey.id, name })
          : await authClient.passkey.addPasskey({ name });
        if (result?.error)
          throw new Error(
            result.error.message ??
              "Passkey setup was not completed. Try again.",
          );
        if (!result?.data)
          throw new Error("Passkey setup was not completed. Try again.");
        await onSaved();
      }}
    >
      <Field
        label="Passkey label"
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
function Security() {
  const { open, close, toast } = useApp();
  const client = useQueryClient();
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const r = await authClient.listSessions();
      if (r.error) throw new Error(r.error.message);
      return r.data;
    },
  });
  const keys = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const r = await authClient.passkey.listUserPasskeys();
      if (r.error) throw new Error(r.error.message);
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
            onClick={async () => {
              const r = await authClient.passkey.deletePasskey({ id: k.id });
              if (r.error) throw new Error(r.error.message);
              await client.invalidateQueries({ queryKey: ["passkeys"] });
            }}
          >
            Remove
          </Action>
        </div>
      ))}
      <h3>Active sessions</h3>
      {sessions.data?.map((s) => (
        <div className="setting-row" key={s.id}>
          <div>
            <strong>
              {s.userAgent?.includes("Mobile")
                ? "Mobile browser"
                : "Browser session"}
            </strong>
            <p>Started {new Date(s.createdAt).toLocaleDateString()}</p>
          </div>
          <Action
            secondary
            onClick={async () => {
              const r = await authClient.revokeSession({ token: s.token });
              if (r.error) throw new Error(r.error.message);
              await client.invalidateQueries({ queryKey: ["sessions"] });
              await client.invalidateQueries({ queryKey: ["world"] });
            }}
          >
            Revoke
          </Action>
        </div>
      ))}
      {(keys.error || sessions.error) && (
        <p className="error">
          Security settings could not be loaded. Refresh to try again.
        </p>
      )}
    </section>
  );
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
  return (
    <section className="settings-section">
      <h2>Administration</h2>
      <p>
        Secrets are encrypted on the server. Environment variables take
        precedence. A blank saved value removes the UI override.
      </p>
      <div className="integration-settings">
        {settings.data?.map((s) => (
          <details key={s.key}>
            <summary>
              <span>
                {s.key === "SCRAPING_PROVIDER"
                  ? "Product import provider"
                  : scrapingProviders.find((p) => p.key === s.key)?.name
                    ? `${scrapingProviders.find((p) => p.key === s.key)!.name} API key`
                    : s.key.replaceAll("_", " ").toLowerCase()}
              </span>
              <small>
                {s.configured ? "Configured" : "Not configured"} · {s.source}
              </small>
            </summary>
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
                    label="Paid import provider"
                    hint="Try a free direct import first, then at most one paid provider. Automatic selection prefers Scraping Fish."
                  >
                    <select
                      name="value"
                      defaultValue={s.value || "auto"}
                      disabled={s.source === "environment"}
                    >
                      <option value="auto">Automatic selection</option>
                      <option value="none">Direct import only</option>
                      {scrapingProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="muted">
                    Current paid provider:{" "}
                    {scrapingProviders.find((p) => p.id === s.effectiveProvider)
                      ?.name ?? "None configured"}
                    . Requests count toward the integration daily limit. Failed
                    imports never switch to another paid provider.
                  </p>
                </>
              ) : (
                <Field
                  label="New value"
                  hint={s.default ? `Default: ${s.default}` : undefined}
                >
                  <input
                    name="value"
                    type={/KEY|TOKEN|PASS/.test(s.key) ? "password" : "text"}
                    autoComplete="off"
                    disabled={s.source === "environment"}
                    placeholder={
                      s.source === "environment"
                        ? "Managed through deployment environment"
                        : "Enter a replacement value"
                    }
                  />
                </Field>
              )}
            </Form>
          </details>
        ))}
      </div>
      <h3>Background delivery & backups</h3>
      <p>
        Worker:{" "}
        {jobs.data?.workerLastSeen &&
        Date.now() - jobs.data.workerLastSeen < 60000
          ? "Online"
          : "Not reporting"}
        . Backups are managed by the Housewatch Digital backup sidecar. Check
        its health and restore status in Coolify.
      </p>
      <p>
        {jobs.data?.imports.filter(
          (j) => j.status === "pending" || j.status === "running",
        ).length ?? 0}{" "}
        imports pending ·{" "}
        {jobs.data?.notifications.filter((j) => j.status === "pending")
          .length ?? 0}{" "}
        notifications pending
      </p>
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
        <p className="error">Could not load integration settings.</p>
      )}
    </section>
  );
}
