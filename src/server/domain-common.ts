import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Base, List } from "../shared/model";
import {
  dateHasElapsed,
  validCalendarDate,
  validTimeZone,
} from "../shared/list-dates";
export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new DomainError(status, message);
}
export const stamp = (): Base => ({
  id: randomUUID(),
  revision: 1,
  createdAt: new Date().toISOString(),
});
export const touch = (r: Base) => {
  r.revision++;
};
export const normalizedEmail = (s: string) => s.trim().toLowerCase();
export const text = z.string().trim().min(1).max(160);
export const id = z.string().uuid();
export const ids = z
  .array(id)
  .max(100)
  .refine(
    (v) => new Set(v).size === v.length,
    "Duplicate selections are not allowed.",
  );
export const revision = z.number().int().positive();
export const listDates = {
  archiveAfter: z
    .string()
    .refine(validCalendarDate, "Choose a valid archive date.")
    .nullable()
    .optional(),
  revealAfter: z
    .string()
    .refine(validCalendarDate, "Choose a valid reveal date.")
    .nullable()
    .optional(),
  timeZone: z
    .string()
    .max(100)
    .refine(validTimeZone, "Choose a valid timezone.")
    .optional(),
  revealExchangeGivers: z.boolean().optional(),
};
export const spendingGuideline = z
  .number()
  .int()
  .positive()
  .max(100000000)
  .nullable();
export type ListPolicy = Pick<
  List,
  "mode" | "timeZone" | "revealAfter" | "revealExchangeGivers"
>;
export function checkSharedListPolicy(
  current: ListPolicy & { modeLocked: boolean },
  next: ListPolicy,
) {
  if (current.modeLocked) {
    if (next.mode !== current.mode)
      fail(409, "This privacy choice cannot change after sharing.");
    if ((next.timeZone ?? "UTC") !== (current.timeZone ?? "UTC"))
      fail(409, "The time zone cannot change after sharing.");
    if (!!next.revealExchangeGivers !== !!current.revealExchangeGivers)
      fail(
        409,
        "Whether secret exchange gifts appear in the summary cannot change after sharing.",
      );
    if (
      (next.revealAfter ?? null) !== (current.revealAfter ?? null) &&
      (!current.revealAfter ||
        !next.revealAfter ||
        next.revealAfter < current.revealAfter ||
        dateHasElapsed(current.revealAfter, current.timeZone))
    )
      fail(
        409,
        "After sharing, an upcoming reveal date can only move later. Lists shared without a date keep gift details hidden.",
      );
  }
  if (next.revealExchangeGivers && !next.revealAfter)
    fail(400, "Choose a reveal date to reveal exchange givers.");
}

export function checkRevision(r: Base, v: number) {
  if (r.revision !== v)
    fail(409, "This changed since you opened it. Refresh and try again.");
}
