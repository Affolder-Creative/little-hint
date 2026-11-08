import type { LookupDiagnostic } from "./lookup-diagnostics";
import type {
  SpendingSettings,
  SpendingConnection,
  SpendingOccasion,
  SpendingRecord,
  SpendingBudget,
} from "./spending";
import type {
  GiftPreferences,
  GiftPreferenceView,
  GiftDiscoveryJob,
  GiftOffer,
  GiftEvidence,
  DiscoveryConfig,
} from "./gift-discovery";
export type Mode = "surprise" | "transparent";
export type Visibility = "private" | "hidden" | "visible";
export interface Base {
  id: string;
  revision: number;
  createdAt: string;
}
export type ItemPriority = "most-wanted" | "would-love" | "nice-to-have";
export type SortOrder =
  | "manual"
  | "priority"
  | "name-asc"
  | "name-desc"
  | "price-asc"
  | "price-desc"
  | "newest"
  | "oldest";
export interface Organization extends Base {
  userId: string;
  scope: string;
  sort: SortOrder;
  order: string[];
}
export type TrashKind = "items" | "lists" | "group-events" | "exchanges";
export interface TrashEntry extends Base {
  kind: TrashKind;
  name: string;
  deletedAt: string;
}
export interface Person extends Base {
  managedOwnerId?: string;
  managedGroupIds?: string[];
  nameSetupRequired?: boolean;
  mergedIntoId?: string;
  name: string;
  userId?: string;
  guardians: string[];
  admin?: boolean;
}
export interface FriendEntry extends Base {
  creatorId: string;
  name: string;
  personId: string;
  originalPersonId: string;
  groupIds: string[];
  archived: boolean;
  connectedAt?: string;
}
export interface Group extends Base {
  name: string;
  ownerId: string;
  memberIds: string[];
  eventLeaderIds?: string[];
}
export interface Household extends Base {
  groupId: string;
  name: string;
}
export interface HouseholdMembership extends Base {
  householdId: string;
  personId: string;
}
export interface GroupInviteRequest extends Base {
  groupId: string;
  requestedBy: string;
  email: string;
  status: "pending" | "approved" | "declined" | "withdrawn";
}
export interface Invitation extends Base {
  friendEntryId?: string;
  declined?: boolean;
  invitedById?: string;
  email: string;
  groupId?: string;
  bootstrap?: boolean;
  expiresAt: string;
  acceptedBy?: string;
  revoked?: boolean;
}
export interface List extends Base {
  deletedAt?: string;
  itemOrder?: string[];
  groupEventId?: string;
  name: string;
  ownerIds: string[];
  pendingOwnerIds: string[];
  groupIds: string[];
  mode: Mode;
  modeLocked: boolean;
  archived: boolean;
  description: string;
  archiveAfter?: string | null;
  revealAfter?: string | null;
  timeZone?: string;
  revealExchangeGivers?: boolean;
}
export interface GroupEvent extends Base {
  spendingGuidelineCents?: number | null;
  deletedAt?: string;
  groupId: string;
  participantIds: string[];
  name: string;
  description: string;
  mode: Mode;
  archived: boolean;
  archiveAfter?: string | null;
  revealAfter?: string | null;
  timeZone: string;
  revealExchangeGivers: boolean;
}
export interface GiftSummary {
  listId: string;
  gifts: Array<{
    id: string;
    itemId: string;
    title: string;
    purchased: number;
    buyerName: string;
    exchange: boolean;
    contributors: Array<{
      id: string;
      name: string;
      status: "sent" | "received";
    }>;
  }>;
}
export interface ProductSource {
  url: string;
  fields: Array<"title" | "description" | "image">;
  method: "extraction" | "web";
  checkedAt: string;
}
export interface PriceTracking {
  baseline: number | null;
  baselineLabel: "when added" | "when tracking started" | "when link changed";
  generation: string;
  paused?: boolean;
  checkedAt?: string;
  status?: "verified" | "unavailable" | "deferred";
  identity?: string;
}
export interface PriceWatch extends Base {
  userId: string;
  itemId: string;
  generation: string;
  reference: number | null;
}
export interface PriceCheck extends Base {
  paidAttempted?: boolean;
  url: string;
  day: string;
  targets: Array<{ id: string; generation: string; revision: number }>;
  status: "pending" | "running" | "complete" | "failed";
  leaseUntil?: string;
  token?: string;
  error?: string;
  providerState?: ImportJob["providerState"];
}
export interface PriceChange extends Base {
  itemId: string;
  generation: string;
  from: number | null;
  to: number | null;
  source: string;
}
export interface Item extends Base {
  /** Creator-private spending default; never changes wish-list membership. */
  spendingListId?: string | null;
  pricing?: PriceTracking;
  friendEntryId?: string;
  productSources?: ProductSource[];
  purchaseOffers?: GiftOffer[];
  recommendationEvidence?: GiftEvidence[];
  deletedAt?: string;
  priority?: ItemPriority | null;
  title: string;
  description: string;
  url: string;
  image: string;
  priceCents: number | null;
  currency: "USD";
  tags: string[];
  quantity: number;
  listId?: string;
  recipientIds: string[];
  creatorId: string;
  visibility: Visibility;
  groupIds: string[];
  archived: boolean;
  importedAt?: string;
  source?: string;
}
export type GiftSourceState = "active" | "archived" | "removed" | "unavailable";
export interface Reservation extends Base {
  planActions?: {
    canRecordPurchase: boolean;
    canRelease: boolean;
    requiresReview: boolean;
  };
  sourceState?: GiftSourceState;
  sourceVersion?: number;
  sourceRecipientIds?: string[];
  sourceReviewedBy?: Record<string, number>;
  privacyReview?: boolean;
  ordinary?: boolean;
  itemId: string;
  buyerId: string;
  quantity: number;
  purchased: number;
  former: boolean;
  exchangeId?: string;
  exchangeRecipientId?: string;
  giverId?: string;
  poolTargetCents?: number;
  titleSnapshot: string;
  purchasedAt?: string;
}
export interface ContributionReturn extends Base {
  recordedBy: string;
  confirmedAt?: string;
  voidedAt?: string;
  amountCents: number;
  date: string;
  receivedDate?: string;
  status: "sent" | "received" | "voided";
}
export interface Contribution extends Base {
  returns?: ContributionReturn[];
  sentAt?: string;
  receivedAt?: string;
  reservationId: string;
  userId: string;
  amountCents: number;
  status: "pledged" | "sent" | "received" | "cancelled";
}
export interface Comment extends Base {
  privacyReview?: boolean;
  authorOnly?: boolean;
  ordinary?: boolean;
  exchangeId?: string;
  exchangeRecipientId?: string;
  editedAt?: string;
  giverId?: string;
  itemId: string;
  authorId: string;
  body: string;
  mentions?: Mention[];
}
export interface Mention {
  userId: string;
  start: number;
  end: number;
}
export interface Exchange extends Base {
  spendingGuidelineCents?: number | null;
  deletedAt?: string;
  archived?: boolean;
  name: string;
  groupId: string;
  organizerId: string;
  participantIds: string[];
  count: 1 | 2 | 3;
  excludeHousehold: boolean;
  exclusions: [string, string][];
  previousId?: string;
  status: "draft" | "drawn" | "cancelled";
  assignments: [string, string][];
  drawnAt?: string;
}
export interface Notice extends Base {
  lifecycle?: { reservationIds: string[]; state: GiftSourceState };
  importId?: string;
  suppressedChannels?: Array<"sms" | "telegram">;
  batchId?: string;
  prioritySnapshot?: ItemPriority | null;
  deliveryChannels?: NotificationChannel[];
  groupEventId?: string;
  userId: string;
  event:
    | "invitation"
    | "reservation"
    | "purchase"
    | "discussion"
    | "contribution"
    | "exchange"
    | "access"
    | "mention"
    | "wishlist"
    | "import"
    | "price-drop";
  itemId?: string;
  exchangeId?: string;
  invitationId?: string;
  inbox?: boolean;
  actorId?: string;
  action?: string;
  listId?: string;
  commentId?: string;
  reservationId?: string;
  contributionId?: string;
  linkId?: string;
  readAt?: string;
  pushDueAt?: string;
  pushComplete?: boolean;
  pushDeliveries?: Record<string, PushDelivery>;
  status: "pending" | "sent" | "failed";
  attempts: number;
  delivered: string[];
  error?: string;
}
export interface PushDelivery {
  status: "sent" | "failed";
  attempts: number;
  nextAttemptAt?: string;
}
export interface Follow extends Base {
  userId: string;
  target: "person" | "list" | "group" | "household";
  targetId: string;
  muted?: boolean;
  channels?: NotificationChannel[];
}
export type NotificationChannel = "push" | "email" | "telegram" | "sms";
export interface BatchDelivery {
  status: "sent" | "skipped" | "failed";
  attempts: number;
  nextAttemptAt?: string;
}
export interface NotificationBatch extends Base {
  userId: string;
  listId: string;
  noticeIds: string[];
  dueAt: string;
  status: "pending" | "sent" | "failed";
  destinations?: string[];
  deliveries: Record<string, BatchDelivery>;
}
export interface NotificationBatchView {
  ids: string[];
  href: string;
}
export interface DiscussionWatch extends Base {
  userId: string;
  itemId: string;
  watching: boolean;
}
export interface PushDevice extends Base {
  userId: string;
  sessionId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label: string;
}
export interface NotificationView {
  id: string;
  event: Notice["event"];
  message: string;
  context?: string;
  href: string;
  createdAt: string;
  readAt?: string;
}
export interface NotificationPage {
  entries: NotificationView[];
  unreadCount: number;
  nextCursor?: string;
}
export interface Preferences extends Base {
  notificationDetails?: Partial<Record<NotificationChannel, boolean>>;
  recipientUpdates: boolean;
  userId: string;
  email: boolean;
  telegram: boolean;
  sms: boolean;
  events: string[];
  pushEvents?: string[];
  channelEvents?: Partial<Record<"email" | "telegram" | "sms", string[]>>;
  phone?: string;
  phoneVerified?: boolean;
  chatId?: string;
  smsOptOut?: boolean;
  smsLogin?: boolean;
  smsConsentVersion?: string;
  smsConsentedDailyLimit?: number;
}
export interface ImportDraft {
  spendingListId?: string | null;
  friendEntryId?: string;
  kind?: "item" | "idea";
  recipientId?: string;
  visibility?: Visibility;
  groupIds?: string[];
  listId?: string;
  revision: number;
  state: "active" | "published" | "discarded";
  fields: Record<string, string | number | null>;
  touched: string[];
}
export interface ImportJob extends Base {
  recoveryCheckpoint?: {
    deadline?: number;
    url: string;
    result: Partial<Item> & { remoteImage?: string; sourceTitle?: string };
    evidence: { text: string; images: string[] };
    manufacturer?: { domain: string; identifiers: string[] };
  };
  recoveryState?: Partial<
    Record<
      "extraction" | "web",
      {
        status: "dispatched" | "complete";
        result?: Partial<Item> & { remoteImage?: string };
      }
    >
  >;
  draft?: ImportDraft;
  providerState?: {
    snapshotId?: string;
    terminal?: boolean;
    submittedAt: string;
    nextPollAt?: string;
    deadline: string;
  };
  diagnostic?: LookupDiagnostic;
  diagnostics?: LookupDiagnostic[];
  unlockerRetry?: {
    attempts: number;
    status: "dispatched" | "scheduled" | "finished";
    nextAttemptAt?: string;
    configuration: string;
    failure?: LookupDiagnostic;
  };

