// Renders what the site says about one configuration. Shared by the build
// (configuration pages, first paint of the configurator) and the browser
// (configurator), so both always say the same thing.
//
// D is the per-language data the build embeds in the configurator page.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const q = (D, text) => (D.srcLang === D.lang ? esc(text) : `<span lang="${D.srcLang}">${esc(text)}</span>`);
const qen = (D, text) => (D.lang === "en" ? esc(text) : `<span lang="en">${esc(text)}</span>`);

export function tag(D, state) {
  return `<span class="tag st-${state}"><span class="mk mk-${state}" aria-hidden="true"></span>${esc(D.state[state])}</span>`;
}

export function label(D, c) {
  return D.axes.map((a) => a.values.find((v) => v.value === c[a.id]).label).join(" · ");
}

export function idOf(D, c) {
  return D.axes.map((a) => c[a.id]).join("__");
}

export function nearest(D, id, keepAxis = null, limit = 4) {
  const c = D.configs[id].c;
  const out = [];
  for (const d of [1, 2]) {
    for (const [oid, o] of Object.entries(D.configs)) {
      if (o.s === "inadmissible") continue;
      const diff = D.axes.map((a) => a.id).filter((ax) => o.c[ax] !== c[ax]);
      if (diff.length !== d || (keepAxis && diff.includes(keepAxis))) continue;
      out.push({ id: oid, diff });
    }
    if (out.length) break;
  }
  const order = D.axes.map((a) => a.id);
  out.sort((a, b) => order.indexOf(a.diff[0]) - order.indexOf(b.diff[0]));
  return out.slice(0, limit);
}

const valueLabel = (D, ax, v) => D.axes.find((a) => a.id === ax).values.find((x) => x.value === v).label;
const axisLabel = (D, ax) => D.axes.find((a) => a.id === ax).label;
const href = (D, pattern, id) => pattern.replace("{id}", id);
const isConsensus = (D, id) => D.configs[id].c.CONCURRENCY === "distributed-consensus";

function limitsFor(D, id) {
  const t = D.t;
  const s = D.configs[id].s;
  const items = [t.cfg_limits_1];
  if (s === "not_evaluated") items.push(t.cfg_limits_2);
  if (s === "inadmissible") items.push(t.cfg_limits_inadm);
  else items.push(isConsensus(D, id) ? t.cfg_limits_3b : t.cfg_limits_3);
  return `<aside class="limits" aria-labelledby="lim-${esc(D.uid)}">
  <h2 class="limits-t" id="lim-${esc(D.uid)}">${esc(t.limits_title)}</h2>
  <ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
</aside>`;
}

