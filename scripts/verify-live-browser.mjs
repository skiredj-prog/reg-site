// Checks 7 and 10 of docs/DEPLOYMENT.md on the served site, with Chromium:
// the home page and the configurator in both languages, at 375px (touch) and
// 1280px, scrolled to the bottom so deferred resources load. Records every
// host contacted, console errors, page errors and requests that failed or
// answered 400 or more. Passes when every page answers 200, nothing errors and
// the only host contacted is the site's. Read-only: writes only the report.
//
//   npm i --no-save playwright@1.49.1 && npx playwright install --with-deps chromium
//   node scripts/verify-live-browser.mjs --site=https://preview.reg.tenirlabs.cc \
//        [--base=/] [--out=verify-live-report/browser.json]
//
// --site and --base are read by src/lib/model.mjs too, so the routes carry the
// base the site is served under.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { route, SITE_URL } from "../src/lib/model.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const arg = (k, d) => { const a = process.argv.slice(2).find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
if (!arg("site")) { console.error("--site=<origin> is required, such as --site=https://preview.reg.tenirlabs.cc"); process.exit(2); }
const SITE = SITE_URL;
const HOST = new URL(SITE).host;
const OUT = arg("out", "verify-live-report/browser.json");
const PATHS = [route("home", "fr"), route("home", "en"), route("configurator", "fr"), route("configurator", "en")];
const WIDTHS = [375, 1280];

const browser = await chromium.launch();
const pages = [];
for (const width of WIDTHS) {
  const mobile = width < 768;
  for (const path of PATHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    const rec = { width, path, url: SITE + path, at: new Date().toISOString(), status: null, final_url: null, title: null, requests: 0, hosts: {}, other_schemes: {}, console_errors: [], page_errors: [], failed_requests: [] };
    page.on("console", (m) => { if (m.type() === "error") rec.console_errors.push({ text: m.text(), url: m.location()?.url ?? null }); });
    page.on("pageerror", (e) => rec.page_errors.push(String(e?.message ?? e)));
    page.on("request", (q) => {
      rec.requests++;
      let u; try { u = new URL(q.url()); } catch { rec.other_schemes.unparseable = (rec.other_schemes.unparseable || 0) + 1; return; }
      if (u.protocol === "http:" || u.protocol === "https:") rec.hosts[u.host] = (rec.hosts[u.host] || 0) + 1;
      else rec.other_schemes[u.protocol] = (rec.other_schemes[u.protocol] || 0) + 1;
    });
    page.on("requestfailed", (q) => rec.failed_requests.push({ url: q.url(), failure: q.failure()?.errorText ?? null, type: q.resourceType() }));
    page.on("response", (s) => { if (s.status() >= 400) rec.failed_requests.push({ url: s.url(), status: s.status(), type: s.request().resourceType() }); });
    try {
      const res = await page.goto(SITE + path, { waitUntil: "networkidle", timeout: 60000 });
      rec.status = res?.status() ?? null;
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
    } catch (e) { rec.goto_error = String(e?.message ?? e); }
    rec.final_url = page.url();
    rec.title = await page.title().catch(() => null);
    await ctx.close();
    pages.push(rec);
  }
}
const chromiumVersion = browser.version();
await browser.close();

const hosts = [...new Set(pages.flatMap((p) => Object.keys(p.hosts)))].sort();
const third_party_hosts = hosts.filter((h) => h !== HOST);
const totals = {
  pages: pages.length,
  all_status_200: pages.every((p) => p.status === 200),
  requests: pages.reduce((n, p) => n + p.requests, 0),
  console_errors: pages.reduce((n, p) => n + p.console_errors.length, 0),
  page_errors: pages.reduce((n, p) => n + p.page_errors.length, 0),
  failed_requests: pages.reduce((n, p) => n + p.failed_requests.length, 0),
  goto_errors: pages.filter((p) => p.goto_error).length,
};
const summary = {
  site: SITE, checked_at: new Date().toISOString(), node: process.version, chromium: chromiumVersion, paths: PATHS, widths: WIDTHS,
  totals, hosts, third_party_hosts,
  check7_no_error: totals.all_status_200 && totals.console_errors === 0 && totals.page_errors === 0 && totals.failed_requests === 0 && totals.goto_errors === 0,
  check10_no_third_party_host: third_party_hosts.length === 0,
  pages,
};
summary.clean = summary.check7_no_error && summary.check10_no_third_party_host;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(summary, null, 2) + "\n");
for (const p of pages) console.log(`${p.width}\t${p.path}\tHTTP ${p.status}\treq ${p.requests}\tconsole ${p.console_errors.length}\tpageerr ${p.page_errors.length}\tfailed ${p.failed_requests.length}\thosts ${Object.keys(p.hosts).join(",")}${p.goto_error ? "\tgoto_error " + p.goto_error : ""}`);
console.log(`hosts: ${hosts.join(", ") || "(none)"}; third-party: ${third_party_hosts.join(", ") || "none"}`);
console.log(summary.clean ? `CLEAN (report in ${OUT})` : `NOT CLEAN (report in ${OUT})`);
process.exit(summary.clean ? 0 : 1);
