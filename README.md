# reg-site

The presentation layer of REG: a static site, French and English, built
from one pinned projection published by
[reg-platform](https://github.com/skiredj-prog/reg-platform). It reads
nothing else, and it never says that a product is conformant.

**Status: preview.** A preview build carries a banner on every page that
says so, and one is deployed (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md));
there is no public release. No page attests or certifies anything, and
nothing on this site may be cited to say that a product conforms to REG.

## Pages

| Page | French / English | What a visitor does there |
| --- | --- | --- |
| Home | `/`, `/en/` | Sees the counts at the source commit, each one linked to the file that produces it, and the map of the 144 configurations. |
| Configurator | `/configurateur/`, `/en/configurator/` | Picks four axes, sees the state, the rule that rejects it and the nearest admissible configurations; leaves with a link, a badge and a REG+ profile skeleton. |
| Configuration | `/configurations/<id>/` | One page per configuration, citable; the badge links here. |
| Vectors | `/vecteurs/`, `/en/vectors/` | Searches and filters the registered vectors, the proposals and the indexed properties without a vector. |
| Vector | `/vecteurs/<id>/` | Requirement, reference-kernel result, and the commands to replay it at the pinned commit. |
| Cite | `/citer/`, `/en/cite/` | Copies the exact reference of this version; when CLAIMS.md is present, assembles the statement it requires. |
| Data source | `/donnees/`, `/en/data/` | Commit, contract, fingerprint, replay, guards, files read with their sha256, records, rules. |
| Verify | `/verifier/`, `/en/verify/` | Sees the site commit, the data commit and the digest manifest; recomputes the sha256 of every served file in the browser; copies the commands that check the provenance signature and rebuild the site. |

Every page carries a "what this does not establish" block and a footer that
links the exact reg-conformance commit.

## Build

```sh
npm run build            # preview build: banner, noindex, robots Disallow; then the output guards
npm run build:public     # same content without the preview banner
npm run preview          # serves dist/ on http://127.0.0.1:4173
npm run check:viewports  # browser checks (needs playwright and the preview server)
node scripts/verify-live.mjs --site=<origin>  # compares a served site with dist/ (docs/DEPLOYMENT.md)
```

The build has no dependencies (Node 20 or later). The browser checks need
Playwright, the only development dependency, pinned with its integrity in
`package-lock.json`: `npm ci` then `npx playwright install chromium`. They
take their expected values from the projection the site was built from.

Where the site is served comes from two variables. `SITE_URL` is its
origin, scheme and host only (default `https://reg.tenirlabs.cc`):
canonical and hreflang links, the sitemap and the link and badge snippets
start with it. `SITE_BASE` is the path it sits under (default `/`;
`/reg-site/` for a GitHub Pages project site): every internal link carries
it, and `check-dist` refuses one that does not. `node src/build.mjs` also
takes `--site=` and `--base=`, which win over the environment;
`node scripts/serve.mjs 4173 --base=/reg-site/` serves `dist/` under that
path, and `check-viewports` reads `SITE_BASE` as the build does. CI builds
and checks both `/` and `/reg-site/`.

To look at a candidate projection without pinning it, put its
`projection-v1.json` and `badges/` in `.rc/data/` and a lock naming its hash
and source commit in `.rc/lock.json` (`.rc/` is ignored by git), then:

```sh
node src/build.mjs --data .rc/data --lock .rc/lock.json --out .rc/dist
node scripts/check-dist.mjs --dist .rc/dist --lock .rc/lock.json
node scripts/serve.mjs 4174 .rc/dist &
BASE=http://127.0.0.1:4174 DIST=.rc/dist node scripts/check-viewports.mjs
```

## How the data is bound

`projection.lock.json` pins the projection's `content_sha256`, its
reg-conformance source commit and the reg-platform commit that published
it. The build refuses to run when:

- the projection's content does not hash to its `content_sha256`,
- that hash is not the pinned one,
- the projection's contract is not `reg-projection` 1.1.x,
- the projection's guards failed,
- the projection allows conformance claims (contract 1.1 never does; a site
  that renders claims will be a new major version),
- a configuration shown as demonstrated or partial cites no record, or a
  record without bound evidence, or a record is marked bound without its
  artifact, results hash and scope,
- the summary counts the pages show disagree with the configurations or the
  guarantee records.

CI also fetches the projection from reg-platform at the pinned commit and
checks it hashes to the pin, then compares every badge the site ships with
reg-platform's, byte for byte (`scripts/verify-remote.mjs`); the deploy job
requires that pin. Push reg-platform first: until it is on GitHub, this
check fails.

To take a new projection: `npm run pin -- <reg-platform commit>`, then
`npm run build`, then commit `projection.lock.json` and `data/`.

## Output guards (`scripts/check-dist.mjs`)

- No affirmative claim wording in the site's own copy (certification,
  "REG-conformant", "conforme REG", "compliant"). Text quoted verbatim from
  reg-conformance is exempt.
- Every page's footer links the exact reg-conformance commit, and every
  page names the commit and the projection hash in its metadata.
- Every page except the 404 has its "what this does not establish" block.
- Preview builds carry the banner, with its whole text in the page's
  language, and `noindex` on every page. The browser checks also see the
  banner at the top of each page they visit.
- Each badge says what the projection says about its configuration (label,
  colour, title), in French and English, and the badges are exactly the five
  state badges plus one per admissible configuration.
- Every internal link and anchor resolves; no duplicate ids.
- Every admissible configuration has a profile skeleton, with no
  attestation; no other configuration has one.
- `sha256sums.txt` lists every other served file once, in byte order of the
  paths, with its sha256; `build.json` names the site commit (`site_commit`,
  read with git, `null` outside a repository) and whether the tree had local
  changes (`site_tree_clean`).

## Deploy (preview)

The custom domain is set in the repository's Settings → Pages, not by a
`CNAME` file: a deployment made by Actions does not read one, so the
artifact carries none. Deployment is manual only: Actions → preview → Run
workflow with `deploy` checked, then approval by the required reviewer of
the `github-pages` environment. Every deployment is a decision on an exact
commit. The procedure, the one-time configuration, the eleven
post-deployment checks (the `verify-live` workflow runs them, read-only)
and the log of deployments are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The `gate-check` workflow tests
the approval gate without publishing anything.

License: Apache-2.0.
