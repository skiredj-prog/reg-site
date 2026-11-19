// Guards on the built site. Fails the build if any page could be read as a
// conformance claim, loses its source commit, or links to nothing.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const lock = JSON.parse(readFileSync(join(ROOT, "projection.lock.json"), "utf8"));
const build = JSON.parse(readFileSync(join(DIST, "build.json"), "utf8"));

// Affirmative claim language. The copy says what the site does not do
// without using these forms.
const BANNED = [
  /certifi(é|ée|és|ées|e|ed|cation|cat)/i,
  /REG[\s-]*(conformant|compliant|certified)/i,
  /conformes?\s+(à\s+)?REG/i,
  /\bcompliant\b/i,
  /\bcompliance\b/i,
  /\bconformité\s+(garantie|attestée)/i,
];

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p); else files.push(p);
  }
})(DIST);

// Text quoted verbatim from reg-conformance (vector properties, record
// notes) is the source's wording, not the site's; it is removed before the
// scan. The projection file itself is the source and is not scanned.
const P = JSON.parse(readFileSync(join(DIST, "data/projection-v1.json"), "utf8"));
const quotes = [];
(function collect(v) {
  if (typeof v === "string") { if (v.length > 3) quotes.push(v); }
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === "object") Object.values(v).forEach(collect);
})([P.vectors, P.guarantee_records, P.invariants, P.axes, P.configurations.map((c) => c.violations)]);
quotes.sort((a, b) => b.length - a.length);
const escHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const errors = [];
const rel = (p) => p.slice(DIST.length);
for (const f of files.filter((f) => /\.(html|svg|json|js)$/.test(f) && !f.endsWith("projection-v1.json"))) {
  let text = readFileSync(f, "utf8");
  for (const q of quotes) text = text.split(escHtml(q)).join(" ").split(JSON.stringify(q).slice(1, -1)).join(" ");
  for (const re of BANNED) {
    const m = text.match(re);
    if (m) errors.push(`${rel(f)}: banned claim wording "${m[0]}"`);
  }
}
for (const f of files.filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(f, "utf8");
  const foot = html.match(/<p data-guard="source-commit">([\s\S]*?)<\/p>/);
  if (!foot || !foot[1].includes(`/commit/${lock.source_commit}`)) errors.push(`${rel(f)}: footer does not link the source commit ${lock.source_commit}`);
  if (!html.includes(`<meta name="reg-source-commit" content="${lock.source_commit}">`)) errors.push(`${rel(f)}: missing reg-source-commit meta`);
  if (build.preview) {
    if (!html.includes('data-guard="preview-banner"')) errors.push(`${rel(f)}: preview banner missing`);
    if (!html.includes('<meta name="robots" content="noindex, nofollow">')) errors.push(`${rel(f)}: preview page is indexable`);
  }
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    let p = join(DIST, m[1]);
    if (m[1].endsWith("/")) p = join(p, "index.html");
    if (!existsSync(p)) errors.push(`${rel(f)}: broken internal link ${m[1]}`);
  }
}
if (build.preview && !readFileSync(join(DIST, "robots.txt"), "utf8").includes("Disallow: /")) errors.push("robots.txt allows indexing in preview");
if (build.projection_sha256 !== lock.content_sha256) errors.push("dist was built from another projection");

if (errors.length) {
  console.error(errors.map((e) => "  " + e).join("\n"));
  console.error(`check-dist: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`check-dist: ${files.filter((f) => f.endsWith(".html")).length} pages, ${files.length} files, no claim wording, source commit on every page`);
