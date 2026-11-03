import { isIP } from "node:net";

export function trustedProxies(value?: string): false | string[] {
  if (!value?.trim()) return false;
  const entries = value.split(",").map((entry) => entry.trim());
  for (const entry of entries) {
    const [address, prefix, extra] = entry.split("/");
    const version = isIP(address);
    if (
      !version ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (version === 4 ? 32 : 128)))
    )
      throw new Error(
        "TRUSTED_PROXIES must contain explicit IP addresses or nonzero CIDRs.",
      );
  }
  return entries;
}
