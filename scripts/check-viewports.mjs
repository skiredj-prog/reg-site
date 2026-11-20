// Browser checks on the built site, at 375px (touch) and 1280px, dark and
// light: no page-level horizontal overflow, no console error, 44px targets on
// a phone, and the paths a visitor takes (configurator, vector list, data
// tabs, citation form, copy, menu). Expected values come from the projection
// the site was built from, never from numbers written here.
//
//   node scripts/serve.mjs 4173 &   then   node scripts/check-viewports.mjs
//   BASE=http://127.0.0.1:4173 DIST=dist SHOTS=<dir> (optional screenshots)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_LABEL, T, fmt } from "../src/i18n.mjs";
import { ROUTES } from "../src/lib/model.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:4173";
const DIST = process.env.DIST || join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SHOTS = process.env.SHOTS;
const P = JSON.parse(readFileSync(join(DIST, "data/projection-v1.json"), "utf8"));
const build = JSON.parse(readFileSync(join(DIST, "build.json"), "utf8"));

const AXES = P.axes.map((a) => a.id);
const cfg = new Map(P.configurations.map((c) => [c.id, c]));
const idOf = (c) => AXES.map((a) => c[a]).join("__");
const firstVector = P.vectors[0]?.id;
const r = (name, lang, ...a) => (typeof ROUTES[name][lang] === "function" ? ROUTES[name][lang](...a) : ROUTES[name][lang]);

// The default configuration of the configurator, and one that breaks a rule
// by changing only the host scope: found in the data, not assumed.
const DEFAULT = "mono-host__local-registry__file-lock__fail-closed";
const hostAxis = AXES[0];
const broken = P.axes[0].values.map((v) => ({ ...cfg.get(DEFAULT).config, [hostAxis]: v.value }))
  .map(idOf).find((id) => !cfg.get(id).admissible_structural);
const otherAdmissible = P.configurations.find((c) => c.admissible_structural && c.id !== DEFAULT)?.id;

const PAGES = [];
for (const lang of ["fr", "en"]) {
  PAGES.push(r("home", lang), r("configurator", lang), r("vectors", lang), r("cite", lang), r("data", lang),
    r("configuration", lang, DEFAULT), r("configuration", lang, broken));
  if (firstVector) PAGES.push(r("vector", lang, firstVector));
}
PAGES.push("/this-page-does-not-exist/");

const errors = [];
const fail = (m) => errors.push(m);
const browser = await chromium.launch();