// mode "page": links to other configuration pages. mode "app": buttons that
// load the configuration in the configurator.
export function renderResult(D, id, { mode = "page", keep = null } = {}) {
  const t = D.t;
  const C = D.configs[id];
  const parts = [];
  parts.push(`<div class="res-top">
  <div class="res-head">
    <p class="eyebrow">${esc(t.cfg_state)}</p>
    <p class="res-state">${tag(D, C.s)}</p>
    <p class="res-help">${esc(D.stateHelp[C.s])}</p>
    ${C.v.length ? "" : `<p class="res-rules"><span class="g" aria-hidden="true">✓</span>${esc(t.conf_rules_ok)}</p>`}
    <p class="res-id"><span class="sr">${esc(t.conf_id)} </span><code>${esc(id)}</code></p>
  </div>
  ${limitsFor(D, id)}
</div>`);

  if (C.v.length) {
    parts.push(`<section class="res-sec" aria-labelledby="viol-${D.uid}">
  <h3 id="viol-${D.uid}">${esc(t.cfg_violations)}</h3>
  <ul class="rules">${C.v.map((v) => `<li><code>${esc(v.clause)}</code> ${q(D, v.desc)}<span class="rule-req">${esc(fmt(t.cfg_requires, { field: axisLabel(D, v.field), values: v.allowed.map((x) => valueLabel(D, v.field, x)).join(", ") }))}</span></li>`).join("")}</ul>
</section>`);
    const near = nearest(D, id, keep);
    parts.push(`<section class="res-sec" aria-labelledby="near-${D.uid}">
  <h3 id="near-${D.uid}">${esc(t.cfg_fix)}</h3>
  ${keep ? `<p class="muted">${esc(t.cfg_fix_hint)}</p>` : ""}
  <ul class="near">${near.map((n) => {
    const colon = D.lang === "fr" ? "\u00a0: " : ": ";
    const what = n.diff.map((ax) => `${esc(axisLabel(D, ax))}${colon}<strong>${esc(valueLabel(D, ax, D.configs[n.id].c[ax]))}</strong>`).join(" · ");
    const act = mode === "app"
      ? `<button type="button" class="btn small" data-use="${esc(n.id)}">${esc(t.cfg_use)}</button>`
      : `<a class="btn small" href="${esc(href(D, D.routes.config, n.id))}">${esc(t.cfg_open_config)} <span aria-hidden="true">→</span></a>`;
    return `<li><span class="near-what">${what}</span>${act}</li>`;
  }).join("")}</ul>
</section>`);
  }

  if (C.s !== "inadmissible") {
    const recs = C.r.map((rid) => [rid, D.records[rid]]).filter(([, r]) => r);
    parts.push(`<section class="res-sec" aria-labelledby="rec-${D.uid}">
  <h3 id="rec-${D.uid}">${esc(t.cfg_records)}</h3>
  ${recs.length ? `<ul class="recs">${recs.map(([rid, r]) => `<li class="rec">
    <p class="rec-h">${q(D, r.name)} <code>${esc(rid)}</code></p>
    <p class="rec-b">${r.bound
      ? `<span class="tag b-yes"><span class="g" aria-hidden="true">✓</span>${esc(t.cfg_record_bound)}</span>`
      : `<span class="tag b-no"><span class="g" aria-hidden="true">✗</span>${esc(t.cfg_record_unbound)}</span>`}${r.version ? ` <span class="muted">· ${esc(t.cfg_version)} ${esc(r.version)}</span>` : ""}</p>
    ${r.problems.length ? `<ul class="rec-p">${r.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
    ${r.limits.length ? `<p class="rec-l"><span class="muted">${esc(t.cfg_limits_decl)}${D.lang === "fr" ? " :" : ":"}</span> ${r.limits.map((l) => q(D, l)).join(" ; ")}</p>` : ""}
    <p class="rec-src"><a class="prov" href="${esc(r.src)}"><span class="prov-k">${esc(t.source)}</span><span class="prov-path">${esc(r.path)}</span><span class="prov-sha" title="${esc(t.sha_title)}">sha256 ${esc(r.sha)}</span><span class="sr"> (GitHub)</span><span aria-hidden="true">↗</span></a></p>
  </li>`).join("")}</ul>` : `<p class="muted">${esc(t.cfg_records_none)}</p>`}
</section>`);
  }

  const caps = new Set(D.axes.map((a) => a.values.find((v) => v.value === C.c[a.id]).cap));
  const inv = D.invariants.filter((i) => i.caps.some((c) => caps.has(c)));
  parts.push(`<section class="res-sec" aria-labelledby="inv-${D.uid}">
  <h3 id="inv-${D.uid}">${esc(t.cfg_invariants)}</h3>
  ${inv.length ? `<ul class="invs">${inv.map((i) => `<li><code>${esc(i.id)}</code> <strong>${esc(i.name)}</strong><span class="inv-p">${qen(D, i.property)}</span>${i.scope ? `<span class="muted">${qen(D, i.scope)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="muted">${esc(t.cfg_invariants_none)}</p>`}
</section>`);

  parts.push(`<section class="res-sec" aria-labelledby="ev-${D.uid}">
  <h3 id="ev-${D.uid}">${esc(t.cfg_evidence)}</h3>
  <dl class="ev">${D.axes.map((a) => {
    const v = a.values.find((x) => x.value === C.c[a.id]);
    return `<div><dt>${esc(a.label)}<span class="muted">${esc(v.label)}</span></dt><dd><code class="cap">${esc(v.cap)}</code>${v.evidence.length
      ? `<ul class="evl">${v.evidence.map((e) => `<li><code>${esc(e)}</code></li>`).join("")}</ul>`
      : `<p class="muted">${esc(t.cfg_evidence_none)}</p>`}</dd></div>`;
  }).join("")}</dl>
</section>`);

  return parts.join("\n");
}

export function renderTake(D, id) {
  const t = D.t;
  const C = D.configs[id];
  const url = D.site + href(D, D.routes.config, id);
  const badge = D.site + href(D, D.routes.badge, id);
  const md = `[![REG+ config: ${D.state[C.s]}](${badge})](${url})`;
  const copy = (key, text, lbl) => `<div class="copy wrap">
    ${lbl ? `<p class="copy-label">${esc(lbl)}</p>` : ""}
    <pre class="code"><code id="${key}">${esc(text)}</code></pre>
    <div class="copy-bar"><button type="button" class="btn small" data-copy="${key}" data-copied="${esc(t.copied)}" data-failed="${esc(t.copy_failed)}">${esc(t.copy)}</button><span class="copy-status" role="status" aria-live="polite"></span></div>
  </div>`;
  const admissible = C.s !== "inadmissible";
  return `<div class="take-grid">
  <div class="take-i">
    <h3>${esc(t.cfg_link)}</h3>
    ${copy(`tk-link-${D.uid}`, url)}
    <p><a href="${esc(href(D, D.routes.config, id))}">${esc(t.cfg_detail)} <span aria-hidden="true">→</span></a></p>
  </div>
  <div class="take-i">
    <h3>${esc(t.cfg_badge)}</h3>
    ${admissible ? `<p class="badge-img"><img src="${esc(href(D, D.routes.badge, id))}" alt="REG+ config: ${esc(D.state[C.s])}" height="20"></p>
    <p class="muted">${esc(t.cfg_badge_note)}</p>
    ${copy(`tk-md-${D.uid}`, md, "Markdown")}` : `<p class="muted">${esc(t.cfg_badge_none)}</p>`}
  </div>
  <div class="take-i">
    <h3>${esc(t.cfg_profile)}</h3>
    ${admissible ? `<p class="muted">${esc(t.cfg_profile_note)}${isConsensus(D, id) ? ` ${esc(t.cfg_profile_fault)}` : ""}</p>
    <p><a class="btn" href="${esc(href(D, D.routes.profile, id))}" download="${esc(id)}.yaml">${esc(t.cfg_profile_dl)} <span class="muted">.yaml</span></a></p>` : `<p class="muted">${esc(t.cfg_profile_none)}</p>`}
  </div>
</div>`;
}
