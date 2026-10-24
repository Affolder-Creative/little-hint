import type { Mention } from "../shared/model";

export function moveMentions(
  previous: string,
  next: string,
  mentions: Mention[],
) {
  let start = 0;
  while (
    start < previous.length &&
    start < next.length &&
    previous[start] === next[start]
  )
    start++;
  let oldEnd = previous.length,
    newEnd = next.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    previous[oldEnd - 1] === next[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  return mentions.flatMap((m) =>
    m.end <= start
      ? [m]
      : m.start >= oldEnd
        ? [{ ...m, start: m.start + delta, end: m.end + delta }]
        : [],
  );
}