  userId: string;
  url: string;
  forceRefresh?: boolean;
  status: "pending" | "running" | "complete" | "failed";
  result?: Partial<Item> & { warnings?: string[] };
  error?: string;
}
export interface Setting extends Base {
  key: string;
  encrypted: string;
}
export interface Link extends Base {
  keepPreviousOwner?: boolean;
  invitationId?: string;
  cancelled?: boolean;
  requestedBy?: string;
  userId: string;
  kind: "telegram" | "profile" | "ownership" | "guardian" | "admin";
  targetId?: string;
  email?: string;
  tokenHash?: string;
  expiresAt: string;
  consumed: boolean;
}
export interface Replay extends Base {
  userId: string;
  key: string;
  fingerprint: string;
  result: unknown;
}
export interface Usage extends Base {
  key: string;
  count: number;
}
export interface Media extends Base {
  purgeAfterAccountClosure?: boolean;
  deletedAt?: string;
  userId: string;
  file: string;
}
export interface SmsAttempt extends Base {
  userId: string;
  provider: "none" | "textbelt" | "twilio";
  account: string;
  purpose: "login" | "verification" | "activity";
  reference: string;
  phone: string;
  status: "accepted" | "delivered" | "failed" | "skipped" | "uncertain";
  segments: number;
  providerId?: string;
  providerError?: string;
  reason?: string;
  checkedAt?: string;
}
export interface SmsChallenge extends Base {
  userId: string;
  phone: string;
  purpose: "login" | "verification" | "reauth";
  account: string;
  sessionId?: string;
  expiresAt: string;
  attempts: number;
  state: "pending" | "checking" | "used" | "cancelled";
  codeHash?: string;
}
export interface SmsConsent extends Base {
  sequence: number;
  userId: string;
  phone: string;
  purpose: "notifications" | "login" | "verification" | "transport";
  optedIn: boolean;
  text: string;
  version: string;
  source: string;
}
export interface SmsQuota extends Base {
  account: string;
  activeAccount?: string;
  remaining?: number;
  checkedAt?: string;
  attemptedAt?: string;
  unavailable?: boolean;
  lowCreditAlertAt?: string;
}
export interface SmsGrant extends Base {
  userId: string;
  sessionId: string;
  expiresAt: string;
}
export interface Records {
  priceChecks: PriceCheck;
  priceWatches: PriceWatch;
  priceChanges: PriceChange;
  friendEntries: FriendEntry;
  spendingSettings: SpendingSettings;
  spendingConnections: SpendingConnection;
  spendingOccasions: SpendingOccasion;
  spendingRecords: SpendingRecord;
  spendingBudgets: SpendingBudget;
  smsAttempts: SmsAttempt;
  smsChallenges: SmsChallenge;
  smsConsents: SmsConsent;
  smsQuotas: SmsQuota;
  smsGrants: SmsGrant;
  giftPreferences: GiftPreferences;
  giftDiscoveryJobs: GiftDiscoveryJob;
  organization: Organization;
  media: Media;
  people: Person;
  groups: Group;
  households: Household;
  householdMemberships: HouseholdMembership;
  groupEvents: GroupEvent;
  invitations: Invitation;
  groupInviteRequests: GroupInviteRequest;
  lists: List;
  items: Item;
  reservations: Reservation;
  contributions: Contribution;
  comments: Comment;
  exchanges: Exchange;
  notices: Notice;
  notificationBatches: NotificationBatch;
  follows: Follow;
  watches: DiscussionWatch;
  pushDevices: PushDevice;
  preferences: Preferences;
  imports: ImportJob;
  settings: Setting;
  links: Link;
  replays: Replay;
  usage: Usage;
}
export type Kind = keyof Records;
export type State = { [K in Kind]: Records[K][] };
export const kinds: Kind[] = [
  "priceChecks",
  "priceWatches",
  "priceChanges",
  "friendEntries",
  "spendingSettings",
  "spendingConnections",
  "spendingOccasions",
  "spendingRecords",
  "spendingBudgets",
  "smsAttempts",
  "smsChallenges",
  "smsConsents",
  "smsQuotas",
  "smsGrants",
  "giftPreferences",
  "giftDiscoveryJobs",
  "organization",
  "media",
  "people",
  "groups",
  "households",
  "householdMemberships",
  "groupEvents",
  "invitations",
  "groupInviteRequests",
  "lists",
  "items",
  "reservations",
  "contributions",
  "comments",
  "exchanges",
  "notices",
  "notificationBatches",
  "follows",
  "watches",
  "pushDevices",
  "preferences",
  "imports",
  "settings",
  "links",
  "replays",
  "usage",
];
export function emptyState(): State {
  return Object.fromEntries(kinds.map((k) => [k, []])) as unknown as State;
}
export interface Actor {
  id: string;
  email: string;
  name: string;
}
export interface GiftView extends Omit<Item, "creatorId"> {
  watchingNotes?: boolean;
  priceWatching?: boolean;
  recipientNames: string[];
  creatorName?: string;
  canEdit: boolean;
  isRecipient: boolean;
  canShop?: boolean;
  mode: Mode;
  available?: number;
  reserved?: number;
  purchased?: number;
  reservations?: Array<{
    needsPrivacyReview?: boolean;
    revision?: number;
    id: string;
    buyerName: string;
    mine: boolean;
    quantity: number;
    purchased?: number;
    reservedAt?: string;
    purchasedAt?: string;
    exchange: boolean;
    poolTargetCents?: number;
    contributions?: Contribution[];
  }>;
  comments?: Array<{
    audience?: string;
    needsPrivacyReview?: boolean;
    revision: number;
    canEdit: boolean;
    canDelete: boolean;
    editedAt?: string;
    id: string;
    author: string;
    body: string;
    mentions?: Mention[];
    createdAt: string;
  }>;
}
export interface World {
  paged?: boolean;
  hasActiveItems?: boolean;
  priceChecksEnabled?: boolean;
  friendEntries?: Array<FriendEntry & { canManage: boolean }>;
  personRedirects?: Record<string, string>;
  compact?: boolean;
  spendingAvailable?: boolean;
  spendingEnabled?: boolean;
  spendingInvitation?: boolean;
  productLookupEnabled?: boolean;
  imageDelivery?: { cacheEnabled: boolean; prefetchEnabled: boolean };
  telegram?: { available: boolean };
  sms?: import("./sms").SmsInfo;
  canCreateGroups?: boolean;
  memberInvitationsEnabled?: boolean;
  groupInviteRequests?: GroupInviteRequest[];
  profileTakeovers?: Array<{
    id: string;
    personId: string;
    name: string;
    email: string;
    invitationId?: string;
    status: "pending" | "accepted" | "cancelled" | "expired";
  }>;
  giftPreferences?: GiftPreferenceView[];
  giftDiscovery?: DiscoveryConfig;
  organization?: Organization[];
  environment?: "production" | "staging" | "preview" | "development" | "test";
  me: Actor & { admin: boolean };
  contributionHistory: Array<{
    contribution: Contribution;
    sourceState?: GiftSourceState;
    title: string;
    purchaser: boolean;
    contributorName: string;
    purchaserName: string;
  }>;
  people: Person[];
  groups: Group[];
  households: Household[];
  householdMemberships: HouseholdMembership[];
  groupEvents: Array<GroupEvent & { canManage: boolean }>;
  invitations: Array<
    Invitation & {
      groupName?: string;
      inviterName?: string;
      friendName?: string;
    }
  >;
  lists: Array<
    List & {
      canEdit: boolean;
      canManageSettings: boolean;
      hasOtherItemEditors: boolean;
      revealAvailable: boolean;
    }
  >;
  items: GiftView[];
  buying: Array<Reservation & { item?: GiftView }>;
  exchanges: Array<
    Omit<Exchange, "assignments"> & {
      canManage: boolean;
      myAssignments: [string, string][];
      delivery: { sent: number; pending: number; failed: number };
    }
  >;
  preferences: Preferences;
  notificationCount?: number;
  notificationAsOf?: number;
  follows?: Follow[];
  watches?: DiscussionWatch[];
  imports: ImportJob[];
  links: Array<Link & { targetName?: string; requesterName?: string }>;
}
