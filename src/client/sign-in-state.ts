export const pendingSignInKey = "little-hint:pending-sign-in";
export const codeLifetime = 10 * 60 * 1000;
export type PendingSignIn = { email: string; requestedAt: number };

export function readPendingSignIn(): PendingSignIn | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(pendingSignInKey) ?? "null",
    );
    const age = Date.now() - value?.requestedAt;
    if (
      typeof value?.email === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) &&
      typeof value.requestedAt === "number" &&
      age >= 0 &&
      age < codeLifetime
    )
      return { email: value.email, requestedAt: value.requestedAt };
    savePendingSignIn(null);
  } catch {
    savePendingSignIn(null);
  }
  return null;
}

export function savePendingSignIn(value: PendingSignIn | null) {
  try {
    if (value) sessionStorage.setItem(pendingSignInKey, JSON.stringify(value));
    else sessionStorage.removeItem(pendingSignInKey);
  } catch {
    // Storage can be unavailable. The in-memory sign-in flow still works.
  }
}
