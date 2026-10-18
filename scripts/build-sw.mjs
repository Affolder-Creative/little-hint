import { readdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = "dist/client";
const assets = (await readdir(`${root}/assets`)).map((f) => `/assets/${f}`);
const brand = [
  "logos/little-hint-horizontal-color.svg",
  "logos/little-hint-horizontal-dark.svg",
  "logos/little-hint-tagline-color.svg",
  "logos/little-hint-tagline-dark.svg",
  "symbols/little-hint-tag-color.svg",
  "symbols/little-hint-tag-dark.svg",
  "icons/little-hint-app-color-64.png",
  "favicons/favicon.svg",
  "manifest.webmanifest",
].map((p) => `/brand/little-hint/${p}`);
const files = ["/", ...assets, ...brand];
const version = createHash("sha256")
  .update(await readFile(`${root}/index.html`))
  .digest("hex")
  .slice(0, 12);
await writeFile(
  `${root}/sw.js`,
  `const CACHE='little-hint-static-${version}';const FILES=${JSON.stringify(files)};const ALLOWED=new Set(FILES);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('little-hint-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(c=>c.match('/'))));return}if(ALLOWED.has(u.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(u.pathname))||fetch(event.request)));});
`,
);
console.log(`Generated private-data-safe service worker ${version}`);
