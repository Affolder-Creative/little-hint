import type { ImportJob } from "./model";
export const retailerCollectionTimeoutMs = 10 * 60 * 1000;
/** Never expose provider execution state or diagnostics to a shopper. */
export function importView(job: ImportJob): ImportJob {
  const { providerState, diagnostic, ...view } = job;
  return view;
}
