# reg-site

The presentation layer of REG: a static site, French and English, built
from one pinned projection published by
[reg-platform](https://github.com/skiredj-prog/reg-platform). It reads
nothing else.

Pages: home (counts at the source commit), REG+ configurator, vector list,
data source (commit, contract, fingerprint, guard findings, records).

## Build

```sh
npm run build          # preview build: banner, noindex, robots Disallow
npm run build:public   # same content without the preview banner
npm run preview        # serves dist/ on http://127.0.0.1:4173
npm run check:viewports   # needs playwright; 375px and 1280px, both themes
```

No dependencies for the build itself (Node ≥ 20).

## How the data is bound

`projection.lock.json` pins the projection's `content_sha256`, its
reg-conformance source commit and the reg-platform commit that published
it. The build refuses to run when:

- the projection's content does not hash to its `content_sha256`,
- that hash is not the pinned one,
- the projection's guards failed,
- the projection allows conformance claims (contract v1.0 never does; a site
  that renders claims will be a new major version).

CI also fetches the projection from reg-platform at the pinned commit and
checks it hashes to the pin (`scripts/verify-remote.mjs`); the deploy job
requires that pin.

To take a new projection: `npm run pin -- <reg-platform commit>`, then
`npm run build`, then commit `projection.lock.json` and `data/`.

## Output guards (`scripts/check-dist.mjs`)

- No affirmative claim wording anywhere in the site's own copy
  (certification, "REG-conformant", "conforme REG", "compliant"). Text quoted
  verbatim from reg-conformance is exempt.
- Every page's footer links the exact reg-conformance commit.
- Preview builds carry the banner and `noindex` on every page.
- Every internal link resolves.

## Deploy (preview)

`public/CNAME` is `reg.tenirlabs.cc`. Deployment is manual only: Actions →
preview → Run workflow → deploy. See `HANDOVER.md` in the project folder
for the DNS record.

License: Apache-2.0.
