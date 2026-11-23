// Guards on the built site. Fails if any page could be read as a conformance
// claim, loses its source commit, has no "what this does not establish"
// block, links to nothing, or links outside the base it was built for.
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
// The path the site is served under ("/", "/reg-site/") and its origin, as
// the build wrote them.
const { base, site } = build;
if (typeof base !== "string" || !/^\/(.+\/)?$/.test(base) || typeof site !== "string" || !site) {
  console.error("check-dist: build.json does not name the base and the site the build was made for");
  process.exit(1);
}

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
// What the preview banner must say, per page language.
const BANNER = {
  fr: [/^Prévisualisation\./, /aucune attestation/, /se dire conforme/],
  en: [/^Preview\./, /no attestation/, /call themselves conformant/],
};
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
    // The banner must be there and say what it is for, in the page's
    // language. The required words are written here, not read from the
    // translations, so emptying a translation cannot empty the check.
    const lang = html.match(/<html lang="([a-z]{2})"/)?.[1];
    const banner = html.match(/<p class="preview" role="note" data-guard="preview-banner">([^<]*)<\/p>/);
    const need = BANNER[lang];
    if (!banner) errors.push(`${rel(f)}: preview banner missing`);
    else if (!need || !need.every((re) => re.test(banner[1]))) errors.push(`${rel(f)}: preview banner does not say it is a preview that attests nothing`);
    if (!html.includes('<meta name="robots" content="noindex, nofollow">')) errors.push(`${rel(f)}: preview page is indexable`);
  }
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const canonical = html.match(/<link rel="canonical" href="([^"]*)">/)?.[1];
  if (!canonical?.startsWith(site + base)) errors.push(`${rel(f)}: canonical URL ${canonical ?? "missing"} is not under ${site}${base}`);
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:\?[^"#]*)?(#[^"]*)?"/g)) {
    // Every internal link carries the base; dist/ is what the base serves.
    if (!m[1].startsWith(base)) { errors.push(`${rel(f)}: link outside the base ${base}: ${m[1]}`); continue; }
    let p = join(DIST, m[1].slice(base.length - 1));
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

// Badges are the platform's, copied as they are, and the projection carries
// no hash of them. Each one must say exactly what the projection says about
// its configuration, in both languages, and the set must be exactly the five
// state badges plus one per admissible configuration. Labels, colours and
// form mirror reg-platform's badge.py: anything else fails here rather than
// passing silently. CI also compares the bytes with reg-platform
// (scripts/verify-remote.mjs).
const BADGE_LABEL = {
  fr: { demonstrated: "démontré", partial: "partiel", not_evaluated: "non évalué", refuted: "réfuté", inadmissible: "non admissible" },
  en: { demonstrated: "demonstrated", partial: "partial", not_evaluated: "not evaluated", refuted: "refuted", inadmissible: "not admissible" },
};
const BADGE_COLOR = { demonstrated: "#157a5e", partial: "#8a5a00", not_evaluated: "#4b5563", refuted: "#a1262d", inadmissible: "#374151" };
const BADGE_FORM = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="20" role="img" aria-label="REG\+ config: ([^"<>]+)"><title>([^<>]+)<\/title><rect width="\d+" height="20" fill="#13212c"\/><rect x="\d+" width="\d+" height="20" fill="(#[0-9a-f]{6})"\/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11"><text x="[\d.]+" y="14" text-anchor="middle">REG\+ config<\/text><text x="[\d.]+" y="14" text-anchor="middle">([^<>]+)<\/text><\/g><\/svg>\n$/;
let badges = 0;
for (const lang of ["fr", "en"]) {
  const dir = join(DIST, lang === "fr" ? "badges" : "badges/en");
  const expected = new Map(Object.keys(BADGE_COLOR).map((s) => [`state-${s}.svg`, { state: s, title: (l) => `REG+ configuration state: ${l}` }]));
  for (const c of P.configurations.filter((c) => c.admissible_structural)) {
    expected.set(`${c.id}.svg`, { state: c.state, title: (l) => `REG+ ${c.id}: ${l} (reg-conformance ${P.source.commit.slice(0, 12)}). Not a conformance claim.` });
  }
  const present = existsSync(dir) ? readdirSync(dir).filter((f) => !(lang === "fr" && f === "en")) : [];
  for (const f of present) if (!expected.has(f)) errors.push(`${rel(join(dir, f))}: no configuration of the projection has this badge`);
  for (const [f, e] of expected) {
    const p = join(dir, f);
    if (!existsSync(p)) { errors.push(`${rel(p)}: badge missing`); continue; }
    const m = readFileSync(p, "utf8").match(BADGE_FORM);
    if (!m) { errors.push(`${rel(p)}: not in the platform's badge form`); continue; }
    const [, aria, title, color, text] = m;
    const label = BADGE_LABEL[lang][e.state];
    if (aria !== label || text !== label || color !== BADGE_COLOR[e.state] || title !== e.title(label)) {
      errors.push(`${rel(p)}: the badge says "${text}" (${color}), the projection says ${e.state}`);
    }
    badges++;
  }
}

if (errors.length) {
  console.error(errors.slice(0, 80).map((e) => "  " + e).join("\n"));
  console.error(`check-dist: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`check-dist: ${pages.length} HTML pages (404.html included, same count as the build), ${files.length} files, ${profiles.length} profile skeletons, ${badges} badges that say what the projection says; no claim wording, source commit and limits on every page${build.preview ? ", preview banner with its text" : ""}, links and anchors resolve`);
