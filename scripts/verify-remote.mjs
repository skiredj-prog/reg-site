// CI: the pinned projection must be exactly what reg-platform publishes at
// the pinned commit, and so must every badge the site ships, byte for byte.
// Binds the site to the platform, not to a local file.
//
// REG_PLATFORM_RAW replaces the raw.githubusercontent.com base, for testing
// against a local copy of reg-platform served as <base>/<commit>/<path>.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash } from "./hash.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(join(ROOT, "projection.lock.json"), "utf8"));
if (!lock.platform_commit) {
  console.log("::warning::platform_commit is not pinned yet; run npm run pin -- <reg-platform commit>");
  process.exit(process.env.REQUIRE_PLATFORM_PIN ? 1 : 0);
}
const short = lock.platform_commit.slice(0, 12);
const base = `${process.env.REG_PLATFORM_RAW || "https://raw.githubusercontent.com/skiredj-prog/reg-platform"}/${lock.platform_commit}`;

const url = `${base}/projection/projection-v1.json`;
const res = await fetch(url);
if (!res.ok) { console.error(`cannot fetch ${url}: ${res.status}`); process.exit(1); }
const h = contentHash(await res.json());
if (h !== lock.content_sha256) { console.error(`reg-platform publishes ${h}, the site pins ${lock.content_sha256}`); process.exit(1); }

// The badges the site ships: dist/badges once built, data/badges before.
const local = existsSync(join(ROOT, "dist/badges")) ? join(ROOT, "dist/badges") : join(ROOT, "data/badges");
const badges = [];
(function walk(dir, rel) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, `${rel}${f}/`); else badges.push(`${rel}${f}`);
  }
})(local, "");
if (!badges.length) { console.error(`no badges in ${local}`); process.exit(1); }
const differ = [];
for (let i = 0; i < badges.length; i += 8) {
  await Promise.all(badges.slice(i, i + 8).map(async (b) => {
    const r = await fetch(`${base}/badges/${b}`);
    if (!r.ok) differ.push(`${b} (${r.status})`);
    else if (!Buffer.from(await r.arrayBuffer()).equals(readFileSync(join(local, b)))) differ.push(b);
  }));
}
if (differ.length) {
  console.error(`${differ.length} badge(s) differ from reg-platform@${short}: ${differ.slice(0, 10).join(", ")}${differ.length > 10 ? ", ..." : ""}`);
  process.exit(1);
}
console.log(`pinned projection ${h.slice(0, 12)} and ${badges.length} badges match reg-platform@${short}`);
