// Vector list: registry scope, search, one Filters panel with chips, sort,
// pagination, all kept in the URL. Without JavaScript every row shows.
(function () {
  "use strict";
  var I = JSON.parse(document.getElementById("v-i18n").textContent);
  var tbody = document.getElementById("v-rows");
  var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
  var q = document.getElementById("vq");
  var fBtn = document.getElementById("vf-btn");
  var panel = document.getElementById("vf-panel");
  var chips = document.getElementById("vf-chips");
  var count = document.getElementById("v-count");
  var empty = document.getElementById("v-empty");
  var prev = document.getElementById("pg-prev");
  var next = document.getElementById("pg-next");
  var range = document.getElementById("pg-range");
  var segs = Array.prototype.slice.call(document.querySelectorAll(".seg-b"));
  var sorts = Array.prototype.slice.call(document.querySelectorAll(".sort"));
  var PER = 25;
  var RES_ORDER = ["PASS", "FAIL", "INCONCLUSIVE", "NOT_APPLICABLE", "ADAPTER_REQUIRED", "IMPLEMENTATION_GAP", "NOT_IN_PERIMETER", "null", "none"];
  var GROUPS = ["idx", "fam", "res"];
  var fmt = function (s, v) { return String(s).replace(/\{(\w+)\}/g, function (_, k) { return v[k] == null ? "" : String(v[k]); }); };

  var st = { reg: "vector", q: "", f: { idx: [], fam: [], res: [] }, sort: "order", dir: 1, page: 1 };

  function readUrl() {
    var u = new URL(location.href);
    var r = u.searchParams.get("r");
    if (r && segs.some(function (b) { return b.dataset.reg === r; })) st.reg = r;
    st.q = u.searchParams.get("q") || "";
    GROUPS.forEach(function (g) { var v = u.searchParams.get(g); st.f[g] = v ? v.split(",") : []; });
    var s = u.searchParams.get("sort");
    if (s === "res" || s === "-res" || s === "-order") { st.sort = s.replace("-", ""); st.dir = s[0] === "-" ? -1 : 1; }
    st.page = Math.max(1, parseInt(u.searchParams.get("p") || "1", 10) || 1);
  }
  function writeUrl() {
    var u = new URL(location.href);
    var set = function (k, v) { if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); };
    set("r", st.reg === "vector" ? "" : st.reg);
    set("q", st.q);
    GROUPS.forEach(function (g) { set(g, st.f[g].join(",")); });
    set("sort", st.sort === "order" && st.dir === 1 ? "" : (st.dir < 0 ? "-" : "") + st.sort);
    set("p", st.page > 1 ? String(st.page) : "");
    history.replaceState(null, "", u);
  }

  function matches(tr) {
    if (tr.dataset.reg !== st.reg) return false;
    if (st.q) {
      var words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) if (tr.dataset.q.indexOf(words[i]) < 0) return false;
    }
    if (st.f.idx.length && st.f.idx.indexOf(tr.dataset.idx) < 0) return false;
    if (st.f.fam.length && st.f.fam.indexOf(tr.dataset.fam) < 0) return false;
    if (st.f.res.length && st.f.res.indexOf(tr.dataset.res) < 0) return false;
    return true;
  }

  function render() {
    var scope = rows.filter(function (tr) { return tr.dataset.reg === st.reg; });
    var hit = rows.filter(matches);
    hit.sort(function (a, b) {
      var d = st.sort === "res"
        ? RES_ORDER.indexOf(a.dataset.res) - RES_ORDER.indexOf(b.dataset.res) || a.dataset.order - b.dataset.order
        : a.dataset.order - b.dataset.order;
      return d * st.dir;
    });
    var pages = Math.max(1, Math.ceil(hit.length / PER));
    if (st.page > pages) st.page = pages;
    var from = (st.page - 1) * PER;
    var shown = hit.slice(from, from + PER);
    // Shown rows first, in order, so the first visible row is the first child.
    rows.forEach(function (tr) { tr.hidden = true; });
    shown.forEach(function (tr) { tr.hidden = false; tbody.appendChild(tr); });
    rows.forEach(function (tr) { if (tr.hidden) tbody.appendChild(tr); });
    count.textContent = fmt(I.count, { n: hit.length, total: scope.length });
    empty.hidden = hit.length > 0;
    range.textContent = hit.length ? fmt(I.range, { a: from + 1, b: from + shown.length, n: hit.length }) : fmt(I.range, { a: 0, b: 0, n: 0 });
    prev.setAttribute("aria-disabled", st.page <= 1 ? "true" : "false");
    next.setAttribute("aria-disabled", st.page >= pages ? "true" : "false");
    segs.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.reg === st.reg ? "true" : "false"); });
    sorts.forEach(function (b) {
      var th = b.closest("th");
      var on = b.dataset.sort === st.sort;
      th.setAttribute("aria-sort", on ? (st.dir > 0 ? "ascending" : "descending") : "none");
      b.querySelector(".sort-i").textContent = on ? (st.dir > 0 ? "↑" : "↓") : "";
    });
    var n = GROUPS.reduce(function (a, g) { return a + st.f[g].length; }, 0);
    fBtn.textContent = n ? fmt(I.filtersN, { n: n }) : I.filters;
    chips.innerHTML = "";
    GROUPS.forEach(function (g) {
      st.f[g].forEach(function (v) {
        var label = I.groups[g] + (document.documentElement.lang === "fr" ? "\u00a0: " : ": ") + ((I.labels[g] && I.labels[g][v]) || v);
        var c = document.createElement("button");
        c.type = "button"; c.className = "chip";
        c.setAttribute("aria-label", fmt(I.remove, { f: label }));
        c.innerHTML = "<span></span><span aria-hidden=\"true\">×</span>";
        c.firstChild.textContent = label;
        c.addEventListener("click", function () { st.f[g] = st.f[g].filter(function (x) { return x !== v; }); syncBoxes(); st.page = 1; update(); });
        chips.appendChild(c);
      });
    });
    if (n) {
      var all = document.createElement("button");
      all.type = "button"; all.className = "btn link"; all.textContent = I.clearAll;
      all.addEventListener("click", clearAll);
      chips.appendChild(all);
    }
  }
  function update() { render(); writeUrl(); }
  function syncBoxes() {
    Array.prototype.forEach.call(panel.querySelectorAll("input[type=checkbox]"), function (box) {
      box.checked = st.f[box.name].indexOf(box.value) >= 0;
    });
  }
  function clearAll() {
    st.q = ""; q.value = ""; GROUPS.forEach(function (g) { st.f[g] = []; }); syncBoxes(); st.page = 1; update();
  }

  readUrl();
  q.value = st.q;
  syncBoxes();
  render();

  q.addEventListener("input", function () { st.q = q.value.trim(); st.page = 1; update(); });
  fBtn.addEventListener("click", function () {
    var open = panel.hidden;
    panel.hidden = !open;
    fBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { var first = panel.querySelector("input"); if (first) first.focus(); }
  });
  panel.addEventListener("change", function (e) {
    var box = e.target;
    if (!box.name || !st.f[box.name]) return;
    var list = st.f[box.name].filter(function (x) { return x !== box.value; });
    if (box.checked) list.push(box.value);
    st.f[box.name] = list; st.page = 1; update();
  });
  segs.forEach(function (b) { b.addEventListener("click", function () { st.reg = b.dataset.reg; st.page = 1; update(); }); });
  sorts.forEach(function (b) {
    b.addEventListener("click", function () {
      if (st.sort === b.dataset.sort) st.dir = -st.dir; else { st.sort = b.dataset.sort; st.dir = 1; }
      update();
    });
  });
  prev.addEventListener("click", function () { if (st.page > 1) { st.page--; update(); count.scrollIntoView({ block: "nearest" }); } });
  next.addEventListener("click", function () { st.page++; update(); count.scrollIntoView({ block: "nearest" }); });
  document.querySelector("[data-clear]").addEventListener("click", clearAll);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    e.preventDefault(); q.focus();
  });
})();
