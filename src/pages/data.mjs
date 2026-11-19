// Data source (Detail of the projection): where every figure comes from,
// how to rebuild it, the replay, the guards, and the files read.

import { AXIS_LABEL, PROBLEM_LABEL, RESULT_LABEL, T, VALUE_LABEL, fmt } from "../i18n.mjs";
import { arrow, copyBlock, dateLabel, esc, kv, limits, q, resultTag, short } from "../lib/html.mjs";
import { layout } from "../lib/layout.mjs";
import { route } from "../lib/model.mjs";

const OUTCOMES = ["PASS", "FAIL", "INCONCLUSIVE", "NOT_APPLICABLE", "ADAPTER_REQUIRED", "IMPLEMENTATION_GAP", "NOT_IN_PERIMETER"];

export function rebuildCommand(M) {
  const lines = [
    `git clone ${M.lock.platform_repository}.git`,
    "cd reg-platform",
  ];
  if (M.lock.platform_commit) lines.push(`git checkout ${M.lock.platform_commit}`);
  lines.push(
    `git clone ${M.repo}.git .cache/reg-conformance`,
    "python3 -m venv .venv && . .venv/bin/activate",
    "pip install -r requirements.txt -r .cache/reg-conformance/requirements.txt",
    "./run_all.sh",
  );
  return lines.join("\n");
}

