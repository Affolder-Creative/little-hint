import type { Pool } from "pg";
import { assertPreviewSeed } from "./deployment";
import { seedSynthetic } from "./synthetic-seed";

export async function seedPreview(
  pool: Pool,
  env = process.env,
  ifNeeded = false,
) {
  assertPreviewSeed(env);
  return seedSynthetic(pool, true, ifNeeded);
}
