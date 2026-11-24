// What the pages need, derived from the projection and nothing else.

// Where the site is served. SITE_URL is an origin: scheme and host, nothing
// after them. SITE_BASE is the path the site sits under: "/" at the root of
// its own domain, "/reg-site/" for a GitHub Pages project site. Both come
// from the environment; --site= and --base= on the command line win over it.
// They are read here, once, so that every page and script sees the same.
const cli = (name) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function origin(value) {
  let url = null;
  try { url = new URL(value); } catch { /* refused below */ }
  if (!url || !/^https?:$/.test(url.protocol) || url.origin !== value) {
    throw new Error(`SITE_URL must be an origin, scheme and host only, with no path and no final slash: ${JSON.stringify(value)}`);
  }
  return value;
}

function base(value) {
  const b = `/${value}/`.replace(/\/{2,}/g, "/");
  if (!/^\/([A-Za-z0-9_~-][A-Za-z0-9._~-]*\/)*$/.test(b)) {
    throw new Error(`SITE_BASE must be a path such as / or /reg-site/: ${JSON.stringify(value)}`);
  }
  return b;
}

export const SITE_URL = origin(cli("site") || process.env.SITE_URL || "https://reg.tenirlabs.cc");
export const BASE = base(cli("base") || process.env.SITE_BASE || "/");

// A path of the site ("/assets/site.css") as a URL path under the base, and
// back again for the files written into dist/, which is served as the base.
export const withBase = (p) => (BASE === "/" ? p : BASE.slice(0, -1) + p);
export const withoutBase = (p) => {
  if (!p.startsWith(BASE)) throw new Error(`${p} is not under the base ${BASE}`);
  return p.slice(BASE.length - 1);
};

// Paths of the site without the base: links go through route().
export const ROUTES = {
  home: { fr: "/", en: "/en/" },
  configurator: { fr: "/configurateur/", en: "/en/configurator/" },
  configuration: { fr: (id) => `/configurations/${id}/`, en: (id) => `/en/configurations/${id}/` },
  vectors: { fr: "/vecteurs/", en: "/en/vectors/" },
  vector: { fr: (id) => `/vecteurs/${id}/`, en: (id) => `/en/vectors/${id}/` },
  cite: { fr: "/citer/", en: "/en/cite/" },
  data: { fr: "/donnees/", en: "/en/data/" },
  verify: { fr: "/verifier/", en: "/en/verify/" },
};

export const route = (name, lang, id) => {
  const r = ROUTES[name][lang];
  return withBase(typeof r === "function" ? r(id) : r);
};

export const badgePath = (lang, id) => withBase(lang === "en" ? `/badges/en/${id}.svg` : `/badges/${id}.svg`);
export const profilePath = (id) => withBase(`/profiles/${id}.yaml`);

// The preferred starting point of the configurator: the repository's own
// example profile (profiles/example-aggregate-budget-single-host.yaml).
const DEFAULT_CONFIG = "mono-host__local-registry__file-lock__fail-closed";

// A vector whose rfc field names a dated revision ("RFC-4 v0.3 revision
// §2.1") rests on a revision that reg-conformance keeps outside the frozen
// baseline (revisions/); its reference says whether it was ratified.
// Returns { name: "RFC-4 v0.3", ratified } or null.
const REVISION = /\b(RFC-\d+ v\d+(?:\.\d+)*) revision\b/;
export function revisionOf(v) {
  const m = REVISION.exec(v?.rfc || "");
  return m ? { name: m[1], ratified: /\bratified\b/i.test(v.reference || "") } : null;
}

