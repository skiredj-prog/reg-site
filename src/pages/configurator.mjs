// The configuration space: the map, the configurator (report runner) and one
// page per configuration (detail).

import {
  AXIS_HELP, AXIS_LABEL, MAP_ROW_SHORT, PROBLEM_LABEL, STATE_COUNT, STATE_HELP, STATE_LABEL, T, VALUE_LABEL, VALUE_SHORT, fmt,
} from "../i18n.mjs";
import { renderResult, renderTake, tag } from "../assets/cfg-render.js";
import { arrow, crumbs, esc, mark, short } from "../lib/html.mjs";
import { layout } from "../lib/layout.mjs";
import { ROUTES, SITE_URL, badgePath, profilePath, route } from "../lib/model.mjs";

const STATES = ["demonstrated", "partial", "not_evaluated", "refuted", "inadmissible"];

// "102 non admissibles, 42 non évaluées, 0 démontrée": the largest first,
// and the number of demonstrated configurations always said, even at zero.
export function stateSummary(M, lang) {
  const by = M.P.summary.configurations_by_state;
  const word = (s, n) => STATE_COUNT[lang][s][(lang === "fr" ? n <= 1 : n === 1) ? 0 : 1];
  const listed = STATES.filter((s) => by[s]).sort((a, b) => by[b] - by[a]);
  if (!by.demonstrated) listed.push("demonstrated");
  return listed.map((s) => `${by[s] || 0} ${word(s, by[s] || 0)}`).join(", ");
}

// 12 x 12: rows are host scope then deduplication, columns concurrency then
// unknown outcome. The table is a picture (aria-hidden); its caption says
// what it shows and the configurator gives keyboard access.
export function configMap(M, lang, { current = null, cellHref = true, compact = false, lead = "" } = {}) {
  const t = T[lang];
  const [H, D, C, U] = M.AXES;
  const vals = (ax) => M.axis[ax].values.map((v) => v.value);
  const head1 = vals(C).map((c) => `<th colspan="${vals(U).length}" scope="colgroup">${esc(VALUE_SHORT[lang][c])}</th>`).join("");
  const head2 = vals(C).map(() => vals(U).map((u) => `<th scope="col" title="${esc(VALUE_LABEL[lang][u])}">${esc(VALUE_SHORT[lang][u])}</th>`).join("")).join("");
  const bodies = vals(H).map((h) => {
    const rows = vals(D).map((d) => {
      const cells = vals(C).map((c) => vals(U).map((u) => {
        const id = [h, d, c, u].join("__");
        const cfg = M.configById.get(id);
        const cur = id === current ? " cur" : "";
        const title = `${[h, d, c, u].map((v) => VALUE_LABEL[lang][v]).join(" · ")} : ${STATE_LABEL[lang][cfg.state]}`;
        const inner = mark(cfg.state);
        return `<td class="m st-${cfg.state}${cur}">${cellHref
          ? `<a href="${route("configuration", lang, id)}" tabindex="-1" data-id="${esc(id)}" title="${esc(title)}">${inner}</a>`
          : `<span>${inner}</span>`}</td>`;
      }).join("")).join("");
      return `<tr><th scope="row"><span class="lab-l">${esc(VALUE_SHORT[lang][d])}</span><span class="lab-s">${esc(MAP_ROW_SHORT[lang][d])}</span></th>${cells}</tr>`;
    }).join("");
    return `<tbody><tr class="map-grp"><th colspan="${1 + vals(C).length * vals(U).length}" scope="rowgroup">${esc(VALUE_LABEL[lang][h])}</th></tr>${rows}</tbody>`;
  }).join("");
  const by = M.P.summary.configurations_by_state;
  const legend = STATES.map((s) => `<li><span class="tag st-${s}">${mark(s)}${esc(STATE_LABEL[lang][s])}</span><span class="n">${by[s] || 0}</span></li>`).join("");
  return `<figure class="map-fig${compact ? " map-compact" : ""}">
  <div class="map-wrap"><table class="map" aria-hidden="true">
    <thead><tr><td></td>${head1}</tr><tr><td></td>${head2}</tr></thead>
    ${bodies}
  </table></div>
  <figcaption>
    <p class="map-sum">${esc(fmt(t.map_label, { total: M.P.summary.configurations_total, summary: stateSummary(M, lang) }))}</p>
    <ul class="legend" aria-label="${esc(t.map_legend)}">${legend}</ul>
    <p class="muted small">${lead ? `${esc(lead)} ` : ""}${esc(t.map_rows)}</p>
  </figcaption>
</figure>`;
}

