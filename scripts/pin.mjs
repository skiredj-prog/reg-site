// Pin a reg-platform projection: npm run pin -- <platform_commit>
//   or: npm run pin -- --file ../reg-platform/projection/projection-v1.json [--badges ../reg-platform/badges]
// Writes data/projection-v1.json, data/badges/ and projection.lock.json.
import { cpSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { contentHash } from "./hash.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const lockPath = join(ROOT, "projection.lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
let text, platformCommit = lock.platform_commit;

if (args[0] === "--file") {
  text = readFileSync(args[1], "utf8");
  const b = args.indexOf("--badges");
  if (b >= 0) { rmSync(join(ROOT, "data/badges"), { recursive: true, force: true }); cpSync(args[b + 1], join(ROOT, "data/badges"), { recursive: true }); }
  platformCommit = null;
} else if (/^[0-9a-f]{40}$/.test(args[0] || "")) {
  platformCommit = args[0];
  const base = `https://raw.githubusercontent.com/skiredj-prog/reg-platform/${platformCommit}`;
  const res = await fetch(`${base}/projection/projection-v1.json`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  text = await res.text();
  const p0 = JSON.parse(text);
  rmSync(join(ROOT, "data/badges"), { recursive: true, force: true });
  mkdirSync(join(ROOT, "data/badges"), { recursive: true });
  const ids = ["demonstrated", "partial", "not_evaluated", "refuted", "inadmissible"].map((s) => `state-${s}`)
    .concat(p0.configurations.filter((c) => c.admissible_structural).map((c) => c.id));
  for (const id of ids) {
    const r = await fetch(`${base}/badges/${id}.svg`);
    if (!r.ok) throw new Error(`badge ${id}: ${r.status}`);
    writeFileSync(join(ROOT, "data/badges", `${id}.svg`), await r.text());
  }
} else {
  console.error("usage: npm run pin -- <40-hex reg-platform commit> | --file <projection.json> [--badges <dir>]");
  process.exit(2);
}

const p = JSON.parse(text);
const h = contentHash(p);
if (h !== p.content_sha256) throw new Error(`content_sha256 mismatch: ${h} vs ${p.content_sha256}`);
if (!p.guards.passed) throw new Error("projection guards failed; refusing to pin");
writeFileSync(join(ROOT, "data/projection-v1.json"), text);
writeFileSync(lockPath, JSON.stringify({ ...lock, content_sha256: h, source_commit: p.source.commit, platform_commit: platformCommit }, null, 2) + "\n");
console.log(`pinned projection ${h.slice(0, 12)} (reg-conformance@${p.source.commit.slice(0, 12)})`);
