import { T } from "../i18n.mjs";
import { esc, short } from "./html.mjs";
import { SITE_URL, route, withBase } from "./model.mjs";

const NAV = ["home", "configurator", "vectors", "cite", "data"];

export function layout(M, { lang, section, path, alt, title, description, body, scripts = [], modules = [], preview }) {
  const t = T[lang];
  const other = lang === "fr" ? "en" : "fr";
  const P = M.P;
  const nav = NAV.map((k) => {
    const cur = k === section ? ' aria-current="page"' : "";
    return `<li><a href="${route(k, lang)}"${cur}>${esc(t["nav_" + k])}</a></li>`;
  }).join("");
  const tag = P.source.exact_tag ? ` (${esc(P.source.exact_tag)})` : "";
  const platform = M.lock.platform_commit
    ? `<a href="${esc(M.platformUrl)}">reg-platform@${short(M.lock.platform_commit, 12)}</a>`
    : `<a href="${esc(M.platformUrl)}">reg-platform</a> (${esc(t.footer_unpinned)})`;
  return `<!doctype html>
<html lang="${lang}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · REG</title>
<meta name="description" content="${esc(description)}">
${preview ? '<meta name="robots" content="noindex, nofollow">\n' : ""}<meta name="reg-source-commit" content="${P.source.commit}">
<meta name="reg-projection-sha256" content="${P.content_sha256}">
<link rel="canonical" href="${SITE_URL}${path}">
<link rel="alternate" hreflang="${lang}" href="${SITE_URL}${path}">
<link rel="alternate" hreflang="${other}" href="${SITE_URL}${alt}">
<link rel="icon" href="${withBase("/assets/favicon.svg")}" type="image/svg+xml">
<link rel="stylesheet" href="${withBase("/assets/site.css")}">
<script>document.documentElement.className="js";try{var m=localStorage.getItem("reg-theme");if(m)document.documentElement.dataset.theme=m}catch(e){}</script>
</head>
<body>
<a class="skip" href="#main">${esc(t.skip)}</a>
${preview ? `<section class="preview-zone" aria-label="${esc(t.preview_label)}"><p class="preview" role="note" data-guard="preview-banner">${esc(t.preview_banner)}</p></section>\n` : ""}<header class="top">
  <div class="top-in">
    <a class="brand" href="${route("home", lang)}">REG</a>
    <a class="stamp" href="${route("data", lang)}" title="${esc(t.stamp_title)}"><span class="stamp-k">reg-conformance</span><code>${short(P.source.commit)}</code></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">${esc(t.menu)}</button>
    <div class="nav-wrap" id="site-nav">
      <nav aria-label="${esc(t.nav_label)}"><ul>${nav}</ul></nav>
      <div class="top-tools">
        <a class="lang" href="${alt}" hreflang="${other}" lang="${other}">${esc(t.other_lang)}</a>
        <button class="theme js-only" type="button" data-theme-toggle data-to-light="${esc(t.theme_to_light)}" data-to-dark="${esc(t.theme_to_dark)}">${esc(t.theme_to_light)}</button>
      </div>
    </div>
  </div>
</header>
<main id="main" tabindex="-1">
${body}
</main>
<footer class="foot">
  <div class="foot-in">
    <p data-guard="source-commit">${esc(t.footer_data)}${lang === "fr" ? " :" : ":"} <a href="${esc(M.commitUrl)}">reg-conformance@${short(P.source.commit, 12)}</a>${tag} · ${esc(t.footer_projection)} ${esc(P.contract_version)} <code title="content_sha256">${short(P.content_sha256, 12)}</code> · ${esc(t.footer_platform)} ${platform}</p>
    <p>${esc(t.footer_license)}</p>
  </div>
</footer>
<script src="${withBase("/assets/site.js")}" defer></script>
${scripts.map((s) => `<script src="${withBase(s)}" defer></script>`).join("\n")}${modules.map((s) => `<script type="module" src="${withBase(s)}"></script>`).join("\n")}
</body>
</html>
`;
}
