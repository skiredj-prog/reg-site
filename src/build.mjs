// Build the static site from the pinned projection. No dependencies.
//
//   node src/build.mjs              preview build (noindex, banner)
//   node src/build.mjs --public     public build (still no conformance claims)
//
// The build refuses a projection that is not the pinned one, whose guards
// failed, that allows conformance claims, or whose contract it does not know.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash } from "../scripts/hash.mjs";
import { LANGS, T } from "./i18n.mjs";
import { esc, short } from "./lib/html.mjs";
import { layout } from "./lib/layout.mjs";
import { SITE_URL, model, profilePath, route } from "./lib/model.mjs";
import { profileYaml } from "./lib/profile.mjs";
import { cite } from "./pages/cite.mjs";
import { configurationPage, configurator } from "./pages/configurator.mjs";
import { data } from "./pages/data.mjs";
import { home } from "./pages/home.mjs";
import { rows, vectorPage, vectorsList } from "./pages/vectors.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const DIST = join(ROOT, opt("--out") || "dist");
const DATA = join(ROOT, opt("--data") || "data");
const LOCK = join(ROOT, opt("--lock") || "projection.lock.json");
const PREVIEW = !args.includes("--public") && process.env.PREVIEW !== "0";

function fail(msg) {
  console.error(`build refused: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- verify
const lock = JSON.parse(readFileSync(LOCK, "utf8"));
const P = JSON.parse(readFileSync(join(DATA, "projection-v1.json"), "utf8"));
if (P.contract !== "reg-projection" || !/^1\.1\.\d+$/.test(P.contract_version)) {
  fail(`this site reads reg-projection 1.1.x, not ${P.contract} ${P.contract_version}`);
}
const actual = contentHash(P);
if (actual !== P.content_sha256) fail(`content_sha256 ${P.content_sha256} does not match the content (${actual})`);
if (actual !== lock.content_sha256) fail(`projection ${actual} is not the pinned one (${lock.content_sha256}). Run npm run pin.`);
if (P.source.commit !== lock.source_commit) fail("projection source commit differs from projection.lock.json");
if (!P.guards.passed) fail("projection guards failed");
if (P.claims.conformance_claims_allowed !== false || P.claims.subjects.length) {
  fail("this site version renders no conformance claims; a projection that allows them needs a new site version");
}
for (const c of P.configurations) {
  if (!/^[a-z0-9-]+(__[a-z0-9-]+){3}$/.test(c.id)) fail(`configuration id not usable in a URL: ${c.id}`);
}

// The five states, checked again here whatever the platform wrote: no
// configuration is shown as demonstrated or partial unless every record it
// cites carries bound evidence, and the counts the pages show agree with the
// configurations. "refuted" comes from a catalogue claim of false and
// promotes nothing, so it needs no bound record.
const STATES = ["demonstrated", "partial", "not_evaluated", "refuted", "inadmissible"];
const records = new Map(P.guarantee_records.map((r) => [r.id, r]));
for (const r of P.guarantee_records) {
  if (r.evidence_bound === true && (r.evidence_problems?.length || !r.evidence_artifact
    || !/^[0-9a-f]{64}$/.test(r.declared_results_hash || "") || /^0+$/.test(r.declared_results_hash)
    || !["production-equivalent", "loopback-test-only"].includes(r.demonstration_scope))) {
    fail(`record ${r.id} is marked bound without a matching artifact, results hash and scope`);
  }
}
const byState = Object.fromEntries(STATES.map((s) => [s, 0]));
for (const c of P.configurations) {
  if (!STATES.includes(c.state)) fail(`${c.id}: unknown state ${c.state}`);
  byState[c.state]++;
  if ((c.state === "inadmissible") !== !c.admissible_structural) {
    fail(`${c.id}: state ${c.state} contradicts admissible_structural ${c.admissible_structural}`);
  }
  if (c.state === "demonstrated" || c.state === "partial") {
    const refs = c.capability_refs || [];
    const unbound = refs.filter((id) => records.get(id)?.evidence_bound !== true);
    if (!refs.length) fail(`${c.id} is shown as ${c.state} but cites no guarantee record`);
    if (unbound.length) fail(`${c.id} is shown as ${c.state} but cites records without bound evidence: ${unbound.join(", ")}`);
    if (c.catalog_claim === null || c.catalog_claim === false) fail(`${c.id} is shown as ${c.state} without a catalogue claim`);
    if (c.state === "demonstrated" && (c.catalog_claim === "partial"
      || refs.some((id) => records.get(id).demonstration_scope === "loopback-test-only"))) {
      fail(`${c.id} is shown as demonstrated on a partial claim or loopback-only evidence`);
    }
  }
}
const S = P.summary;
for (const s of new Set([...STATES, ...Object.keys(S.configurations_by_state || {})])) {
  const said = S.configurations_by_state?.[s] || 0;
  if (said !== (byState[s] || 0)) fail(`the summary counts ${said} ${s} configurations, the configurations say ${byState[s] || 0}`);
}
if (S.configurations_total !== P.configurations.length
  || S.configurations_admissible !== P.configurations.filter((c) => c.admissible_structural).length
  || S.guarantee_records_total !== P.guarantee_records.length
  || S.guarantee_records_bound !== P.guarantee_records.filter((r) => r.evidence_bound === true).length) {
  fail("the summary counts disagree with the configurations or the guarantee records");
}
for (const v of [...P.vectors, ...(P.vector_index?.rows_without_vector || [])]) {
  if (!/^[A-Za-z0-9._-]+$/.test(v.id)) fail(`vector id not usable in a URL: ${v.id}`);
}

const M = model(P, lock);
const opts = { preview: PREVIEW };

// ---------------------------------------------------------------- write
rmSync(DIST, { recursive: true, force: true });
let pages = 0;
const out = (path, html) => {
  const dir = join(DIST, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
  pages++;
};

const allRows = rows(M);
for (const lang of LANGS) {
  out(route("home", lang), home(M, lang, opts));
  out(route("configurator", lang), configurator(M, lang, opts));
  for (const c of P.configurations) out(route("configuration", lang, c.id), configurationPage(M, lang, c, opts));
  out(route("vectors", lang), vectorsList(M, lang, opts));
  for (const r of allRows) out(route("vector", lang, r.id), vectorPage(M, lang, r, opts));
  out(route("cite", lang), cite(M, lang, opts));
  out(route("data", lang), data(M, lang, opts));
}

// A not-found page, both languages on one page (GitHub Pages serves /404.html).
const nf = layout(M, {
  lang: "fr", section: null, path: "/404.html", alt: "/en/", preview: PREVIEW,
  title: T.fr.nf_title, description: T.fr.nf_title,
  body: `<div class="page page-form"><div class="page-head"><div><h1>${esc(T.fr.nf_title)}</h1><p class="lead">${esc(T.fr.nf_lead)}</p></div></div>
<p><a class="btn primary" href="/">${esc(T.fr.nf_home)} <span aria-hidden="true">→</span></a></p>
<div lang="en"><h2>${esc(T.en.nf_title)}</h2><p>${esc(T.en.nf_lead)}</p><p><a class="btn" href="/en/">${esc(T.en.nf_home)} <span aria-hidden="true">→</span></a></p></div></div>`,
});
writeFileSync(join(DIST, "404.html"), nf);
pages++;

cpSync(join(ROOT, "src/assets"), join(DIST, "assets"), { recursive: true });
cpSync(join(DATA, "badges"), join(DIST, "badges"), { recursive: true });
if (!existsSync(join(DATA, "badges/en"))) fail("data/badges/en is missing: pin a projection whose platform renders English badges");
mkdirSync(join(DIST, "data"), { recursive: true });
cpSync(join(DATA, "projection-v1.json"), join(DIST, "data/projection-v1.json"));
mkdirSync(join(DIST, "profiles"), { recursive: true });
for (const c of M.admissible) writeFileSync(join(DIST, profilePath(c.id)), profileYaml(M, c));
cpSync(join(ROOT, "public"), DIST, { recursive: true });
writeFileSync(join(DIST, "robots.txt"), PREVIEW ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
if (!PREVIEW) {
  const urls = [];
  for (const lang of LANGS) {
    urls.push(route("home", lang), route("configurator", lang), route("vectors", lang), route("cite", lang), route("data", lang));
    for (const c of P.configurations) urls.push(route("configuration", lang, c.id));
    for (const r of allRows) urls.push(route("vector", lang, r.id));
  }
  writeFileSync(join(DIST, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${SITE_URL}${u}</loc></url>`).join("\n")}\n</urlset>\n`);
}
writeFileSync(join(DIST, "build.json"), JSON.stringify({
  preview: PREVIEW, source_commit: P.source.commit, source_tag: P.source.exact_tag || null,
  projection_contract: P.contract_version, projection_sha256: P.content_sha256,
  platform_commit: lock.platform_commit || null, pages,
}, null, 2) + "\n");
console.log(`built ${pages} HTML pages (${(pages - 1) / LANGS.length} per language and 404.html) from reg-conformance@${short(P.source.commit, 12)} (projection ${short(P.content_sha256, 12)})${PREVIEW ? ", preview" : ", public"}`);
