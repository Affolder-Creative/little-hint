import type { Base, Item } from "./model";

export const giftCategories = [
  ["reading", "Books & reading", "fiction, nonfiction, books, reading"],
  [
    "crafts",
    "Arts & crafts",
    "art, drawing, painting, knitting, sewing, crafts",
  ],
  ["music", "Music & audio", "music, vinyl, headphones, guitar, audio"],
  ["gaming", "Video games", "gaming, videogames, console, controller"],
  ["technology", "Technology", "technology, electronics, gadgets, computer"],
  ["cooking", "Cooking & baking", "cooking, baking, kitchen, cookware"],
  ["coffee", "Coffee & tea", "coffee, espresso, tea, brewing"],
  ["food", "Food & treats", "food, chocolate, snacks, treats"],
  ["home", "Home & decor", "home, decor, candle, blanket"],
  ["gardening", "Gardening", "gardening, plants, garden, seeds"],
  ["outdoors", "Outdoors & camping", "outdoors, camping, hiking, fishing"],
  ["fitness", "Sports & fitness", "sports, fitness, running, cycling, yoga"],
  ["clothing", "Clothing & accessories", "clothing, fashion, jewelry, bags"],
  ["self-care", "Beauty & self-care", "beauty, skincare, bath, self-care"],
  ["travel", "Travel", "travel, luggage, passport, packing"],
  ["photography", "Photography", "photography, camera, tripod"],
  ["tools", "DIY & tools", "tools, woodworking, diy, workshop"],
  ["games", "Board games & puzzles", "puzzle, puzzles, board games, tabletop"],
  ["pets", "Pets", "pets, dog, cat, pet"],
  ["toys", "Toys & learning", "toys, learning, building sets, lego"],
  ["stationery", "Stationery", "stationery, journal, pens, notebooks"],
  ["collectibles", "Collectibles", "collectibles, collecting, memorabilia"],
] as const;
export const discoveryModes = ["off", "givers", "receivers", "both"] as const;
export type DiscoveryMode = (typeof discoveryModes)[number];
export interface GiftPreferences extends Base {
  personId: string;
  categoryIds: string[];
  interests: string;
  likes: string;
  avoid: string;
  groupIds: string[];
  setup: "new" | "deferred" | "done" | "skipped";
}
export type GiftPreferenceView = Omit<GiftPreferences, "groupIds" | "setup"> & {
  canEdit: boolean;
  groupIds?: string[];
  setup?: GiftPreferences["setup"];
};
export interface GiftOffer {
  url: string;
  retailer: string;
  seller: string;
  priceCents: number;
  currency: "USD";
  checkedAt: string;
  identity: string;
}
export interface GiftEvidence {
  kind: "customer" | "editorial";
  url: string;
  label: string;
  checkedAt: string;
}
export interface GiftCandidate {
  id: string;
  title: string;
  description: string;
  image: string;
  categoryIds: string[];
  reason: string;
  offers: GiftOffer[];
  evidence: GiftEvidence[];
}
export interface DiscoveryInput {
  personId: string;
  categoryIds: string[];
  interests: string;
  likes: string;
  avoid: string;
  maxPriceCents: number | null;
}
export interface DiscoverySelection {
  candidateId: string;
  offerUrl: string;
  listId?: string;
  title: string;
  description: string;
  visibility: Item["visibility"];
  groupIds: string[];
  allowDuplicate: boolean;
}
export interface DiscoveryReview {
  id: string;
  selections: DiscoverySelection[];
  fingerprint: string;
  conflicts: Array<{ candidateId: string; itemId: string; title: string }>;
  preparedAt: string;
}
export interface GiftDiscoveryJob extends Base {
  userId: string;
  input: DiscoveryInput;
  fingerprint: string;
  sourceFingerprint: string;
  status:
    "pending" | "running" | "complete" | "failed" | "cancelled" | "reviewing";
  expiresAt: string;
  startedAt?: string;
  // Classification at reservation time; absent on older, non-exempt jobs.
  monthlyQuotaExempt?: boolean;
  error?: string;
  candidates: GiftCandidate[];
  review?: DiscoveryReview;
  requestedSelections?: DiscoverySelection[];
  saved?: Record<string, string>;
  inputTokens?: number;
  outputTokens?: number;
  searchCalls?: number;
}
export interface DiscoveryConfig {
  mode: DiscoveryMode;
  available: boolean;
  weeklyLimit: number;
  monthlyLimit: number;
  model: string;
}
export interface DiscoveryAllowance {
  // null means this account is exempt from the corresponding cap.
  weeklyRemaining: number | null;
  monthlyRemaining: number | null;
  weekResetsAt: string;
  monthResetsAt: string;
}
export interface DiscoveryContext {
  config: DiscoveryConfig;
  allowance: DiscoveryAllowance;
  own: boolean;
  preferences?: GiftPreferenceView;
  inferredCategoryIds: string[];
  recent?: GiftDiscoveryJob;
}
export const discoveryLifetimeMs = 24 * 60 * 60 * 1000;
export const offerFreshnessMs = 15 * 60 * 1000;
export function discoveryAllowed(config: DiscoveryConfig, own: boolean) {
  return (
    config.available &&
    (config.mode === "both" || config.mode === (own ? "receivers" : "givers"))
  );
}
export function inferredInterests(titlesAndTags: string[]) {
  const evidence = titlesAndTags.join(" ").toLowerCase();
  return giftCategories
    .filter(([, , words]) =>
      words
        .split(", ")
        .some((word) => new RegExp(`\\b${word}\\b`, "i").test(evidence)),
    )
    .map(([id]) => id);
}