// Everything the shared renderer needs, in one language.
export function cfgData(M, lang, uid = "c") {
  const t = T[lang];
  const P = M.P;
  const configs = {};
  for (const c of P.configurations) {
    configs[c.id] = {
      c: c.config,
      s: c.state,
      v: c.violations.map((v) => ({ clause: v.clause_id, desc: v.description, field: v.field, allowed: v.allowed_values })),
      r: c.capability_refs,
    };
  }
  const records = {};
  for (const r of P.guarantee_records) {
    records[r.id] = {
      name: r.name,
      bound: r.evidence_bound,
      problems: r.evidence_problems.map((p) => PROBLEM_LABEL[lang][p] || p),
      limits: r.known_limits || [],
      version: r.implementation_version,
      path: r.source_path,
      sha: short(r.source_sha256, 8),
      src: M.blob(r.source_path),
    };
  }
  const keys = ["cfg_state", "cfg_violations", "cfg_fix", "cfg_fix_hint", "cfg_use", "cfg_open_config", "cfg_requires",
    "cfg_records", "cfg_records_none", "cfg_record_bound", "cfg_record_unbound", "cfg_version", "cfg_limits_decl",
    "cfg_invariants", "cfg_invariants_none", "cfg_evidence", "cfg_evidence_none", "cfg_link", "cfg_badge", "cfg_badge_note",
    "cfg_badge_none", "cfg_profile", "cfg_profile_note", "cfg_profile_fault", "cfg_profile_none", "cfg_profile_dl",
    "cfg_detail", "cfg_changed", "cfg_limits_1", "cfg_limits_2", "cfg_limits_3", "cfg_limits_3b", "cfg_limits_inadm",
    "cfg_incompatible", "limits_title", "source", "sha_title", "copy", "copied", "copy_failed", "conf_id", "cfg_announce",
    "conf_rules_ok"];
  return {
    lang,
    uid,
    srcLang: "fr",
    site: SITE_URL,
    axes: P.axes.map((a) => ({
      id: a.id,
      label: AXIS_LABEL[lang][a.id],
      values: a.values.map((v) => ({ value: v.value, label: VALUE_LABEL[lang][v.value], cap: v.capability_id, evidence: v.required_evidence })),
    })),
    configs,
    records,
    invariants: P.invariants.map((i) => ({ id: i.id, name: i.name, property: i.property, scope: i.scope, caps: i.applies_to || [] })),
    state: STATE_LABEL[lang],
    stateHelp: STATE_HELP[lang],
    routes: {
      config: ROUTES.configuration[lang]("{id}"),
      badge: badgePath(lang, "{id}"),
      profile: profilePath("{id}"),
    },
    defaultId: M.defaultConfig,
    t: Object.fromEntries(keys.map((k) => [k, t[k]])),
  };
}

