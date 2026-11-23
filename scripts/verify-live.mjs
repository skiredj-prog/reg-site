// Read-only checks of a served site against a local build of the same commit
// (docs/DEPLOYMENT.md, "Verifying a deployment", checks 1 to 6, 8, 9 and 11;
// 7 and 10 are check-viewports and verify-live-browser). DNS lookups, a TLS
// handshake, HEAD and GET requests: nothing is written anywhere but --out.
//
//   npm run build     with the SITE_BASE and SITE_URL the served site was built for
//   node scripts/verify-live.mjs --site=https://preview.reg.tenirlabs.cc \
//        [--dist=dist] [--out=verify-live-report] [--repo=skiredj-prog/reg-site] [--concurrency=8]
//
// --site is the origin the site is served from. Every expectation comes from
// the build in --dist: the files and their digests, the base path, the preview
// flag and build.json. --repo names the GitHub repository whose Pages serve the
// site, for the DNS and redirect checks. On a local server (127.0.0.1,
// localhost) those checks and the transport check are recorded, not judged.
// Exit code 0 when no check fails.
import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import tls from "node:tls";

const arg = (k, d) => { const a = process.argv.slice(2).find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SITE = arg("site", "");
let siteUrl;
try { siteUrl = new URL(SITE); } catch { /* refused below */ }
if (!siteUrl || !/^https?:$/.test(siteUrl.protocol) || siteUrl.origin !== SITE) {
  console.error("--site must be an origin, scheme and host only, with no path and no final slash, such as --site=https://preview.reg.tenirlabs.cc");
  process.exit(2);
}
const HOST = siteUrl.host;
const DIST = arg("dist", "dist");
const OUT = arg("out", "verify-live-report");
const REPO = arg("repo", "skiredj-prog/reg-site");
const CONC = Number(arg("concurrency", "8"));
const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(HOST);
const PAGES_IPS = new Set(["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"]);
const UA = "reg-site verify-live (read-only post-deployment check)";

// The build the site is compared with.
if (!existsSync(join(DIST, "build.json"))) { console.error(`${DIST}/build.json not found: build the site first (npm run build)`); process.exit(2); }
const build = JSON.parse(readFileSync(join(DIST, "build.json"), "utf8"));
const BASE = build.base; // "/" or "/reg-site/": the path the site sits under
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const expected = [];
(function walk(dir, rel) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, `${rel}${f}/`); else expected.push({ path: `${rel}${f}`, hash: sha256(readFileSync(p)) });
  }
})(DIST, "");
const expectedByPath = new Map(expected.map((e) => [e.path, e.hash]));
const served = (path) => `${SITE}${BASE}${path}`; // a file of dist/ as the site serves it

async function req(url, method = "GET") {
  const r = await fetch(url, { method, redirect: "manual", headers: { "user-agent": UA, "cache-control": "no-cache" }, signal: AbortSignal.timeout(60000) });
  const bytes = method === "GET" ? Buffer.from(await r.arrayBuffer()) : null;
  return { status: r.status, headers: Object.fromEntries(r.headers.entries()), bytes };
}
const tryReq = async (url, method) => { try { return await req(url, method); } catch (e) { return { error: String(e?.cause?.code || e?.message || e) }; } };
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

const tests = [];
const add = (n, name, pass, details) => tests.push({ n, name, status: pass === null ? "INFO" : pass ? "PASS" : "FAIL", details });
const [owner, repoName] = REPO.split("/");
const projectSite = owner && repoName ? `https://${owner}.github.io/${repoName}/` : null;

// 1. DNS: a custom domain points at GitHub Pages through a CNAME to the owner's
// github.io name; a github.io name resolves to the Pages addresses directly.
{
  const d = {};
  if (LOCAL) { add(1, "DNS", null, { note: `${HOST} is a local server, not checked` }); } else {
    try { d.cname = await dns.resolveCname(HOST); } catch (e) { d.cname_error = e.code; }
    try { d.a = (await dns.resolve4(HOST)).sort(); } catch (e) { d.a_error = e.code; }
    const githubIo = HOST.endsWith(".github.io");
    const okCname = githubIo || (Array.isArray(d.cname) && d.cname.length === 1 && d.cname[0].replace(/\.$/, "") === `${owner}.github.io`);
    const okA = Array.isArray(d.a) && d.a.length > 0 && d.a.every((ip) => PAGES_IPS.has(ip));
    d.expected = { cname: githubIo ? "none" : `${owner}.github.io`, a: "GitHub Pages addresses only" };
    add(1, "DNS", okCname && okA, d);
  }
}

