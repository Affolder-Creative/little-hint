import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../marketing");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".json": "application/json",
};
export function marketingServer() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/" || url.pathname === "/little-hint") {
        res.writeHead(302, { Location: "/little-hint/" }).end();
        return;
      }
      if (!url.pathname.startsWith("/little-hint/")) {
        res.writeHead(404).end();
        return;
      }
      const relative =
        decodeURIComponent(url.pathname.slice("/little-hint/".length)) ||
        "index.html";
      const path = resolve(root, relative);
      if (!path.startsWith(root + "/")) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(path);
      res
        .writeHead(200, {
          "Content-Type": mime[extname(path)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = marketingServer();
  server.listen(Number(process.env.MARKETING_PORT ?? 4174), "127.0.0.1", () => {
    console.log(
      `Little Hint marketing: http://127.0.0.1:${server.address().port}/little-hint/`,
    );
  });
}
