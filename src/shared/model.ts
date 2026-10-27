export type Mode = "surprise" | "transparent";
export type Visibility = "private" | "hidden" | "visible";
export interface Base {
  id: string;
  revision: number;
  createdAt: string;
}
export interface Person extends Base {
  name: string;
  userId?: string;
  guardians: string[];
  admin?: boolean;
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
export interface Invitation extends Base {
  invitedById?: string;
  email: string;
  groupId?: string;
  bootstrap?: boolean;
  expiresAt: string;
  acceptedBy?: string;
  revoked?: boolean;
}
export interface List extends Base {
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
export interface Item extends Base {
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
export interface Reservation extends Base {
  itemId: string;
  buyerId: string;
  quantity: number;
  purchased: number;
  former: boolean;
  exchangeId?: string;
  giverId?: string;
  poolTargetCents?: number;
  titleSnapshot: string;
  purchasedAt?: string;
}
export interface Contribution extends Base {
  reservationId: string;
  userId: string;
  amountCents: number;
  status: "pledged" | "sent" | "received" | "cancelled";
}
export interface Comment extends Base {
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
    | "wishlist";
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
  target: "person" | "list";
  targetId: string;
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
}
export interface ImportJob extends Base {
  userId: string;
  url: string;
  forceRefresh?: boolean;
  status: "pending" | "running" | "complete" | "failed";
  result?: Partial<Item>;
  error?: string;
}
export interface Setting extends Base {
  key: string;
  encrypted: string;
}
export interface Link extends Base {
  requestedBy?: string;
  userId: string;
  kind: "telegram" | "profile" | "ownership";
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
  userId: string;
  file: string;
}
export interface Records {
  media: Media;
  people: Person;
  groups: Group;
  households: Household;
  householdMemberships: HouseholdMembership;
  groupEvents: GroupEvent;
  invitations: Invitation;
  lists: List;
  items: Item;
  reservations: Reservation;
  contributions: Contribution;
  comments: Comment;
  exchanges: Exchange;
  notices: Notice;
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
  "media",
  "people",
  "groups",
  "households",
  "householdMemberships",
  "groupEvents",
  "invitations",
  "lists",
  "items",
  "reservations",
  "contributions",
  "comments",
  "exchanges",
  "notices",
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
  recipientNames: string[];
  creatorName?: string;
  canEdit: boolean;
  isRecipient: boolean;
  mode: Mode;
  available?: number;
  reserved?: number;
  purchased?: number;
  reservations?: Array<{
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
    id: string;
    author: string;
    body: string;
    mentions?: Mention[];
    createdAt: string;
  }>;
}
export interface World {
  environment?: "production" | "staging" | "development" | "test";
  me: Actor & { admin: boolean };
  contributionHistory: Array<{
    contribution: Contribution;
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
  invitations: Array<Invitation & { groupName?: string; inviterName?: string }>;
  lists: Array<
    List & {
      canEdit: boolean;
      canManageSettings: boolean;
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
