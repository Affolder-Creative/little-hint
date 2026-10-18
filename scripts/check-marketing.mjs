import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../marketing");
const html = await readFile(resolve(root, "index.html"), "utf8");
const css = await readFile(resolve(root, "style.css"), "utf8");
assert.match(html, /<html lang="en">/);
assert.equal(
  [...html.matchAll(/<h1\b/g)].length,
  1,
  "Exactly one page heading",
);
assert.match(html, /name="description"/);
assert.match(html, /rel="canonical"/);
assert.match(html, /property="og:image"/);
assert.match(css, /prefers-reduced-motion/);
assert.doesNotMatch(
  html,
  /<script\b/i,
  "Marketing site is independent of the app runtime",
);
for (const image of html.matchAll(/<img\b[^>]*>/g))
  assert.match(image[0], /\balt="[^"]*"/, "Images need alt text");
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const refs = [...html.matchAll(/\b(?:src|href|srcset)="([^"]+)"/g)].map(
  (m) => m[1],
);
refs.push(...[...css.matchAll(/url\("?([^"\)]+)"?\)/g)].map((m) => m[1]));
let assets = 0;
for (const ref of refs) {
  if (ref.startsWith("#")) {
    assert.ok(ids.has(ref.slice(1)), `Missing anchor ${ref}`);
    continue;
  }
  if (ref.startsWith("https://")) continue;
  assert.ok(
    !ref.startsWith("/"),
    `Root-relative asset breaks project Pages: ${ref}`,
  );
  if (ref === "./") continue;
  const path = resolve(root, ref);
  assert.ok(
    path.startsWith(root + "/"),
    `Asset escapes publication directory: ${ref}`,
  );
  assert.ok((await stat(path)).isFile(), `Missing asset ${ref}`);
  assets++;
}
assert.ok((await stat(resolve(root, "assets/social-preview.png"))).isFile());
assert.ok((await stat(resolve(root, ".nojekyll"))).isFile());
console.log(
  `Marketing checks passed: ${assets} asset references, valid anchors, metadata, and subpath-safe links.`,
);
