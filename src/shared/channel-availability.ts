import type { World } from "./model";
import { notificationChannels } from "./follows";

// Missing capability metadata must not advertise an unavailable integration.
export function availableNotificationChannels(
  world: Pick<World, "sms" | "telegram">,
) {
  return notificationChannels.filter((channel) =>
    channel === "sms"
      ? world.sms?.available === true
      : channel === "telegram"
        ? world.telegram?.available === true
        : true,
  );
}
