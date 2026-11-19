// HTML helpers shared by every page. Strings only, no dependencies.

import {
  INDEX_LABEL, RESULT_GLYPH, RESULT_HELP, RESULT_LABEL, STATE_HELP, STATE_LABEL, T, fmt,
} from "../i18n.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const short = (h, n = 7) => String(h || "").slice(0, n);
export const arrow = (ext = false) => `<span aria-hidden="true">${ext ? "↗" : "→"}</span>`;

// Text quoted from reg-conformance keeps its own language.
export function q(text, srcLang, pageLang) {
  if (text == null || text === "") return "";
  return srcLang === pageLang ? esc(text) : `<span lang="${srcLang}">${esc(text)}</span>`;
}

// The mark of a configuration state, drawn in CSS so that it has the same
// shape on every system. It always sits next to the state's name.
export const mark = (state) => `<span class="mk mk-${state}" aria-hidden="true"></span>`;

export function stateTag(lang, state, { help = false } = {}) {
  const title = help ? "" : ` title="${esc(STATE_HELP[lang][state])}"`;
  return `<span class="tag st-${state}"${title}>${mark(state)}${esc(STATE_LABEL[lang][state])}</span>`;
}

export function resultTag(lang, result) {
  const k = result === undefined ? "none" : String(result);
  const g = RESULT_GLYPH[k] ?? "·";
  const label = RESULT_LABEL[lang][k] ?? k;
  const cls = k === "null" ? "r-null" : `r-${k}`;
  return `<span class="tag ${cls}" title="${esc(RESULT_HELP[lang][k] || "")}"><span class="g" aria-hidden="true">${g}</span>${esc(label)}</span>`;
}

export function indexTag(lang, status) {
  if (!status) return `<span class="idx idx-none">${esc(INDEX_LABEL[lang].UNINDEXED)}</span>`;
  return `<span class="idx idx-${esc(status)}">${esc(INDEX_LABEL[lang][status] || status)}</span>`;
}

// A link to one file of reg-conformance at the source commit, with its sha256.
export function prov(M, lang, path, { line, label } = {}) {
  const f = M.files.get(path);
  const shown = esc(label || path) + (line ? `<span class="prov-line">:${line}</span>` : "");
  const sha = f ? `<span class="prov-sha" title="${esc(T[lang].sha_title)}">sha256 ${short(f.sha256, 8)}</span>` : "";
  return `<a class="prov" href="${esc(M.blob(path, line))}"><span class="prov-k">${esc(T[lang].source)}</span><span class="prov-path">${shown}</span>${sha}<span class="sr"> (GitHub)</span>${arrow(true)}</a>`;
}

export function limits(lang, items, { id = "limits", title } = {}) {
  const list = items.filter(Boolean);
  if (!list.length) return "";
  return `<aside class="limits" aria-labelledby="${id}">
  <h2 class="limits-t" id="${id}">${esc(title || T[lang].limits_title)}</h2>
  <ul>${list.map((x) => `<li>${x}</li>`).join("")}</ul>
</aside>`;
}

let copySeq = 0;
export function copyBlock(lang, text, { label, code = true, cls = "", id, wrap = false } = {}) {
  const t = T[lang];
  const bid = id || `copy-${++copySeq}`;
  const body = code ? `<pre class="code"><code id="${bid}">${esc(text)}</code></pre>` : `<p class="copy-text" id="${bid}">${esc(text)}</p>`;
  return `<div class="copy${wrap ? " wrap" : ""}${cls ? ` ${cls}` : ""}">
  ${label ? `<p class="copy-label">${esc(label)}</p>` : ""}
  ${body}
  <div class="copy-bar"><button type="button" class="btn small" data-copy="${bid}" data-copied="${esc(t.copied)}" data-failed="${esc(t.copy_failed)}">${esc(t.copy)}</button><span class="copy-status" role="status" aria-live="polite"></span></div>
</div>`;
}

export function crumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map(([href, label], i) =>
    i === items.length - 1
      ? `<li><span aria-current="page">${label}</span></li>`
      : `<li><a href="${esc(href)}">${label}</a></li>`).join("")}</ol></nav>`;
}

export function kv(rows, cls = "kv") {
  return `<dl class="${cls}">${rows.filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

export function plural(lang, n, one, many) {
  const singular = lang === "fr" ? Math.abs(n) <= 1 : n === 1;
  return singular ? one : many;
}

export function dateLabel(lang, iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export { fmt };
