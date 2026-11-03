import { afterEach, expect, it } from "vitest";
import Fastify from "fastify";
import statics from "@fastify/static";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
let root: string | undefined;
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
  if (root) await rm(root, { recursive: true, force: true });
});
it.each([true, false])(
  "serves nested static assets with patched glob, wildcard=%s",
  async (wildcard) => {
    root = await mkdtemp(path.join(os.tmpdir(), "hint-static-"));
    await mkdir(path.join(root, "assets"));
    await writeFile(
      path.join(root, "assets", "app.js"),
      "export const ready = true;",
    );
    await writeFile(path.join(root, ".private"), "hidden");
    const app = Fastify();
    apps.push(app);
    await app.register(statics, {
      root,
      wildcard,
      serveDotFiles: false,
      dotfiles: "ignore",
      globIgnore: ["**/.private"],
    });
    const asset = await app.inject("/assets/app.js");
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain("ready = true");
    expect(
      (
        await app.inject({
          url: "/assets/app.js",
          headers: { "if-none-match": asset.headers.etag! },
        })
      ).statusCode,
    ).toBe(304);
    expect((await app.inject("/.private")).statusCode).toBe(404);
    expect((await app.inject("/missing.js")).statusCode).toBe(404);
  },
);