export function data(M, lang, { preview }) {
  const t = T[lang];
  const P = M.P;
  const colon = lang === "fr" ? " :" : ":";
  const rp = P.reference_kernel_replay;
  const basis = rp.performed && rp.summary_by_basis ? [
    ["specified_by_frozen_rfcs", t.data_basis_frozen],
    ["outside_frozen_rfcs", t.data_basis_outside],
  ].filter(([k]) => rp.summary_by_basis[k]) : [];
  const shownOutcomes = OUTCOMES.filter((o) => basis.some(([k]) => rp.summary_by_basis[k][o]));
  const basisTable = basis.length ? `<div class="frame"><div class="frame-scroll"><table class="plain-t num-t">
    <thead><tr><th scope="col">${esc(t.data_basis)}</th><th scope="col">${esc(t.cite_total)}</th>${shownOutcomes.map((o) => `<th scope="col">${resultTag(lang, o)}</th>`).join("")}</tr></thead>
    <tbody>${basis.map(([k, label]) => `<tr><th scope="row">${esc(label)}</th><td>${rp.summary_by_basis[k].total}</td>${shownOutcomes.map((o) => `<td>${rp.summary_by_basis[k][o] || 0}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div></div>` : "";

  const findings = P.guards.findings;
  const records = P.guarantee_records.map((r) => {
    const used = (M.configsByRecord.get(r.id) || []).length;
    const perim = Object.entries(r.deployment_perimeter || {}).map(([k, v]) => `<code>${esc(k)}=${esc(v)}</code>`).join(" ");
    return `<tr>
      <td><span class="cell-t">${q(r.name, "fr", lang)}</span><code class="small">${esc(r.id)}</code></td>
      <td>${r.evidence_bound
        ? `<span class="tag b-yes"><span class="g" aria-hidden="true">✓</span>${esc(t.cfg_record_bound)}</span>`
        : `<span class="tag b-no"><span class="g" aria-hidden="true">✗</span>${esc(t.cfg_record_unbound)}</span>`}
        ${r.evidence_problems.length ? `<ul class="rec-p">${r.evidence_problems.map((p) => `<li>${esc(PROBLEM_LABEL[lang][p] || p)}</li>`).join("")}</ul>` : ""}</td>
      <td>${r.demonstration_scope ? `<code>${esc(r.demonstration_scope)}</code>` : `<span class="muted">${esc(t.none)}</span>`}<div class="perim">${perim}</div>${r.perimeter_rejected_by?.length ? `<p class="muted small">${esc(fmt(t.data_rejected_by, { rules: r.perimeter_rejected_by.join(", ") }))}</p>` : ""}</td>
      <td class="num">${used}</td>
      <td><a class="prov" href="${esc(M.blob(r.source_path))}"><span class="prov-path">${esc(r.source_path.split("/").pop())}</span><span class="prov-sha">sha256 ${short(r.source_sha256, 8)}</span><span class="sr"> (GitHub)</span>${arrow(true)}</a></td>
    </tr>`;
  }).join("");
  const rules = P.rules.map((r) => `<tr>
      <td><code>${esc(r.clause_id)}</code></td>
      <td>${esc(AXIS_LABEL[lang][r.condition.field] || r.condition.field)} = <strong>${esc(VALUE_LABEL[lang][r.condition.value] || r.condition.value)}</strong></td>
      <td>${esc(AXIS_LABEL[lang][r.requires.field] || r.requires.field)} ∈ {${r.requires.allowed_values.map((v) => esc(VALUE_LABEL[lang][v] || v)).join(", ")}}</td>
      <td>${q(r.description, "fr", lang)}</td>
    </tr>`).join("");
  const inv = P.invariants.map((i) => `<tr>
      <td><code>${esc(i.id)}</code><span class="cell-t">${esc(i.name)}</span></td>
      <td>${q(i.property, "en", lang)}${i.scope ? `<span class="muted small"> (${q(i.scope, "en", lang)})</span>` : ""}</td>
      <td>${i.formerly ? q(i.formerly, "fr", lang) : `<span class="muted">${esc(t.none)}</span>`}</td>
      <td>${q(i.verification || "", "fr", lang)}</td>
    </tr>`).join("");
  const files = P.source.files.map((f) => `<tr>
      <td><a href="${esc(M.blob(f.path))}"><code>${esc(f.path)}</code></a></td>
      <td class="num">${f.bytes.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</td>
      <td><code class="sha">${esc(f.sha256)}</code></td>
    </tr>`).join("");

  const tabs = [
    ["source", t.data_tab_source],
    ["fichiers", t.data_files],
    ["fiches", t.data_records],
    ["regles", t.data_tab_rules],
  ];
  const body = `
<div class="page">
  <div class="page-head">
    <div>
      <h1>${esc(t.data_title)}</h1>
      <p class="lead">${esc(t.data_lead)}</p>
      <p class="meta"><span>${esc(t.data_commit)}${colon} <a href="${esc(M.commitUrl)}"><code>${short(P.source.commit, 12)}</code></a></span><span>${esc(t.data_contract)}${colon} <code>${esc(P.contract)} ${esc(P.contract_version)}</code></span><span>${esc(t.data_guards)}${colon} <span class="tag b-yes"><span class="g" aria-hidden="true">✓</span>${esc(t.data_guards_ok)}</span></span></p>
    </div>
    <div class="head-actions"><a class="btn" href="/data/projection-v1.json" download>${esc(t.data_raw)}</a></div>
  </div>
  ${limits(lang, [esc(t.data_lim_1), esc(t.data_lim_2), esc(t.data_lim_3)], { id: "data-limits" })}
  <div class="tabs" data-tabs>
    <nav class="tab-list" aria-label="${esc(t.on_this_page)}"><ul>${tabs.map(([id, l]) => `<li><a href="#${id}" data-tab="${id}">${esc(l)}</a></li>`).join("")}</ul></nav>

    <section class="tab-panel" id="source" aria-labelledby="source-t">
      <h2 id="source-t">${esc(t.data_tab_source)}</h2>
      ${kv([
        [esc(t.data_commit), `<a href="${esc(M.commitUrl)}"><code class="sha">${esc(P.source.commit)}</code></a>`],
        [esc(t.data_date), esc(dateLabel(lang, P.source.commit_date))],
        [esc(t.data_tag), P.source.exact_tag ? `<code>${esc(P.source.exact_tag)}</code>` : `<span class="muted">${esc(t.none)}</span>`],
        [esc(t.data_platform), M.lock.platform_commit ? `<a href="${esc(M.platformUrl)}"><code class="sha">${esc(M.lock.platform_commit)}</code></a>` : `<span class="muted">${esc(t.footer_unpinned)}</span>`],
        [esc(t.data_contract), `<code>${esc(P.contract)} ${esc(P.contract_version)}</code>`],
        [esc(t.data_hash), `<code class="sha">${esc(P.content_sha256)}</code>`],
        [esc(t.data_versions), `catalog <code>${esc(P.source.catalog_version)}</code> · rules <code>${esc(P.source.rules_version)}</code> · capabilities <code>${esc(P.source.capabilities_version)}</code>`],
      ])}
      <h3 id="verifier">${esc(t.data_verify)}</h3>
      <p>${esc(M.lock.platform_commit ? t.data_verify_lead : t.data_verify_unpinned)}</p>
      ${copyBlock(lang, rebuildCommand(M), { id: "rebuild-cmd" })}
      <p class="muted small">${esc(fmt(t.data_verify_expect, { hash: P.content_sha256 }))}</p>
      <p class="muted small">${esc(t.vp_rerun_note)}</p>
      <h3 id="rejeu">${esc(t.data_replay)}</h3>
      <p>${esc(t.data_replay_lead)}</p>
      ${rp.performed ? `<p class="replay-line"><span class="g" aria-hidden="true">✓</span>${esc(fmt(t.data_replay_line, { suite: rp.suite || "runner.py", same: rp.matching_registry, total: rp.results_total }))}</p>${basisTable}` : `<p class="muted">${esc(t.data_replay_none)}</p>`}
      <h3 id="garde-fous">${esc(t.data_guards)}</h3>
      <p>${esc(t.data_guards_passed)}</p>
      ${findings.length ? `<ul class="findings">${findings.map((f) => `<li><code>${esc(f.code)}</code> <span class="muted">${esc(f.level)}</span><span lang="en">${esc(f.message)}</span></li>`).join("")}</ul>` : `<p class="muted">${esc(t.data_findings_none)}</p>`}
    </section>

    <section class="tab-panel" id="fichiers" aria-labelledby="fichiers-t">
      <h2 id="fichiers-t">${esc(t.data_files)}</h2>
      <p>${esc(t.data_files_lead)}</p>
      <div class="frame"><div class="frame-scroll"><table class="plain-t files-t">
        <thead><tr><th scope="col">${esc(t.data_file)}</th><th scope="col" class="num">${esc(t.data_bytes)}</th><th scope="col">sha256</th></tr></thead>
        <tbody>${files}</tbody>
      </table></div></div>
    </section>

    <section class="tab-panel" id="fiches" aria-labelledby="fiches-t">
      <h2 id="fiches-t">${esc(t.data_records)}</h2>
      <p>${esc(fmt(t.data_records_lead, { total: P.summary.guarantee_records_total, bound: P.summary.guarantee_records_bound }))}</p>
      <div class="frame"><div class="frame-scroll"><table class="plain-t rec-t">
        <thead><tr><th scope="col">${esc(t.data_record)}</th><th scope="col">${esc(t.data_evidence)}</th><th scope="col">${esc(t.data_scope)}</th><th scope="col" class="num">${esc(t.data_configs)}</th><th scope="col">${esc(t.source)}</th></tr></thead>
        <tbody>${records}</tbody>
      </table></div></div>
    </section>

    <section class="tab-panel" id="regles" aria-labelledby="regles-t">
      <h2 id="regles-t">${esc(t.data_tab_rules)}</h2>
      <h3>${esc(t.data_rules)}</h3>
      <div class="frame"><div class="frame-scroll"><table class="plain-t">
        <thead><tr><th scope="col">Clause</th><th scope="col">${esc(t.data_rule_if)}</th><th scope="col">${esc(t.data_rule_then)}</th><th scope="col">${esc(t.data_rule_text)}</th></tr></thead>
        <tbody>${rules}</tbody>
      </table></div></div>
      <h3>${esc(t.data_invariants)}</h3>
      <div class="frame"><div class="frame-scroll"><table class="plain-t">
        <thead><tr><th scope="col">Id</th><th scope="col">${esc(t.data_property)}</th><th scope="col">${esc(t.data_formerly)}</th><th scope="col">${esc(t.data_verification)}</th></tr></thead>
        <tbody>${inv}</tbody>
      </table></div></div>
    </section>
  </div>
</div>`;
  return layout(M, {
    lang, section: "data", path: route("data", lang), alt: route("data", lang === "fr" ? "en" : "fr"),
    title: t.data_title, description: t.data_lead, body, preview,
  });
}
