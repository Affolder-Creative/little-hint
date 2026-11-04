import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/client/image-store", () => ({ clearProductImages: vi.fn() }));
vi.mock("better-auth/react", () => ({ createAuthClient: () => ({}) }));
vi.mock("better-auth/client/plugins", () => ({ emailOTPClient: () => ({}) }));
vi.mock("@better-auth/passkey/client", () => ({ passkeyClient: () => ({}) }));
import {
  api,
  setApiAccount,
  ApiError,
  ApiTimeoutError,
} from "../src/client/api";
import { trustedProxies } from "../src/server/proxy";
afterEach(() => {
  vi.unstubAllGlobals();
  setApiAccount(null);
});
it("reuses an uncertain operation key, then rotates after confirmed success", async () => {
  setApiAccount("alice");
  const keys: string[] = [];
  const fetcher = vi.fn(async (_url: unknown, options: any) => {
    keys.push(options.headers["Idempotency-Key"]);
    if (keys.length === 1) throw new TypeError("response lost");
    return new Response(JSON.stringify({ id: "committed" }));
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    api("reservations", { itemId: "gift", quantity: 1 }),
  ).rejects.toThrow();
  await api("reservations", { itemId: "gift", quantity: 1 });
  await api("reservations", { itemId: "gift", quantity: 1 });
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[0]);
});
it("rejects old-account responses and does not reuse their operation keys", async () => {
  setApiAccount("alice");
  let resolve!: (r: Response) => void;
  const keys: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: unknown, options: any) => {
      keys.push(options.headers["Idempotency-Key"]);
      return new Promise<Response>((r) => {
        resolve = r;
      });
    }),
  );
  const old = api("items", { title: "private" });
  setApiAccount("bob");
  resolve(new Response(JSON.stringify({ title: "alice private data" })));
  await expect(old).rejects.toThrow("account changed");
  const next = api("items", { title: "private" });
  resolve(new Response("{}"));
  await next;
  expect(keys[1]).not.toBe(keys[0]);
});
it("retains uncertain keys through server errors and rate-limited retries", async () => {
  const keys: string[] = [];
  let status = 500;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_: unknown, o: any) => {
      keys.push(o.headers["Idempotency-Key"]);
      return new Response("{}", { status });
    }),
  );
  await expect(api("items", {})).rejects.toThrow();
  status = 429;
  await expect(api("items", {})).rejects.toThrow();
  status = 200;
  await api("items", {});
  expect(keys[0]).toBe(keys[1]);
  expect(keys[2]).toBe(keys[1]);
});
it("accepts explicit proxy networks and rejects unsafe trust configurations", () => {
  expect(trustedProxies("")).toBe(false);
  expect(trustedProxies("127.0.0.1, 172.18.0.0/24")).toEqual([
    "127.0.0.1",
    "172.18.0.0/24",
  ]);
  for (const value of [
    "true",
    "1",
    "*",
    "0.0.0.0/0",
    "::/0",
    "127.0.0.1/99",
    "127.0.0.1,",
  ])
    expect(() => trustedProxies(value)).toThrow();
});

it.each([401, 502, 503, 504])(
  "preserves HTTP %s for non-JSON responses",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Unavailable</html>", { status })),
    );
    await expect(api("world")).rejects.toMatchObject({ status });
  },
);
it("bounds stalled headers and response bodies and aborts the request", async () => {
  for (const body of [false, true]) {
    let signal: AbortSignal;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_: unknown, options: any) => {
        signal = options.signal;
        return body
          ? new Response(new ReadableStream({ start() {} }))
          : new Promise<Response>(() => {});
      }),
    );
    await expect(
      api("world", undefined, { timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(ApiTimeoutError);
    expect(signal!.aborted).toBe(true);
  }
});
it("preserves JSON error messages", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Please wait." }), {
          status: 429,
        }),
    ),
  );
  await expect(api("world")).rejects.toEqual(new ApiError(429, "Please wait."));
});
