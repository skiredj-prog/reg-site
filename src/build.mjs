// Build the static site from the pinned projection. No dependencies.
//
//   node src/build.mjs            preview build (noindex, banner)
//   PREVIEW=0 node src/build.mjs  public build (still no conformance claims)
//
// The build refuses a projection that is not the pinned one, whose guards
// failed, or that allows conformance claims (contract v1.0 has none).

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AXIS_HELP, AXIS_LABEL, CATEGORY_LABEL, LANGS, PROBLEM_LABEL, RESULT_LABEL,
  STATE_HELP, STATE_LABEL, STATUS_LABEL, T, VALUE_LABEL, fmt,
} from "./i18n.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const PREVIEW = process.env.PREVIEW !== "0";
const SITE_URL = "https://reg.tenirlabs.cc";

// ---------------------------------------------------------------- verify
import { contentHash } from "../scripts/hash.mjs";

function fail(msg) {
  console.error(`build refused: ${msg}`);
  process.exit(1);
}

const lock = JSON.parse(readFileSync(join(ROOT, "projection.lock.json"), "utf8"));
const P = JSON.parse(readFileSync(join(ROOT, "data/projection-v1.json"), "utf8"));
if (P.contract !== "reg-projection" || !/^1\./.test(P.contract_version)) fail("not a reg-projection v1");
const actual = contentHash(P);
if (actual !== P.content_sha256) fail(`content_sha256 ${P.content_sha256} does not match the content (${actual})`);
if (actual !== lock.content_sha256) fail(`projection ${actual} is not the pinned one (${lock.content_sha256}). Run npm run pin.`);
if (P.source.commit !== lock.source_commit) fail("projection source commit differs from projection.lock.json");
if (!P.guards.passed) fail("projection guards failed");
if (P.claims.conformance_claims_allowed !== false || P.claims.subjects.length) {
  fail("this site version renders no conformance claims; a projection that allows them needs a new site version");
}

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (h) => h.slice(0, 12);
const ROUTES = {
  home: { fr: "/", en: "/en/" },
  configurator: { fr: "/configurateur/", en: "/en/configurator/" },
  vectors: { fr: "/vecteurs/", en: "/en/vectors/" },
  data: { fr: "/donnees/", en: "/en/data/" },
};
const S = P.summary;
const commitUrl = `${P.source.repository}/commit/${P.source.commit}`;
const platformUrl = lock.platform_commit
  ? `${lock.platform_repository}/commit/${lock.platform_commit}`
  : lock.platform_repository;

