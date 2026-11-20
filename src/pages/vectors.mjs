// Vectors: the list (List / Index) and one page per row (Detail).

import {
  FAMILY_LABEL, INDEX_HELP_FR, INDEX_LABEL, REGISTRY_LABEL, REGISTRY_ONE, RESULT_HELP, RESULT_LABEL, T, fmt,
} from "../i18n.mjs";
import { arrow, copyBlock, crumbs, esc, indexTag, kv, limits, prov, q, resultTag, short } from "../lib/html.mjs";
import { layout } from "../lib/layout.mjs";
import { revisionOf, route } from "../lib/model.mjs";

const RESULTS = ["PASS", "FAIL", "INCONCLUSIVE", "NOT_APPLICABLE", "ADAPTER_REQUIRED", "IMPLEMENTATION_GAP", "NOT_IN_PERIMETER"];

// One row per id: registered vectors, proposals, then index rows no vector exercises.
export function rows(M) {
  const out = [];
  M.registered.forEach((v) => out.push({
    kind: "vector", id: v.id, v, index: v.index?.status || null, family: v.index?.family || null,
    result: v.reference_kernel_result ?? null, property: v.index?.normative_property || v.property,
    basis: v.index?.rfc || v.rfc, superseded: (v.superseded_by || []).length > 0,
  }));
  M.proposals.forEach((v) => out.push({
    kind: v.registry, id: v.id, v, index: v.index?.status || null, family: v.index?.family || null,
    result: "none", property: v.note, basis: v.rfc, superseded: false,
  }));
  M.indexOnly.forEach((r) => out.push({
    kind: "index_only", id: r.id, r, index: r.status, family: r.family, result: "none",
    property: r.normative_property, basis: r.rfc, superseded: false,
  }));
  return out;
}

const registryOf = (row) => (row.kind === "vector" ? "vector" : row.kind === "index_only" ? "index_only" : "candidate");

