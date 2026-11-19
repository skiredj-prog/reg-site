// The configurator: four selects, the map as a shortcut, the result and the
// take-away, all rendered by cfg-render.js from the data the build embedded.
import { idOf, renderResult, renderTake, tag } from "./cfg-render.js";

const D = JSON.parse(document.getElementById("cfg-data").textContent);
const form = document.getElementById("cfg-form");
const out = document.getElementById("cfg-out");
const take = document.getElementById("cfg-take");
const status = document.getElementById("cfg-status");
const exportBtn = document.getElementById("cfg-export");
const map = document.getElementById("cfg-map");
const now = document.getElementById("cfg-now");
const selects = Object.fromEntries(D.axes.map((a) => [a.id, document.getElementById(`ax-${a.id}`)]));
const fmt = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const exportLabel = exportBtn.textContent;
out.setAttribute("tabindex", "-1");

function current() {
  return Object.fromEntries(D.axes.map((a) => [a.id, selects[a.id].value]));
}

function markOptions(c) {
  for (const a of D.axes) {
    for (const o of selects[a.id].options) {
      const probe = { ...c, [a.id]: o.value };
      const bad = D.configs[idOf(D, probe)].s === "inadmissible";
      const base = a.values.find((v) => v.value === o.value).label;
      o.textContent = bad ? `${base} — ${D.t.cfg_incompatible}` : base;
    }
  }
}

function show(id, { keep = null, announce = null, push = true } = {}) {
  const C = D.configs[id];
  for (const a of D.axes) selects[a.id].value = C.c[a.id];
  markOptions(C.c);
  out.innerHTML = renderResult(D, id, { mode: "app", keep });
  take.innerHTML = renderTake(D, id);
  now.innerHTML = tag(D, C.s);
  for (const td of map.querySelectorAll("td.cur")) td.classList.remove("cur");
  const cell = map.querySelector(`a[data-id="${id}"]`);
  if (cell) cell.parentElement.classList.add("cur");
  if (C.s === "inadmissible") {
    exportBtn.setAttribute("href", "#take-t");
    exportBtn.removeAttribute("download");
    exportBtn.setAttribute("aria-describedby", "take-t");
  } else {
    exportBtn.setAttribute("href", D.routes.profile.replace("{id}", id));
    exportBtn.setAttribute("download", `${id}.yaml`);
    exportBtn.removeAttribute("aria-describedby");
  }
  exportBtn.textContent = exportLabel;
  if (push) {
    const url = new URL(location.href);
    url.searchParams.set("c", id);
    history.replaceState(null, "", url);
  }
  if (announce) status.textContent = announce;
}

function announceFor(axis, id) {
  const a = D.axes.find((x) => x.id === axis);
  const v = a.values.find((x) => x.value === D.configs[id].c[axis]);
  return fmt(D.t.cfg_announce, { axis: a.label, value: v.label, state: D.state[D.configs[id].s] });
}

form.addEventListener("change", (e) => {
  const axis = e.target.name;
  if (!selects[axis]) return;
  const id = idOf(D, current());
  show(id, { keep: axis, announce: announceFor(axis, id) });
});

map.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-id]");
  if (!a) return;
  e.preventDefault();
  const id = a.getAttribute("data-id");
  show(id, { announce: fmt(D.t.cfg_announce, { axis: "", value: id, state: D.state[D.configs[id].s] }).replace(/^[:\s]+/, "") });
  // Where the map sits below the result, bring the result back into view.
  const top = out.getBoundingClientRect().top;
  if (top < 0 || top > window.innerHeight * 0.6) out.scrollIntoView({ block: "start" });
});

document.getElementById("cfg-reset").addEventListener("click", () => {
  show(D.defaultId, { announce: D.state[D.configs[D.defaultId].s] });
});

out.addEventListener("click", (e) => {
  const b = e.target.closest("[data-use]");
  if (!b) return;
  const id = b.getAttribute("data-use");
  show(id, { announce: `${id} : ${D.state[D.configs[id].s]}` });
  out.focus();
});

const asked = new URL(location.href).searchParams.get("c");
show(asked && D.configs[asked] ? asked : D.defaultId, { push: Boolean(asked && D.configs[asked]) });