function layout({ lang, page, title, description, body, scripts = [] }) {
  const t = T[lang];
  const other = lang === "fr" ? "en" : "fr";
  const nav = ["home", "configurator", "vectors", "data"].map((k) => {
    const cur = k === page ? ' aria-current="page"' : "";
    return `<li><a href="${ROUTES[k][lang]}"${cur}>${esc(t["nav_" + k])}</a></li>`;
  }).join("");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · REG</title>
<meta name="description" content="${esc(description)}">
${PREVIEW ? '<meta name="robots" content="noindex, nofollow">' : ""}
<meta name="reg-source-commit" content="${P.source.commit}">
<meta name="reg-projection-sha256" content="${P.content_sha256}">
<link rel="alternate" hreflang="${other}" href="${SITE_URL}${ROUTES[page][other]}">
<link rel="stylesheet" href="/assets/site.css">
<script>try{var m=localStorage.getItem("reg-theme");if(m)document.documentElement.dataset.theme=m}catch(e){}</script>
</head>
<body>
<a class="skip" href="#main">${esc(t.skip)}</a>
${PREVIEW ? `<p class="preview" role="note" data-guard="preview-banner">${esc(t.preview_banner)}</p>` : ""}
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="${ROUTES.home[lang]}">REG</a>
    <nav aria-label="${lang === "fr" ? "Navigation principale" : "Main"}"><ul>${nav}</ul></nav>
    <div class="top-tools">
      <a class="lang" href="${ROUTES[page][other]}" hreflang="${other}" lang="${other}">${esc(t.other_lang)}</a>
      <button class="theme" type="button" data-theme-toggle title="${lang === "fr" ? "Basculer entre thème clair et sombre" : "Switch between light and dark theme"}">${lang === "fr" ? "Thème" : "Theme"}</button>
    </div>
  </div>
</header>
<main id="main" class="wrap">
${body}
</main>
<footer class="foot">
  <div class="wrap">
    <p data-guard="source-commit">${esc(t.footer_data)}${lang === "fr" ? "\u00a0:" : ":"} <a href="${commitUrl}">reg-conformance@${short(P.source.commit)}</a>${P.source.describe ? ` (${esc(P.source.describe)})` : ""} · ${esc(t.footer_projection)} v${esc(P.contract_version)} <code>${short(P.content_sha256)}</code> · ${esc(t.footer_platform)} <a href="${platformUrl}">reg-platform${lock.platform_commit ? "@" + short(lock.platform_commit) : ""}</a></p>
    <p>${esc(t.footer_license)}</p>
  </div>
</footer>
<script src="/assets/theme.js" defer></script>
${scripts.map((s) => `<script src="${s}" defer></script>`).join("\n")}
</body>
</html>
`;
}

// ---------------------------------------------------------------- pages
function home(lang) {
  const t = T[lang];
  const demo = S.configurations_by_state.demonstrated || 0;
  const part = S.configurations_by_state.partial || 0;
  const pass = S.vectors_by_reference_kernel_result.PASS || 0;
  const body = `
<section class="hero">
  <h1>${esc(t.home_title)}</h1>
  <p class="lead">${esc(t.home_lead)}</p>
  <div class="actions">
    <a class="btn primary" href="${ROUTES.configurator[lang]}">${esc(t.home_cta_config)} <span aria-hidden="true">→</span></a>
    <a class="btn" href="${ROUTES.vectors[lang]}">${esc(t.home_cta_vectors)} <span aria-hidden="true">→</span></a>
  </div>
</section>
<section aria-labelledby="now">
  <h2 id="now">${esc(t.home_now)} <a href="${commitUrl}"><code>${short(P.source.commit)}</code></a></h2>
  <dl class="stats">
    <div><dt>${esc(fmt(t.stat_admissible, { total: S.configurations_total }))}</dt><dd>${S.configurations_admissible}</dd></div>
    <div><dt>${esc(demo === 1 ? t.stat_demonstrated : t.stat_demonstrated_n)}${part ? ` · ${part} ${esc(t.stat_partial)}` : ""}</dt><dd>${demo}</dd></div>
    <div><dt>${esc(t.stat_vectors)}<span class="sub">${esc(fmt(t.stat_vectors_pass, { n: pass }))}</span></dt><dd>${S.vectors_total}</dd></div>
  </dl>
</section>
<section class="cols">
  <div>
    <h2>${esc(t.home_reading)}</h2>
    <ul class="plain">
      <li>${esc(t.home_reading_1)}</li>
      <li>${esc(t.home_reading_2)}</li>
      <li>${esc(t.home_reading_3)}</li>
    </ul>
  </div>
  <div>
    <h2>${esc(t.home_not)}</h2>
    <ul class="plain">
      <li>${esc(t.home_not_1)}</li>
      <li>${esc(t.home_not_2)}</li>
      <li>${esc(t.home_not_3)}</li>
    </ul>
  </div>
</section>`;
  return layout({ lang, page: "home", title: t.home_title, description: t.home_lead, body });
}

function configurator(lang) {
  const t = T[lang];
  // Client payload: only what the configurator needs, already translated.
  const payload = {
    lang,
    commit: P.source.commit,
    siteUrl: SITE_URL,
    pageUrl: SITE_URL + ROUTES.configurator[lang],
    defaultId: "mono-host__local-registry__file-lock__fail-closed",
    axes: P.axes.map((a) => ({
      id: a.id,
      label: AXIS_LABEL[lang][a.id] || a.id,
      help: AXIS_HELP[lang][a.id] || "",
      values: a.values.map((v) => ({ value: v.value, label: VALUE_LABEL[lang][v.value] || v.value, evidence: v.required_evidence })),
    })),
    configs: Object.fromEntries(P.configurations.map((c) => [c.id, {
      s: c.state, v: c.violations.map((x) => ({ id: x.clause_id, field: x.field, allowed: x.allowed_values, d: x.description })), r: c.capability_refs,
    }])),
    records: Object.fromEntries(P.guarantee_records.map((r) => [r.id, {
      name: r.name, bound: r.evidence_bound, scope: r.demonstration_scope,
      problems: r.evidence_problems.map((p) => PROBLEM_LABEL[lang][p] || p),
      limits: r.known_limits, path: r.source_path,
    }])),
    states: STATE_LABEL[lang], help: STATE_HELP[lang], t,
  };
  const selects = P.axes.map((a) => `
    <div class="field">
      <label for="ax-${a.id}">${esc(AXIS_LABEL[lang][a.id])}</label>
      <select id="ax-${a.id}" name="${a.id}" data-axis="${a.id}" aria-describedby="h-${a.id}">
        ${a.values.map((v) => `<option value="${esc(v.value)}">${esc(VALUE_LABEL[lang][v.value] || v.value)}</option>`).join("")}
      </select>
      <p class="hint" id="h-${a.id}">${esc(AXIS_HELP[lang][a.id])}</p>
    </div>`).join("");
  const body = `
<header class="page-head">
  <h1>${esc(t.cfg_title)}</h1>
  <p class="lead">${esc(t.cfg_lead)}</p>
</header>
<noscript><p class="note">${esc(t.cfg_noscript)}</p></noscript>
<div class="split" data-configurator>
  <form class="panel" aria-labelledby="cfg-form" onsubmit="return false">
    <h2 id="cfg-form">${esc(t.cfg_form)}</h2>
    ${selects}
    <button class="btn link" type="button" data-reset>${esc(t.cfg_reset)}</button>
  </form>
  <section class="panel result" aria-labelledby="cfg-state" aria-live="polite">
    <h2 id="cfg-state">${esc(t.cfg_state)}</h2>
    <div class="state-row"><img data-badge alt="" width="160" height="20"><strong data-state-label></strong></div>
    <p data-state-help></p>
    <div data-violations hidden>
      <h3>${esc(t.cfg_violations)}</h3>
      <ul class="plain" data-violation-list></ul>
      <h3>${esc(t.cfg_fix)}</h3>
      <div class="fixes" data-fixes></div>
    </div>
    <div data-admissible>
      <h3>${esc(t.cfg_records)}</h3>
      <div data-records></div>
      <h3>${esc(t.cfg_badge)}</h3>
      <p class="hint">${esc(t.cfg_badge_note)}</p>
      <label class="sr" for="badge-md">Markdown</label>
      <textarea id="badge-md" class="code" rows="3" readonly data-badge-md></textarea>
      <div class="actions">
        <button class="btn" type="button" data-copy="md">${esc(t.cfg_copy)}</button>
        <button class="btn" type="button" data-copy="link">${esc(t.cfg_share)}</button>
        <span class="status" role="status" data-copy-status></span>
      </div>
    </div>
    <h3>${esc(t.cfg_evidence)}</h3>
    <dl class="evidence" data-evidence></dl>
  </section>
</div>
<script type="application/json" id="cfg-data">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`;
  return layout({ lang, page: "configurator", title: t.cfg_title, description: t.cfg_lead, body, scripts: ["/assets/configurator.js"] });
}

function vectors(lang) {
  const t = T[lang];
  const uniq = (k) => [...new Set(P.vectors.map((v) => String(v[k])))];
  const opt = (k, labels) => `<option value="">${esc(t.vec_all)}</option>` +
    uniq(k).map((x) => `<option value="${esc(x)}">${esc(labels[x] || x)}</option>`).join("");
  const rows = P.vectors.map((v) => {
    const r = String(v.reference_kernel_result);
    return `<tr data-category="${esc(v.category)}" data-status="${esc(v.status)}" data-result="${esc(r)}">
      <th scope="row"><code>${esc(v.id)}</code></th>
      <td data-label="${esc(t.vec_col_rfc)}">${esc(v.rfc || "")}</td>
      <td data-label="${esc(t.vec_col_property)}">${esc(v.property || v.note || "")}</td>
      <td data-label="${esc(t.vec_col_status)}">${esc(STATUS_LABEL[lang][v.status] || v.status)}</td>
      <td data-label="${esc(t.vec_col_result)}"><span class="res res-${esc(r.toLowerCase())}">${esc(RESULT_LABEL[lang][r] || r)}</span></td>
    </tr>`;
  }).join("");
  const body = `
<header class="page-head">
  <h1>${esc(t.vec_title)}</h1>
  <p class="lead">${esc(t.vec_lead)}</p>
</header>
<form class="filters" role="search" onsubmit="return false" data-filters data-total="${P.vectors.length}" data-count-tpl="${esc(t.vec_count)}">
  <div class="field grow">
    <label for="f-q">${esc(t.vec_search)}</label>
    <input id="f-q" type="search" name="q" placeholder="${esc(t.vec_search_hint)}" autocomplete="off">
  </div>
  <div class="field"><label for="f-category">${esc(t.vec_category)}</label><select id="f-category" name="category">${opt("category", CATEGORY_LABEL[lang])}</select></div>
  <div class="field"><label for="f-status">${esc(t.vec_status)}</label><select id="f-status" name="status">${opt("status", STATUS_LABEL[lang])}</select></div>
  <div class="field"><label for="f-result">${esc(t.vec_result)}</label><select id="f-result" name="result">${opt("reference_kernel_result", RESULT_LABEL[lang])}</select></div>
</form>
<p class="count" role="status" data-count>${esc(fmt(t.vec_count, { n: P.vectors.length, total: P.vectors.length }))}</p>
<div class="empty" data-empty hidden>
  <p>${esc(t.vec_empty)}</p>
  <button class="btn" type="button" data-clear>${esc(t.vec_clear)}</button>
</div>
<table class="vectors">
  <thead><tr><th scope="col">${esc(t.vec_col_id)}</th><th scope="col">${esc(t.vec_col_rfc)}</th><th scope="col">${esc(t.vec_col_property)}</th><th scope="col">${esc(t.vec_col_status)}</th><th scope="col">${esc(t.vec_col_result)}</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
  return layout({ lang, page: "vectors", title: t.vec_title, description: t.vec_lead, body, scripts: ["/assets/vectors.js"] });
}

