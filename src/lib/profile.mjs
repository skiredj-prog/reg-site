// A REG+ profile skeleton in the format of reg-conformance's profiles/.
// Configuration and invariants come from the catalogue; attestations stay
// empty. The file attests nothing and says so.

const STATE_EN = {
  demonstrated: "demonstrated", partial: "partial", not_evaluated: "not evaluated",
  refuted: "refuted", inadmissible: "not admissible",
};

export function profileYaml(M, c) {
  const P = M.P;
  const inv = M.invariantsFor(c);
  const ev = M.evidenceFor(c);
  const pad = (s, n) => s + " ".repeat(Math.max(1, n - s.length));
  const invW = Math.max(0, ...inv.map((i) => i.name.length)) + 4;
  const capW = Math.max(0, ...ev.map((e) => (e.capability_id || "").length)) + 2;
  const lines = [
    `# REG+ profile skeleton for ${c.id}`,
    `# From reg-conformance at commit ${P.source.commit}`,
    `# (${P.contract} ${P.contract_version}, content sha256 ${P.content_sha256}).`,
    "#",
    "# This file attests nothing: its attestations list is empty. At that commit",
    `# the catalogue gives this configuration the state "${STATE_EN[c.state]}".`,
    "#",
    "# To check its structure, copy it into profiles/ of reg-conformance at that",
    "# commit and run:  python3 tools/validate_profiles.py",
    "",
    `profile_id: "${c.id.replace(/__/g, "-")}"   # rename to your system`,
    'profile_version: "0.1.0"',
    "description: >",
    "  TODO: the system this profile describes, in one paragraph.",
    "",
    "config:",
    ...M.AXES.map((ax) => `  ${ax}: "${c.config[ax]}"`),
    "",
  ];
  if (c.config.CONCURRENCY === "distributed-consensus") {
    lines.push(
      "# tools/validate_profiles.py requires a fault model for distributed-consensus",
      "# (crash-stop only, quorum equal to a majority). Declare yours:",
      "# fault_model:",
      "#   crash: ",
      "#   byzantine: 0",
      "#   omission: 0",
      "#   quorum: ",
      "#   total_nodes: ",
      "",
    );
  }
  lines.push(
    "# Invariants of catalog/capabilities-v1.yaml whose applies_to names one of",
    "# this configuration's capabilities.",
    inv.length ? "invariants:" : "invariants: []",
    ...inv.map((i) => `  - ${pad(`"${i.name}"`, invW)}# ${i.id}${i.scope ? `, ${i.scope}` : ""}`),
    "",
    "# Evidence the catalogue requires for each capability. Add one attestation",
    "# per piece of evidence bound to a file (see the examples in profiles/).",
    ...ev.map((e) => `#   ${pad(e.capability_id || e.value, capW)}${e.required_evidence?.length ? e.required_evidence.join(", ") : "(none required)"}`),
    "attestations: []",
    "",
  );
  return lines.join("\n");
}
