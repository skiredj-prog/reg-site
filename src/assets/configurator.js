(function () {
  "use strict";
  var root = document.querySelector("[data-configurator]");
  var dataEl = document.getElementById("cfg-data");
  if (!root || !dataEl) return;
  var D = JSON.parse(dataEl.textContent);
  var t = D.t;
  var axes = D.axes.map(function (a) { return a.id; });
  var selects = {};
  axes.forEach(function (a) { selects[a] = root.querySelector('[data-axis="' + a + '"]'); });
  var $ = function (sel) { return root.querySelector(sel); };
  var STORE = "reg-config";

  function idOf(cfg) { return axes.map(function (a) { return cfg[a]; }).join("__"); }
  function parse(id) {
    var parts = String(id || "").split("__");
    if (parts.length !== axes.length) return null;
    var cfg = {};
    axes.forEach(function (a, i) { cfg[a] = parts[i]; });
    return D.configs[id] ? cfg : null;
  }
  function current() {
    var cfg = {};
    axes.forEach(function (a) { cfg[a] = selects[a].value; });
    return cfg;
  }
  function valueLabel(axis, value) {
    var ax = D.axes.filter(function (x) { return x.id === axis; })[0];
    var v = ax && ax.values.filter(function (x) { return x.value === value; })[0];
    return v ? v.label : value;
  }
  function axisLabel(axis) {
    var ax = D.axes.filter(function (x) { return x.id === axis; })[0];
    return ax ? ax.label : axis;
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }

  // Mark options that would make the configuration inadmissible, holding
  // the other axes fixed. Text marker, not colour only; never disabled, so
  // the user can still see why.
  function annotate(cfg) {
    axes.forEach(function (a) {
      Array.prototype.forEach.call(selects[a].options, function (o) {
        var probe = Object.assign({}, cfg); probe[a] = o.value;
        var c = D.configs[idOf(probe)];
        var base = valueLabel(a, o.value);
        o.textContent = c && c.s === "inadmissible" && o.value !== cfg[a] ? base + " (" + t.cfg_incompatible + ")" : base;
      });
    });
  }

  // Admissible configurations at the smallest distance, changing the axes
  // the user did not just touch first.
  function nearest(cfg, touched) {
    var best = [];
    var bestScore = Infinity;
    Object.keys(D.configs).forEach(function (id) {
      if (D.configs[id].s === "inadmissible") return;
      var c = parse(id);
      var diff = axes.filter(function (a) { return c[a] !== cfg[a]; });
      var score = diff.length * 10 + (touched && diff.indexOf(touched) >= 0 ? 100 : 0);
      if (score < bestScore) { bestScore = score; best = [{ id: id, diff: diff }]; }
      else if (score === bestScore) best.push({ id: id, diff: diff });
    });
    return best.slice(0, 3);
  }

  function render(touched) {
    var cfg = current();
    var id = idOf(cfg);
    var c = D.configs[id];
    annotate(cfg);
    var state = c.s;
    var badge = $("[data-badge]");
    badge.src = state === "inadmissible" ? "/badges/state-inadmissible.svg" : "/badges/" + id + ".svg";
    badge.alt = "REG+ config: " + D.states[state];
    $("[data-state-label]").textContent = D.states[state];
    $("[data-state-help]").textContent = D.help[state];

    var bad = state === "inadmissible";
    $("[data-violations]").hidden = !bad;
    $("[data-admissible]").hidden = bad;

    if (bad) {
      var list = $("[data-violation-list]"); list.textContent = "";
      c.v.forEach(function (v) {
        var li = el("li");
        li.appendChild(el("code", null, v.id));
        li.appendChild(document.createTextNode(" " + (D.lang === "fr" ? v.d : axisLabel(v.field) + ": " + v.allowed.map(function (x) { return valueLabel(v.field, x); }).join(" / "))));
        list.appendChild(li);
      });
      var fixes = $("[data-fixes]"); fixes.textContent = "";
      nearest(cfg, touched).forEach(function (n) {
        var target = parse(n.id);
        var b = el("button", { type: "button", class: "btn" });
        b.textContent = t.cfg_use + " : " + n.diff.map(function (a) { return valueLabel(a, target[a]); }).join(" + ");
        if (D.lang !== "fr") b.textContent = b.textContent.replace(" : ", ": ");
        b.addEventListener("click", function () { apply(target); render(); announce(n.diff, target); selects[n.diff[0]].focus(); });
        fixes.appendChild(b);
      });
    } else {
      var recs = $("[data-records]"); recs.textContent = "";
      if (!c.r.length) recs.appendChild(el("p", null, t.cfg_records_none));
      c.r.forEach(function (rid) {
        var r = D.records[rid];
        var box = el("div", { class: "record" });
        var h = el("p", { class: "record-head" });
        h.appendChild(el("code", null, rid));
        h.appendChild(document.createTextNode(" " + r.name + " · "));
        h.appendChild(el("strong", null, r.bound ? t.cfg_record_bound : t.cfg_record_unbound));
        box.appendChild(h);
        if (r.problems.length) {
          var ul = el("ul", { class: "plain small" });
          r.problems.forEach(function (p) { ul.appendChild(el("li", null, p)); });
          box.appendChild(ul);
        }
        if (r.limits && r.limits.length) {
          box.appendChild(el("p", { class: "hint" }, t.cfg_limits + (D.lang === "fr" ? "\u00a0: " : ": ") + r.limits.join(D.lang === "fr" ? "\u00a0; " : "; ")));
        }
        recs.appendChild(box);
      });
      var md = "![REG+ config: " + D.states[state] + "](" + D.siteUrl + "/badges/" + id + ".svg)\n" +
        "<!-- reg-conformance@" + D.commit.slice(0, 12) + "; " + (D.lang === "fr" ? "état d'une configuration du catalogue, pas une attestation" : "state of a catalogue configuration, not an attestation") + " -->";
      $("[data-badge-md]").value = md;
    }

    var ev = $("[data-evidence]"); ev.textContent = "";
    D.axes.forEach(function (a) {
      var v = a.values.filter(function (x) { return x.value === cfg[a.id]; })[0];
      ev.appendChild(el("dt", null, a.label + " · " + v.label));
      var dd = el("dd");
      if (!v.evidence.length) dd.textContent = t.cfg_evidence_none;
      else v.evidence.forEach(function (e, i) { if (i) dd.appendChild(document.createTextNode(" ")); dd.appendChild(el("code", null, e)); });
      ev.appendChild(dd);
    });

    try {
      var u = new URL(location.href); u.searchParams.set("c", id);
      history.replaceState(null, "", u);
      localStorage.setItem(STORE, id);
    } catch (e) { /* storage blocked: the URL still carries the choice */ }
  }

  function apply(cfg) { axes.forEach(function (a) { selects[a].value = cfg[a]; }); }
  function announce(diff, cfg) {
    var s = $("[data-copy-status]");
    if (s) s.textContent = diff.map(function (a) { return t.cfg_changed.replace("{axis}", axisLabel(a)).replace("{value}", valueLabel(a, cfg[a])); }).join(" ");
  }

  // Initial value: URL, then last choice, then the default.
  var initial = null;
  try { initial = parse(new URL(location.href).searchParams.get("c")); } catch (e) {}
  if (!initial) { try { initial = parse(localStorage.getItem(STORE)); } catch (e) {} }
  if (!initial) initial = parse(D.defaultId);
  apply(initial);

  axes.forEach(function (a) { selects[a].addEventListener("change", function () { render(a); }); });
  $("[data-reset]").addEventListener("click", function () { apply(parse(D.defaultId)); render(); });

  function copy(text) {
    var status = $("[data-copy-status]");
    var done = function () { status.textContent = t.cfg_copied; };
    var failed = function () { status.textContent = t.cfg_copy_failed; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, failed);
    else failed();
  }
  root.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      copy(b.getAttribute("data-copy") === "md" ? $("[data-badge-md]").value : D.pageUrl + "?c=" + idOf(current()));
    });
  });

  render();
})();
