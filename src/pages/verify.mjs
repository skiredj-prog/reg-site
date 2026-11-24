// Verify (Detail of this build): what the visitor is looking at, the three
// links from the repository to the bytes received, and how to check each one
// without trusting this site: recompute the digests here, check the
// provenance signature, rebuild and compare.

import { T } from "../i18n.mjs";
import { arrow, copyBlock, esc, kv, limits, short } from "../lib/html.mjs";
import { layout } from "../lib/layout.mjs";
import { BASE, SITE_URL, route, withBase } from "../lib/model.mjs";

// Served at the root of the base; build.mjs writes it last.
export const MANIFEST = "sha256sums.txt";
const WORKFLOW = ".github/workflows/preview.yml";
const REPO = "skiredj-prog/reg-site";

export function signatureCommand() {
  const file = `${SITE_URL}${withBase("/" + MANIFEST)}`;
  return [
    `curl -sSfO ${file}`,
    `gh attestation verify ${MANIFEST} -R ${REPO} \\`,
    `  --signer-workflow ${REPO}/${WORKFLOW} \\`,
    "  --source-ref refs/heads/main",
  ].join("\n");
}

export function mirrorCommand() {
  const root = `${SITE_URL}${BASE}`;
  return [
    `curl -sSfO ${root}${MANIFEST}`,
    "mkdir -p site && cd site",
    `while read -r h p; do mkdir -p "$(dirname "$p")"; curl -sSfo "$p" "${root}$p"; done < ../${MANIFEST}`,
    `sha256sum -c ../${MANIFEST}`,
  ].join("\n");
}

export function rebuildSiteCommand(M, preview) {
  const lines = [`git clone ${M.site.repository}.git`, "cd reg-site", `git checkout ${M.site.commit}`];
  const env = `SITE_URL=${SITE_URL} SITE_BASE=${BASE}`;
  lines.push(`${env} npm run ${preview ? "build" : "build:public"}`);
  lines.push(`node scripts/verify-live.mjs --site=${SITE_URL}`);
  return lines.join("\n");
}

