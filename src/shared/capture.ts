/** Extract one web link from the URL, text, or title supplied by a share sheet. */
export function captureLink(input: string): string | null {
  if (input.length > 8192) return null;
  const matches = input.trim().match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const links = new Set<string>();
  for (const match of matches) {
    let candidate = match.replace(/[.,!?;:]+$/, "");
    while (
      candidate.endsWith(")") &&
      (candidate.match(/\)/g)?.length ?? 0) >
        (candidate.match(/\(/g)?.length ?? 0)
    )
      candidate = candidate.slice(0, -1);
    try {
      const url = new URL(candidate);
      if (!url.hostname || url.username || url.password) return null;
      links.add(url.href);
    } catch {
      return null;
    }
  }
  return links.size === 1 ? [...links][0] : null;
}

export function sharedCapture(params: URLSearchParams) {
  const url =
    captureLink(params.get("url") ?? "") ??
    captureLink(params.get("text") ?? "") ??
    captureLink(params.get("title") ?? "");
  return { url: url ?? "", title: (params.get("title") ?? "").slice(0, 300) };
}