// 1. Every page, both widths, both themes.
for (const width of [375, 1280]) {
  for (const theme of ["dark", "light"]) {
    const mobile = width < 768;
    const ctx = await browser.newContext({
      viewport: { width, height: 900 }, colorScheme: theme, deviceScaleFactor: 1,
      ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error" && !/status of 404/.test(m.text())) fail(`${width} ${theme} ${page.url()}: console ${m.text()}`); });
    page.on("pageerror", (e) => fail(`${width} ${theme} ${page.url()}: ${e.message}`));
    for (const path of PAGES) {
      const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
      if (path.includes("does-not-exist") ? res.status() !== 404 : !res.ok()) fail(`${path}: HTTP ${res.status()}`);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      if (o.sw > o.cw) fail(`${width} ${theme} ${path}: page overflows horizontally (${o.sw} > ${o.cw})`);
      if (build.preview) {
        // The preview banner is seen, not only present in the markup.
        const b = await page.$eval('[data-guard="preview-banner"]', (e) => {
          const r = e.getBoundingClientRect(), s = getComputedStyle(e);
          return { top: r.top + window.scrollY, h: r.height, shown: s.display !== "none" && s.visibility === "visible" && Number(s.opacity) === 1 };
        }).catch(() => null);
        if (!b || !b.shown || b.h < 16 || b.top > 1) fail(`${width} ${theme} ${path}: preview banner not visible at the top of the page`);
      }
      if (mobile) {
        // Controls a thumb has to hit. Inline links in running text, the map
        // (a visual summary; the selects are the way in) and native checkboxes
        // (their label is the target) are not counted.
        const small = await page.$$eval("header a, header button, .btn, button, select, input[type=text], input[type=search], input[type=url], summary, .tab-list a, .led-more", (els) => els
          .filter((e) => e.offsetParent && !e.closest(".map, .skip, .crumbs") && e.getClientRects().length)
          .map((e) => ({ t: (e.textContent || e.getAttribute("aria-label") || e.name || "").trim().replace(/\s+/g, " ").slice(0, 40), h: Math.round(e.getBoundingClientRect().height) }))
          .filter((x) => x.h < 44));
        for (const s of small) fail(`375 ${theme} ${path}: target "${s.t}" is ${s.h}px high`);
      }
      if (SHOTS && theme === "dark") await page.screenshot({ path: `${SHOTS}/${width}${path.replace(/[/?=]/g, "_")}.png`, fullPage: true });
    }
    await ctx.close();
  }
}

// 2. Configurator, at both widths.
for (const width of [1280, 375]) {
  const mobile = width < 768;
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`configurator ${width}: ${e.message}`));
  const state = () => page.textContent("#cfg-out .res-state .tag").then((s) => s.trim());
  await page.goto(BASE + r("configurator", "fr"));
  const want = (id) => STATE_LABEL.fr[cfg.get(id).state];
  if ((await state()) !== want(DEFAULT)) fail(`configurator ${width}: default state is "${await state()}", the projection says "${want(DEFAULT)}"`);
  if ((await page.textContent("#cfg-now")).trim() !== want(DEFAULT)) fail(`configurator ${width}: the state line under the lists disagrees with the result`);
  await page.selectOption(`#ax-${hostAxis}`, cfg.get(broken).config[hostAxis]);
  if ((await state()) !== want(broken)) fail(`configurator ${width}: ${broken} shows "${await state()}", the projection says "${want(broken)}"`);
  if ((await page.getAttribute("#cfg-export", "href")) !== "#take-t") fail(`configurator ${width}: export still offers a profile for a configuration that is not admissible`);
  const fixes = await page.$$("#cfg-out [data-use]");
  if (!fixes.length) fail(`configurator ${width}: no admissible configuration offered nearby`);
  else {
    const target = await fixes[0].getAttribute("data-use");
    await fixes[0].click();
    if (cfg.get(target).config[hostAxis] !== cfg.get(broken).config[hostAxis]) fail(`configurator ${width}: the first fix changes the axis the visitor just chose`);
    if ((await state()) !== want(target)) fail(`configurator ${width}: after the fix, state "${await state()}" instead of "${want(target)}"`);
    if (!page.url().includes(`c=${target}`)) fail(`configurator ${width}: the configuration is not kept in the URL`);
    if ((await page.getAttribute("#cfg-export", "href")) !== `/profiles/${target}.yaml`) fail(`configurator ${width}: export does not point to the profile of ${target}`);
  }
  if (!mobile && otherAdmissible) {
    await page.click(`#cfg-map a[data-id="${otherAdmissible}"]`);
    if (idOf(Object.fromEntries(await Promise.all(AXES.map(async (a) => [a, await page.inputValue(`#ax-${a}`)])))) !== otherAdmissible) fail("configurator: a click on the map does not load that configuration");
  }
  if (otherAdmissible) {
    await page.goto(`${BASE}${r("configurator", "en")}?c=${otherAdmissible}`);
    const got = idOf(Object.fromEntries(await Promise.all(AXES.map(async (a) => [a, await page.inputValue(`#ax-${a}`)]))));
    if (got !== otherAdmissible) fail(`configurator ${width}: ?c=${otherAdmissible} restored ${got}`);
    if ((await state()) !== STATE_LABEL.en[cfg.get(otherAdmissible).state]) fail(`configurator ${width}: English state label wrong after restore`);
  }
  await ctx.close();
}

// 3. Vector list: registry toggle, filtered-zero state, clear.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const count = () => page.textContent("#v-count").then((s) => s.trim());
  const reg = P.vectors.filter((v) => v.registry === "vector").length;
  const cand = P.vectors.length - reg;
  await page.goto(BASE + r("vectors", "fr"));
  if ((await count()) !== fmt(T.fr.vec_count, { n: reg, total: reg })) fail(`vectors: count "${await count()}" for ${reg} registered vectors`);
  if (cand) {
    await page.click('.seg-b[data-reg="candidate"]');
    if ((await count()) !== fmt(T.fr.vec_count, { n: cand, total: cand })) fail(`vectors: proposals count "${await count()}" for ${cand}`);
  }
  await page.goto(BASE + r("vectors", "fr") + "?q=zzzz-no-such-vector");
  if (!(await page.isVisible("#v-empty"))) fail("vectors: filtered-zero state not shown");
  await page.click("#v-empty [data-clear]");
  if ((await count()) !== fmt(T.fr.vec_count, { n: reg, total: reg })) fail("vectors: clearing did not restore the list");
  const firstRow = await page.$eval("#v-rows tr:not([hidden]) td.c-id a", (a) => a.textContent.trim());
  await page.click(`#v-rows a:text-is("${firstRow}")`);
  if (!page.url().endsWith(`/${encodeURIComponent(firstRow)}/`)) fail(`vectors: row link goes to ${page.url()}`);
  await ctx.close();
}

