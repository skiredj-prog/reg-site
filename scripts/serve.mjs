// Minimal static server for dist/: node scripts/serve.mjs [port] [dir] [--base=/reg-site/]
// With --base, dist/ is served under that path, as GitHub Pages serves a
// project site: a request outside it, like a file that does not exist, gets
// 404.html with status 404.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const [port, dir] = args.filter((a) => !a.startsWith("--"));
const BASE = `/${args.find((a) => a.startsWith("--base="))?.slice(7) || ""}/`.replace(/\/{2,}/g, "/");
const DIST = dir ? join(process.cwd(), dir, "/") : fileURLToPath(new URL("../dist/", import.meta.url));
const PORT = Number(port || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".yaml": "text/yaml; charset=utf-8",
};
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let p = path.startsWith(BASE) ? normalize(join(DIST, path.slice(BASE.length - 1))) : null;
  if (p && !p.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (p && existsSync(p) && statSync(p).isDirectory()) p = join(p, "index.html");
  if (!p || !existsSync(p)) {
    const nf = join(DIST, "404.html");
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(existsSync(nf) ? readFileSync(nf) : "not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}${BASE}`));