export function model(P, lock) {
  const repo = P.source.repository;
  const commit = P.source.commit;
  const files = new Map(P.source.files.map((f) => [f.path, f]));
  const blob = (path, line) => `${repo}/blob/${commit}/${path}${line ? `#L${line}` : ""}`;
  const AXES = P.axes.map((a) => a.id);
  const axis = Object.fromEntries(P.axes.map((a) => [a.id, a]));
  const valueInfo = {};
  for (const a of P.axes) for (const v of a.values) valueInfo[`${a.id}=${v.value}`] = v;

  const configs = P.configurations;
  const configById = new Map(configs.map((c) => [c.id, c]));
  const admissible = configs.filter((c) => c.admissible_structural);
  const defaultConfig = configById.get(DEFAULT_CONFIG)?.admissible_structural ? DEFAULT_CONFIG : admissible[0]?.id;

  const records = new Map(P.guarantee_records.map((r) => [r.id, r]));
  const configsByRecord = new Map();
  for (const c of configs) for (const r of c.capability_refs) {
    if (!configsByRecord.has(r)) configsByRecord.set(r, []);
    configsByRecord.get(r).push(c.id);
  }
  const rulesByClause = new Map(P.rules.map((r) => [r.clause_id, r]));

  const capsOf = (c) => AXES.map((ax) => valueInfo[`${ax}=${c.config[ax]}`]?.capability_id).filter(Boolean);
  const invariantsFor = (c) => {
    const caps = new Set(capsOf(c));
    return P.invariants.filter((i) => (i.applies_to || []).some((x) => caps.has(x)));
  };
  const evidenceFor = (c) => AXES.map((ax) => ({ axis: ax, value: c.config[ax], ...valueInfo[`${ax}=${c.config[ax]}`] }));

  // Admissible configurations one change away (then two), in axis order.
  function nearest(c, keepAxis = null, limit = 4) {
    const out = [];
    for (const d of [1, 2]) {
      for (const o of admissible) {
        const diff = AXES.filter((ax) => o.config[ax] !== c.config[ax]);
        if (diff.length !== d || (keepAxis && diff.includes(keepAxis))) continue;
        out.push({ id: o.id, diff });
      }
      if (out.length) break;
    }
    out.sort((a, b) => AXES.indexOf(a.diff[0]) - AXES.indexOf(b.diff[0]));
    return out.slice(0, limit);
  }

  const registered = P.vectors.filter((v) => v.registry === "vector");
  const proposals = P.vectors.filter((v) => v.registry !== "vector");
  const indexOnly = P.vector_index?.rows_without_vector || [];
  const supersedes = new Map();
  for (const v of P.vectors) for (const by of v.superseded_by || []) {
    if (!supersedes.has(by)) supersedes.set(by, []);
    supersedes.get(by).push(v.id);
  }
  const vectorById = new Map(P.vectors.map((v) => [v.id, v]));

  const fileOf = (re) => P.source.files.find((f) => re.test(f.path))?.path;
  const paths = {
    catalog: fileOf(/^catalog\/valid-configurations/),
    rules: fileOf(/^catalog\/compatibility-rules/),
    capabilities: fileOf(/^catalog\/capabilities/),
    index: P.vector_index?.present ? P.vector_index.path : null,
    claims: P.claims_policy?.present ? P.claims_policy.path : null,
    vectors: P.source.files.filter((f) => /^vectors\/[^/]+\.yaml$/.test(f.path) && !/proposals/.test(f.path)).map((f) => f.path),
    proposals: fileOf(/^vectors\/proposals\.yaml$/),
  };

  const platformUrl = lock.platform_commit
    ? `${lock.platform_repository}/commit/${lock.platform_commit}`
    : lock.platform_repository;

  return {
    P, lock, repo, commit, files, blob, AXES, axis, valueInfo, configs, configById, admissible, defaultConfig,
    records, configsByRecord, rulesByClause, capsOf, invariantsFor, evidenceFor, nearest,
    registered, proposals, indexOnly, supersedes, vectorById, paths,
    commitUrl: `${repo}/commit/${commit}`,
    treeUrl: `${repo}/tree/${commit}`,
    platformUrl,
  };
}
