import { Pencil, Archive, ArchiveRestore } from "lucide-react";
import { ImportDrafts } from "./ImportDrafts";
import { useProductImages } from "./useProductImages";
import { BrowseTools } from "./BrowseTools";
import { ProfileEditor, GiftPreferencesShortcut } from "./ProfileEditor";
import { Invitations } from "./Invitations";
import { OfferLinks } from "./OfferLinks";
import { Action } from "./Action";
import { PageBoundary } from "./PageBoundary";
import { NavigationScroll, useNavigationState } from "./NavigationScroll";
import {
  GiftPreferenceOnboarding,
  GiftPreferencePrompt,
  PreferenceSummary,
  DiscoveryLink,
} from "./GiftPreferences";
import {
  ContributionForm,
  ContributionSpendingGuidance,
  ShareCostForm,
  GuidelineLabel,
  SpendingGuidance,
  ExchangeGuidelineForm,
} from "./SpendingGuidance";
import {
  eventSpendingContext,
  reservationSpendingContext,
  spendingGuideline,
} from "../shared/spending-guidance";
import { ListIndex } from "./ListIndex";
import { priorityLabels, ordered, sortLabels } from "../shared/organization";
import {
  ActionMenu,
  CollectionTools,
  ItemActions,
  ReorderForm,
  RunButton,
  SortSelect,
  TrashButton,
  TrashView,
  useItemScope,
  useOrganization,
} from "./Management";
import {
  NotificationBell,
  NotificationCenter,
  NotificationOpen,
  FollowButton,
  WatchButton,
  PushLifecycle,
  clearPushBinding,
} from "./Notifications";
import { MentionNote, MentionText } from "./MentionNote";
import { actionError, contributionStatus } from "./copy";
import { Confirm } from "./Confirm";
import { canManageGroupEvents } from "../shared/group-events";
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
  useNavigate,
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
  Info,
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
import type { World, GiftView, Reservation } from "../shared/model";
import { api, ApiError, clearPersonalData, dollars } from "./api";
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
  ExchangeForm,
  value,
  saveDraft,
} from "./forms";
import { Install, UpdateNotice, useOnline } from "./pwa";
import { Login } from "./Login";
import { RevealPolicy, GiftSummaryPanel } from "./ListFeatures";
import { EventPage, ManagedEventNotice } from "./GroupEvents";
import { ExchangeReview, exchangeMissingLists } from "./ExchangeReview";
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
    [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["world"],
    queryFn: async ({ signal }): Promise<World | null> => {
      try {
        return await api<World>("world", undefined, { signal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    refetchInterval: (q) => (q.state.data ? 20000 : false),
  });
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
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);
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
              <GiftPreferenceOnboarding key={world.me.id}>
                <Routes>
                  <Route path="/" element={<Home />} />
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
          <div className="toast" role="status">
            <Check size={18} />
            {message}
          </div>
        )}
        <UpdateNotice />
      </NavigationScroll>
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
    </div>
  );
}
function Browser({
  items,
  emptyTitle = "No items to show yet",
  emptyText = "Add an item to your wish list, or ask your people to share theirs.",
  emptyAction,
  searchLabel = "Search items and gift ideas",
  listNames,
  listId,
  headingLevel = 2,
  personScoped = false,
}: {
  items: GiftView[];
  emptyTitle?: string;
  emptyText?: string;
  emptyAction?: ReactNode;
  searchLabel?: string;
  listNames?: ReadonlyMap<string, string>;
  listId?: string;
  headingLevel?: 2 | 3;
  personScoped?: boolean;
}) {
  const [search, setSearch] = useNavigationState<string>("search", ""),
    [tag, setTag] = useNavigationState<string>("tag", ""),
    [available, setAvailable] = useNavigationState<boolean>("available", false);
  const [selectedPeople, setSelectedPeople] = useNavigationState<string[]>(
    "people",
    [],
  );
  const { world, open, mutate } = useApp();
  const settings = useOrganization(useItemScope(listId));
  const parentList = world.lists.find((l) => l.id === listId);
  const [itemStatus, setItemStatus] = useNavigationState<string>(
    "itemStatus",
    "active",
  );
  const canManage = parentList?.canEdit || items.some((i) => i.canEdit);
  const canReorder = !!parentList?.canEdit && !parentList.archived;
  const visibleItems = parentList?.archived
    ? items
    : items.filter(
        (i) => i.archived === (canManage && itemStatus === "archived"),
      );
  const sorted = ordered(visibleItems, settings.sort, parentList?.itemOrder);
  const showAvailability = items.some((item) => item.available !== undefined);
  const tags = [...new Set(items.flatMap((i) => i.tags))].sort();
  const recipientIds = new Set(items.flatMap((item) => item.recipientIds));
  const people = world.people
    .filter((person) => recipientIds.has(person.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const showPeople = !personScoped && people.length > 1;
  const chosenPeople = showPeople
    ? people.filter((person) => selectedPeople.includes(person.id))
    : [];
  const filtered = sorted.filter(
    (i) =>
      `${i.title} ${i.recipientNames.join(" ")} ${i.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!tag || i.tags.includes(tag)) &&
      (!chosenPeople.length ||
        chosenPeople.some((person) => i.recipientIds.includes(person.id))) &&
      (!showAvailability ||
        !available ||
        (i.available !== undefined && i.available > 0)),
  );
  return (
    <>
      {canManage && items.length > 0 && !parentList?.archived && (
        <div className="tabs" role="group" aria-label="Item status">
          {["active", "archived"].map((status) => (
            <button
              key={status}
              aria-pressed={itemStatus === status}
              onClick={() => setItemStatus(status)}
            >
              {status === "active" ? "Active items" : "Archived items"}
            </button>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <>
          <BrowseTools
            search={search}
            setSearch={setSearch}
            searchLabel={searchLabel}
            placeholder={
              searchLabel === "Search gift ideas"
                ? "Search gift ideas"
                : "Search items"
            }
            searchHint="Search by name, person, or tag"
            activeCount={
              Number(!!tag) +
              Number(showAvailability && available) +
              Number(chosenPeople.length > 0)
            }
            summary={[
              ...(settings.sort !== "manual"
                ? [sortLabels[settings.sort]]
                : []),
              ...(tag ? [tag] : []),
              ...(chosenPeople.length
                ? [
                    `For ${chosenPeople.map((person) => person.name).join(", ")}`,
                  ]
                : []),
              ...(showAvailability && available ? ["Available to give"] : []),
            ]}
            clear={() => {
              setTag("");
              setAvailable(false);
              setSelectedPeople([]);
            }}
          >
            <SortSelect
              items
              manualLabel={parentList ? "List order" : "Default order"}
              sort={settings.sort}
              change={(sort) => settings.save(sort)}
            />
            {canReorder && items.filter((i) => !i.archived).length > 1 && (
              <button
                data-browse-reorder
                className="button secondary small"
                onClick={() =>
                  open(
                    "Arrange wish-list items",
                    <ReorderForm
                      entries={ordered(
                        items.filter((i) => !i.archived),
                        "manual",
                        parentList.itemOrder,
                      ).map((i) => ({ id: i.id, name: i.title }))}
                      save={async (order) => {
                        await mutate("lists/reorder", {
                          id: parentList.id,
                          revision: parentList.revision,
                          order,
                        });
                        await settings.save("manual");
                      }}
                    />,
                  )
                }
              >
                Reorder items
              </button>
            )}
            <label>
              Tag
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
            </label>
            {showPeople && (
              <fieldset className="people-filter">
                <legend>People</legend>
                <details>
                  <summary>
                    {chosenPeople.length
                      ? `${chosenPeople.length} selected`
                      : "All people"}
                  </summary>
                  <div className="people-filter-options">
                    {people.map((person) => (
                      <label className="check" key={person.id}>
                        <input
                          type="checkbox"
                          checked={chosenPeople.some(
                            (selected) => selected.id === person.id,
                          )}
                          onChange={(event) =>
                            setSelectedPeople(
                              event.target.checked
                                ? [
                                    ...chosenPeople.map(
                                      (selected) => selected.id,
                                    ),
                                    person.id,
                                  ]
                                : chosenPeople
                                    .filter(
                                      (selected) => selected.id !== person.id,
                                    )
                                    .map((selected) => selected.id),
                            )
                          }
                        />
                        {person.name}
                      </label>
                    ))}
                  </div>
                </details>
              </fieldset>
            )}
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
          </BrowseTools>
        </>
      )}
      {filtered.length ? (
        <div className="gift-grid">
          {filtered.map((i) => (
            <div className="gift-card-entry" key={i.id}>
              <GiftCard
                gift={i}
                headingLevel={headingLevel}
                sourceListName={i.listId ? listNames?.get(i.listId) : undefined}
              />
              <ItemActions gift={i} />
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title={
            visibleItems.length
              ? "No matches found"
              : itemStatus === "archived"
                ? "No archived items"
                : emptyTitle
          }
          action={
            visibleItems.length ? (
              <button
                className="button secondary"
                onClick={() => {
                  setSearch("");
                  setTag("");
                  setAvailable(false);
                  setSelectedPeople([]);
                }}
              >
                Clear filters
              </button>
            ) : itemStatus === "archived" ? undefined : (
              emptyAction
            )
          }
        >
          {visibleItems.length
            ? "Try another search, or clear your filters to see everything."
            : itemStatus === "archived"
              ? "Items you archive will appear here. You can restore them whenever you like."
              : emptyText}
        </Empty>
      )}
    </>
  );
}
function Home() {
  const { world, open } = useApp();
  const incoming = world.invitations.some(
    (i) => !!i.groupId && i.email === world.me.email.toLowerCase(),
  );
  const others = world.items.filter((i) => !i.archived && !i.isRecipient);
  const items = others.length ? others : world.items.filter((i) => !i.archived);
  const solo = !world.groups.length;
  const hasLists = world.lists.some((list) => list.canEdit && !list.archived);
  return (
    <>
      <Header
        title={`Hi, ${world.me.name.split(" ")[0]}.`}
        description={
          solo
            ? "A place for the things you would love."
            : "A few hints from your favorite people."
        }
      />
      <GiftPreferencePrompt />
      <Install />
      {incoming && <Invitations />}
      <div className="home-intro">
        <div>
          <h2>{others.length ? "From your people" : "Your wish lists"}</h2>
          <p>
            {solo
              ? "Save your wishes here. Choose who to share them with when you're ready."
              : others.length
                ? "A few things they’ve been wishing for."
                : "A little hint about what you would love."}
          </p>
        </div>
        <Link className="text-button" to={solo ? "/lists" : "/people"}>
          {solo ? "My lists" : "View your people"} <ArrowRight size={16} />
        </Link>
      </div>
      {solo && !items.length ? (
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
        <Browser items={items} headingLevel={3} />
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
  const lists = world.lists.filter(
    (list) =>
      !list.archived &&
      list.ownerIds.includes(person.id) &&
      // Pending ownership invitations also appear in world.lists, but do not
      // grant access to the list's contents until accepted.
      (list.canEdit ||
        world.groups.some((group) => list.groupIds.includes(group.id))),
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
            : `A few hints about what ${person.name} would love.`
        }
      >
        <DiscoveryLink personId={person.id} />
        <FollowButton target="person" targetId={person.id} />
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
        {tab === "wishes" && lists.length > 0 && (
          <>
            <nav
              className="person-lists"
              aria-label={`Wish lists for ${person.name}`}
            >
              <ul>
                {lists.map((list) => (
                  <li key={list.id}>
                    <Link className="text-button" to={`/lists/${list.id}`}>
                      {list.name} <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        )}
        <Browser
          key={`${id}-${tab}`}
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
              ? "Save an idea here and choose who can see it."
              : lists.length
                ? own
                  ? "Open a wish list above to add an item or read its notes."
                  : "Open a wish list above to read its notes."
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
              (!i.archived || i.canEdit) &&
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
  const navigate = useNavigate();
  const [showSummary, setShowSummary] = useState(false);
  useEffect(() => setShowSummary(false), [id]);
  const list = world.lists.find((l) => l.id === id);
  const ideaRecipients = world.people.filter(
    (person) =>
      list?.ownerIds.includes(person.id) &&
      person.userId !== world.me.id &&
      !person.guardians.includes(world.me.id),
  );
  const [privacyOpen, setPrivacyOpen] = useNavigationState<boolean>(
    `listPrivacy:${list?.revealAfter ?? "unscheduled"}`,
    !!list?.revealAfter,
  );
  if (id && !list)
    return (
      <Empty
        page
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
        <Header
          className="list-heading"
          title={list.name}
          description={list.description}
        >
          {list.canEdit && !list.archived && (
            <button
              className="button"
              onClick={() => open("Add item", <GiftForm listId={list.id} />)}
            >
              <Plus size={17} /> Add item
            </button>
          )}
          {!list.canEdit && !list.archived && ideaRecipients.length > 0 && (
            <button
              className="button secondary"
              onClick={() =>
                open(
                  ideaRecipients.length === 1
                    ? `Gift idea for ${ideaRecipients[0].name}`
                    : "Add gift idea",
                  <GiftForm
                    recipientOptions={ideaRecipients.map((person) => person.id)}
                    onSaved={(gift) => navigate(`/gift/${gift.id}`)}
                  />,
                )
              }
            >
              <Plus size={17} /> Add gift idea
            </button>
          )}
          {list.canEdit && !list.archived && (
            <DiscoveryLink
              personId={list.ownerIds.find((id) =>
                world.people.some(
                  (p) =>
                    p.id === id &&
                    (p.userId === world.me.id ||
                      p.guardians.includes(world.me.id)),
                ),
              )!}
              listId={list.id}
            />
          )}
          {list.canManageSettings ? (
            <ActionMenu name={list.name} label="List actions">
              <button
                className="text-button"
                onClick={() => open("Edit list", <ListForm list={list} />)}
              >
                <Pencil size={16} aria-hidden="true" /> Edit list
              </button>
              <FollowButton target="list" targetId={list.id} />
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
                {list.archived ? (
                  <ArchiveRestore size={16} aria-hidden="true" />
                ) : (
                  <Archive size={16} aria-hidden="true" />
                )}{" "}
                {list.archived ? "Restore list" : "Archive list"}
              </Action>
              <TrashButton kind="lists" entry={list} />
            </ActionMenu>
          ) : (
            <FollowButton target="list" targetId={list.id} />
          )}
        </Header>
        {!list.canEdit && ideaRecipients.length > 0 && (
          <div className="list-gift-ideas">
            <p className="muted">
              Gift ideas are saved for a person, separately from this wish list.
            </p>
            <nav aria-label="Saved gift ideas">
              {ideaRecipients.map((person) => (
                <Link
                  className="gift-ideas-link"
                  key={person.id}
                  to={`/people/${person.id}?tab=ideas`}
                >
                  View gift ideas for {person.name}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </div>
        )}
        {list.archived && (
          <p className="notice">
            This list is archived. Existing purchase history is preserved.
          </p>
        )}
        {list.groupEventId && <ManagedEventNotice list={list} />}
        <details
          className="list-privacy"
          key={list.id}
          open={privacyOpen}
          onToggle={(event) => setPrivacyOpen(event.currentTarget.open)}
        >
          <summary>
            <Privacy mode={list.mode} />{" "}
            <span className="privacy-disclosure-label">
              <Info size={16} aria-hidden="true" />
              <span className="sr-only">Privacy details</span>
            </span>
          </summary>
          <RevealPolicy list={list} />
        </details>
        {list.canEdit && <ImportDrafts listId={list.id} />}
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
            listId={list.id}
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
  return <ListIndex />;
}

function GiftDetail() {
  const noteLocation = useLocation();
  const { id } = useParams();
  const { world, open, mutate, toast, close } = useApp();
  const gift = world.items.find((i) => i.id === id);
  const [quantity, setQuantity] = useState(1),
    [exchange, setExchange] = useState("");
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
  const choices = world.exchanges.flatMap((e) =>
    e.status === "drawn" && !e.archived
      ? e.myAssignments
          .filter(([, r]) => gift.recipientIds.includes(r))
          .map(([g, r]) => ({
            key: `${e.id}:${g}:${r}`,
            label: `${e.name} · ${world.people.find((p) => p.id === g)?.name ?? "Giver"} to ${world.people.find((p) => p.id === r)?.name ?? "Recipient"}`,
            id: e.id,
            giver: g,
            recipient: r,
          }))
      : [],
  );
  const selectedExchange = choices.find((c) => c.key === exchange);
  const spendingContext = selectedExchange
    ? {
        kind: "exchange" as const,
        id: selectedExchange.id,
        giverId: selectedExchange.giver,
        recipientId: selectedExchange.recipient,
      }
    : eventSpendingContext(world, gift);
  return (
    <>
      <Link
        className="back-link"
        to={
          gift.listId
            ? `/lists/${gift.listId}`
            : ideaRecipientId
              ? `/people/${ideaRecipientId}?tab=ideas`
              : "/"
        }
      >
        <ArrowLeft size={16} />
        {gift.listId
          ? "Back to wish list"
          : ideaRecipientId
            ? "Back to gift ideas"
            : "Back to Home"}
      </Link>
      <div className="gift-detail">
        <GiftPhoto gift={gift} size="full" />
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
            {gift.archived
              ? "Archived"
              : gift.isRecipient
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
          <p className="detail-price">{dollars(gift.priceCents)}</p>
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
                {isPrivateIdea(gift)
                  ? privateIdeaDescription
                  : gift.available
                    ? `${gift.available} available to reserve. Let your people know you have this one covered.`
                    : "All requested items have been reserved."}
              </p>
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
                  <SpendingGuidance
                    context={spendingContext}
                    preview={{ itemId: gift.id, quantity }}
                  />
                  <Action
                    onClick={async () => {
                      const c = choices.find((c) => c.key === exchange);
                      await mutate("reservations", {
                        itemId: gift.id,
                        quantity,
                        exchangeId: c?.id,
                        giverId: c?.giver,
                        exchangeRecipientId: c?.recipient,
                      });
                      toast(
                        "Gift reserved. Open Buying to mark it as purchased or cancel your reservation.",
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
            The recipient cannot see this conversation. Notes from an exchange
            giver are visible only to that giver and anyone managing their
            profile.
          </p>
          {gift.comments.length ? (
            gift.comments.map((c) => (
              <div
                className={`comment${noteLocation.hash === `#note-${c.id}` ? " targeted-note" : ""}`}
                key={c.id}
                id={`note-${c.id}`}
                tabIndex={-1}
              >
                <Avatar name={c.author} small />
                <div>
                  <strong>{c.author}</strong>
                  <small>{new Date(c.createdAt).toLocaleDateString()}</small>
                  <p>
                    <MentionText body={c.body} mentions={c.mentions} />
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p>No notes yet. Sizes, plans, and helpful details go here.</p>
          )}
          <WatchButton itemId={gift.id} />
          {!gift.archived && <MentionNote itemId={gift.id} />}
        </section>
      )}
    </>
  );
}
function Buying() {
  const { world, open, mutate, toast, close } = useApp();
  const contributions = world.contributionHistory;
  const [view, setView] = useNavigationState<
    "needs-buying" | "purchased" | "all"
  >("buyingView", "needs-buying");
  const activeView = useRef<HTMLButtonElement>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (!focusRequest) return;
    // Wait for React to close the dialog and finish restoring its opener.
    (activeView.current ?? document.getElementById("main"))?.focus({
      preventScroll: true,
    });
  }, [focusRequest]);
  const reservations = world.buying.filter((r) => r.quantity > 0);
  const needsBuying = reservations.filter((r) => r.purchased < r.quantity);
  const matchesView = (r: Pick<Reservation, "quantity" | "purchased">) =>
    view === "all" ||
    (view === "purchased"
      ? r.purchased >= r.quantity
      : r.purchased < r.quantity);
  const visible = reservations.filter(matchesView);
  const focusView = () => setFocusRequest((request) => request + 1);
  return (
    <>
      <Header
        title="Your gift plans"
        description="Keep track of gifts you’re buying and helping pay for."
      />
      {reservations.length > 0 && (
        <div
          className="tabs buying-views"
          role="group"
          aria-label="Gift purchase status"
        >
          {(
            [
              ["needs-buying", "Needs buying", needsBuying.length],
              [
                "purchased",
                "Purchased",
                reservations.length - needsBuying.length,
              ],
              ["all", "All", reservations.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              ref={view === key ? activeView : undefined}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      )}
      {visible.length > 0 ? (
        <div className="buying-list">
          {visible.map((r) => {
            const updateAction = (
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
                        if (
                          !matchesView({
                            quantity: r.quantity,
                            purchased: Number(value(f, "purchased")),
                          })
                        )
                          focusView();
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
                        {isPrivateIdea(r.item)
                          ? privateIdeaDescription
                          : "Mark what you have bought so others know it is covered."}{" "}
                        If your plans change, choose Cancel reservation.
                      </p>
                    </Form>,
                  )
                }
              >
                Update purchase
              </button>
            );
            return (
              <div className="buying-row" key={r.id}>
                {r.item ? (
                  <Link
                    to={`/gift/${r.item.id}`}
                    data-navigation-focus={`reservation-${r.id}`}
                    aria-label={`View ${r.titleSnapshot}`}
                  >
                    <GiftPhoto gift={r.item} />
                  </Link>
                ) : (
                  <Gift size={36} />
                )}
                <div>
                  <h2>{r.titleSnapshot}</h2>
                  <PrivateIdeaBadge gift={r.item} />
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
                  {isPrivateIdea(r.item) && (
                    <p className="muted">{privateIdeaDescription}</p>
                  )}
                  {r.exchangeId && (
                    <p className="muted">Secret gift exchange</p>
                  )}
                  <SpendingGuidance
                    context={reservationSpendingContext(world, r)}
                    sharedGift={
                      r.poolTargetCents
                        ? {
                            priceCents: r.item?.priceCents ?? null,
                            quantity: r.quantity,
                            poolTargetCents: r.poolTargetCents,
                          }
                        : undefined
                    }
                  />
                </div>
                <div className="actions">
                  {r.item && r.quantity === 1 && r.purchased === 0 && (
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
                          view === "needs-buying"
                            ? "Marked as purchased. Find it in Purchased to update or cancel."
                            : "Marked as purchased. Use Update purchase if your plans change.",
                        );
                        if (view === "needs-buying") focusView();
                      }}
                      label={`Mark ${r.titleSnapshot} as purchased`}
                    >
                      Mark as purchased
                    </Action>
                  )}
                  {!(r.item && r.quantity === 1 && r.purchased === 0) &&
                    updateAction}
                  <ActionMenu name={r.titleSnapshot} label="More actions">
                    {r.item &&
                      r.quantity === 1 &&
                      r.purchased === 0 &&
                      updateAction}
                    {!r.exchangeId && r.item && !r.item.archived && (
                      <button
                        className="text-button"
                        onClick={() =>
                          open(
                            "Share the cost",
                            <ShareCostForm reservation={r} />,
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
                              if (
                                !qty ||
                                !matchesView({
                                  quantity: qty,
                                  purchased: Math.min(r.purchased, qty),
                                })
                              )
                                focusView();
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
                              The quantity you cancel becomes available for
                              others to reserve. This also reduces the quantity
                              marked as purchased if it is higher than your
                              remaining reservation. It does not cancel a shop
                              order or refund a payment.
                            </p>
                          </Form>,
                        )
                      }
                    >
                      Cancel reservation
                    </button>
                  </ActionMenu>
                </div>
              </div>
            );
          })}
        </div>
      ) : reservations.length > 0 ? (
        <Empty
          title={
            view === "needs-buying"
              ? "Nothing left to buy"
              : "No purchases marked yet"
          }
          action={
            <button
              className="button secondary"
              onClick={() => {
                setView(view === "needs-buying" ? "purchased" : "needs-buying");
                focusView();
              }}
            >
              {view === "needs-buying"
                ? "View purchased gifts"
                : "View gifts to buy"}
            </button>
          }
        >
          {view === "needs-buying"
            ? "All your reserved quantities are marked purchased. You can still review or change them in Purchased."
            : "Gifts appear here once all reserved quantities are marked purchased. Partially purchased gifts stay in Needs buying."}
        </Empty>
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
                  {c.userId === world.me.id && c.status !== "cancelled" && (
                    <ContributionSpendingGuidance
                      reservationId={c.reservationId}
                    />
                  )}
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
  const [view, setView] = useNavigationState<string>("exchangeView", "active"),
    [search, setSearch] = useNavigationState<string>("exchangeSearch", ""),
    [group, setGroup] = useNavigationState<string>("exchangeGroup", ""),
    [status, setStatus] = useNavigationState<string>("exchangeStatus", "");
  const settings = useOrganization("exchanges");
  const canCreate = world.groups.some((g) =>
    canManageGroupEvents(g, world.me.id),
  );
  const location = useLocation();
  useEffect(() => {
    const target = world.exchanges.find(
      (e) => `#exchange-${e.id}` === location.hash,
    );
    if (target) setView(target.archived ? "archived" : "active");
  }, [location.hash]);
  const rows = world.exchanges.filter(
    (e) => !!e.archived === (view === "archived"),
  );
  const exchanges = ordered(rows, settings.sort, settings.order).filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) &&
      (!group || e.groupId === group) &&
      (!status || e.status === status),
  );
  return (
    <>
      <Header
        title="Gift exchanges"
        description="Draw names and give them something to smile about."
      >
        {canCreate && (
          <button
            className="button"
            onClick={() => open("Secret gift exchange", <ExchangeForm />)}
          >
            <Plus size={17} />
            Create exchange
          </button>
        )}
      </Header>
      <div className="tabs" role="group" aria-label="Exchange view">
        {["active", "archived", "trash"].map((value) => (
          <button
            key={value}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {value === "active"
              ? "Current"
              : value === "archived"
                ? "Archived"
                : "Trash"}
          </button>
        ))}
      </div>
      {view !== "trash" && (
        <>
          <CollectionTools
            scope="exchanges"
            rows={rows}
            search={search}
            setSearch={setSearch}
            group={group}
            setGroup={setGroup}
            status={status}
            setStatus={setStatus}
          />
        </>
      )}
      {view === "trash" ? (
        <TrashView kinds={["exchanges"]} />
      ) : exchanges.length ? (
        <div className="exchange-list">
          {exchanges.map((e) => (
            <section
              className="exchange-panel"
              key={e.id}
              id={`exchange-${e.id}`}
            >
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
              <GuidelineLabel amount={e.spendingGuidelineCents} />
              {e.archived && (
                <p className="notice">
                  This exchange is archived. Assignments and purchase history
                  are kept.
                </p>
              )}
              {e.canManage && (
                <div className="actions exchange-controls">
                  {e.status === "drawn" && !e.archived && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        open(
                          "Edit spending guideline",
                          <ExchangeGuidelineForm exchange={e} />,
                        )
                      }
                    >
                      Edit spending guideline
                    </button>
                  )}
                  {e.status === "draft" && !e.archived && (
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

                  <ActionMenu name={e.name} label="Exchange actions">
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
                    <RunButton
                      run={() =>
                        mutate("exchanges/archive", {
                          id: e.id,
                          revision: e.revision,
                          archived: !e.archived,
                        })
                      }
                    >
                      {e.archived ? "Restore exchange" : "Archive exchange"}
                    </RunButton>
                    {e.status !== "drawn" && (
                      <TrashButton kind="exchanges" entry={e} />
                    )}
                    {e.status === "drawn" && (
                      <p>Cancel the exchange before moving it to Trash.</p>
                    )}
                  </ActionMenu>
                </div>
              )}
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
              {e.canManage && e.status === "drawn" && (
                <details
                  className="exchange-notifications"
                  open={e.delivery.pending > 0 || e.delivery.failed > 0}
                >
                  <summary>
                    Notification delivery
                    {e.delivery.failed > 0
                      ? ` · ${e.delivery.failed} failed`
                      : e.delivery.pending > 0
                        ? ` · ${e.delivery.pending} pending`
                        : ""}
                  </summary>
                  <p>
                    Notifications: {e.delivery.sent} processed ·{" "}
                    {e.delivery.pending} pending · {e.delivery.failed} failed
                  </p>
                  <small>
                    Delivery follows each person’s notification settings.
                  </small>
                </details>
              )}
            </section>
          ))}
        </div>
      ) : (
        <Empty
          title={
            world.exchanges.length
              ? "No matching exchanges"
              : "Start a little surprise"
          }
          action={
            !world.groups.length ? (
              <Link className="button" to="/settings?section=groups">
                Create or join a family group
              </Link>
            ) : undefined
          }
        >
          {world.exchanges.length
            ? "Try another search, view, or status."
            : canCreate
              ? "Choose participants and let Little Hint draw the names."
              : world.groups.length
                ? "A family-group owner or event leader can create a gift exchange for your group."
                : "Create or join a family group to take part in gift exchanges."}
        </Empty>
      )}
    </>
  );
}