export function configurator(M, lang, { preview }) {
  const t = T[lang];
  const D = cfgData(M, lang, "app");
  const id = M.defaultConfig;
  const cur = M.configById.get(id);
  const selects = M.P.axes.map((a) => {
    const opts = a.values.map((v) => {
      const probe = { ...cur.config, [a.id]: v.value };
      const pid = M.AXES.map((ax) => probe[ax]).join("__");
      const bad = !M.configById.get(pid).admissible_structural;
      return `<option value="${esc(v.value)}"${v.value === cur.config[a.id] ? " selected" : ""}>${esc(VALUE_LABEL[lang][v.value])}${bad ? ` — ${esc(t.cfg_incompatible)}` : ""}</option>`;
    }).join("");
    return `<div class="field">
      <label for="ax-${a.id}">${esc(AXIS_LABEL[lang][a.id])}</label>
      <p class="hint" id="hint-${a.id}">${esc(AXIS_HELP[lang][a.id])}</p>
      <select id="ax-${a.id}" name="${a.id}" aria-describedby="hint-${a.id}">${opts}</select>
    </div>`;
  }).join("\n");
  const body = `
<div class="page page-wide">
  <div class="page-head">
    <div>
      <p class="eyebrow">${esc(t.cfg_eyebrow)}</p>
      <h1>${esc(t.cfg_title)}</h1>
      <p class="lead">${esc(t.cfg_lead)}</p>
    </div>
    <div class="head-actions">
      <a class="btn primary" id="cfg-export" href="${profilePath(id)}" download="${esc(id)}.yaml">${esc(t.cfg_profile_dl)}</a>
    </div>
  </div>
  <div class="cfg">
    <form class="cfg-params" id="cfg-form" aria-labelledby="cfg-params-t">
      <h2 class="eyebrow" id="cfg-params-t">${esc(t.cfg_params)}</h2>
      <div class="cfg-fields">
      ${selects}
      </div>
      <p class="cfg-now"><span class="muted">${esc(t.cfg_now)}</span> <span id="cfg-now">${tag(D, cur.state)}</span> <a href="#cfg-out">${esc(t.cfg_see_result)} <span aria-hidden="true">↓</span></a></p>
      <p class="cfg-reset"><button type="button" class="btn link" id="cfg-reset">${esc(t.cfg_reset)}</button></p>
      <noscript><p class="note">${esc(t.cfg_noscript)}</p></noscript>
    </form>
    <div class="cfg-out" id="cfg-out">
${renderResult(D, id, { mode: "app" })}
    </div>
    <div class="cfg-map" id="cfg-map">
      ${configMap(M, lang, { current: id, compact: true })}
      <p class="muted small fine-only">${esc(t.cfg_map_hint)}</p>
    </div>
  </div>
  <section class="take" aria-labelledby="take-t">
    <h2 id="take-t">${esc(t.cfg_take)}</h2>
    <div id="cfg-take">${renderTake(D, id)}</div>
  </section>
  <p class="sr" id="cfg-status" role="status" aria-live="polite"></p>
</div>
<script type="application/json" id="cfg-data">${JSON.stringify(D).replace(/</g, "\\u003c")}</script>`;
  const path = route("configurator", lang);
  return layout(M, {
    lang, section: "configurator", path, alt: route("configurator", lang === "fr" ? "en" : "fr"),
    title: t.cfg_title, description: t.cfg_lead, body, modules: ["/assets/configurator.js"], preview,
  });
}

export function configurationPage(M, lang, c, { preview }) {
  const t = T[lang];
  const D = cfgData(M, lang, "c");
  const other = lang === "fr" ? "en" : "fr";
  const title = M.AXES.map((ax) => VALUE_LABEL[lang][c.config[ax]]).join(" · ");
  const body = `
<div class="page">
  ${crumbs([[route("configurator", lang), esc(t.conf_back)], [null, `<code>${esc(c.id)}</code>`]])}
  <div class="page-head">
    <div>
      <p class="eyebrow">${esc(t.conf_eyebrow)}</p>
      <h1>${esc(title)}</h1>
      <p class="meta">${M.AXES.map((ax) => `<span>${esc(AXIS_LABEL[lang][ax])}${lang === "fr" ? "\u00a0:" : ":"} <code>${esc(c.config[ax])}</code></span>`).join("")}</p>
    </div>
    <div class="head-actions">
      <a class="btn primary" href="${route("configurator", lang)}?c=${esc(c.id)}">${esc(t.conf_open)} ${arrow()}</a>
    </div>
  </div>
  <div class="conf">
${renderResult(D, c.id, { mode: "page" })}
  </div>
  <section class="take" aria-labelledby="take-t">
    <h2 id="take-t">${esc(t.cfg_take)}</h2>
    ${renderTake(D, c.id)}
  </section>
  <p class="src-line">${esc(t.conf_rules_src)} <a class="prov" href="${esc(M.blob(M.paths.catalog))}"><span class="prov-k">${esc(t.source)}</span><span class="prov-path">${esc(M.paths.catalog)}</span><span class="prov-sha" title="${esc(t.sha_title)}">sha256 ${short(M.files.get(M.paths.catalog).sha256, 8)}</span><span class="sr"> (GitHub)</span>${arrow(true)}</a></p>
</div>`;
  return layout(M, {
    lang, section: "configurator", path: route("configuration", lang, c.id), alt: route("configuration", other, c.id),
    title: `${title} (${STATE_LABEL[lang][c.state]})`, description: STATE_HELP[lang][c.state], body, preview,
  });
}
