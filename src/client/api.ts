import { clearProductImages } from "./image-store";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), passkeyClient()],
});
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let pendingWrites = 0;
let accountId: string | null = null;
let generation = 0;
const uncertain = new Map<string, string>();
export function setApiAccount(id: string | null) {
  if (id === accountId) return;
  accountId = id;
  generation++;
  uncertain.clear();
}
export const hasPendingWrites = () => pendingWrites > 0;
export async function api<T = any>(
  path: string,
  body?: unknown,
  options?: { signal?: AbortSignal; idempotencyKey?: string },
): Promise<T> {
  const epoch = generation;
  const operation =
    body === undefined ? undefined : JSON.stringify([path, body]);
  const key =
    options?.idempotencyKey ??
    (operation ? (uncertain.get(operation) ?? crypto.randomUUID()) : undefined);
  if (operation && key) uncertain.set(operation, key);
  if (body !== undefined) pendingWrites++;
  try {
    const response = await fetch(`/api/v1/${path}`, {
      credentials: "same-origin",
      signal: options?.signal,
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "Idempotency-Key": key!,
            },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (epoch !== generation && path !== "world")
      throw new Error("Your account changed. Reopen this page to continue.");
    // A retry can be rate-limited after the original request already committed.
    // Only a confirmed success resolves an uncertain operation.
    if (operation && response.ok) uncertain.delete(operation);
    if (!response.ok)
      throw new ApiError(
        response.status,
        data.error ?? "Unable to complete this request.",
      );
    return data;
  } finally {
    if (body !== undefined) pendingWrites--;
  }
}
export async function clearPersonalData() {
  await clearProductImages();
  try {
    sessionStorage.removeItem("little-hint:scroll");
  } catch {
    // Session storage may be unavailable in restricted browser contexts.
  }
  for (const k of Object.keys(localStorage))
    if (k.startsWith("little-hint:draft") || k === "little-hint:last-account")
      localStorage.removeItem(k);
}
export const dollars = (cents: number | null | undefined) =>
  cents == null
    ? "Price not added"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: cents % 100 ? 2 : 0,
      }).format(cents / 100);
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
