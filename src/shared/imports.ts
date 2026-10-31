import type { ImportJob } from "./model";
/** Never expose provider execution state or diagnostics to a shopper. */
export function importView(job: ImportJob): ImportJob {
  const { providerState, diagnostic, ...view } = job;
  return view;
}