function data(lang) {
  const t = T[lang];
  const findings = P.guards.findings;
  const recs = P.guarantee_records.map((r) => `<tr>
    <th scope="row"><a href="${P.source.repository}/blob/${P.source.commit}/${esc(r.source_path)}"><code>${esc(r.id)}</code></a><span class="sub">${esc(r.name)}</span></th>
    <td data-label="${esc(t.data_evidence)}">${r.evidence_bound ? esc(t.cfg_record_bound) : `${esc(t.cfg_record_unbound)}<ul class="plain small">${r.evidence_problems.map((p) => `<li>${esc(PROBLEM_LABEL[lang][p] || p)}</li>`).join("")}</ul>`}</td>
    <td data-label="${esc(t.data_scope)}">${esc(r.demonstration_scope || "—")}</td>
  </tr>`).join("");
  const inv = P.invariants.map((i) => `<tr><th scope="row"><code>${esc(i.id)}</code><span class="sub">${esc(i.name)}</span></th><td data-label="${lang === "fr" ? "Propriété" : "Property"}">${esc(i.property)}</td><td data-label="${esc(t.data_formerly)}">${esc(i.formerly || "—")}</td><td data-label="${esc(t.data_verification)}">${esc(i.verification || "—")}</td></tr>`).join("");
  const body = `
<header class="page-head">
  <h1>${esc(t.data_title)}</h1>
  <p class="lead">${esc(t.data_lead)}</p>
</header>
<section class="cols">
  <div>
    <h2>${esc(t.data_source)}</h2>
    <dl class="kv">
      <dt>${esc(t.data_commit)}</dt><dd><a href="${commitUrl}"><code>${P.source.commit}</code></a></dd>
      <dt>${esc(t.data_describe)}</dt><dd><code>${esc(P.source.describe || t.data_none)}</code></dd>
      <dt>${esc(t.data_tag)}</dt><dd>${esc(P.source.exact_tag || t.data_none)}</dd>
      <dt>${esc(t.data_platform)}</dt><dd>${lock.platform_commit ? `<a href="${platformUrl}"><code>${esc(lock.platform_commit)}</code></a>` : esc(t.data_none)}</dd>
    </dl>
  </div>
  <div>
    <h2>${esc(t.data_versions)}</h2>
    <dl class="kv">
      <dt>${esc(t.data_contract)}</dt><dd>reg-projection v${esc(P.contract_version)}</dd>
      <dt>${esc(t.data_hash)}</dt><dd><code class="wrap-any">${P.content_sha256}</code></dd>
      <dt>catalog</dt><dd>${esc(P.source.catalog_version)}</dd>
      <dt>rules</dt><dd>${esc(P.source.rules_version)}</dd>
      <dt>capabilities</dt><dd>${esc(P.source.capabilities_version)}</dd>
    </dl>
    <p><a class="btn" href="/data/projection-v1.json" download>${esc(t.data_raw)}</a></p>
  </div>
</section>
<section>
  <h2>${esc(t.data_guards)}</h2>
  <p>${esc(t.data_guards_passed)}</p>
  <h3>${esc(t.data_findings)}</h3>
  ${findings.length ? `<ul class="plain">${findings.map((f) => `<li><code>${esc(f.code)}</code> (${esc(f.level)}) ${esc(f.message)}</li>`).join("")}</ul>` : `<p>${esc(t.data_findings_none)}</p>`}
</section>
<section>
  <h2>${esc(t.data_records)}</h2>
  <table class="records"><thead><tr><th scope="col">${esc(t.data_record)}</th><th scope="col">${esc(t.data_evidence)}</th><th scope="col">${esc(t.data_scope)}</th></tr></thead><tbody>${recs}</tbody></table>
</section>
<section>
  <h2>${esc(t.data_invariants)}</h2>
  <table class="records"><thead><tr><th scope="col">Id</th><th scope="col">${lang === "fr" ? "Propriété" : "Property"}</th><th scope="col">${esc(t.data_formerly)}</th><th scope="col">${esc(t.data_verification)}</th></tr></thead><tbody>${inv}</tbody></table>
</section>`;
  return layout({ lang, page: "data", title: t.data_title, description: t.data_lead, body });
}

