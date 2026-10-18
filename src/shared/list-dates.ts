/** A date means the whole calendar day, including daylight-saving transitions. */
export function dateHasElapsed(
  after: string | null | undefined,
  timeZone = "UTC",
  now = new Date(),
): boolean {
  if (!after) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}` > after;
}

export function validCalendarDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

export function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function listIsArchived(
  list: { archived: boolean; archiveAfter?: string | null; timeZone?: string },
  now = new Date(),
): boolean {
  return list.archived || dateHasElapsed(list.archiveAfter, list.timeZone, now);
}
