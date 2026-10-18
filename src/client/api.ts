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
export const hasPendingWrites = () => pendingWrites > 0;
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  if (body !== undefined) pendingWrites++;
  try {
    const response = await fetch(`/api/v1/${path}`, {
      credentials: "same-origin",
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
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
export function clearPersonalData() {
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
