import { ItemPhotoDetail } from "./ItemPhotoDetail";
import { netContribution } from "../shared/contribution-money";
import { NameSetup } from "./NameSetup";
import {
  shoppingChoices,
  shoppingLink,
  shoppingPayload,
} from "./shopping-context";
import type { GiftView } from "../shared/model";
import { CollectionStatus, useCollection } from "./Pagination";
import { Price, PriceControls } from "./Price";
import { AddFriend, FriendManagement } from "./Friends";
import "./friends.css";
import { hydrateWorld } from "../shared/world";
import { Browser } from "./Browser";
import { Lists } from "./Lists";
import { Exchanges } from "./Exchanges";
import { Buying } from "./Buying";
import { ProductSources } from "./ProductSources";
import { SpendingPage, SpendingSummary } from "./Spending";
import { PrivateNote } from "./PrivateNotes";
import { Capture } from "./Capture";
import { ImportDrafts } from "./ImportDrafts";
import { useProductImages } from "./useProductImages";
import { ProfileEditor, GiftPreferencesShortcut } from "./ProfileEditor";
import { Invitations } from "./Invitations";
import { OfferLinks } from "./OfferLinks";
import { Action } from "./Action";
import { PageBoundary } from "./PageBoundary";
import { NavigationScroll } from "./NavigationScroll";
import {
  GiftPreferenceOnboarding,
  GiftPreferencePrompt,
  PreferenceSummary,
  DiscoveryLink,
} from "./GiftPreferences";
import {
  ContributionForm,
  GuidelineLabel,
  SpendingGuidance,
} from "./SpendingGuidance";
import {
  eventSpendingContext,
  spendingGuideline,
} from "../shared/spending-guidance";
import { priorityLabels } from "../shared/organization";
import { ItemActions } from "./Management";
import {
  NotificationBell,
  NotificationCenter,
  NotificationOpen,
  FollowButton,
  WatchButton,
  PushLifecycle,
  clearPushBinding,
} from "./Notifications";
import { MentionNote } from "./MentionNote";
import { actionError } from "./copy";
/* Little Hint operates as a quiet, practical gift notebook. Approved heart-tag artwork anchors the shell; product content leads. */
import {
  lazy,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  NavLink,
  Link,
  Route,
  Routes,
  useLocation,
  useParams,
  Navigate,
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
  ArrowRight,
  ArrowLeft,
  Check,
  ExternalLink,
  LockKeyhole,
  MessageCircle,
  Sun,
  Moon,
  Gift,
  WifiOff,
  LoaderCircle,
} from "lucide-react";
import type { World } from "../shared/model";
import {
  api,
  ApiError,
  isConnectionError,
  clearPersonalData,
  dollars,
  setApiAccount,
} from "./api";
import { AppContext, useApp, type ToastOptions } from "./context";
import {
  Logo,
  Avatar,
  Modal,
  Form,
  Field,
  Empty,
  GiftPhoto,
  PrivateIdeaBadge,
  isPrivateIdea,
  privateIdeaDescription,
  Header,
  MobileNavigation,
} from "./components";
import {
  GroupForm,
  PersonForm,
  ListForm,
  GiftForm,
  value,
  saveDraft,
} from "./forms";
import { Install, UpdateNotice, useOnline } from "./pwa";
import { Login } from "./Login";
import { RevealPolicy } from "./ListFeatures";
import { EventPage } from "./GroupEvents";
import "./gift-actions.css";
const SettingsPage = lazy(() => import("./SettingsPage"));
const GiftDiscoveryPage = lazy(() =>
  import("./GiftDiscovery").then((module) => ({
    default: module.GiftDiscoveryPage,
  })),
);
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
    [message, setMessage] = useState<({ text: string } & ToastOptions) | null>(
      null,
    );
  const [toastHovered, setToastHovered] = useState(false);
  const [toastFocused, setToastFocused] = useState(false);
  const authenticatedAccount = useRef<string | null | undefined>(undefined);
  const isolateAccount = async (id: string | null) => {
    if (authenticatedAccount.current === id) return;
    authenticatedAccount.current = id;
    setApiAccount(id);
    await client.cancelQueries({ predicate: (q) => q.queryKey[0] !== "world" });
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== "world" });
    setModal(null);
    setMessage(null);
  };
  const query = useQuery({
    queryKey: ["world"],
    queryFn: async ({ signal }): Promise<World | null> => {
      try {
        const next = hydrateWorld(
          await api<World>("world", undefined, { signal, timeoutMs: 10000 }),
        );
        if (!signal.aborted) await isolateAccount(next.me.id);
        return next;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          if (!signal.aborted) await isolateAccount(null);
          return null;
        }
        throw error;
      }
    },
    refetchInterval: (q) => (q.state.data ? 20000 : false),
  });
  const startupConnectionFailure = useRef(false);
  if (query.error)
    startupConnectionFailure.current = isConnectionError(query.error);
  if (query.data !== undefined) startupConnectionFailure.current = false;
  useProductImages(query.data, location.key, () => {
    void query.refetch();
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
    if (!message) {
      setToastHovered(false);
      setToastFocused(false);
      return;
    }
    if (toastHovered || toastFocused) return;
    const timer = setTimeout(() => setMessage(null), message.duration ?? 5000);
    return () => clearTimeout(timer);
  }, [message, toastHovered, toastFocused]);
  useEffect(() => {
    if (query.data === null) void clearPushBinding().catch(() => {});
    if (query.data)
      localStorage.setItem("little-hint:last-account", query.data.me.id);
  }, [query.data?.me.id]);
  useEffect(() => {
    if (!query.data) return;
    const main = document.getElementById("main");
    const updateTitle = () => {
      const heading = main?.querySelector<HTMLElement>("h1");
      const title = heading?.textContent
        ? `${heading.textContent} · Little Hint`
        : "Little Hint";
      if (document.title !== title) document.title = title;
    };
    updateTitle();
    // Async pages can replace their loading state after route effects run.
    // Refresh the title without moving focus away from the user's work.
    const titles = new MutationObserver(updateTitle);
    if (main)
      titles.observe(main, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    return () => titles.disconnect();
  }, [location.pathname, location.search, location.hash, !!query.data]);
  const mutate = async <T = any,>(path: string, body: unknown): Promise<T> => {
    if (!navigator.onLine)
      throw new Error("Go online to complete this action.");
    const result = await api<T>(path, body);
    if (["items", "reservations"].includes(path) && !(result as any)?.duplicate)
      localStorage.setItem("little-hint:engaged", "yes");
    await Promise.all([
      client.invalidateQueries({ queryKey: ["world"] }),
      client.invalidateQueries({ queryKey: ["collection"] }),
      client.invalidateQueries({ queryKey: ["spending"] }),
      client.invalidateQueries({ queryKey: ["buying-history"] }),
      client.invalidateQueries({ queryKey: ["notifications"] }),
      client.invalidateQueries({ queryKey: ["trash"] }),
      client.invalidateQueries({ queryKey: ["gift-summary"] }),
    ]);
    return result;
  };
  if (!online && query.data === undefined)
    return (
      <>
        <OfflineDrafts dark={dark} />
        <UpdateNotice />
      </>
    );
  if (query.data === undefined && startupConnectionFailure.current)
    return (
      <>
        <ConnectionScreen
          dark={dark}
          busy={query.isFetching}
          onRetry={() => {
            void query.refetch();
          }}
        />
        <UpdateNotice />
      </>
    );
  if (query.isPending)
    return (
      <div className="loading-screen app-loading-screen">
        <div
          className="loading-content"
          role="status"
          aria-label="Loading Little Hint"
        >
          <Logo dark={dark} />
          <LoaderCircle className="spin" aria-hidden="true" />
        </div>
        <p className="loading-credit">Created by Affolder Creative</p>
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
  if (world.people.some((p) => p.userId === world.me.id && p.nameSetupRequired))
    return <NameSetup dark={dark} />;
  return (
    <AppContext.Provider
      value={{
        world,
        mutate,
        open: (title, body) => setModal({ title, body }),
        close: () => setModal(null),
        toast: (text, options) => setMessage({ text, ...options }),
        dark,
      }}
    >
      <NavigationScroll key={world.me.id} account={world.me.id}>
        <PushLifecycle />
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
                    (to === "/lists" &&
                      location.pathname.startsWith("/events/"))
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
                <NotificationBell />
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
                You are offline. Lists and gift plans may have changed.
                Reconnect to reserve gifts, update purchases, or save changes.
              </div>
            )}
            {(world.environment === "staging" ||
              world.environment === "preview" ||
              world.me.email.endsWith("@example.test")) && (
              <div
                className="demo-banner"
                role="region"
                aria-label="Test environment"
              >
                {world.environment === "preview"
                  ? "Synthetic preview · Sample data · Emails go to the test inbox"
                  : world.environment === "staging"
                    ? "Test version · Sample data · Emails go to a test inbox"
                    : "Demo version · Sample data"}
              </div>
            )}
            <main id="main" tabIndex={-1}>
              {world.spendingAvailable !== false &&
                world.spendingInvitation && (
                  <p className="notice">
                    <Link to="/settings?section=spending">
                      You have a spending partner invitation. Review it in
                      Settings.
                    </Link>
                  </p>
                )}
              <GiftPreferenceOnboarding key={world.me.id}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route
                    path="/capture"
                    element={<Capture key={location.search} />}
                  />
                  <Route
                    path="/notifications"
                    element={<NotificationCenter />}
                  />
                  <Route
                    path="/notifications/batches/:id"
                    element={<NotificationOpen batch />}
                  />
                  <Route
                    path="/notifications/:id"
                    element={<NotificationOpen />}
                  />
                  <Route path="/people" element={<People />} />
                  <Route
                    path="/people/:id/gift-ideas"
                    element={
                      <PageBoundary key={location.pathname}>
                        <GiftDiscoveryPage />
                      </PageBoundary>
                    }
                  />
                  <Route path="/people/:id" element={<PersonPage />} />
                  <Route path="/lists" element={<Lists />} />
                  <Route path="/lists/:id" element={<Lists />} />
                  <Route path="/events/:id" element={<EventPage />} />
                  <Route path="/gift/:id" element={<GiftDetail />} />
                  <Route path="/buying" element={<Buying />} />
                  <Route
                    path="/buying/spending"
                    element={
                      world.spendingAvailable === false ? (
                        <Navigate to="/buying" replace />
                      ) : (
                        <SpendingPage />
                      )
                    }
                  />
                  <Route path="/exchanges" element={<Exchanges />} />
                  <Route
                    path="/settings"
                    element={
                      <PageBoundary key="settings">
                        <SettingsPage theme={theme} setTheme={setTheme} />
                      </PageBoundary>
                    }
                  />
                  <Route path="/invite/:id" element={<Invitations />} />
                  <Route
                    path="*"
                    element={
                      <Empty
                        page
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
              </GiftPreferenceOnboarding>
            </main>
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
          <div
            className="toast"
            role="status"
            onMouseOver={() => setToastHovered(true)}
            onMouseLeave={() => setToastHovered(false)}
            onFocus={() => setToastFocused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setToastFocused(false);
            }}
          >
            <Check size={18} aria-hidden="true" />
            <span>
              {message.text}
              {message.action && (
                <>
                  {" "}
                  <Link
                    to={message.action.to}
                    onClick={() => {
                      setMessage(null);
                      setToastHovered(false);
                      setToastFocused(false);
                    }}
                  >
                    {message.action.label}
                  </Link>
                </>
              )}
            </span>
          </div>
        )}
        <UpdateNotice />
      </NavigationScroll>
    </AppContext.Provider>
  );
}
function ConnectionScreen({
  dark,
  offline = false,
  busy = false,
  onRetry,
  children,
}: {
  dark: boolean;
  offline?: boolean;
  busy?: boolean;
  onRetry: () => void;
  children?: ReactNode;
}) {
  return (
    <main className="connection-screen">
      <div className="connection-intro">
        <Logo dark={dark} />
        <h1>
          {offline
            ? "A little out of touch."
            : "Well, this wasn't on the wish list."}
        </h1>
        <p>
          {offline
            ? "Your device appears to be offline. Reconnect to open your wish lists."
            : "We can't reach Little Hint right now. Try again in a moment."}
        </p>
        <button className="button" disabled={busy} onClick={onRetry}>
          {busy ? "Trying again…" : "Try again"}
        </button>
        {!offline && (
          <span className="sr-only" role="status">
            {busy ? "Trying to connect to Little Hint." : ""}
          </span>
        )}
      </div>
      {children && <div className="connection-drafts">{children}</div>}
    </main>
  );
}
function OfflineDrafts({ dark }: { dark: boolean }) {
  const account = localStorage.getItem("little-hint:last-account");
  const enabled =
    account && localStorage.getItem(`little-hint:draft-optin:${account}`);
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);
  return (
    <ConnectionScreen dark={dark} offline onRetry={() => location.reload()}>
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
              onClick={async () => {
                await clearPersonalData();
                location.reload();
              }}
            >
              Delete saved drafts
            </button>
          </div>
        </Modal>
      )}
    </ConnectionScreen>
  );
}
function Home() {
  const { world, open } = useApp();
  const incoming = world.invitations.some(
    (i) =>
      (!!i.groupId || !!i.friendEntryId) &&
      i.email === world.me.email.toLowerCase(),
  );
  const others = world.items.filter((i) => !i.archived && !i.isRecipient);
  const items = others.length ? others : world.items.filter((i) => !i.archived);
  const feedMode = world.homeFeedMode ?? (others.length ? "gifting" : "own");
  const solo = !world.groups.length;
  const hasLists = world.lists.some((list) => list.canEdit && !list.archived);
  return (
    <>
      <Header
        title={`Hi, ${world.me.name.split(" ")[0]}.`}
        description={
          feedMode === "gifting"
            ? "A few hints for your favorite people."
            : "A little hint about what you would love."
        }
      >
        <Link className="text-button" to={solo ? "/lists" : "/people"}>
          {solo ? "My lists" : "View your people"} <ArrowRight size={16} />
        </Link>
      </Header>
      <GiftPreferencePrompt />
      <Install />
      {incoming && <Invitations />}
      {solo && !(world.hasActiveItems ?? !!items.length) ? (
        <Empty
          title={
            hasLists
              ? "Add a few things you would love"
              : "Start with a wish list"
          }
          action={
            <button
              className="button"
              onClick={() =>
                hasLists
                  ? open("Add item", <GiftForm />)
                  : open("Your first wish list", <ListForm />)
              }
            >
              <Plus size={17} />
              {hasLists ? "Add item" : "Create your first wish list"}
            </button>
          }
        >
          Your wish list stays private until you choose to share it with a
          family group.
        </Empty>
      ) : (
        <Browser items={items} headingLevel={2} />
      )}
      {solo && (
        <p>
          Ready to share?{" "}
          {world.canCreateGroups !== false && (
            <>
              <button
                className="text-button"
                onClick={() => open("Create a family group", <GroupForm />)}
              >
                Create a family group
              </button>{" "}
              or{" "}
            </>
          )}
          accept an invitation from someone you know
          {world.canCreateGroups === false
            ? ", or ask an app administrator to create a group."
            : "."}
        </p>
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
        description="Find your people, browse their wish lists, and keep gift ideas for them."
      >
        <button
          className="button"
          onClick={() => open("Add a friend", <AddFriend />)}
        >
          <Plus size={17} /> Add a friend
        </button>
        <button
          className="button secondary"
          onClick={() => open("A profile you manage", <PersonForm />)}
        >
          <Plus size={17} />
          Managed profile
        </button>
      </Header>
      <p className="notice">
        <Link to="/settings?section=invitations">
          Invite someone to Little Hint
        </Link>{" "}
        so they can manage their own wishes. To share lists, send a separate{" "}
        <Link to="/settings?section=groups&view=members">
          family-group invitation
        </Link>
        . Create a managed profile for someone whose wishes you’ll look after.
      </p>
      <div className="people-list">
        {world.people.map((p) => (
          <Link
            className="person-row"
            key={p.id}
            to={`/people/${p.id}${world.friendEntries?.some((f) => f.personId === p.id) ? "?tab=ideas" : ""}`}
          >
            <Avatar name={p.name} />
            <div>
              <h2>{p.name}</h2>
              <p>
                {p.userId === world.me.id
                  ? "Your wish lists"
                  : p.guardians.includes(world.me.id)
                    ? "Managed by you"
                    : world.friendEntries?.some(
                          (f) => f.personId === p.id && !f.connectedAt,
                        )
                      ? "Gift ideas · Not connected"
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
  const shoppingLocation = useLocation();
  const { id } = useParams();
  const { world, open } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "ideas" ? "ideas" : "wishes";
  const tabNavigation = useRef<{ tab: string; x: number; y: number } | null>(
    null,
  );
  useLayoutEffect(() => {
    const pending = tabNavigation.current;
    if (!pending || pending.tab !== tab) return;
    tabNavigation.current = null;
    // A tab change updates history without behaving like a new page visit.
    document
      .getElementById(`person-tab-${tab}`)
      ?.focus({ preventScroll: true });
    window.scrollTo({ left: pending.x, top: pending.y, behavior: "instant" });
  }, [tab]);
  const setTab = (next: string) => {
    if (next === tab) return;
    tabNavigation.current = { tab: next, x: window.scrollX, y: window.scrollY };
    setParams((current) => {
      const updated = new URLSearchParams(current);
      if (next === "ideas") updated.set("tab", "ideas");
      else updated.delete("tab");
      return updated;
    });
  };
  const person = world.people.find((p) => p.id === id);
  const redirect = id && world.personRedirects?.[id];
  if (redirect)
    return <Navigate replace to={`/people/${redirect}?tab=ideas`} />;
  if (!person)
    return (
      <Empty
        page
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
  const friendEntries = (world.friendEntries ?? []).filter(
    (f) => f.personId === person.id,
  );
  const unconnectedFriend = friendEntries.some((f) => !f.connectedAt);
  const archivedFriend =
    friendEntries.length > 0 && friendEntries.every((f) => f.archived);
  const lists = world.lists.filter(
    (list) =>
      !list.archived &&
      list.ownerIds.includes(person.id) &&
      // Pending ownership invitations also appear in world.lists, but do not
      // grant access to the list's contents until accepted.
      (list.canEdit ||
        world.groups.some((group) => list.groupIds.includes(group.id))),
  );
  const editableLists = lists.filter((l) => l.canEdit);
  const addWish = () =>
    editableLists.length === 1
      ? open("Add item", <GiftForm listId={editableLists[0].id} />)
      : editableLists.length > 1
        ? open(
            "Choose a wish list",
            <div className="managed-list-choices">
              {editableLists.map((list) => (
                <button
                  className="button secondary"
                  key={list.id}
                  onClick={() =>
                    open("Add item", <GiftForm listId={list.id} />)
                  }
                >
                  {list.name}
                </button>
              ))}
            </div>,
          )
        : open(
            "Create wish list",
            <ListForm
              personId={person.id}
              onCreated={(list) =>
                open("Add item", <GiftForm listId={list.id} />)
              }
            />,
          );
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
            : unconnectedFriend
              ? `Plan gifts for ${person.name} before they join.`
              : `A few hints about what ${person.name} would love.`
        }
      >
        {own && tab === "wishes" && (
          <button className="button" onClick={addWish}>
            <Plus size={17} />
            {editableLists.length ? "Add item" : "Create wish list"}
          </button>
        )}
        {own && person.userId !== world.me.id && tab === "ideas" && (
          <button
            className="button"
            onClick={() =>
              open(
                `Gift idea for ${person.name}`,
                <GiftForm recipientId={person.id} />,
              )
            }
          >
            <Plus size={17} />
            Add gift idea
          </button>
        )}
        <DiscoveryLink personId={person.id} />
        {person.userId && <FollowButton target="person" targetId={person.id} />}
        {own ? (
          <>
            <button
              className="button secondary"
              onClick={() =>
                open("Edit profile", <ProfileEditor personId={person.id} />)
              }
            >
              Edit profile
            </button>
            <GiftPreferencesShortcut personId={person.id} name={person.name} />
          </>
        ) : !archivedFriend ? (
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
        ) : null}
      </Header>
      {!person.userId && own && (
        <p className="muted">
          {person.managedGroupIds?.length
            ? `Profile shared with ${world.groups
                .filter((g) => person.managedGroupIds?.includes(g.id))
                .map((g) => g.name)
                .join(
                  ", ",
                )}. Each wish list and gift idea has its own audience.`
            : "Profile sharing is off. Lists and ideas you share separately keep their audience."}
        </p>
      )}
      <FriendManagement personId={person.id} />
      {person.userId !== world.me.id && <SpendingSummary person={person.id} />}
      <PreferenceSummary personId={person.id} />
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
        }}
      >
        {["wishes", "ideas"].map((key) => (
          <button
            key={key}
            id={`person-tab-${key}`}
            data-navigation-focus={`person-tab-${key}`}
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
        {tab === "ideas" && <ImportDrafts recipientId={id} />}
        {tab === "wishes" && lists.length > 0 && (
          <>
            <nav
              className="person-lists"
              aria-label={`Wish lists for ${person.name}`}
            >
              <ul>
                {lists.map((list) => (
                  <li key={list.id}>
                    <Link
                      className="person-list-link"
                      to={shoppingLink(
                        `/lists/${list.id}`,
                        shoppingLocation.search,
                      )}
                      aria-labelledby={`person-list-name-${list.id}`}
                      aria-describedby={`person-list-type-${list.id}`}
                    >
                      <span>
                        <strong id={`person-list-name-${list.id}`}>
                          {list.name}
                        </strong>
                        <small id={`person-list-type-${list.id}`}>
                          {list.groupEventId
                            ? "Group event wish list"
                            : "Wish list"}
                        </small>
                      </span>{" "}
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        )}
        <Browser
          key={`${id}-${tab}`}
          scope="person"
          scopeId={id}
          tab={tab}
          personScoped
          searchLabel={tab === "ideas" ? "Search gift ideas" : "Search items"}
          listNames={
            tab === "wishes"
              ? new Map(lists.map((list) => [list.id, list.name]))
              : undefined
          }
          emptyTitle={
            tab === "ideas"
              ? `No gift ideas for ${person.name} yet`
              : lists.length
                ? "No items on these wish lists yet"
                : "No wish-list items shared yet"
          }
          emptyText={
            tab === "ideas"
              ? archivedFriend
                ? "Saved ideas stay here. Restore this friend entry to add more or share again."
                : "Save an idea here and choose who can see it."
              : lists.length
                ? own
                  ? "Open a wish list above to add an item or read its notes."
                  : "Open a wish list above to read its notes."
                : own
                  ? "Add an item to a wish list to get started."
                  : unconnectedFriend
                    ? "This friend hasn't connected an account yet. Save gift ideas on the Gift ideas tab, or invite them to connect."
                    : "Ask them to share a wish list with your family group."
          }
          emptyAction={
            tab === "ideas" &&
            person.userId !== world.me.id &&
            !archivedFriend ? (
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
              (!i.archived || i.canEdit) &&
              i.recipientIds.includes(id!) &&
              (tab === "wishes" ? !!i.listId : !i.listId),
          )}
        />
      </div>
    </>
  );
}
function GiftDetail() {
  const noteLocation = useLocation();
  const [, setShoppingParams] = useSearchParams();
  const { id } = useParams();
  const { world, open, mutate, toast, close } = useApp();
  const detailQuery = useCollection<GiftView>(`items/${id}`);
  const gift = world.paged
    ? detailQuery.data
    : world.items.find((i) => i.id === id);
  const [quantity, setQuantity] = useState(1),
    [exchange, setExchange] = useState(
      new URLSearchParams(noteLocation.search).get("shopping") ?? "",
    );
  useEffect(() => {
    setExchange(new URLSearchParams(noteLocation.search).get("shopping") ?? "");
  }, [id, noteLocation.search]);
  if (world.paged && (detailQuery.isPending || detailQuery.error))
    return <CollectionStatus query={detailQuery} />;
  if (!gift)
    return (
      <Empty
        page
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
  const ideaRecipientId = gift.recipientIds.find((id) =>
    world.people.some((person) => person.id === id),
  );
  const myReservations =
    gift.reservations?.filter((reservation) => reservation.mine) ?? [];
  const myReserved = myReservations.reduce(
    (total, reservation) => total + reservation.quantity,
    0,
  );
  const myPurchased = myReservations.reduce(
    (total, reservation) => total + (reservation.purchased ?? 0),
    0,
  );
  const choices = shoppingChoices(world, gift);
  const selectedExchange = choices.find((c) => c.key === exchange);
  const spendingContext = selectedExchange
    ? {
        kind: "exchange" as const,
        id: selectedExchange.id,
        giverId: selectedExchange.giver,
        recipientId: selectedExchange.recipient,
      }
    : eventSpendingContext(world, gift);
  const contextSelector = (choices.length > 0 ||
    exchange ||
    gift.comments?.some((c) => c.needsPrivacyReview) ||
    gift.reservations?.some((r) => r.needsPrivacyReview)) && (
    <div className="shopping-context">
      <Field label="Buying for">
        <select
          value={exchange}
          onChange={(e) => {
            const value = e.target.value;
            setExchange(value);
            setShoppingParams(
              (current) => {
                const next = new URLSearchParams(current);
                next.set("shopping", value);
                return next;
              },
              { replace: true },
            );
          }}
        >
          <option value="" disabled>
            Choose an exchange or separate gift
          </option>
          <option value="ordinary">Not part of an exchange</option>
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="muted">
        Link this gift to an exchange, or keep it separate.
      </p>
    </div>
  );
  return (
    <>
      <Link
        className="back-link"
        to={shoppingLink(
          gift.listId
            ? `/lists/${gift.listId}`
            : ideaRecipientId
              ? `/people/${ideaRecipientId}?tab=ideas`
              : "/",
          noteLocation.search,
        )}
      >
        <ArrowLeft size={16} />
        {gift.listId
          ? "Back to wish list"
          : ideaRecipientId
            ? "Back to gift ideas"
            : "Back to Home"}
      </Link>
      <div className="gift-detail">
        <ItemPhotoDetail gift={gift} />
        <section className="gift-detail-info">
          <div className="gift-recipient">
            <Avatar name={gift.recipientNames[0]} small />
            <span>For {gift.recipientNames.join(" & ")}</span>
          </div>
          <div className="section-heading">
            <h1>{gift.title}</h1>
            <ItemActions gift={gift} />
          </div>
          <PrivateIdeaBadge gift={gift} />
          {gift.listId && gift.priority && (
            <span className={`item-priority priority-${gift.priority}`}>
              {priorityLabels[gift.priority]}
            </span>
          )}
          <p className="status">
            {gift.publicationState === "draft"
              ? "Draft · Not yet published"
              : gift.archived
                ? "Archived"
                : gift.isRecipient && !gift.canShop
                  ? gift.mode === "surprise"
                    ? "On your list · Buying plans stay a surprise"
                    : "On your list · You can see the gift plans"
                  : gift.available
                    ? `${gift.available} available to reserve`
                    : "Taken care of"}
            {myReserved > 0 &&
              ` · You reserved ${myReserved} · ${myPurchased} purchased`}
          </p>
          {myReserved > 0 && (
            <Link className="text-button" to="/buying">
              {myReservations.length === 1
                ? "Manage reservation"
                : "Manage reservations"}
            </Link>
          )}
          <Price gift={gift} />
          <PriceControls gift={gift} />
          <GuidelineLabel
            amount={
              spendingContext ? spendingGuideline(world, spendingContext) : null
            }
          />
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
            <ProductSources sources={gift.productSources} />
            {gift.importedAt && !gift.pricing && (
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
          {gift.purchaseOffers && (
            <OfferLinks candidate={{ offers: gift.purchaseOffers }} />
          )}
          {gift.recommendationEvidence?.map((e, i) => (
            <p className="muted" key={i}>
              <a href={e.url} target="_blank" rel="noopener noreferrer">
                {e.label}
              </a>
            </p>
          ))}
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
          {(gift.archived ||
            gift.canShop === false ||
            (gift.canShop === undefined && gift.isRecipient)) &&
            contextSelector}
          {gift.archived ? (
            <p className="notice">
              {gift.listId
                ? "This item is archived."
                : "This gift idea is archived."}
            </p>
          ) : gift.canShop === false ||
            (gift.canShop === undefined && gift.isRecipient) ? (
            <p className="privacy-note">
              <LockKeyhole size={18} />
              {gift.publicationState === "draft"
                ? "Publish this draft when you’re ready to share it with your wish-list viewers."
                : gift.mode === "surprise"
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
                {isPrivateIdea(gift)
                  ? privateIdeaDescription
                  : gift.available
                    ? `${gift.available} available to reserve. Let your people know you have this one covered.`
                    : "All requested items have been reserved."}
              </p>
              {contextSelector}
              {!!gift.available && (
                <>
                  <div className="form-row">
                    <Field
                      label={
                        myReserved > 0 ? "Additional quantity" : "Quantity"
                      }
                    >
                      <input
                        type="number"
                        min="1"
                        max={gift.available}
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </Field>
                  </div>
                  <SpendingGuidance
                    context={spendingContext}
                    preview={{ itemId: gift.id, quantity }}
                  />
                  <Action
                    onClick={async () => {
                      if (choices.length && !exchange)
                        throw new Error("Choose who this gift is for.");
                      const c = choices.find((c) => c.key === exchange);
                      if (exchange && exchange !== "ordinary" && !c)
                        throw new Error(
                          "This assignment is unavailable. Choose again.",
                        );
                      await mutate("reservations", {
                        itemId: gift.id,
                        ordinary: exchange === "ordinary",
                        quantity,
                        exchangeId: c?.id,
                        giverId: c?.giver,
                        exchangeRecipientId: c?.recipient,
                      });
                      toast(
                        "Gift reserved. Mark it as purchased or cancel your reservation in Buying.",
                        {
                          action: { label: "Open Buying", to: "/buying" },
                          duration: 10000,
                        },
                      );
                    }}
                  >
                    <ShoppingBag size={16} />
                    {myReserved > 0 ? "Reserve more" : "Reserve gift"}
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
              {r.needsPrivacyReview && (
                <div>
                  <p>
                    This older gift needs a context choice. Other shoppers see
                    an anonymous reservation until you confirm.
                  </p>
                  <Action
                    onClick={() =>
                      mutate("privacy/review", {
                        id: r.id,
                        revision: r.revision,
                        kind: "reservation",
                        ...shoppingPayload(exchange),
                      })
                    }
                  >
                    Confirm gift context
                  </Action>
                </div>
              )}
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
                        .reduce((n, c) => n + netContribution(c), 0),
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
                      <ContributionForm gift={gift} reservation={r} />,
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
            {selectedExchange
              ? `New notes are visible only to ${world.people.find((p) => p.id === selectedExchange.giver)?.name ?? "this giver"} and people managing their profile. Recipients cannot read them.`
              : (choices.length && !exchange) ||
                  (exchange !== "ordinary" && exchange && !selectedExchange)
                ? "Choose who this gift is for before writing a note."
                : "New notes are visible to other shoppers with access to this gift. Recipients cannot read them."}
          </p>
          {noteLocation.hash.startsWith("#note-") &&
            !gift.comments.some(
              (c) => `#note-${c.id}` === noteLocation.hash,
            ) && (
              <p role="status">
                This note was deleted or is no longer available.
              </p>
            )}
          {gift.comments.length ? (
            gift.comments.map((c) => (
              <div key={c.id}>
                {c.needsPrivacyReview && (
                  <div>
                    <p>
                      This older note may describe an exchange. Only you can
                      read it until you choose its audience.
                    </p>
                    <Action
                      secondary
                      onClick={() =>
                        mutate("privacy/review", {
                          id: c.id,
                          revision: c.revision,
                          kind: "note",
                          authorOnly: true,
                        })
                      }
                    >
                      Keep note private
                    </Action>
                    <Action
                      onClick={() =>
                        mutate("privacy/review", {
                          id: c.id,
                          revision: c.revision,
                          kind: "note",
                          ...shoppingPayload(exchange),
                        })
                      }
                    >
                      Confirm selected audience
                    </Action>
                  </div>
                )}
                <p className="muted">Visible to: {c.audience}</p>
                <PrivateNote
                  note={c}
                  itemId={gift.id}
                  targeted={noteLocation.hash === `#note-${c.id}`}
                />
              </div>
            ))
          ) : (
            <p>No notes yet. Sizes, plans, and helpful details go here.</p>
          )}
          <WatchButton itemId={gift.id} />
          {!gift.archived &&
            ((!choices.length && !exchange) ||
              exchange === "ordinary" ||
              selectedExchange) && (
              <MentionNote
                key={gift.id}
                itemId={gift.id}
                context={shoppingPayload(exchange)}
              />
            )}
        </section>
      )}
    </>
  );
}