export function vectorsList(M, lang, { preview }) {
  const t = T[lang];
  const all = rows(M);
  const count = (r) => all.filter((x) => registryOf(x) === r).length;
  const fams = [...new Set(all.map((x) => x.family).filter(Boolean))];
  const idxs = ["IMPLEMENTED", "DECLARED", "RESERVED"].filter((s) => all.some((x) => x.index === s));
  const res = RESULTS.filter((r) => all.some((x) => x.result === r)).concat(["none"]);
  const check = (group, value, label) => `<label class="check"><input type="checkbox" name="${group}" value="${esc(value)}"> <span>${label}</span></label>`;
  const tr = all.map((x, i) => {
    const sub = x.kind === "vector" ? "" : `<span class="row-kind">${esc(REGISTRY_ONE[lang][x.kind])}</span>`;
    const sup = x.superseded ? `<span class="row-kind">${esc(t.vec_superseded)}</span>` : "";
    const text = [x.id, x.property, x.basis, x.v?.property, x.v?.reference].filter(Boolean).join(" ").toLowerCase();
    return `<tr role="row" data-reg="${registryOf(x)}" data-idx="${esc(x.index || "UNINDEXED")}" data-fam="${esc(x.family || "")}" data-res="${esc(String(x.result))}" data-order="${i}" data-q="${esc(text)}">
<td role="cell" class="c-id"><a href="${route("vector", lang, x.id)}">${esc(x.id)}</a>${sub}${sup}</td>
<td role="cell" class="c-prop">${q(x.property || "", "en", lang)}${x.basis ? `<span class="c-basis">${q(x.basis, "en", lang)}</span>` : ""}</td>
<td role="cell" class="c-idx">${indexTag(lang, x.index)}</td>
<td role="cell" class="c-res">${resultTag(lang, x.result)}</td>
</tr>`;
  }).join("\n");
  const defs = M.P.vector_index?.status_definitions || {};
  const body = `
<div class="page page-wide">
  <div class="page-head head-limits">
    <div>
      <h1>${esc(t.vec_title)}</h1>
      <p class="lead">${esc(t.vec_lead)}</p>
    </div>
    ${limits(lang, [esc(t.vp_lim_case), esc(t.vec_lim_kernel), esc(t.vec_lim_score)], { id: "vec-limits" })}
  </div>
  <div class="seg js-only" role="group" aria-label="${esc(t.vec_registry)}">
    ${["vector", "candidate", "index_only"].map((r, i) => `<button type="button" class="seg-b" data-reg="${r}" aria-pressed="${i === 0}">${esc(REGISTRY_LABEL[lang][r])} <span class="n">${count(r)}</span></button>`).join("")}
  </div>
  <div class="toolbar">
    <div class="search">
      <label for="vq">${esc(t.vec_search)}</label>
      <input id="vq" type="search" autocomplete="off" spellcheck="false" aria-describedby="vq-hint">
      <p class="hint" id="vq-hint">${esc(t.vec_search_hint)}<span class="fine-only"> ${esc(t.vec_slash)}</span></p>
    </div>
    <button type="button" class="btn js-only" id="vf-btn" aria-expanded="false" aria-controls="vf-panel">${esc(t.vec_filters)}</button>
  </div>
  <div class="filters" id="vf-panel" hidden>
    <fieldset><legend>${esc(t.vec_status)}</legend>${idxs.map((s) => check("idx", s, esc(INDEX_LABEL[lang][s]))).join("")}${check("idx", "UNINDEXED", esc(INDEX_LABEL[lang].UNINDEXED))}</fieldset>
    <fieldset><legend>${esc(t.vec_family)}</legend>${fams.map((f) => check("fam", f, esc(FAMILY_LABEL[lang][f] || f))).join("")}</fieldset>
    <fieldset><legend>${esc(t.vec_result)}</legend>${res.map((r) => check("res", r, esc(RESULT_LABEL[lang][r]))).join("")}</fieldset>
  </div>
  <div class="chips" id="vf-chips"></div>
  <p class="count" id="v-count" aria-live="polite">${esc(fmt(t.vec_count, { n: all.length, total: all.length }))}</p>
  <div class="frame">
    <div class="frame-scroll sticky-ok">
      <table class="vt" role="table">
        <thead role="rowgroup"><tr role="row">
          <th role="columnheader" scope="col" class="c-id" aria-sort="ascending"><button type="button" class="sort" data-sort="order">${esc(t.vec_col_id)} <span class="sort-i" aria-hidden="true">↑</span></button></th>
          <th role="columnheader" scope="col" class="c-prop">${esc(t.vec_col_property)}</th>
          <th role="columnheader" scope="col" class="c-idx">${esc(t.vec_col_status)}</th>
          <th role="columnheader" scope="col" class="c-res"><button type="button" class="sort" data-sort="res">${esc(t.vec_col_result)} <span class="sort-i" aria-hidden="true"></span></button></th>
        </tr></thead>
        <tbody role="rowgroup" id="v-rows">
${tr}
        </tbody>
      </table>
    </div>
    <div class="empty" id="v-empty" hidden>
      <p>${esc(t.vec_empty)}</p>
      <button type="button" class="btn" data-clear>${esc(t.vec_clear)}</button>
    </div>
  </div>
  <nav class="pager js-only" aria-label="${esc(t.vec_pages)}">
    <button type="button" class="btn small" id="pg-prev">${arrowBack()} ${esc(t.vec_prev)}</button>
    <span id="pg-range">${esc(fmt(t.vec_range, { a: 1, b: Math.min(25, all.length), n: all.length }))}</span>
    <button type="button" class="btn small" id="pg-next">${esc(t.vec_next)} ${arrow()}</button>
  </nav>
  <section class="defs" aria-labelledby="defs-t">
    <h2 id="defs-t">${esc(t.vec_defs)}</h2>
    <dl class="kv">${Object.entries(defs).map(([k, d]) => `<div><dt>${indexTag(lang, k)}</dt><dd>${lang === "fr" ? `${esc(INDEX_HELP_FR[k] || "")} <span class="muted" lang="en">${esc(d)}</span>` : esc(d)}</dd></div>`).join("")}</dl>
    <div class="src-list">${M.paths.index ? prov(M, lang, M.paths.index) : ""}${M.paths.vectors.map((p) => prov(M, lang, p)).join("")}${M.paths.proposals ? prov(M, lang, M.paths.proposals) : ""}</div>
  </section>
</div>
<script type="application/json" id="v-i18n">${JSON.stringify({
    count: t.vec_count, range: t.vec_range, remove: t.vec_remove, clearAll: t.vec_clear_all,
    filters: t.vec_filters, filtersN: t.vec_filters_n,
    labels: {
      idx: { ...INDEX_LABEL[lang] }, fam: FAMILY_LABEL[lang], res: RESULT_LABEL[lang],
    },
    groups: { idx: t.vec_status, fam: t.vec_family, res: t.vec_result },
  }).replace(/</g, "\\u003c")}</script>`;
  return layout(M, {
    lang, section: "vectors", path: route("vectors", lang), alt: route("vectors", lang === "fr" ? "en" : "fr"),
    title: t.vec_title, description: t.vec_lead, body, scripts: ["/assets/vectors.js"], preview,
  });
}

