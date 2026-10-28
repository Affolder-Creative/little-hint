import { Invitations } from "./Invitations";
import { FollowingSettings } from "./FollowSettings";
import { GiftDiscoveryAdmin } from "./GiftDiscoveryAdmin";
import { PreferenceButton } from "./GiftPreferences";
import {
  FollowButton,
  NotificationTopics,
  NotificationDetails,
  PushSetup,
  clearPushBinding,
} from "./Notifications";
import { settingLabels, settingSources } from "./copy";
import { SettingsNavigation, settingsSections } from "./SettingsNavigation";
import { Confirm } from "./Confirm";
import { familyGroupLabel } from "../shared/households";
import { AccountInvitations } from "./AccountInvitations";
import { HouseholdSettings } from "./Households";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus,
  ExternalLink,
  LogOut,
  KeyRound,
  Trash2,
  Mail,
} from "lucide-react";
import type { World } from "../shared/model";
import { api, authClient, clearPersonalData } from "./api";
import { useApp } from "./context";
import { Avatar, Form, Field, Header } from "./components";
import {
  GroupForm,
  PersonForm,
  GiftForm,
  value,
  getDrafts,
  draftKey,
} from "./forms";
import { Install } from "./pwa";
import { GroupEventSettings } from "./GroupEvents";
import { scrapingProviders } from "../shared/scraping-providers";
import { Action } from "./Action";
export default function SettingsPage({
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
    world.invitations.filter(
      (i) => !!i.groupId && i.email === world.me.email.toLowerCase(),
    ).length + world.links.filter((l) => l.kind === "ownership").length;
  const [notificationSaved, setNotificationSaved] = useState(false);
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
      >
        <span className="settings-version">Version {__APP_VERSION__}</span>
      </Header>
      <div className="settings-layout" data-section={section}>
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
            hidden={section !== "invitations"}
            className="settings-section"
            aria-labelledby="settings-invitations-title"
          >
            <AccountInvitations />
          </section>
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
                <PreferenceButton personId={p.id} />
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
            className="settings-section family-groups-section"
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
            {!selectedGroup && (
              <p className="muted">
                A family group brings friends or family together to share wish
                lists and plan gifts. You can belong to more than one.
              </p>
            )}
            {!!world.invitations.some(
              (i) => !!i.groupId && i.email === world.me.email.toLowerCase(),
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
            {selectedGroup && world.groups.length > 1 && (
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
            )}
            {!selectedGroup && (
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
                <div className="selected-group-heading">
                  <h3>{familyGroupLabel(g, world)}</h3>
                  <span>
                    {g.ownerId === world.me.id
                      ? "You own this group"
                      : "You’re a member"}
                  </span>
                </div>
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
                  <FollowButton target="group" targetId={g.id} compact />
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
            className="settings-section notification-settings"
            onChangeCapture={() => setNotificationSaved(false)}
            hidden={section !== "notifications"}
            aria-labelledby="settings-notifications-title"
          >
            <h2 id="settings-notifications-title">Notifications</h2>
            <p>
              Your inbox keeps relevant updates. Choose where else to receive
              them.
            </p>
            <Form
              submit="Save notification preferences"
              onSubmit={async (f) => {
                await mutate("preferences", {
                  notificationDetails: Object.fromEntries(
                    ["push", "email", "telegram", "sms"].map((c) => [
                      c,
                      f.get(`details-${c}`) === "on",
                    ]),
                  ),
                  email: f.get("email") === "on",
                  telegram: f.get("telegram") === "on",
                  sms: f.get("sms") === "on",
                  events: [
                    ...new Set(
                      ["email", "telegram", "sms"].flatMap((channel) =>
                        f.getAll(`${channel}Events`),
                      ),
                    ),
                  ],
                  pushEvents: f.getAll("pushEvents"),
                  channelEvents: {
                    email: f.getAll("emailEvents"),
                    telegram: f.getAll("telegramEvents"),
                    sms: f.getAll("smsEvents"),
                  },
                  recipientUpdates: f.get("recipientUpdates") === "on",
                });
                setNotificationSaved(true);
              }}
            >
              <fieldset className="choice-group notification-delivery">
                <legend>Delivery channels</legend>
                <div className="delivery-channel">
                  <label className="check">
                    <input
                      type="checkbox"
                      name="email"
                      defaultChecked={world.preferences.email}
                    />
                    Email
                  </label>
                  <span className="muted">{world.me.email}</span>
                </div>
                <div className="delivery-channel">
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
                </div>
                <div className="delivery-channel">
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
                </div>
                <PushSetup />
              </fieldset>
              <NotificationTopics />
              <NotificationDetails />
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
                External alerts show wish-list details only when you enable
                previews. Your inbox shows only updates you can access.
              </p>
            </Form>
            {notificationSaved && (
              <p role="status">Notification preferences saved.</p>
            )}
            <FollowingSettings />
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
          <section
            className="settings-sign-out"
            id="settings-sign-out"
            tabIndex={-1}
          >
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
                await clearPushBinding().catch(() => {});
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
class FreshSignInRequiredError extends Error {}
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
    retry: (failureCount, error) =>
      !(error instanceof FreshSignInRequiredError) && failureCount < 3,
    queryFn: async () => {
      const r = await authClient.listSessions();
      if (r.error?.code === "SESSION_NOT_FRESH")
        throw new FreshSignInRequiredError("Sign in again to manage devices.");
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
      {sessions.error instanceof FreshSignInRequiredError && (
        <div role="alert" className="error">
          <p>
            Sign in again to view or manage your signed-in devices. Add any
            personal drafts you want to keep first, then sign out below and sign
            back in.
          </p>
          <a className="button secondary" href="#settings-sign-out">
            Go to sign out
          </a>
        </div>
      )}
      {sessions.isPending && <p role="status">Checking signed-in devices…</p>}
      {sessions.isSuccess && !sessions.data?.length && (
        <p>No signed-in devices to show. Refresh to check again.</p>
      )}
      {current.error && !!sessions.data?.length && (
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
      {(keys.error ||
        (sessions.error &&
          !(sessions.error instanceof FreshSignInRequiredError))) && (
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
      <GiftDiscoveryAdmin settings={settings.data ?? []} />
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
                !s.key.startsWith("GIFT_DISCOVERY_") &&
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
      <p>
        Backups are managed outside Little Hint. Check your hosting or backup
        system for the latest database and uploaded-file backups, and test a
        restore. Backup status is not reported here.
      </p>
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
            .
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