// 2. Transport: http redirects to the https root, https answers, the
// certificate is trusted, names the host and the protocol is TLS 1.2 or 1.3.
{
  const d = {};
  const s = await tryReq(`${SITE}${BASE}`, "HEAD");
  d.https = s.error ? s : { status: s.status, cache_control: s.headers["cache-control"] ?? null, age: s.headers.age ?? null };
  if (siteUrl.protocol !== "https:") { add(2, "Transport", null, { note: `${SITE} is not https; only the status is recorded`, ...d }); } else {
    const h = await tryReq(`http://${HOST}/`, "HEAD");
    d.http = h.error ? h : { status: h.status, location: h.headers.location ?? null };
    d.tls = await new Promise((res) => {
      const sock = tls.connect({ host: siteUrl.hostname, port: Number(siteUrl.port || 443), servername: siteUrl.hostname, timeout: 15000 }, () => {
        const c = sock.getPeerCertificate();
        res({ authorized: sock.authorized, authorizationError: sock.authorizationError ?? null, protocol: sock.getProtocol(), subject: c.subject?.CN ?? null, san: c.subjectaltname ?? null, issuer: c.issuer?.O ? `${c.issuer.O} ${c.issuer.CN ?? ""}`.trim() : null, valid_from: c.valid_from, valid_to: c.valid_to, fingerprint256: c.fingerprint256 });
        sock.end();
      });
      sock.on("error", (e) => res({ error: String(e) })); sock.on("timeout", () => { sock.destroy(); res({ error: "timeout" }); });
    });
    const names = String(d.tls.san ?? "").split(", ").filter((x) => x.startsWith("DNS:")).map((x) => x.slice(4));
    const parent = siteUrl.hostname.replace(/^[^.]+\./, "");
    const sanOk = names.includes(siteUrl.hostname) || names.includes(`*.${parent}`);
    d.verdicts = {
      http_301_to_https_root: d.http.status === 301 && d.http.location === `https://${HOST}/`,
      https_200: d.https.status === 200,
      tls: d.tls.authorized === true && sanOk && /^TLSv1\.[23]$/.test(d.tls.protocol || "") && new Date(d.tls.valid_to) > new Date(),
    };
    add(2, "Transport", Object.values(d.verdicts).every(Boolean), d);
  }
}

// 3. Redirect: with a custom domain, the project-site path redirects to it.
{
  const d = { project_site: projectSite };
  if (LOCAL || !projectSite || HOST === `${owner}.github.io`) { add(3, "Redirect", null, { ...d, note: "no custom domain to redirect to, or local server: recorded only" }); } else {
    const r = await tryReq(projectSite, "HEAD");
    d.response = r.error ? r : { status: r.status, location: r.headers.location ?? null };
    let toHost = null; try { toHost = new URL(d.response.location ?? "", projectSite).host; } catch { /* no location */ }
    add(3, "Redirect", r.status === 301 && toHost === HOST, d);
  }
}

// 4. Byte-for-byte integrity of every file of the build, as served. The HTML
// bodies are kept for check 8, the headers of index.html for check 11.
let fetched; const html = new Map(); let cache = null;
{
  const t0 = Date.now();
  fetched = await pool(expected, CONC, async (e) => {
    const r = await tryReq(served(e.path), "GET");
    if (r.error) return { path: e.path, error: r.error, ok: false };
    const hash = sha256(r.bytes);
    if (e.path === "index.html") cache = { cache_control: r.headers["cache-control"] ?? null, age: r.headers.age ?? null, etag: r.headers.etag ?? null, server: r.headers.server ?? null };
    if (e.path.endsWith(".html")) html.set(e.path, r.bytes.toString("utf8"));
    return { path: e.path, status: r.status, hash, ok: r.status === 200 && hash === e.hash, content_type: r.headers["content-type"] ?? null };
  });
  const bad = fetched.filter((f) => !f.ok);
  add(4, "Integrity", bad.length === 0, { build: DIST, base: BASE, expected_files: expected.length, identical: fetched.length - bad.length, differing_or_missing: bad.slice(0, 50), seconds: Math.round((Date.now() - t0) / 1000) });
}
const servedOk = new Set(fetched.filter((f) => f.ok).map((f) => f.path));

// 5. Data: the projection, every badge and every profile skeleton are the
// build's; build.json is the build's and says it was built for this origin
// and this base.
{
  const d = {};
  const count = (pred) => ({ expected: expected.filter(pred).length, identical: fetched.filter((f) => f.ok && pred(f)).length });
  d.projection = { expected_sha256: expectedByPath.get("data/projection-v1.json") ?? null, identical: servedOk.has("data/projection-v1.json") };
  d.badges = count((e) => e.path.startsWith("badges/") && e.path.endsWith(".svg"));
  d.profiles = count((e) => e.path.startsWith("profiles/"));
  d.build = { identical: servedOk.has("build.json"), built_for: { site: build.site, base: build.base }, served_at: { site: SITE, base: BASE } };
  d.build.consistent = build.site === SITE && typeof build.base === "string";
  const same = (c) => c.expected > 0 && c.identical === c.expected;
  add(5, "Data", d.projection.expected_sha256 !== null && d.projection.identical && same(d.badges) && same(d.profiles) && d.build.identical && d.build.consistent, d);
}

