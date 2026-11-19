// Cite (Pattern 3, Form page): the reference of this version, then the
// statement CLAIMS.md asks for, assembled from the visitor's own run.

import { SECTION_STATUS, T } from "../i18n.mjs";
import { copyBlock, dateLabel, esc, kv, limits, short } from "../lib/html.mjs";
import { layout } from "../lib/layout.mjs";
import { route } from "../lib/model.mjs";

const OUTCOMES = ["PASS", "FAIL", "INCONCLUSIVE", "NOT_APPLICABLE", "ADAPTER_REQUIRED", "IMPLEMENTATION_GAP"];
const SETS = [["vectors", "cite_vectors"], ["probes", "cite_probes"], ["checks", "cite_checks"]];

export function reference(M) {
  const P = M.P;
  const suite = P.reference_kernel_replay?.suite;
  return [
    "REG Conformance (reg-conformance)",
    `commit ${P.source.commit} (${P.source.commit_date.slice(0, 10)})`,
    P.source.exact_tag ? `tag ${P.source.exact_tag}` : null,
    suite || null,
    `${M.treeUrl}`,
    "Apache-2.0",
  ].filter(Boolean).join(", ") + ".";
}

// The blocks of one CLAIMS.md section, as written, with the parts in force marked.
function sectionBlocks(sec) {
  const inForce = new Set(sec.status === "in_force" ? [] : sec.parts_in_force);
  return (sec.blocks || []).map((b) => {
    const live = sec.status === "in_force" || (b.part && inForce.has(b.part));
    const cls = live ? ' class="in-force"' : "";
    if (b.type === "paragraph") {
      if (b.lead && !b.text) return `<h4${cls}>${esc(b.lead)}</h4>`;
      return `<p${cls}>${b.lead ? `<strong>${esc(b.lead)}</strong> ` : ""}${esc(b.text)}</p>`;
    }
    if (b.type === "quote") return `<blockquote${cls}><p>${esc(b.text)}</p></blockquote>`;
    if (b.type === "list") {
      const tagName = b.ordered ? "ol" : "ul";
      return `<${tagName}${cls}>${b.items.map((x) => `<li>${esc(x)}</li>`).join("")}</${tagName}>`;
    }
    if (b.type === "table") {
      return `<div class="frame-scroll"${cls}><table class="plain-t"><thead><tr>${b.header.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    return "";
  }).join("\n");
}

// The evidence levels, as the CLAIMS.md table names and defines them.
function levelNames(cp) {
  for (const s of cp.sections) for (const b of s.blocks || []) {
    if (b.type === "table" && b.header[0] === "Level") return Object.fromEntries(b.rows.map((r) => [r[0], { name: r[1], meaning: r[2] || "" }]));
  }
  return { 1: { name: "Semantic mapping" }, 2: { name: "Adapter-tested" }, 3: { name: "Native-conformant" } };
}

function form(M, lang, cp) {
  const t = T[lang];
  const levels = levelNames(cp);
  const req = `<span class="req">${esc(t.cite_required)}</span>`;
  const opt = `<span class="opt">${esc(t.cite_optional)}</span>`;
  const field = (id, label, { hint = "", required = false, attrs = "", value = "" } = {}) => `<div class="field" data-field="${id}">
      <label for="f-${id}">${esc(label)} ${required ? req : opt}</label>
      <p class="hint" id="h-${id}" data-hint="${esc(hint)}">${esc(hint)}</p>
      <input id="f-${id}" name="${id}" aria-describedby="h-${id}"${required ? " required" : ""} ${attrs}${value ? ` value="${esc(value)}"` : ""}>
    </div>`;
  const counts = `<div class="frame-scroll"><table class="counts">
      <thead><tr><th scope="col" id="ch-o">${esc(t.cite_outcome)}</th>${SETS.map(([k, l]) => `<th scope="col" id="ch-${k}">${esc(t[l])}</th>`).join("")}</tr></thead>
      <tbody>${OUTCOMES.map((o) => `<tr><th scope="row" id="rh-${o}"><code>${o}</code></th>${SETS.map(([k, l]) => `<td data-label="${esc(t[l])}"><input type="number" min="0" step="1" inputmode="numeric" name="${k}.${o}" id="n-${k}-${o}" aria-labelledby="ch-${k} rh-${o}" aria-describedby="h-counts"></td>`).join("")}</tr>`).join("")}
      <tr class="total"><th scope="row" id="rh-total">${esc(t.cite_total)}</th>${SETS.map(([k, l]) => `<td data-label="${esc(t[l])}"><output id="tot-${k}" aria-labelledby="ch-${k} rh-total">0</output></td>`).join("")}</tr></tbody>
    </table></div>
    <p class="hint" id="h-counts" data-hint=""></p>`;
  return `<form id="cite-form" class="form" novalidate>
    <fieldset>
      <legend>${esc(t.cite_form)}</legend>
      ${field("subject", t.cite_subject, { hint: t.cite_subject_hint, required: true, attrs: 'type="text" autocomplete="off"' })}
      ${field("version", t.cite_version_f, { attrs: 'type="text" autocomplete="off"' })}
      ${field("subject_commit", t.cite_subject_commit, { hint: t.cite_hex, required: true, attrs: 'type="text" autocomplete="off" spellcheck="false" pattern="[0-9a-fA-F]{7,40}"' })}
      ${field("reg_commit", t.cite_reg_commit, { hint: t.cite_reg_commit_hint, required: true, attrs: 'type="text" autocomplete="off" spellcheck="false" pattern="[0-9a-fA-F]{7,40}"', value: M.P.source.commit })}
    </fieldset>
    <fieldset>
      <legend>${esc(t.cite_level)}</legend>
      ${[1, 2, 3].map((n) => {
        const lv = levels[n] || {};
        // A level the file says no run reaches cannot be chosen; the file's
        // own sentence says why.
        const off = /no run reaches this/i.test(lv.meaning || "");
        return `<label class="check"><input type="radio" name="level" value="${n}"${n === 2 ? " checked" : ""}${off ? " disabled" : ""}> <span>${n} · <span lang="en">${esc(lv.name || "")}</span>${lv.meaning ? `<span class="check-note" lang="en">${esc(lv.meaning)}</span>` : ""}</span></label>`;
      }).join("")}
    </fieldset>
    <fieldset>
      <legend>${esc(t.cite_counts)}</legend>
      <p class="hint">${esc(t.cite_counts_hint)}</p>
      ${counts}
    </fieldset>
    <fieldset>
      <legend>${esc(t.cite_bundle_t)}</legend>
      ${field("bundle", t.cite_bundle, { hint: t.cite_bundle_hint, required: true, attrs: 'type="url" autocomplete="url" inputmode="url"' })}
      ${field("bundle_sha", t.cite_bundle_sha, { hint: t.cite_sha_hint, required: true, attrs: 'type="text" autocomplete="off" spellcheck="false" pattern="[0-9a-fA-F]{64}"' })}
    </fieldset>
    <fieldset>
      <legend>${esc(t.cite_conditions)}</legend>
      <label class="check"><input type="checkbox" name="provisional"> <span>${esc(t.cite_provisional)}</span></label>
      <label class="check"><input type="checkbox" name="flag"> <span>${esc(t.cite_flag)}</span></label>
      <label class="check"><input type="checkbox" name="third"> <span>${esc(t.cite_third)}</span></label>
      ${field("reg_version", t.cite_reg_version, { hint: t.cite_reg_version_hint, attrs: 'type="text" autocomplete="off"', value: M.P.source.exact_tag || "" })}
    </fieldset>
    <div class="cite-out" aria-labelledby="out-t">
      <h3 id="out-t">${esc(t.cite_out)}</h3>
      <p class="muted small">${esc(t.cite_draft_note)}</p>
      <pre class="code quote-out"><code id="cite-text">${esc(t.cite_out_empty)}</code></pre>
      <div class="form-actions">
        <button type="submit" class="btn primary">${esc(t.cite_copy)}</button>
        <button type="button" class="btn" id="cite-reset">${esc(t.cite_reset)}</button>
        <span class="copy-status" id="cite-status" role="status" aria-live="polite"></span>
      </div>
      <p class="muted small">${esc(t.cite_saved)}</p>
    </div>
  </form>
  <dialog class="dlg" id="cite-confirm" aria-labelledby="cite-confirm-t" aria-describedby="cite-confirm-d">
    <h2 id="cite-confirm-t">${esc(t.cite_confirm_t)}</h2>
    <p id="cite-confirm-d">${esc(t.cite_confirm_d)}</p>
    <div class="dlg-actions">
      <button type="button" class="btn" data-dlg="keep" autofocus>${esc(t.cite_confirm_keep)}</button>
      <button type="button" class="btn danger" data-dlg="clear">${esc(t.cite_confirm_ok)}</button>
    </div>
  </dialog>
  <script type="application/json" id="cite-i18n">${JSON.stringify({
    empty: t.cite_out_empty, subject: t.cite_err_subject, hex: t.cite_err_hex, sha: t.cite_err_sha, url: t.cite_err_url,
    count: t.cite_err_count, regVersion: t.cite_err_reg_version, copied: t.copied, failed: t.copy_failed, invalid: t.cite_err_summary,
    confirm: t.cite_confirm_t, cleared: t.cite_cleared,
  }).replace(/</g, "\\u003c")}</script>`;
}

export function cite(M, lang, { preview }) {
  const t = T[lang];
  const P = M.P;
  const cp = P.claims_policy;
  const colon = lang === "fr" ? "\u00a0:" : ":";
  let policy;
  if (!cp?.present) {
    policy = `<p class="note">${esc(t.cite_policy_absent)}</p>`;
  } else {
    const never = cp.sections.find((s) => s.title === "What must not be said");
    policy = `
    <p>${esc(t.cite_policy_lead)}</p>
    <h3>${esc(t.cite_status_of)}</h3>
    <div class="frame"><table class="plain-t status-t">
      <thead><tr><th scope="col">${esc(t.cite_section)}</th><th scope="col">${esc(t.cite_status)}</th></tr></thead>
      <tbody>${cp.sections.map((s) => `<tr><td lang="en">${esc(s.title)}${s.status === "partly_in_force" ? `<span class="muted small"> ${esc(t.cite_part_in_force)}${colon} <span lang="en">${esc(s.parts_in_force.join(", "))}</span></span>` : ""}</td><td><span class="sec-st sec-${s.status}">${esc(SECTION_STATUS[lang][s.status])}</span></td></tr>`).join("")}</tbody>
    </table></div>
    <p class="muted small" lang="en">${esc(cp.status_line || "")}</p>
    ${form(M, lang, cp)}
    ${never ? `<section class="never" aria-labelledby="never-t">
      <h3 id="never-t">${esc(t.cite_never)} <span class="sec-st sec-${never.status}">${esc(SECTION_STATUS[lang][never.status])}</span></h3>
      <div lang="en">${sectionBlocks(never)}</div>
    </section>` : ""}
    <details class="verbatim">
      <summary>${esc(t.cite_verbatim)} <span class="muted">CLAIMS.md · sha256 ${short(cp.sha256, 8)}</span></summary>
      <div lang="en">
        <h3>${esc(cp.title || "CLAIMS.md")}</h3>
        ${cp.sections.map((s) => `<section class="claims-sec sec-${s.status}"><h4>${esc(s.title)} <span class="sec-st sec-${s.status}" lang="${lang}">${esc(SECTION_STATUS[lang][s.status])}</span></h4>${sectionBlocks(s)}</section>`).join("\n")}
      </div>
      <p><a href="${esc(M.blob(cp.path))}">${esc(t.cite_open_file)} <span aria-hidden="true">↗</span></a></p>
    </details>`;
  }
  const body = `
<div class="page page-form">
  <div class="page-head">
    <div>
      <h1>${esc(t.cite_title)}</h1>
      <p class="lead">${esc(t.cite_lead)}</p>
    </div>
  </div>
  ${limits(lang, [esc(t.cite_lim_1), esc(t.cite_lim_2), esc(t.cite_lim_3)], { id: "cite-limits" })}
  <section class="panel" aria-labelledby="ver-t">
    <h2 id="ver-t">${esc(t.cite_version)}</h2>
    <p class="muted">${esc(t.cite_version_note)}</p>
    ${copyBlock(lang, reference(M), { id: "cite-ref", label: t.cite_ref, wrap: true })}
    ${kv([
      [esc(t.data_commit), `<a href="${esc(M.commitUrl)}"><code>${esc(P.source.commit)}</code></a>`],
      [esc(t.data_date), esc(dateLabel(lang, P.source.commit_date))],
      [esc(t.data_tag), P.source.exact_tag ? `<code>${esc(P.source.exact_tag)}</code>` : `<span class="muted">${esc(t.none)}</span>`],
    ])}
  </section>
  <section aria-labelledby="pol-t">
    <h2 id="pol-t">${esc(t.cite_policy)}</h2>
    ${policy}
  </section>
</div>`;
  return layout(M, {
    lang, section: "cite", path: route("cite", lang), alt: route("cite", lang === "fr" ? "en" : "fr"),
    title: t.cite_title, description: t.cite_lead, body, scripts: cp?.present ? ["/assets/cite.js"] : [], preview,
  });
}
