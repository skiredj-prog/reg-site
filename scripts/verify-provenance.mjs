// Check 12 of docs/DEPLOYMENT.md: the files the site serves are files a run
// of the preview workflow signed. Downloads every file of the build in --dist
// from the served site, asks the GitHub CLI to verify the provenance
// signature of the served home page (repository, signer workflow, branch),
// then requires that one of the statements it verified lists every served
// file, by path and sha256. Read-only: writes only the report.
//
//   GH_TOKEN=... node scripts/verify-provenance.mjs --site=https://preview.reg.tenirlabs.cc \
//        [--dist=dist] [--repo=skiredj-prog/reg-site] [--commit=<deployed sha>] [--out=verify-live-report]
//
// GH (environment) names the gh binary. The signed commit may differ from the
// deployed one when two commits build identical bytes; the report says so.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

const arg = (k, d) => { const a = process.argv.slice(2).find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
let SITE;
try { SITE = new URL(arg("site", "")).origin; } catch { console.error("--site=<origin> is required, such as --site=https://preview.reg.tenirlabs.cc"); process.exit(2); }
const DIST = arg("dist", "dist");
const REPO = arg("repo", "skiredj-prog/reg-site");
const WORKFLOW = `${REPO}/.github/workflows/preview.yml`;
const DEPLOYED = arg("commit", "") || null;
const OUT = arg("out", "verify-live-report");
const GH = process.env.GH || "gh";
const ANCHOR = "index.html"; // present in every build

const result = { check: 12, name: "Provenance", site: SITE, repo: REPO, signer_workflow: WORKFLOW, source_ref: "refs/heads/main", deployed_commit: DEPLOYED, checked_at: new Date().toISOString() };
function done(status, extra = {}) {
  Object.assign(result, extra, { status });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "provenance.json"), JSON.stringify(result, null, 2) + "\n");
  const c = result.covering;
  const md = [
    `## Check 12, provenance: ${status}`,
    "",
    `- Site: ${SITE}${result.base ?? ""}; served files compared: ${result.served ?? "none"}${result.unread?.length ? `, not read: ${result.unread.length}` : ""}`,
    `- Signature lookup: \`gh attestation verify ${ANCHOR} -R ${REPO} --signer-workflow ${WORKFLOW} --source-ref refs/heads/main\`: ${result.verified_statements ?? 0} verified statement(s)`,
    c ? `- Covering statement: ${c.subjects} subjects, signed at commit \`${c.commit ?? "unknown"}\`, run ${c.run ?? "unknown"}` : "- No verified statement lists every served file",
    DEPLOYED && c ? `- Deployed commit \`${DEPLOYED}\`: ${c.commit === DEPLOYED ? "same as the signed commit" : "differs from the signed commit: the served bytes are the ones signed at that commit, and check 4 compares them with a build of the deployed commit"}` : null,
    result.reason ? `- ${result.reason}` : null,
    "",
  ].filter((x) => x !== null).join("\n");
  writeFileSync(join(OUT, "provenance.md"), md);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n", { flag: "a" });
  console.log(md);
  process.exit(status === "PASS" ? 0 : 1);
}

if (!existsSync(join(DIST, "build.json"))) done("FAIL", { reason: `${DIST}/build.json not found: build the deployed commit first` });
const BASE = JSON.parse(readFileSync(join(DIST, "build.json"), "utf8")).base;
result.base = BASE;
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p); else files.push(relative(DIST, p).split(sep).join("/"));
  }
})(DIST);

// The served bytes, not the build's: the signature must cover what visitors get.
const served = new Map();
const unread = [];
const url = (path) => SITE + BASE + path.split("/").map(encodeURIComponent).join("/");
async function fetchOne(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url(path), { cache: "no-store", redirect: "manual" });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) { if (attempt) throw e; }
  }
}
let next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < files.length) {
    const path = files[next++];
    try { served.set(path, await fetchOne(path)); } catch (e) { unread.push({ path, error: String(e?.message ?? e) }); }
  }
}));
result.served = served.size;
result.unread = unread.slice(0, 50);
if (!served.has(ANCHOR)) done("FAIL", { reason: `the served ${ANCHOR} could not be read` });

const dir = mkdtempSync(join(tmpdir(), "provenance-"));
const anchorFile = join(dir, ANCHOR);
writeFileSync(anchorFile, served.get(ANCHOR));
let out;
try {
  out = execFileSync(GH, ["attestation", "verify", anchorFile, "-R", REPO, "--signer-workflow", WORKFLOW, "--source-ref", "refs/heads/main", "--format", "json"],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
} catch (e) {
  done("FAIL", { reason: `gh attestation verify found no valid signature for the served ${ANCHOR}: ${String(e.stderr || e.message).trim().split("\n").slice(-3).join(" ")}` });
}

// Each verified result carries the signed in-toto statement; older gh
// versions only return the bundle, whose DSSE payload is that statement.
const statements = [];
for (const r of JSON.parse(out)) {
  let st = r?.verificationResult?.statement;
  if (!st && r?.attestation?.bundle?.dsseEnvelope?.payload) {
    try { st = JSON.parse(Buffer.from(r.attestation.bundle.dsseEnvelope.payload, "base64").toString("utf8")); } catch { /* unreadable */ }
  }
  if (!st?.subject) continue;
  const cert = r?.verificationResult?.signature?.certificate || {};
  const pred = st.predicate || {};
  statements.push({
    subjects: new Map(st.subject.map((s) => [s.name, s.digest?.sha256])),
    commit: cert.sourceRepositoryDigest || pred.buildDefinition?.resolvedDependencies?.find((d) => d.digest?.gitCommit)?.digest.gitCommit || null,
    run: cert.runInvocationURI || pred.runDetails?.metadata?.invocationId || null,
    ref: cert.sourceRepositoryRef || null,
  });
}
result.verified_statements = statements.length;

const digests = [...served].map(([path, buf]) => [path, createHash("sha256").update(buf).digest("hex")]);
const misses = statements.map((s) => digests.filter(([p, h]) => s.subjects.get(p) !== h).map(([p]) => p));
const i = misses.findIndex((m) => m.length === 0);
if (i < 0) {
  const best = misses.length ? misses.reduce((a, b) => (b.length < a.length ? b : a)) : [];
  done("FAIL", { reason: statements.length ? `no verified statement lists every served file; the closest misses ${best.length}: ${best.slice(0, 10).join(", ")}` : "the verified result carries no readable statement", missing: best.slice(0, 50) });
}
const c = statements[i];
done(unread.length ? "FAIL" : "PASS", {
  covering: { commit: c.commit, run: c.run, ref: c.ref, subjects: c.subjects.size },
  same_commit: DEPLOYED ? c.commit === DEPLOYED : null,
  reason: unread.length ? `${unread.length} served file(s) could not be read` : null,
});
