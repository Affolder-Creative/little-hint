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
  const environment = env.APP_ENV || env.NODE_ENV;
  const variable =
    environment === "staging"
      ? "STAGING_GIFT_DISCOVERY_USER_OVERRIDES"
      : "GIFT_DISCOVERY_USER_OVERRIDES";
  const raw = environment === "preview" ? undefined : env[variable]?.trim();
  if (!raw) return new Map<string, z.infer<typeof overridesSchema>[string]>();
  try {
    return new Map(Object.entries(overridesSchema.parse(JSON.parse(raw))));
  } catch {
    // Do not include the supplied value or account IDs in logs/errors.
    throw new Error(
      `Invalid ${variable}. Use an account-ID object with weeklyLimit (0–999999 or unlimited) and/or bypassMonthlyLimit (boolean).`,
    );
  }
}
