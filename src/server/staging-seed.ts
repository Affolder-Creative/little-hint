import type { Pool } from "pg";
import { assertStagingSeed } from "./deployment";
import { seedSynthetic } from "./synthetic-seed";

export async function seedStaging(pool: Pool, env = process.env) {
  assertStagingSeed(env);
  return seedSynthetic(pool);
}
