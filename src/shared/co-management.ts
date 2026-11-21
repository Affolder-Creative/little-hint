import type { Base, Item } from "./model";
export interface CoManagement extends Base {
  personId: string;
  ownerId: string;
  helperId: string;
  requestedBy: string;
  expiresAt: string;
  scopeIds?: string[];
  status: "pending" | "active" | "declined" | "cancelled" | "ended" | "expired";
}
export interface RecoveredDraft extends Base {
  kind?: Item["kind"];
  shoppingOffers?: Item["shoppingOffers"];
  primaryOfferId?: string;
  products?: Array<Omit<RecoveredDraft, keyof Base | "userId" | "sourceId">>;
  userId: string;
  sourceId: string;
  title: string;
  description: string;
  url: string;
  image: string;
  images?: string[];
  descriptionRich?: Item["descriptionRich"];
  priceCents: number | null;
  priceMaxCents?: number | null;
  currency: Item["currency"];
  quantity: number;
  tags: string[];
  priority?: Item["priority"];
}
export interface CoManagementView {
  arrangements: Array<CoManagement & { ownerName: string; helperName: string }>;
  candidates: Array<{ personId: string; userId: string; name: string }>;
  audiences: Array<{
    personId: string;
    groups: Array<{ id: string; name: string }>;
  }>;
  recoveredDrafts: RecoveredDraft[];
}