// 6. Not found: an unknown path answers 404 with the body of 404.html; the
// home pages answer 200.
{
  const d = {};
  const r = await tryReq(`${SITE}${BASE}this-page-does-not-exist/`, "GET");
  d.status = r.status ?? r.error; d.body_sha256 = r.bytes ? sha256(r.bytes) : null; d.expected_404_sha256 = expectedByPath.get("404.html") ?? null;
  const homes = [`${BASE}`, ...(expectedByPath.has("en/index.html") ? [`${BASE}en/`] : [])];
  d.homes = {};
  for (const p of homes) { const h = await tryReq(`${SITE}${p}`, "HEAD"); d.homes[p] = h.status ?? h.error; }
  add(6, "Not found", r.status === 404 && d.body_sha256 !== null && d.body_sha256 === d.expected_404_sha256 && homes.every((p) => d.homes[p] === 200), d);
}

// 8. Metadata and indexing, from the pages fetched in 4: canonical and
// hreflang on this origin and base, the robots meta and robots.txt of a
// preview (noindex, disallow all) or of a public build (neither).
{
  const d = { preview: build.preview, pages: 0, canonical_ok: 0, robots_meta_ok: 0, hreflang_links: 0, hreflang_targets_served: 0, problems: [] };
  const toPath = (u) => { let p = new URL(u).pathname; if (!p.startsWith(BASE)) return null; p = p.slice(BASE.length); return p === "" || p.endsWith("/") ? `${p}index.html` : p; };
  for (const e of expected.filter((x) => x.path.endsWith(".html") && x.path !== "404.html")) {
    const page = html.get(e.path) ?? "";
    d.pages++;
    const want = served(e.path).replace(/index\.html$/, "");
    const canon = page.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
    if (canon === want) d.canonical_ok++; else d.problems.push({ path: e.path, canonical: canon ?? null, expected: want });
    const noindex = /<meta name="robots" content="noindex, nofollow">/.test(page);
    if (noindex === build.preview) d.robots_meta_ok++; else d.problems.push({ path: e.path, robots_meta: noindex ? "noindex on a public build" : "missing on a preview" });
    for (const m of page.matchAll(/<link rel="alternate" hreflang="[a-z-]+" href="([^"]+)">/g)) {
      d.hreflang_links++;
      let target = null; try { target = new URL(m[1]).host === HOST ? toPath(m[1]) : null; } catch { /* not a URL */ }
      if (target && servedOk.has(target)) d.hreflang_targets_served++; else d.problems.push({ path: e.path, hreflang_target_not_served: m[1] });
    }
  }
  const rb = await tryReq(served("robots.txt"), "GET");
  d.robots_txt = rb.bytes ? rb.bytes.toString("utf8") : rb.error;
  const disallowAll = /^User-agent: \*\r?\nDisallow: \/\r?\n?$/.test(d.robots_txt ?? "");
  const okRobots = rb.status === 200 && servedOk.has("robots.txt") && disallowAll === build.preview;
  d.robots_txt_ok = okRobots;
  d.problems = d.problems.slice(0, 50);
  add(8, "Metadata", d.pages > 0 && d.canonical_ok === d.pages && d.robots_meta_ok === d.pages && d.hreflang_targets_served === d.hreflang_links && okRobots, d);
}

// 9. Claims wording: follows from 4. The build compared came out of npm run
// build, whose check-dist refuses affirmative claim wording.
add(9, "Claims wording", tests.find((t) => t.n === 4).status === "PASS", { note: "follows from check 4: the served files are those of a build that passed check-dist" });

// 11. Cache headers of index.html, recorded, no threshold.
add(11, "Cache", null, cache ?? { note: "index.html not fetched" });

const summary = { site: SITE, base: BASE, build: DIST, repo: REPO, checked_at: new Date().toISOString(), node: process.version, all_pass: tests.every((t) => t.status !== "FAIL"), tests };
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "report.json"), JSON.stringify({ ...summary, files: fetched }, null, 2) + "\n");
writeFileSync(join(OUT, "report.md"), [
  `# verify-live: ${SITE}${BASE}`, "",
  `Checked ${summary.checked_at} with Node ${process.version} against the build in \`${DIST}\` (${expected.length} files). Checks 7 and 10 are separate: check-viewports and verify-live-browser.`, "",
  "| # | Check | Result |", "| --- | --- | --- |", ...tests.map((t) => `| ${t.n} | ${t.name} | ${t.status} |`), "",
  "```json", JSON.stringify(tests, null, 2), "```", "",
].join("\n"));
console.log(tests.map((t) => `${t.n}\t${t.status}\t${t.name}`).join("\n"));
console.log(summary.all_pass ? `ALL PASS (report in ${OUT})` : `FAIL (report in ${OUT})`);
process.exit(summary.all_pass ? 0 : 1);
