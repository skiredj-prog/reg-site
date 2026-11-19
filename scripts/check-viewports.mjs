// Browser checks at 375px and 1280px: no horizontal overflow, no console
// errors, 44px targets, and the configurator's main path.
// Expects dist/ served on BASE (default http://127.0.0.1:4173).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:4173";
const PAGES = ["/", "/configurateur/", "/vecteurs/", "/donnees/", "/en/", "/en/configurator/", "/en/vectors/", "/en/data/"];
const SHOTS = process.env.SHOTS;
const errors = [];
const browser = await chromium.launch();
for (const width of [375, 1280]) {
  for (const theme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${width} ${page.url()}: console ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`${width} ${page.url()}: ${e.message}`));
    for (const path of PAGES) {
      await page.goto(BASE + path);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      if (o.sw > o.cw) errors.push(`${width} ${theme} ${path}: horizontal overflow ${o.sw} > ${o.cw}`);
      if (width === 375) {
        const small = await page.$$eval(".top a, .top button, .btn, select, input", (els) => els
          .filter((e) => e.offsetParent && !e.classList.contains("skip"))
          .map((e) => ({ t: (e.textContent || e.name || "").trim().slice(0, 30), h: e.getBoundingClientRect().height }))
          .filter((x) => x.h < 44));
        for (const s of small) errors.push(`375 ${path}: target "${s.t}" is ${s.h}px high`);
      }
      if (SHOTS && theme === "dark") await page.screenshot({ path: `${SHOTS}/${width}${path.replace(/\//g, "_")}.png`, fullPage: true });
    }
    await ctx.close();
  }
}

// Configurator path.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await page.goto(BASE + "/configurateur/");
const label = () => page.textContent("[data-state-label]");
if ((await label()) !== "non évalué") errors.push(`configurator default state is "${await label()}"`);
await page.selectOption("#ax-HOST_SCOPE", "multi-host");
if ((await label()) !== "non admissible") errors.push("multi-host + local-registry + file-lock should be inadmissible");
const fixes = await page.$$("[data-fixes] button");
if (!fixes.length) errors.push("no nearby admissible configuration offered");
else {
  await fixes[0].click();
  if ((await label()) === "non admissible") errors.push("applying a fix left the configuration inadmissible");
  if ((await page.inputValue("#ax-HOST_SCOPE")) !== "multi-host") errors.push("the fix changed the axis the user just picked");
}
if (!page.url().includes("?c=")) errors.push("configuration not kept in the URL");
await page.goto(BASE + "/en/configurator/?c=mono-process__none__thread-lock__fail-open");
if ((await page.inputValue("#ax-UNCERTAINTY")) !== "fail-open") errors.push("configuration not restored from the URL");
await page.goto(BASE + "/vecteurs/?q=zzzz");
if (!(await page.isVisible("[data-empty]"))) errors.push("filtered-zero state not shown");
await page.click("[data-clear]");
if ((await page.textContent("[data-count]")).trim() !== "60 sur 60") errors.push("clear filters did not restore the list");
if (SHOTS) {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(BASE + "/configurateur/");
  await page.selectOption("#ax-HOST_SCOPE", "multi-host");
  await page.screenshot({ path: `${SHOTS}/cfg-inadmissible-375.png`, fullPage: true });
}
await browser.close();

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`check-viewports: ${PAGES.length} pages x 2 widths x 2 themes, configurator and filters OK`);
