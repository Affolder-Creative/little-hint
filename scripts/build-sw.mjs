import { readdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = "dist/client";
const push = await readFile("src/service-worker/push.js", "utf8");
const assets = (await readdir(`${root}/assets`)).map((f) => `/assets/${f}`);
const manifest = JSON.parse(
  await readFile(`${root}/.vite/manifest.json`, "utf8"),
);
const initialAssets = new Set();
const visited = new Set();
function addInitialAssets(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  initialAssets.add(`/${chunk.file}`);
  for (const file of [...(chunk.css ?? []), ...(chunk.assets ?? [])])
    initialAssets.add(`/${file}`);
  for (const dependency of chunk.imports ?? []) addInitialAssets(dependency);
}
// Deferred routes stay deferred. Cache their static files only when requested.
addInitialAssets("index.html");
initialAssets.delete("/index.html");
const brand = [
  "logos/little-hint-horizontal-color.svg",
  "logos/little-hint-horizontal-dark.svg",
  "logos/little-hint-tagline-color.svg",
  "logos/little-hint-tagline-dark.svg",
  "symbols/little-hint-tag-color.svg",
  "symbols/little-hint-tag-dark.svg",
  "icons/little-hint-app-color-64.png",
  "favicons/favicon.svg",
  "favicons/little-hint-favicon-color.svg",
  "favicons/little-hint-favicon-dark.svg",
  "favicons/favicon-color.ico",
  "favicons/favicon-dark.ico",
  "manifest.webmanifest",
].map((p) => `/brand/little-hint/${p}`);
const files = ["/", ...initialAssets, ...brand];
const allowed = [...new Set([...files, ...assets])];
const version = createHash("sha256")
  .update(await readFile(`${root}/index.html`))
  .digest("hex")
  .slice(0, 12);
await writeFile(
  `${root}/sw.js`,
  `const CACHE='little-hint-static-${version}';const FILES=${JSON.stringify(files)};const ALLOWED=new Set(${JSON.stringify(allowed)});
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('little-hint-static-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')event.waitUntil(self.skipWaiting())});
async function navigationResponse(request){const controller=new AbortController();let timer;try{return await Promise.race([fetch(request,{signal:controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Navigation timed out'))},5000)})])}catch{return (await caches.open(CACHE)).match('/')}finally{clearTimeout(timer)}}
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/__preview/'))return;if(event.request.mode==='navigate'){event.respondWith(navigationResponse(event.request));return}if(ALLOWED.has(u.pathname))event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(u.pathname);if(cached)return cached;const response=await fetch(event.request);if(response.ok&&!response.redirected)await cache.put(u.pathname,response.clone()).catch(()=>{});return response}));});
${push}
`,
);
console.log(`Generated private-data-safe service worker ${version}`);
