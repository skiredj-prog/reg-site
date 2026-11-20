// Guards on the built site. Fails if any page could be read as a conformance
// claim, loses its source commit, has no "what this does not establish"
// block, or links to nothing.
//
//   node scripts/check-dist.mjs [--dist dist] [--lock projection.lock.json]
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const DIST = join(ROOT, opt("--dist", "dist"));
const lock = JSON.parse(readFileSync(join(ROOT, opt("--lock", "projection.lock.json")), "utf8"));
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
  /\b(attested|attesté) (conformant|conforme)/i,
];

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p); else files.push(p);
  }
})(DIST);

// Text quoted verbatim from reg-conformance is the source's wording, not the
// site's: it is removed before the scan. CLAIMS.md lists the forbidden
// wordings itself ("What must not be said"), which is why it is exempt here
// and only here. The projection file itself is the source and is not scanned.
const P = JSON.parse(readFileSync(join(DIST, "data/projection-v1.json"), "utf8"));
const quotes = [];
(function collect(v) {
  if (typeof v === "string") { if (v.length > 3) quotes.push(v); }
  else if (Array.isArray(v)) v.forEach(collect);
  else if (v && typeof v === "object") Object.values(v).forEach(collect);
})([P.vectors, P.guarantee_records, P.invariants, P.axes, P.rules, P.vector_index, P.claims_policy,
  P.configurations.map((c) => c.violations), P.guards.findings]);
// The vector list also carries each quote lowercased, as its search key.
for (const q of [...quotes]) if (q.toLowerCase() !== q) quotes.push(q.toLowerCase());
quotes.sort((a, b) => b.length - a.length);
const escHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const errors = [];
const rel = (p) => p.slice(DIST.length);
for (const f of files.filter((f) => /\.(html|svg|json|js|yaml|xml|txt)$/.test(f) && !f.endsWith("projection-v1.json"))) {
  let text = readFileSync(f, "utf8");
  for (const q of quotes) text = text.split(escHtml(q)).join(" ").split(JSON.stringify(q).slice(1, -1)).join(" ");
  for (const re of BANNED) {
    const m = text.match(re);
    if (m) errors.push(`${rel(f)}: banned claim wording "${m[0]}"`);
  }
}

const pages = files.filter((f) => f.endsWith(".html"));
for (const f of pages) {
  const html = readFileSync(f, "utf8");
  const foot = html.match(/<p data-guard="source-commit">([\s\S]*?)<\/p>/);
  if (!foot || !foot[1].includes(`/commit/${lock.source_commit}`)) errors.push(`${rel(f)}: footer does not link the source commit ${lock.source_commit}`);
  if (!html.includes(`<meta name="reg-source-commit" content="${lock.source_commit}">`)) errors.push(`${rel(f)}: missing reg-source-commit meta`);
  if (!html.includes(`<meta name="reg-projection-sha256" content="${lock.content_sha256}">`)) errors.push(`${rel(f)}: missing or wrong reg-projection-sha256 meta`);
  if (!rel(f).endsWith("404.html") && !/<aside class="limits"/.test(html)) errors.push(`${rel(f)}: no "what this does not establish" block`);
  if (build.preview) {
    if (!html.includes('data-guard="preview-banner"')) errors.push(`${rel(f)}: preview banner missing`);
    if (!html.includes('<meta name="robots" content="noindex, nofollow">')) errors.push(`${rel(f)}: preview page is indexable`);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:\?[^"#]*)?(#[^"]*)?"/g)) {
    let p = join(DIST, m[1]);
    if (m[1].endsWith("/")) p = join(p, "index.html");
    if (!existsSync(p)) errors.push(`${rel(f)}: broken internal link ${m[1]}`);
  }
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(decodeURIComponent(m[1]))) errors.push(`${rel(f)}: broken anchor #${m[1]}`);
  }
  const dup = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).filter((id, i, a) => a.indexOf(id) !== i);
  if (dup.length) errors.push(`${rel(f)}: duplicate ids ${[...new Set(dup)].join(", ")}`);
}
if (build.preview && !readFileSync(join(DIST, "robots.txt"), "utf8").includes("Disallow: /")) errors.push("robots.txt allows indexing in preview");
if (build.projection_sha256 !== lock.content_sha256) errors.push("dist was built from another projection");
if (build.pages !== pages.length) errors.push(`build wrote ${build.pages} HTML pages, dist holds ${pages.length}`);

// Every admissible configuration has a profile skeleton; no other does.
const admissible = new Set(P.configurations.filter((c) => c.admissible_structural).map((c) => c.id));
const profiles = files.filter((f) => f.includes("/profiles/")).map((f) => f.split("/").pop().replace(/\.yaml$/, ""));
for (const id of admissible) if (!profiles.includes(id)) errors.push(`profile skeleton missing for ${id}`);
for (const id of profiles) if (!admissible.has(id)) errors.push(`profile skeleton for a configuration that is not admissible: ${id}`);
for (const f of files.filter((f) => f.includes("/profiles/"))) {
  const y = readFileSync(f, "utf8");
  if (!/^attestations: \[\]$/m.test(y)) errors.push(`${rel(f)}: a skeleton must carry no attestation`);
  if (!y.includes(P.source.commit)) errors.push(`${rel(f)}: skeleton does not name the source commit`);
}

if (errors.length) {
  console.error(errors.slice(0, 80).map((e) => "  " + e).join("\n"));
  console.error(`check-dist: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`check-dist: ${pages.length} HTML pages (404.html included, same count as the build), ${files.length} files, ${profiles.length} profile skeletons; no claim wording, source commit and limits on every page, links and anchors resolve`);
