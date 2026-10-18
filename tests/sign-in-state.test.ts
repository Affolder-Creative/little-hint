import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  codeLifetime,
  pendingSignInKey,
  readPendingSignIn,
  savePendingSignIn,
} from "../src/client/sign-in-state";

const values = new Map<string, string>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("pending sign-in recovery", () => {
  it("restores only the email and request time", () => {
    const pending = { email: "alex@example.test", requestedAt: Date.now() };
    savePendingSignIn(pending);
    expect(readPendingSignIn()).toEqual(pending);
    expect(JSON.parse(values.get(pendingSignInKey)!)).toEqual(pending);
    savePendingSignIn(null);
    expect(readPendingSignIn()).toBeNull();
  });
  it.each([
    "{broken",
    "null",
    JSON.stringify({ email: "invalid", requestedAt: Date.now() }),
    JSON.stringify({ email: "alex@example.test", requestedAt: "tomorrow" }),
    JSON.stringify({
      email: "alex@example.test",
      requestedAt: Date.now() + 60000,
    }),
    JSON.stringify({
      email: "alex@example.test",
      requestedAt: Date.now() - codeLifetime,
    }),
  ])("discards invalid or expired storage: %s", (raw) => {
    values.set(pendingSignInKey, raw);
    expect(readPendingSignIn()).toBeNull();
    expect(values.has(pendingSignInKey)).toBe(false);
  });
  it("works when storage access is blocked", () => {
    vi.stubGlobal("sessionStorage", {
      getItem() {
        throw new Error("Blocked");
      },
      setItem() {
        throw new Error("Blocked");
      },
      removeItem() {
        throw new Error("Blocked");
      },
    });
    expect(readPendingSignIn()).toBeNull();
    expect(() =>
      savePendingSignIn({
        email: "alex@example.test",
        requestedAt: Date.now(),
      }),
    ).not.toThrow();
  });
});
