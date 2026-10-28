import { z } from "zod";

const overridesSchema = z.record(
  z
    .string()
    .min(1)
    .max(200)
    .refine((id) => id.trim() === id),
  z.strictObject({
    weeklyLimit: z
      .union([z.number().int().min(0).max(999999), z.literal("unlimited")])
      .optional(),
    bypassMonthlyLimit: z.boolean().optional(),
  }),
);

// Keep this outside settings: overrides are server-only and must never be
// serialized with DiscoveryConfig or exposed as editable admin settings.
export function discoveryUserOverrides(env = process.env) {
  const raw = env.GIFT_DISCOVERY_USER_OVERRIDES?.trim();
  if (!raw) return new Map<string, z.infer<typeof overridesSchema>[string]>();
  try {
    return new Map(Object.entries(overridesSchema.parse(JSON.parse(raw))));
  } catch {
    // Do not include the supplied value or account IDs in logs/errors.
    throw new Error(
      "Invalid GIFT_DISCOVERY_USER_OVERRIDES. Use an account-ID object with weeklyLimit (0–999999 or unlimited) and/or bypassMonthlyLimit (boolean).",
    );
  }
}
