// Home (marketing home route): the hero with the map of the configurations,
// the ledger "at this commit", what can and cannot be checked here, and what
// a visitor leaves with.

import { T, fmt } from "../i18n.mjs";
import { arrow, dateLabel, esc, limits, plural, prov, short } from "../lib/html.mjs";
import { layout } from "../lib/layout.mjs";
import { revisionOf, route } from "../lib/model.mjs";
import { configMap } from "./configurator.mjs";

export function home(M, lang, { preview }) {
  const t = T[lang];
  const P = M.P;
  const S = P.summary;
  const demo = S.configurations_by_state.demonstrated || 0;
  const pass = S.reference_kernel_pass;
  const impl = pass.by_index_status.IMPLEMENTED || 0;
  const others = Object.entries(pass.by_index_status).filter(([k]) => k !== "IMPLEMENTED");
  // What the PASS rest on, each group named by its vectors (revisionOf in
  // lib/model.mjs). Superseded vectors are counted apart, so the two groups
  // never overlap.
  const passed = P.vectors.filter((v) => v.registry === "vector" && v.reference_kernel_result === "PASS");
  const superseded = passed.filter((v) => (v.superseded_by || []).length);
  const onRevision = passed.filter((v) => !(v.superseded_by || []).length && revisionOf(v));
  const revisions = [...new Set(onRevision.map((v) => revisionOf(v).name))];
  const ratified = onRevision.length > 0 && onRevision.every((v) => revisionOf(v).ratified);
  const ids = (vs) => vs.map((v) => `<a href="${route("vector", lang, v.id)}"><code>${esc(v.id)}</code></a>`).join(", ");
  const parts = [];
  if (superseded.length) {
    parts.push(fmt(esc(plural(lang, superseded.length, t.led_pass_superseded, t.led_pass_superseded_n)), { n: superseded.length, ids: ids(superseded) }));
  }
  if (onRevision.length) {
    const tpl = revisions.length === 1 ? (ratified ? t.led_rev_one_ratified : t.led_rev_one) : (ratified ? t.led_rev_many_ratified : t.led_rev_many);
    const keep = (n) => n.replace(/ /g, "\u00a0"); // "RFC-4 v0.3" stays on one line
    const rev = esc(fmt(tpl, { r: keep(revisions[0]), list: revisions.map(keep).join(", ") }));
    parts.push(fmt(esc(plural(lang, onRevision.length, t.led_pass_revision, t.led_pass_revision_n)), { n: onRevision.length, rev, ids: ids(onRevision) }));
  }
  const passOn = esc(others.length
    ? fmt(t.led_pass_on_mixed, { impl, other: others.reduce((a, [, n]) => a + n, 0), others: others.map(([k]) => k).join(", ") })
    : t.led_pass_on);
  const passSub = `${passOn}${parts.length ? ", " + fmt(esc(t.led_pass_of_which), { parts: parts.join(esc(t.led_and)) }) : ""}. ${esc(t.led_pass_kernel)}`;
  const replay = P.reference_kernel_replay;
  const vecFiles = M.paths.vectors.map((p) => prov(M, lang, p)).join("");
  const ledger = [
    {
      n: S.configurations_admissible,
      l: fmt(t.led_admissible, { total: S.configurations_total }),
      s: fmt(t.led_admissible_sub, { rules: P.rules.length, rejected: S.configurations_total - S.configurations_admissible }),
      src: prov(M, lang, M.paths.catalog) + prov(M, lang, M.paths.rules),
      more: route("configurator", lang),
    },
    {
      n: demo,
      l: plural(lang, demo, t.led_demonstrated, t.led_demonstrated_n),
      s: fmt(t.led_demonstrated_sub, { records: S.guarantee_records_total, bound: S.guarantee_records_bound }),
      src: `<a class="prov" href="${esc(M.treeUrl)}/capabilities"><span class="prov-k">${esc(t.source)}</span><span class="prov-path">capabilities/</span><span class="prov-sha">${S.guarantee_records_total} ${esc(t.files_word)}</span><span class="sr"> (GitHub)</span>${arrow(true)}</a>`,
      more: `${route("data", lang)}#fiches`,
      zero: demo === 0,
    },
    {
      n: S.vectors_registered,
      l: t.led_vectors,
      s: fmt(t.led_vectors_sub, { cand: S.candidates_total, rows: S.index_rows_without_vector }),
      src: vecFiles + (M.paths.index ? prov(M, lang, M.paths.index) : ""),
      more: route("vectors", lang),
    },
    {
      n: pass.total,
      l: t.led_pass,
      sh: passSub,
      src: replay.performed
        ? `<p class="led-replay"><span class="g" aria-hidden="true">✓</span>${esc(fmt(t.led_replay, { same: replay.matching_registry, total: replay.results_total }))}</p>`
        : "",
      more: `${route("data", lang)}#rejeu`,
    },
  ];
  const can = [t.home_can_1, t.home_can_2, t.home_can_3];
  const cannot = [t.home_cannot_1, t.home_cannot_2, t.home_cannot_3, t.home_cannot_4];
  const body = `
<div class="page">
<section class="hero" aria-labelledby="hero-t">
  <div class="hero-text">
    <p class="eyebrow">${esc(t.home_eyebrow)}</p>
    <h1 id="hero-t">${esc(t.home_title)}</h1>
    <p class="lead">${esc(t.home_lead)}</p>
    <div class="actions">
      <a class="btn primary" href="${route("configurator", lang)}">${esc(t.home_cta_config)} ${arrow()}</a>
      <a class="btn" href="${route("vectors", lang)}">${esc(t.home_cta_vectors)} ${arrow()}</a>
    </div>
    <dl class="receipt">
      <div><dt>${esc(t.rc_source)}</dt><dd><a href="${esc(M.commitUrl)}"><code>reg-conformance@${short(P.source.commit)}</code></a>${P.source.exact_tag ? ` <code>${esc(P.source.exact_tag)}</code>` : ""} · ${esc(dateLabel(lang, P.source.commit_date))}</dd></div>
      <div><dt>${esc(t.rc_projection)}</dt><dd><a href="${route("data", lang)}#source"><code>${esc(P.contract_version)} · sha256 ${short(P.content_sha256, 12)}</code></a></dd></div>
      <div><dt>${esc(t.rc_replay)}</dt><dd>${replay.performed
        ? `<a href="${route("data", lang)}#rejeu"><span class="g" aria-hidden="true">✓</span>${esc(fmt(t.rc_replay_v, { same: replay.matching_registry, total: replay.results_total }))}</a>`
        : `<span class="muted">${esc(t.rc_replay_none)}</span>`}</dd></div>
    </dl>
  </div>
  ${configMap(M, lang, { lead: t.map_lead })}
</section>

<section class="now" aria-labelledby="now-t">
  <div class="sec-head">
    <h2 id="now-t">${esc(t.home_now)}</h2>
    <p class="sec-meta"><a href="${esc(M.commitUrl)}"><code>${short(P.source.commit)}</code></a>${P.source.exact_tag ? ` · <code>${esc(P.source.exact_tag)}</code>` : ""} · ${esc(dateLabel(lang, P.source.commit_date))} · <a href="${route("data", lang)}">${esc(t.nav_data)} ${arrow()}</a></p>
  </div>
  <ol class="ledger">
${ledger.map((x) => `    <li class="led${x.zero ? " led-zero" : ""}">
      <p class="led-n">${x.n}</p>
      <p class="led-l">${esc(x.l)}</p>
      <p class="led-s">${x.sh ?? esc(x.s)}</p>
      <div class="led-src">${x.src}</div>
      <a class="led-more" href="${esc(x.more)}">${esc(t.led_open)} ${arrow()}</a>
    </li>`).join("\n")}
  </ol>
</section>

<section class="scope">
  <div class="scope-can">
    <h2>${esc(t.home_can)}</h2>
    <ul>${can.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
  </div>
  ${limits(lang, cannot.map(esc), { id: "home-limits" })}
</section>

<section class="take-home" aria-labelledby="take-t">
  <h2 id="take-t">${esc(t.home_take)}</h2>
  <ul class="cards">
    <li><a class="card" href="${route("configurator", lang)}"><span class="card-t">${esc(t.take_config)} ${arrow()}</span><span class="card-d">${esc(t.take_config_d)}</span></a></li>
    <li><a class="card" href="${route("vectors", lang)}"><span class="card-t">${esc(t.take_vector)} ${arrow()}</span><span class="card-d">${esc(t.take_vector_d)}</span></a></li>
    <li><a class="card" href="${route("cite", lang)}"><span class="card-t">${esc(t.take_cite)} ${arrow()}</span><span class="card-d">${esc(t.take_cite_d)}</span></a></li>
  </ul>
</section>
</div>`;
  return layout(M, {
    lang, section: "home", path: route("home", lang), alt: route("home", lang === "fr" ? "en" : "fr"),
    title: t.home_title, description: t.home_lead, body, preview,
  });
}