export function verify(M, lang, { preview }) {
  const t = T[lang];
  const P = M.P;
  const S = M.site;
  const colon = lang === "fr" ? " :" : ":";
  const siteLink = S.commit
    ? `<a href="${esc(`${S.repository}/commit/${S.commit}`)}"><code class="sha">${esc(S.commit)}</code></a>`
    : `<span class="muted">${esc(t.verify_nocommit)}</span>`;
  const siteState = S.commit === null ? ""
    : S.clean ? `<p class="muted small">${esc(t.verify_clean)}</p>`
    : `<p class="note small v-warn"><span class="g" aria-hidden="true">!</span> ${esc(t.verify_dirty)}</p>`;
  const manifestUrl = withBase("/" + MANIFEST);
  const rebuildable = S.commit && S.clean;

  const chain = [
    ["verify_chain_1", route("data", lang) + "#verifier"],
    ["verify_chain_2", "#reconstruire"],
    ["verify_chain_3", "#recalculer"],
  ].map(([k, href], i) => `<li class="chain-i">
      <h3 class="chain-t"><span class="chain-n" aria-hidden="true">${i + 1}</span>${esc(t[k + "_t"])}</h3>
      <p>${esc(t[k])}</p>
      <p><a href="${esc(href)}">${esc(t[k + "_a"])} ${arrow()}</a>${k === "verify_chain_3" ? ` · <a href="#signature">${esc(t.verify_chain_3_b)} ${arrow()}</a>` : ""}</p>
    </li>`).join("");

  const body = `
<div class="page">
  <div class="page-head">
    <div>
      <h1>${esc(t.verify_title)}</h1>
      <p class="lead">${esc(t.verify_lead)}</p>
      <p class="meta"><span>${esc(t.verify_site)}${colon} ${S.commit ? `<a href="${esc(`${S.repository}/commit/${S.commit}`)}"><code>reg-site@${short(S.commit, 12)}</code></a>` : `<span class="muted">${esc(t.verify_nocommit_short)}</span>`}</span><span>${esc(t.verify_data)}${colon} <a href="${esc(M.commitUrl)}"><code>reg-conformance@${short(P.source.commit, 12)}</code></a></span><span>${esc(preview ? t.verify_preview : t.verify_public)}</span></p>
    </div>
    <div class="head-actions"><a class="btn" href="${manifestUrl}" download>${esc(t.verify_manifest_dl)}</a></div>
  </div>
  ${limits(lang, [esc(t.verify_lim_1), esc(t.verify_lim_2), esc(t.verify_lim_3), esc(t.verify_lim_4)], { id: "verify-limits" })}

  <section aria-labelledby="regarde-t">
    <h2 id="regarde-t">${esc(t.verify_what)}</h2>
    ${kv([
      [esc(t.verify_site), `${siteLink}${siteState}`],
      [esc(t.verify_data), `<a href="${esc(M.commitUrl)}"><code class="sha">${esc(P.source.commit)}</code></a>${P.source.exact_tag ? ` <span class="muted">(${esc(P.source.exact_tag)})</span>` : ""}`],
      [esc(t.verify_projection), `<code>${esc(P.contract)} ${esc(P.contract_version)}</code> · sha256 <code class="sha">${esc(P.content_sha256)}</code>`],
      [esc(t.verify_platform), M.lock.platform_commit ? `<a href="${esc(M.platformUrl)}"><code class="sha">${esc(M.lock.platform_commit)}</code></a>` : `<span class="muted">${esc(t.footer_unpinned)}</span>`],
      [esc(t.verify_served), `<code>${esc(SITE_URL)}${esc(BASE)}</code> · ${esc(preview ? t.verify_preview : t.verify_public)}`],
      [esc(t.verify_manifest), `<a href="${manifestUrl}"><code>${esc(MANIFEST)}</code></a> <span class="muted">${esc(t.verify_manifest_d)}</span>`],
    ])}
  </section>

  <section aria-labelledby="chaine-t">
    <h2 id="chaine-t">${esc(t.verify_chain)}</h2>
    <ol class="chain">${chain}</ol>
  </section>

  <section aria-labelledby="recalculer">
    <h2 id="recalculer">${esc(t.verify_run_t)}</h2>
    <p>${esc(t.verify_run_lead)}</p>
    <div class="vrun js-only" id="vrun" data-base="${esc(BASE)}" data-manifest="${esc(MANIFEST)}">
      <p><button type="button" class="btn primary" id="vrun-go">${esc(t.verify_run_btn)}</button></p>
      <div class="vrun-prog" id="vrun-prog" hidden>
        <label for="vrun-bar" id="vrun-label">${esc(t.verify_run_btn)}</label>
        <progress id="vrun-bar" max="1" value="0"></progress>
      </div>
      <p class="vrun-res" id="vrun-res" role="status" aria-live="polite"></p>
      <div id="vrun-detail" hidden>
        <p class="copy-label">${esc(t.verify_manifest_hash)}</p>
        <p><code class="sha" id="vrun-mhash"></code></p>
        <p class="muted small">${esc(t.verify_manifest_hash_d)}</p>
        <ul class="vrun-bad" id="vrun-bad"></ul>
      </div>
    </div>
    <p class="no-js-only muted">${esc(t.verify_no_js)}</p>
    <h3 id="terminal">${esc(t.verify_term)}</h3>
    <p>${esc(t.verify_term_lead)}</p>
    ${copyBlock(lang, mirrorCommand(), { id: "mirror-cmd" })}
    <p class="muted small">${esc(t.verify_term_expect)}</p>
  </section>

  <section aria-labelledby="signature">
    <h2 id="signature">${esc(t.verify_sig_t)}</h2>
    <p>${esc(t.verify_sig_lead)}</p>
    <p>${esc(t.verify_sig_cmd_lead)}</p>
    ${copyBlock(lang, signatureCommand(), { id: "sig-cmd" })}
    <p class="muted small">${esc(t.verify_sig_expect)}</p>
    <p class="muted small">${esc(t.verify_sig_none)}</p>
    <p><a href="https://github.com/${REPO}/attestations">${esc(t.verify_sig_list)}<span class="sr"> (GitHub)</span> ${arrow(true)}</a></p>
  </section>

  <section aria-labelledby="reconstruire">
    <h2 id="reconstruire">${esc(t.verify_rebuild_t)}</h2>
    ${rebuildable ? `<p>${esc(t.verify_rebuild_lead)}</p>
    ${copyBlock(lang, rebuildSiteCommand(M, preview), { id: "rebuild-site-cmd" })}
    <p class="muted small">${esc(t.verify_rebuild_expect)}</p>` : `<p>${esc(S.commit ? t.verify_rebuild_dirty : t.verify_rebuild_nocommit)}</p>`}
  </section>

  <section aria-labelledby="publies-t">
    <h2 id="publies-t">${esc(t.verify_public_t)}</h2>
    <p>${esc(t.verify_public_lead)}</p>
    <ul class="links">
      <li><a href="https://github.com/${REPO}/actions/workflows/verify-live.yml">${esc(t.verify_runs_live)}<span class="sr"> (GitHub)</span> ${arrow(true)}</a></li>
      <li><a href="https://github.com/${REPO}/actions/workflows/preview.yml">${esc(t.verify_runs_preview)}<span class="sr"> (GitHub)</span> ${arrow(true)}</a></li>
      <li><a href="https://github.com/${REPO}/blob/${S.commit || "main"}/docs/DEPLOYMENT.md">${esc(t.verify_doc)}<span class="sr"> (GitHub)</span> ${arrow(true)}</a></li>
    </ul>
  </section>
  <script type="application/json" id="vrun-i18n">${JSON.stringify({
    running: t.verify_running, ok: t.verify_res_ok, diff: t.verify_res_diff, err: t.verify_res_err,
    again: t.verify_run_again, manifest: t.verify_err_manifest, crypto: t.verify_err_crypto,
    differs: t.verify_differs, unread: t.verify_unread, locale: lang === "fr" ? "fr-FR" : "en-US",
  }).replace(/</g, "\\u003c")}</script>
</div>`;
  return layout(M, {
    lang, section: "verify", path: route("verify", lang), alt: route("verify", lang === "fr" ? "en" : "fr"),
    title: t.verify_title, description: t.verify_lead, body, preview, scripts: ["/assets/verify.js"],
  });
}
