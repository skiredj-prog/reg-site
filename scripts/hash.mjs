import { createHash } from "node:crypto";
export function canonical(v) {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}
export function contentHash(p) {
  const body = { ...p };
  delete body.content_sha256;
  delete body.generated_at;
  return createHash("sha256").update(canonical(body), "utf8").digest("hex");
}
