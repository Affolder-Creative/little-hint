export const notificationTopics = [
  { id: "mention", label: "Mentions" },
  { id: "discussion", label: "Private notes I follow" },
  { id: "contribution", label: "Cost sharing" },
  { id: "wishlist", label: "New items on followed wish lists" },
  { id: "invitation", label: "Invitations & ownership requests" },
  { id: "exchange", label: "Exchange updates" },
  { id: "access", label: "Changes affecting my gift plans" },
  { id: "reservation", label: "Reservations" },
  { id: "purchase", label: "Purchases" },
] as const;
export const defaultPushEvents = notificationTopics
  .map((t) => t.id)
  .filter((t) => t !== "reservation" && t !== "purchase");