const arrowBack = () => `<span aria-hidden="true">←</span>`;

export function replayCommand(M, id) {
  return [
    `git clone ${M.repo}.git`,
    "cd reg-conformance",
    `git checkout ${M.commit}`,
    "python3 -m venv .venv && . .venv/bin/activate",
    "pip install -r requirements.txt",
    "python3 runner.py --mode native --output report.json",
    `python3 -c "import json; r = {x['vector_id']: x['status'] for x in json.load(open('report.json'))['results']}; print('${id}', r['${id}'])"`,
  ].join("\n");
}

export function vectorPage(M, lang, row, { preview }) {
  const t = T[lang];
  const other = lang === "fr" ? "en" : "fr";
  const colon = lang === "fr" ? "\u00a0:" : ":";
  const fam = row.family ? FAMILY_LABEL[lang][row.family] || row.family : null;
  const eyebrow = [REGISTRY_ONE[lang][row.kind], fam].filter(Boolean).join(" · ");
  const v = row.v;
  const idxDef = row.index ? (lang === "fr" ? INDEX_HELP_FR[row.index] : M.P.vector_index?.status_definitions?.[row.index]) : null;
  const meta = [];
  meta.push(`<span>${esc(t.vp_index_status)}${colon} ${indexTag(lang, row.index)}</span>`);
  if (row.kind === "vector") meta.push(`<span>${esc(t.vec_col_result)}${colon} ${resultTag(lang, row.result)}</span>`);
  if (row.basis) meta.push(`<span>${esc(t.vp_rfc)}${colon} ${q(row.basis, "en", lang)}</span>`);
  const supBy = v?.superseded_by || [];
  const sups = M.supersedes.get(row.id) || [];
  const link = (id) => `<a href="${route("vector", lang, id)}"><code>${esc(id)}</code></a>`;

  const lim = [];
  if (row.kind === "vector") {
    lim.push(esc(t.vp_lim_case), esc(t.vp_lim_kernel));
    if (row.result === "IMPLEMENTATION_GAP") lim.push(esc(t.vp_lim_gap));
    if (row.index === "RESERVED") lim.push(esc(t.vp_lim_reserved));
    if (supBy.length) lim.push(esc(t.vp_lim_superseded));
    const rev = revisionOf(v);
    if (rev) lim.push(esc(fmt(rev.ratified ? t.vp_lim_revision_ratified : t.vp_lim_revision, { r: rev.name })));
  } else if (row.kind === "index_only") {
    lim.push(esc(t.vp_lim_index));
  } else {
    lim.push(esc(t.vp_lim_proposal));
  }

  let main = "";
  if (row.kind === "vector") {
    const replayed = v.reference_kernel_replay;
    main = `
  <div class="split">
    <section class="panel" aria-labelledby="req-t">
      <h2 id="req-t">${esc(t.vp_requires)}</h2>
      ${kv([
        v.input && [esc(t.vp_input), q(v.input, "en", lang)],
        v.intended && [esc(t.vp_intended), q(v.intended, "en", lang)],
        v.expected && [esc(t.vp_expected), `<code>${esc(v.expected)}</code>`],
        v.index?.normative_property && [esc(t.vp_property), q(v.index.normative_property, "en", lang)],
        v.reference && [esc(t.vp_reference), q(v.reference, "en", lang)],
      ])}
    </section>
    <div class="stack">
      <section class="panel" aria-labelledby="res-t">
        <h2 id="res-t">${esc(t.vp_result)}</h2>
        <p class="big-res">${resultTag(lang, row.result)}</p>
        <p class="muted">${esc(RESULT_HELP[lang][String(row.result)] || "")}</p>
        ${kv([
          v.observed && [esc(t.vp_observed), q(v.observed, "en", lang)],
          [esc(t.vp_yaml_status), `<code>${esc(v.status)}</code>`],
        ])}
        <p class="replay-line">${replayed === undefined || replayed === null
          ? esc(t.vp_replay_none)
          : `<span class="g" aria-hidden="true">✓</span>${esc(t.vp_replay_ok)} <code>${esc(replayed)}</code>`}</p>
      </section>
      ${limits(lang, lim, { id: "v-limits" })}
    </div>
  </div>
  ${supBy.length || sups.length ? `<section class="panel" aria-labelledby="sup-t"><h2 id="sup-t">${esc(supBy.length ? t.vp_superseded_by : t.vp_supersedes)}</h2>
    <p>${(supBy.length ? supBy : sups).map(link).join(" · ")}</p></section>` : ""}
  <section class="rerun" aria-labelledby="rerun-t">
    <h2 id="rerun-t">${esc(t.vp_rerun)}</h2>
    <p>${esc(t.vp_rerun_lead)}</p>
    ${copyBlock(lang, replayCommand(M, row.id), { id: "rerun-cmd" })}
    <p class="muted small">${esc(t.vp_rerun_note)}</p>
  </section>`;
  } else if (row.kind === "index_only") {
    const r = row.r;
    main = `
  <div class="split">
    <section class="panel" aria-labelledby="req-t">
      <h2 id="req-t">${esc(t.vp_property)}</h2>
      <p>${q(r.normative_property, "en", lang)}</p>
      ${kv([
        [esc(t.vp_location), q(r.location, "en", lang)],
        [esc(t.vec_col_result), resultTag(lang, "none")],
      ])}
      <p class="muted">${esc(t.vp_no_vector)}</p>
    </section>
    ${limits(lang, lim, { id: "v-limits" })}
  </div>`;
  } else {
    main = `
  <div class="split">
    <section class="panel" aria-labelledby="req-t">
      <h2 id="req-t">${esc(REGISTRY_ONE[lang][row.kind])}</h2>
      <p>${esc(t.vp_proposal)}</p>
      ${kv([
        [esc(t.vp_yaml_status), `<code>${esc(v.status)}</code>`],
        v.note && [esc(t.vp_note), q(v.note, "en", lang)],
      ])}
    </section>
    ${limits(lang, lim, { id: "v-limits" })}
  </div>`;
  }

  const sources = [];
  if (v?.file) sources.push(prov(M, lang, v.file, { line: v.line }));
  if (M.paths.index && row.index) sources.push(prov(M, lang, M.paths.index));
  const body = `
<div class="page">
  ${crumbs([[route("vectors", lang), esc(t.vp_back)], [null, `<code>${esc(row.id)}</code>`]])}
  <div class="page-head">
    <div>
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h1 class="mono-h">${esc(row.id)}</h1>
      ${v?.property ? `<p class="lead">${q(v.property, "en", lang)}</p>` : ""}
      <p class="meta">${meta.join("")}</p>
      ${idxDef ? `<p class="muted small">${indexTag(lang, row.index)} ${esc(idxDef)}</p>` : ""}
    </div>
    ${row.kind === "vector" ? `<div class="head-actions"><a class="btn" href="#rerun-t">${esc(t.vp_rerun)} ${arrow()}</a></div>` : ""}
  </div>
  ${main}
  <section class="sources" aria-labelledby="src-t">
    <h2 id="src-t">${esc(t.source)}</h2>
    <div class="src-list">${sources.join("")}</div>
    ${row.kind === "vector" && v.index?.location ? `<p class="muted small">${esc(t.vp_location)}${colon} ${q(v.index.location, "en", lang)}</p>` : ""}
  </section>
</div>`;
  return layout(M, {
    lang, section: "vectors", path: route("vector", lang, row.id), alt: route("vector", other, row.id),
    title: `${row.id}${v?.property ? ` · ${v.property}` : ""}`, description: row.property || row.id, body, preview,
  });
}