// ---------------------------------------------------------------- write
rmSync(DIST, { recursive: true, force: true });
const out = (route, html) => {
  const dir = join(DIST, route);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
};
for (const lang of LANGS) {
  out(ROUTES.home[lang], home(lang));
  out(ROUTES.configurator[lang], configurator(lang));
  out(ROUTES.vectors[lang], vectors(lang));
  out(ROUTES.data[lang], data(lang));
}
cpSync(join(ROOT, "src/assets"), join(DIST, "assets"), { recursive: true });
cpSync(join(ROOT, "data/badges"), join(DIST, "badges"), { recursive: true });
mkdirSync(join(DIST, "data"), { recursive: true });
cpSync(join(ROOT, "data/projection-v1.json"), join(DIST, "data/projection-v1.json"));
cpSync(join(ROOT, "public"), DIST, { recursive: true });
writeFileSync(join(DIST, "robots.txt"), PREVIEW ? "User-agent: *\nDisallow: /\n" : "User-agent: *\nAllow: /\n");
writeFileSync(join(DIST, "build.json"), JSON.stringify({
  preview: PREVIEW, source_commit: P.source.commit, projection_sha256: P.content_sha256,
  platform_commit: lock.platform_commit || null,
}, null, 2) + "\n");
console.log(`built ${LANGS.length * 4} pages from reg-conformance@${short(P.source.commit)} (projection ${short(P.content_sha256)})${PREVIEW ? ", preview" : ""}`);
