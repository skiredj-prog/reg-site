// CI: the pinned projection must be exactly what reg-platform publishes at
// the pinned commit. Binds the site to the platform, not to a local file.
import { readFileSync } from "node:fs";
import { contentHash } from "./hash.mjs";

const lock = JSON.parse(readFileSync(new URL("../projection.lock.json", import.meta.url)));
if (!lock.platform_commit) {
  console.log("::warning::platform_commit is not pinned yet; run npm run pin -- <reg-platform commit>");
  process.exit(process.env.REQUIRE_PLATFORM_PIN ? 1 : 0);
}
const url = `https://raw.githubusercontent.com/skiredj-prog/reg-platform/${lock.platform_commit}/projection/projection-v1.json`;
const res = await fetch(url);
if (!res.ok) { console.error(`cannot fetch ${url}: ${res.status}`); process.exit(1); }
const h = contentHash(await res.json());
if (h !== lock.content_sha256) { console.error(`reg-platform publishes ${h}, the site pins ${lock.content_sha256}`); process.exit(1); }
console.log(`pinned projection ${h.slice(0, 12)} matches reg-platform@${lock.platform_commit.slice(0, 12)}`);
