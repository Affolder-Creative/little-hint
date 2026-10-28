import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

test("generated worker bounds navigation waits without caching private responses", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "little-hint-worker-"));
  try {
    await mkdir(path.join(root, "dist/client/assets"), { recursive: true });
    await mkdir(path.join(root, "dist/client/.vite"), { recursive: true });
    await writeFile(
      path.join(root, "dist/client/.vite/manifest.json"),
      JSON.stringify({
        "index.html": {
          file: "assets/main.js",
          imports: ["shared"],
          dynamicImports: ["settings"],
          css: ["assets/main.css"],
        },
        shared: { file: "assets/shared.js" },
        settings: { file: "assets/settings.js" },
      }),
    );
    for (const asset of ["main.js", "main.css", "shared.js", "settings.js"])
      await writeFile(path.join(root, "dist/client/assets", asset), "");
    await mkdir(path.join(root, "src/service-worker"), { recursive: true });
    await writeFile(path.join(root, "dist/client/index.html"), "app shell");
    await writeFile(path.join(root, "src/service-worker/push.js"), "");
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("./build-sw.mjs", import.meta.url))],
      { cwd: root },
    );
    const source = await readFile(path.join(root, "dist/client/sw.js"), "utf8");
    function worker(fetch, cached = "cached shell") {
      const handlers = {};
      let timeout;
      const matches = [];
      const puts = [];
      const installed = [];
      vm.runInNewContext(source, {
        self: {
          location: { origin: "https://hint.example" },
          addEventListener: (name, fn) => {
            handlers[name] = fn;
          },
        },
        URL,
        AbortController,
        fetch,
        setTimeout: (fn, ms) => {
          timeout = ms;
          return setTimeout(fn, 10);
        },
        clearTimeout,
        caches: {
          open: async () => ({
            addAll: async (files) => installed.push(...files),
            put: async (...args) => puts.push(args),
            match: async (key) => {
              matches.push(key);
              return cached;
            },
          }),
        },
      });
      return {
        request(pathname, mode = "navigate") {
          let response;
          handlers.fetch({
            request: {
              method: "GET",
              url: `https://hint.example${pathname}`,
              mode,
            },
            respondWith: (value) => {
              response = value;
            },
          });
          return response;
        },
        matches,
        puts,
        installed,
        install() {
          let done;
          handlers.install({ waitUntil: (promise) => (done = promise) });
          return done;
        },
        timeout: () => timeout,
      };
    }
    await t.test(
      "installation fetches the entry dependencies, not deferred routes",
      async () => {
        const w = worker();
        await w.install();
        assert.ok(w.installed.includes("/assets/main.js"));
        assert.ok(w.installed.includes("/assets/shared.js"));
        assert.ok(w.installed.includes("/assets/main.css"));
        assert.ok(!w.installed.includes("/assets/settings.js"));
      },
    );
    await t.test(
      "deferred static chunks are cached after a successful request",
      async () => {
        const response = new Response("module code");
        const w = worker(async () => response, null);
        assert.equal(await w.request("/assets/settings.js", "cors"), response);
        assert.equal(w.puts[0][0], "/assets/settings.js");
        assert.equal(await w.puts[0][1].text(), "module code");
      },
    );
    await t.test(
      "failed chunks and private uploads never enter the cache",
      async () => {
        const w = worker(
          async () => new Response("not found", { status: 404 }),
          null,
        );
        assert.equal(
          (await w.request("/assets/settings.js", "cors")).status,
          404,
        );
        assert.deepEqual(w.puts, []);
        assert.equal(w.request("/uploads/private.jpg", "cors"), undefined);
        assert.equal(w.request("/assets/unknown.js", "cors"), undefined);
      },
    );
    await t.test("successful navigation uses the network", async () => {
      const w = worker(async () => "fresh shell");
      assert.equal(await w.request("/settings"), "fresh shell");
      assert.deepEqual(w.matches, []);
    });
    await t.test(
      "a stalled navigation falls back even if fetch ignores abort",
      async () => {
        let signal;
        const w = worker((request, options) => {
          signal = options.signal;
          return new Promise(() => {});
        });
        assert.equal(await w.request("/"), "cached shell");
        assert.equal(w.timeout(), 5000);
        assert.equal(signal.aborted, true);
        assert.deepEqual(w.matches, ["/"]);
      },
    );
    await t.test("offline navigation uses only the static shell", async () => {
      const w = worker(async () => {
        throw new Error("offline");
      });
      assert.equal(await w.request("/gift/private-id"), "cached shell");
      assert.deepEqual(w.matches, ["/"]);
    });
    await t.test(
      "API requests bypass worker caching and navigation fallback",
      () => {
        const w = worker(() => {
          throw new Error("must not intercept APIs");
        });
        assert.equal(w.request("/api/v1/world"), undefined);
        assert.deepEqual(w.matches, []);
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