// 4. Data tabs, the copy buttons, the citation form, the menu.
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 }, isMobile: true, hasTouch: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  await page.goto(BASE + r("data", "fr") + "#rejeu");
  if (!(await page.isVisible("#rejeu"))) fail("data: #rejeu does not open its tab");
  await page.click('.tab-list a[data-tab="fichiers"]');
  if (!(await page.isVisible("#fichiers")) || (await page.isVisible("#source"))) fail("data: tab switch does not show the files panel alone");
  await page.goto(BASE + r("cite", "fr"));
  await page.click('[data-copy="cite-ref"]');
  const stSel = '[data-copy="cite-ref"] + .copy-status';
  await page.waitForFunction((sel) => document.querySelector(sel)?.textContent.trim(), stSel, { timeout: 5000 }).catch(() => {});
  const st = (await page.textContent(stSel)).trim();
  if (st !== T.fr.copied) fail(`cite: copy status "${st}"`);
  else if ((await page.evaluate(() => navigator.clipboard.readText())).trim() !== (await page.textContent("#cite-ref")).trim()) fail("cite: the clipboard does not hold the reference");
  if (await page.$("#cite-form")) {
    await page.click('#cite-form button[type="submit"]');
    const focused = await page.evaluate(() => document.activeElement?.name);
    if (focused !== "subject") fail(`cite: an empty submit focuses "${focused}", not the first field`);
    if ((await page.getAttribute('[name="subject"]', "aria-invalid")) !== "true") fail("cite: the empty required field is not marked invalid");
    await page.fill('[name="subject"]', "Runtime X");
    if (await page.getAttribute('[name="subject"]', "aria-invalid")) fail("cite: the error does not clear when the visitor types");
    await page.fill('[name="subject_commit"]', "abc1234");
    await page.fill('[name="vectors.PASS"]', "3");
    await page.fill('[name="vectors.FAIL"]', "1");
    const text = (await page.textContent("#cite-text")).trim();
    if (!text.startsWith("Runtime X at commit abc1234, run with reg-conformance at ") || !text.includes("3 of 4 REG vectors passed (1 failed)")) fail(`cite: assembled text is "${text}"`);
    // Clearing a filled draft asks first; Escape keeps it.
    await page.click("#cite-reset");
    if (!(await page.isVisible("#cite-confirm"))) fail("cite: clearing a filled draft does not ask for confirmation");
    else {
      if ((await page.evaluate(() => document.activeElement?.getAttribute("data-dlg"))) !== "keep") fail("cite: the confirmation does not focus \"keep the draft\"");
      await page.keyboard.press("Escape");
      // The dialog's close event is queued: wait for its handler to run.
      await page.waitForFunction(() => document.activeElement?.id === "cite-reset", null, { timeout: 2000 }).catch(() => {});
      if (await page.isVisible("#cite-confirm")) fail("cite: Escape does not close the confirmation");
      if ((await page.inputValue('[name="subject"]')) !== "Runtime X") fail("cite: Escape cleared the draft");
      if ((await page.evaluate(() => document.activeElement?.id)) !== "cite-reset") fail("cite: focus does not return to the clear button");
      await page.click("#cite-reset");
      await page.click('#cite-confirm [data-dlg="clear"]');
      await page.waitForFunction(() => document.querySelector('[name="subject"]').value === "", null, { timeout: 2000 }).catch(() => {});
      if ((await page.inputValue('[name="subject"]')) !== "") fail("cite: confirming does not clear the draft");
    }
  }
  await page.goto(BASE + r("home", "fr"));
  await page.click(".menu-btn");
  const themeBtn = "[data-theme-toggle]";
  const before = (await page.textContent(themeBtn)).trim();
  await page.click(themeBtn);
  const after = (await page.textContent(themeBtn)).trim();
  if (before === after || ![T.fr.theme_to_light, T.fr.theme_to_dark].includes(after)) fail(`theme: button says "${before}" then "${after}"`);
  if (!(await page.isVisible("#site-nav"))) fail("menu: does not open on a phone");
  await page.keyboard.press("Escape");
  if (await page.isVisible("#site-nav")) fail("menu: Escape does not close it");
  await ctx.close();
}
await browser.close();

if (errors.length) {
  console.error(errors.slice(0, 80).map((e) => "  " + e).join("\n"));
  console.error(`check-viewports: ${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`check-viewports: ${PAGES.length} pages x 2 widths x 2 themes${build.preview ? " (preview build, banner seen at the top of each)" : ""}; configurator, vector list, data tabs, copy, ${P.claims_policy?.present ? "citation form, " : ""}menu OK`);
