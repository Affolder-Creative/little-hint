import { useEffect, useState, type ReactNode } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bell, BellOff, Check, CheckCheck } from "lucide-react";
import { api } from "./api";
import { useApp } from "./context";
import { Empty, Header } from "./components";
import { actionError } from "./copy";
import type { NotificationPage, NotificationView } from "../shared/model";
import {
  FollowSettings,
  useFollowSettings,
  type FollowTarget,
} from "./FollowSettings";
import type { NotificationBatchView } from "../shared/model";
import { notificationChannels, channelLabels } from "../shared/follows";
import { defaultPushEvents, notificationTopics } from "../shared/notifications";

type PushInfo = {
  publicKey: string | null;
  devices: { id: string; label: string; current: boolean }[];
};
const supported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
const deviceKey = "little-hint:push-device";
const accountKey = "little-hint:push-account";
export async function clearPushBinding() {
  localStorage.removeItem(deviceKey);
  localStorage.removeItem(accountKey);
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  registration.active?.postMessage({ type: "CLEAR_PUSH" });
  const subscription = await registration.pushManager?.getSubscription();
  await subscription?.unsubscribe();
}
export function AsyncButton({
  action,
  children,
  className = "button secondary",
  label,
}: {
  action: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="async-control">
      <button
        type="button"
        className={className}
        disabled={busy}
        aria-label={label}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await action();
          } catch (e) {
            setError(actionError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
export function NotificationBell() {
  const { world } = useApp();
  const count = world.notificationCount ?? 0;
  return (
    <Link
      to="/notifications"
      className="icon-button notification-bell"
      aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
    >
      <Bell size={20} />
      {count > 0 && (
        <span className="notification-count" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
export function NotificationCenter() {
  const { mutate } = useApp();
  const [unread, setUnread] = useState(false);
  const navigate = useNavigate();
  const query = useInfiniteQuery({
    queryKey: ["notifications", unread],
    initialPageParam: "",
    queryFn: ({ pageParam }) =>
      api<NotificationPage & { asOf: string }>(
        `notifications?unread=${unread}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: 20_000,
  });
  const entries = [
    ...new Map(
      query.data?.pages.flatMap((p) => p.entries).map((n) => [n.id, n]),
    ).values(),
  ];
  return (
    <>
      <Header
        title="Notifications"
        description="Updates from your people and gift plans."
      >
        <Link className="text-button" to="/settings?section=notifications">
          Notification settings
        </Link>
      </Header>
      <div className="notification-toolbar">
        <div className="actions" aria-label="Filter notifications">
          <button
            className={`button ${unread ? "secondary" : ""}`}
            aria-pressed={!unread}
            onClick={() => setUnread(false)}
          >
            All
          </button>
          <button
            className={`button ${unread ? "" : "secondary"}`}
            aria-pressed={unread}
            onClick={() => setUnread(true)}
          >
            Unread
          </button>
        </div>
        {!!query.data?.pages[0].unreadCount && (
          <AsyncButton
            action={() =>
              mutate("notifications/read", {
                through: query.data!.pages[0].asOf,
                read: true,
              })
            }
          >
            <CheckCheck size={17} /> Mark all as read
          </AsyncButton>
        )}
      </div>
      {query.isPending ? (
        <p role="status">Loading notifications…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{actionError(query.error)}</p>
          <button className="button secondary" onClick={() => query.refetch()}>
            Try again
          </button>
        </div>
      ) : entries.length ? (
        <ul className="notification-list">
          {entries.map((n) => (
            <li key={n.id} className={n.readAt ? "" : "unread"}>
              <div className="notification-symbol" aria-hidden="true">
                {n.readAt ? <Check size={19} /> : <Bell size={19} />}
              </div>
              <div className="notification-content">
                <AsyncButton
                  className="notification-open"
                  action={async () => {
                    await mutate("notifications/read", {
                      ids: [n.id],
                      read: true,
                    });
                    navigate(n.href);
                  }}
                >
                  <span>{n.message}</span>
                  {n.context && <span className="muted">{n.context}</span>}
                </AsyncButton>
                <time dateTime={n.createdAt}>
                  {new Date(n.createdAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
              <AsyncButton
                className="text-button"
                label={`${n.readAt ? "Mark unread" : "Mark read"}: ${n.message}`}
                action={() =>
                  mutate("notifications/read", { ids: [n.id], read: !n.readAt })
                }
              >
                {n.readAt ? "Mark unread" : "Mark read"}
              </AsyncButton>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={unread ? "You’re all caught up" : "No updates yet"}>
          {unread
            ? "New unread updates will appear here."
            : "Follow a person or wish list, or join a gift conversation to get updates here."}
        </Empty>
      )}
      {query.hasNextPage && (
        <button
          className="button secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}
export function NotificationOpen({ batch = false }: { batch?: boolean }) {
  const { id } = useParams();
  const { mutate } = useApp();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["notification", batch, id],
    queryFn: async () => {
      if (batch) {
        const value = await api<NotificationBatchView>(
          `notifications/batches/${id}`,
        );
        return { id: id!, href: value.href, readIds: value.ids };
      }
      const value = await api<NotificationView>(`notifications/${id}`);
      return { ...value, readIds: [value.id] };
    },
    retry: false,
  });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!query.data) return;
    let cancelled = false;
    (async () => {
      const ids = query.data!.readIds;
      for (let start = 0; start < ids.length; start += 100)
        await mutate("notifications/read", {
          ids: ids.slice(start, start + 100),
          read: true,
        });
    })()
      .then(() => {
        if (!cancelled) navigate(query.data!.href, { replace: true });
      })
      .catch((e) => setError(actionError(e)));
    return () => {
      cancelled = true;
    };
  }, [query.data?.id, batch]);
  return query.isError || error ? (
    <Empty
      page
      title="This update is no longer available"
      action={
        <Link className="button secondary" to="/notifications">
          All notifications
        </Link>
      }
    >
      {error ||
        "It may have been resolved, or its sharing settings may have changed."}
    </Empty>
  ) : (
    <p role="status">Opening your update…</p>
  );
}
export function FollowButton({
  target,
  targetId,
  compact = false,
}: FollowTarget & { compact?: boolean }) {
  const { mutate, toast, open } = useApp();
  const { direct, effective } = useFollowSettings({ target, targetId });
  const following = effective.following;
  const label = direct?.muted
    ? "List muted"
    : following
      ? "Following"
      : target === "person"
        ? "Follow person"
        : target === "group"
          ? "Follow family group"
          : target === "household"
            ? "Follow household"
            : "Follow wish list";
  return (
    <AsyncButton
      className={compact ? "text-button" : undefined}
      label={label}
      action={async () => {
        if (direct || following) {
          open(
            "Notification settings",
            <FollowSettings target={target} targetId={targetId} />,
          );
          return;
        }
        await mutate("follows", { target, targetId, following: true });
        toast("You’ll get updates when new wish-list items are added.");
      }}
    >
      {direct?.muted ? (
        <BellOff size={17} />
      ) : following ? (
        <Check size={17} />
      ) : (
        <Bell size={17} />
      )}
      {compact && !following && !direct?.muted ? "Follow" : label}
    </AsyncButton>
  );
}
export function NotificationDetails() {
  const { world } = useApp();
  const [details, setDetails] = useState(
    world.preferences.notificationDetails ?? {},
  );
  return (
    <details className="notification-disclosure">
      <summary>
        Preview privacy
        <span className="muted">
          {notificationChannels.some((c) => details[c])
            ? `Previews allowed: ${notificationChannels
                .filter((c) => details[c])
                .map((c) => channelLabels[c])
                .join(", ")}`
            : "Details hidden on all channels"}
        </span>
      </summary>
      <fieldset className="choice-group notification-details">
        <legend>Show details in notifications</legend>
        <p className="muted">
          Choose where previews may show names, list names, and priorities
          outside Little Hint, including on a lock screen. Delivered previews
          cannot be recalled. Private gift plans and notes stay generic.
        </p>
        {notificationChannels.map((c) => (
          <div key={c}>
            <label className="check">
              <input
                type="checkbox"
                name={`details-${c}`}
                checked={details[c] ?? false}
                onChange={(e) =>
                  setDetails((d) => ({ ...d, [c]: e.target.checked }))
                }
              />
              {channelLabels[c]}
            </label>
            <p className="muted">
              Example:{" "}
              {details[c]
                ? 'John added 3 items to "Birthday", including 1 marked Most wanted.'
                : "Open Little Hint to see the details."}
            </p>
          </div>
        ))}
      </fieldset>
    </details>
  );
}
export function WatchButton({ itemId }: { itemId: string }) {
  const { world, mutate } = useApp();
  const watching =
    world.watches?.find((w) => w.itemId === itemId)?.watching ?? false;
  return (
    <AsyncButton
      action={() => mutate("watches", { itemId, watching: !watching })}
    >
      {watching ? <BellOff size={17} /> : <Bell size={17} />}
      {watching ? "Stop watching notes" : "Watch notes"}
    </AsyncButton>
  );
}
export function NotificationTopics() {
  const { world } = useApp();
  const p = world.preferences;
  const [topics, setTopics] = useState(() => ({
    push: p.pushEvents ?? defaultPushEvents,
    email: p.channelEvents?.email ?? p.events,
    telegram: p.channelEvents?.telegram ?? p.events,
    sms: p.channelEvents?.sms ?? p.events,
  }));
  return (
    <details className="notification-disclosure">
      <summary>
        Customize topics
        <span className="muted">
          {notificationChannels
            .map(
              (c) =>
                `${channelLabels[c]} ${topics[c].length}/${notificationTopics.length}`,
            )
            .join(" · ")}
        </span>
      </summary>
      <div className="notification-topics channel-topics">
        <p className="muted">
          These are your topic choices, including for channels you haven’t
          connected. Delivery also requires an enabled channel above; push
          requires an enabled device. Follow settings can override the default
          channels for new wish-list items.
        </p>
        {notificationTopics.map((topic) => (
          <fieldset className="choice-group" key={topic.id}>
            <legend>
              {topic.id === "wishlist"
                ? "New wish-list items: default channels"
                : topic.label}
            </legend>
            <div className="topic-channels">
              {notificationChannels.map((channel) => (
                <label className="check" key={channel}>
                  <input
                    type="checkbox"
                    name={`${channel}Events`}
                    value={topic.id}
                    checked={topics[channel].includes(topic.id)}
                    onChange={(e) =>
                      setTopics((current) => ({
                        ...current,
                        [channel]: e.target.checked
                          ? [...current[channel], topic.id]
                          : current[channel].filter((id) => id !== topic.id),
                      }))
                    }
                  />
                  {channel === "sms" ? "Text" : channelLabels[channel]}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </details>
  );
}
export function PushSetup() {
  const { world, toast } = useApp();
  const client = useQueryClient();
  const info = useQuery({
    queryKey: ["push"],
    queryFn: () => api<PushInfo>("push"),
  });
  const [permission, setPermission] = useState(
    supported() ? Notification.permission : "unsupported",
  );
  const localId = localStorage.getItem(deviceKey);
  const current = info.data?.devices.find((d) => d.id === localId);
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  const enable = async () => {
    const allowed = await Notification.requestPermission();
    setPermission(allowed);
    if (allowed !== "granted") return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.active)
      throw new Error("The app is still getting ready. Reload and try again.");
    const publicKey = info.data!.publicKey!;
    const bytes = Uint8Array.from(
      atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      }));
    const saved = await api<{ id: string }>(
      "push/subscribe",
      subscription.toJSON(),
    );
    localStorage.setItem(deviceKey, saved.id);
    localStorage.setItem(accountKey, world.me.id);
    registration.active?.postMessage({ type: "BIND_PUSH", deviceId: saved.id });
    await client.invalidateQueries({ queryKey: ["push"] });
    toast("Push notifications enabled on this device.");
  };
  return (
    <details className="push-setup notification-disclosure">
      <summary>
        Push notifications
        <span className="muted">
          {info.isPending
            ? "Checking device setup…"
            : info.isError
              ? "Could not check setup"
              : !info.data?.publicKey
                ? "Not configured on this installation"
                : `${info.data.devices.length} ${info.data.devices.length === 1 ? "device" : "devices"} enabled · ${ios && !installed ? "Add this app to your Home Screen" : !supported() ? "Unsupported in this browser" : permission === "denied" ? "Blocked in this browser" : current ? "Enabled on this device" : "Set up this device"}`}
        </span>
      </summary>
      <p>
        Get an alert on this device when something needs your attention. Choose
        which wish-list details appear under Preview privacy below.
      </p>
      {info.isPending ? (
        <p role="status">Checking device setup…</p>
      ) : info.isError ? (
        <p className="error" role="alert">
          {actionError(info.error)}
        </p>
      ) : !info.data?.publicKey ? (
        <p className="muted">
          Push is not configured on this installation. Your in-app inbox still
          works.
        </p>
      ) : ios && !installed ? (
        <p>
          Add Little Hint to your Home Screen, then open it there to enable
          push. <Link to="/settings?section=device">Installation help</Link>
        </p>
      ) : !supported() ? (
        <p>
          This browser does not support push. Your in-app inbox still works.
        </p>
      ) : permission === "denied" ? (
        <p>
          Notifications are blocked. Allow them in this browser or device’s
          notification settings, then return here.
        </p>
      ) : current ? (
        <div className="actions">
          <span>Enabled on this device</span>
          <AsyncButton
            action={async () => {
              await api("push/test", { id: current.id });
              toast("Test notification sent.");
            }}
          >
            Send a test
          </AsyncButton>
        </div>
      ) : (
        <AsyncButton action={enable}>Enable on this device</AsyncButton>
      )}
      {!!info.data?.devices.length && (
        <ul className="push-devices">
          {info.data.devices.map((d) => (
            <li key={d.id}>
              <span>
                {d.label}
                {d.id === localId ? " · This device" : ""}
              </span>
              <AsyncButton
                className="text-button"
                action={async () => {
                  await api("push/unsubscribe", { id: d.id });
                  if (d.id === localId) await clearPushBinding();
                  await client.invalidateQueries({ queryKey: ["push"] });
                }}
              >
                Disable
              </AsyncButton>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        Supported app icons show your unread count. Counts on other closed
        devices update when they next receive a push or open Little Hint. Use
        your device’s notification settings for quiet hours.
      </p>
    </details>
  );
}
export function PushLifecycle() {
  const { world } = useApp();
  const client = useQueryClient();
  const [bindingReady, setBindingReady] = useState(false);
  useEffect(() => {
    setBindingReady(false);
    if (!("serviceWorker" in navigator)) {
      setBindingReady(true);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      client.invalidateQueries({ queryKey: ["world"] });
      client.invalidateQueries({ queryKey: ["notifications"] });
    };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_UPDATE") refresh();
    };
    navigator.serviceWorker.addEventListener("message", message);
    (async () => {
      if (localStorage.getItem(accountKey) !== world.me.id) {
        await clearPushBinding();
        return;
      }
      if (!supported() || Notification.permission !== "granted") {
        await clearPushBinding();
        return;
      }
      const info = await api<PushInfo>("push");
      if (cancelled) return;
      if (!info.devices.some((d) => d.id === localStorage.getItem(deviceKey))) {
        await clearPushBinding();
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active) return;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription || cancelled) return;
      const saved = await api<{ id: string }>(
        "push/subscribe",
        subscription.toJSON(),
      );
      if (cancelled) return;
      localStorage.setItem(deviceKey, saved.id);
      registration.active?.postMessage({
        type: "BIND_PUSH",
        deviceId: saved.id,
      });
      client.invalidateQueries({ queryKey: ["push"] });
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBindingReady(true);
      });
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", message);
    };
  }, [world.me.id]);
  useEffect(() => {
    if (!bindingReady) return;
    const boundAccount = localStorage.getItem(accountKey);
    if (boundAccount && boundAccount !== world.me.id) return;
    const nav = navigator as Navigator & {
      setAppBadge?: (count: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    const count = world.notificationCount ?? 0;
    (count ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
    if (world.notificationAsOf !== undefined)
      navigator.serviceWorker?.controller?.postMessage({
        type: "UPDATE_BADGE",
        deviceId: localStorage.getItem(deviceKey),
        count,
        timestamp: world.notificationAsOf,
      });
  }, [
    world.notificationCount,
    world.notificationAsOf,
    world.me.id,
    bindingReady,
  ]);
  return null;
}
