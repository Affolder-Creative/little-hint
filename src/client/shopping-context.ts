import type { GiftView, World } from "../shared/model";
export function shoppingChoices(
  world: World,
  gift: Pick<GiftView, "recipientIds">,
) {
  return world.exchanges.flatMap((e) =>
    e.status === "drawn" && !e.archived
      ? e.myAssignments
          .filter(([, r]) => gift.recipientIds.includes(r))
          .map(([g, r]) => ({
            key: `${e.id}:${g}:${r}`,
            id: e.id,
            giver: g,
            recipient: r,
            label: `${e.name} · ${world.people.find((p) => p.id === g)?.name ?? "Giver"} to ${world.people.find((p) => p.id === r)?.name ?? "Recipient"}`,
          }))
      : [],
  );
}
export function shoppingPayload(key: string) {
  if (key === "ordinary") return { ordinary: true };
  const [exchangeId, giverId, exchangeRecipientId] = key.split(":");
  return exchangeId ? { exchangeId, giverId, exchangeRecipientId } : {};
}
export function shoppingLink(path: string, search: string) {
  const context = new URLSearchParams(search).get("shopping");
  if (!context) return path;
  return `${path}${path.includes("?") ? "&" : "?"}shopping=${encodeURIComponent(context)}`;
}
