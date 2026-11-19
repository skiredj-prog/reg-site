// Minimal static server for dist/: node scripts/serve.mjs [port]
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = process.argv[3] ? join(process.cwd(), process.argv[3], "/") : fileURLToPath(new URL("../dist/", import.meta.url));
const PORT = Number(process.argv[2] || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".yaml": "text/yaml; charset=utf-8",
};
createServer((req, res) => {
  let p = normalize(join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!p.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!existsSync(p)) {
    const nf = join(DIST, "404.html");
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(existsSync(nf) ? readFileSync(nf) : "not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}/`));
