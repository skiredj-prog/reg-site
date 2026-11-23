# Deployment

reg-site is a static site built by GitHub Actions and served by GitHub
Pages. This page says how a build becomes a deployment, what has to be in
place first, how a deployment is verified, how to go back, and which
deployments were made.

Nothing here is automatic. A deployment is a decision of the release
controller on an exact commit, taken at the approval gate of the
`github-pages` environment. A green CI run, a merge or a configuration
change publishes nothing.

## Where the site is served

| Name | State | What is served |
| --- | --- | --- |
| `https://preview.reg.tenirlabs.cc/` | deployed (see the log below) | preview build at base path `/`: banner on every page, `noindex, nofollow`, `robots.txt` disallows all, no copy snippets in the configurator |
| `https://reg.tenirlabs.cc/` | reserved, not configured | nothing: no DNS record; the CI default origin only |
| `https://skiredj-prog.github.io/reg-site/` | redirect | GitHub redirects a project site to its custom domain |

`noindex` and `robots.txt` are indexing hints, not access control: a
preview is reachable by anyone who has its URL. A public build
(`npm run build:public`) is a different object and needs its own decision.

## How publication works

The `preview` workflow (`.github/workflows/preview.yml`) has three jobs.

1. `build`, on every push and pull request: builds and checks the site for
   both base paths, `/` and `/reg-site/`, with `check-dist`, `verify-remote`
   and the browser checks at 375 px and 1280 px. It deploys nothing.
2. `pages`, on manual dispatch only: builds the artifact for the `base` and
   `site` inputs, requires that the pinned projection match reg-platform
   byte for byte (`REQUIRE_PLATFORM_PIN=1`), runs the same checks and
   uploads the Pages artifact.
3. `deploy`, on manual dispatch with `deploy` checked only: waits for the
   required reviewer of the `github-pages` environment, then runs
   `actions/deploy-pages@v4`. This step, and only this step, publishes.

The `gate-check` workflow (`.github/workflows/gate-check.yml`) declares the
same environment, holds only `contents: read`, never calls
`actions/deploy-pages` and prints one line. It exists to test the approval
gate: dispatch it from `main`, wait for "Review pending deployments", then
Reject. The run fails and nothing is published. Never test the gate by
dispatching `preview` with `deploy` checked: an approval by mistake would
publish the site.

## One-time configuration

Done by the release controller on 23 November 2026, in this order. None of
these steps publishes content.

| Step | Where | Setting |
| --- | --- | --- |
| Domain ownership | GitHub profile → Settings → Pages → Add a domain | `reg.tenirlabs.cc` verified by the TXT record GitHub displays (`_github-pages-challenge-<user>.reg.tenirlabs.cc`); the TXT record stays in place |
| DNS | registrar zone of `tenirlabs.cc` | `preview.reg` CNAME `skiredj-prog.github.io.`; nothing else changed |
| Pages | reg-site → Settings → Pages | Source = GitHub Actions; custom domain = `preview.reg.tenirlabs.cc`; wait for "DNS check successful" and the certificate; Enforce HTTPS |
| Environment protection | reg-site → Settings → Environments → `github-pages` | Required reviewer; deployment branches = `main` only. "Prevent self-review" is off: the gate is a manual authorization by the release controller, not an independent review |
| Gate test | Actions → gate-check → Run workflow from `main` | Run stopped at the gate and was rejected; nothing deployed |

Why `reg.tenirlabs.cc` is the verified domain: GitHub's verification covers
the verified domain and its immediate subdomains only. `preview.reg` is one
level below `reg.tenirlabs.cc` and two below `tenirlabs.cc`, so verifying
`tenirlabs.cc` alone would not protect it.

Before the first deployment, a configured Pages site answers 404 from
GitHub's edge cache and no `http://` redirect: that is the expected state,
not a fault.

## Deploying

1. **Decision.** The release controller names the exact commit, at the head
   of `main` (the environment accepts deployments from `main` only), and
   gives an explicit GO for deployment. A GO for configuration or for a
   merge is not a GO for deployment.
2. **Preconditions.** CI green on that commit for both base paths;
   `verify-remote` passing with the platform pin; the configuration above
   in place; no conflict on the DNS name.
3. **Expected hashes.** On that commit, `SITE_BASE=/
   SITE_URL=https://preview.reg.tenirlabs.cc npm run build`, then the
   sha256 of every file under `dist/`, kept outside the repository for the
   integrity test below.
4. **Dispatch.** Actions → preview → Run workflow, branch `main`, `deploy`
   checked, `base` = `/`, `site` = `https://preview.reg.tenirlabs.cc`.
5. **Approval.** The `deploy` job waits under "Review pending deployments".
   Approve to publish; Reject fails the run and publishes nothing.
6. **Propagation.** GitHub Pages serves with `Cache-Control: max-age=600`.
   Responses cached before publication can persist up to ten minutes at an
   edge node. Wait ten minutes after the first conforming `build.json`
   response before verifying.
7. **Verification and record.** Run the checks below from a machine that can
   reach the host, keep the report with a hash list of its files, and add a
   line to the log at the end of this page. The deployment is complete only
   when the record exists.

## Verifying a deployment

Eleven read-only checks, run against the served site.

| # | Check | What passes |
| --- | --- | --- |
| 1 | DNS | the host resolves through the CNAME to GitHub Pages addresses |
| 2 | Transport | `http://` answers 301 to the `https://` root; `https://` answers 200; TLS 1.2 or 1.3 with a trusted certificate whose SAN is the host |
| 3 | Redirects | the project-site path redirects to the preview root; no other name is affected |
| 4 | Integrity | the sha256 of every served file equals the one from an independent build of the same commit (same `SITE_BASE` and `SITE_URL`) |
| 5 | Data | `projection-v1.json`, every badge and every profile skeleton are identical to the build; `build.json` carries the expected `preview`, `base`, `site`, commits and page count |
| 6 | Not found | an unknown path answers 404 with the body of `404.html` |
| 7 | Browser | `BASE=<origin> npm run check:viewports` passes against the live site; a page load records no console error and no failed request |
| 8 | Metadata | canonical, `robots` meta and hreflang links match the origin; `robots.txt` disallows all for a preview |
| 9 | Claims wording | follows from check 4: the identical build passed `check-dist`, which refuses affirmative claim wording |
| 10 | Third parties | the browser contacts the site's host only |
| 11 | Cache | `Cache-Control` and `Age` recorded, no threshold |

Label each fact as observed or inferred in the report. Replay checks 4 to 8
after any redeployment.

## Going back

There is no rollback button. To restore an earlier state, revert on `main`
(a reviewed commit) and deploy again with the procedure above. To stop
serving altogether, Settings → Pages → Unpublish site: a public,
hard-to-undo step that needs its own decision, after which the custom
domain, the DNS check and the certificate have to be set up again.

## Log

Newest first. Times in UTC.

| Date | Commit | Run | Base and origin | Result |
| --- | --- | --- | --- | --- |
| 2026-11-23 07:38 | `33a12fb` | [45130223442](https://github.com/skiredj-prog/reg-site/actions/runs/45130223442) | `/`, `https://preview.reg.tenirlabs.cc` | first publication; approved at the gate by the release controller; the eleven checks passed between 08:23 and 08:39 UTC from the release controller's workstation, 630 of 630 files identical to an independent build of the commit |
| 2026-11-23, 06:23 to 06:53 | `33a12fb` | 45123811382 (`gate-check`) | none | gate test: stopped at the gate, rejected, nothing deployed |
