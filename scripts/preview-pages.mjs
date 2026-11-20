// A static-only path-verification harness: no Next server and no SPA fallback.
import { createServer } from "node:http";
import { readFileSync, statSync, createReadStream } from "node:fs";
import { resolve, extname, sep } from "node:path";

const root = resolve(import.meta.dirname, "../apps/web/out");
const { basePath, revision, siteUrl } = JSON.parse(readFileSync(resolve(root, "pages-build.json"), "utf8"));
const port = Number(process.env.PORT ?? 3418);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };
createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname); }
  catch { res.writeHead(400).end(); return; }
  if (basePath && pathname === basePath) { res.writeHead(308, { Location: `${basePath}/` }).end(); return; }
  if (!pathname.startsWith(`${basePath}/`)) { res.writeHead(404).end("Outside exported base path"); return; }
  let file = resolve(root, `.${pathname.slice(basePath.length)}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) { res.writeHead(403).end(); return; }
  try {
    if (statSync(file).isDirectory()) {
      if (!pathname.endsWith("/")) { res.writeHead(308, { Location: `${pathname}/` }).end(); return; }
      file = resolve(file, "index.html");
    }
    const size = statSync(file).size;
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Content-Length": size, "Cache-Control": "no-store" });
    if (req.method === "HEAD") res.end(); else createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    if (req.method === "HEAD") res.end(); else createReadStream(resolve(root, "404.html")).pipe(res);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Exact static export ${revision}: http://127.0.0.1:${port}${basePath}/`);
  console.log(`Built for ${siteUrl}/. No deployment and no Next runtime.`);
});
