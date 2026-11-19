// Assemble the statement CLAIMS.md asks for. Validation on blur, errors in
// the hint slot, cleared on focus. The draft stays in this browser.
(function () {
  "use strict";
  var form = document.getElementById("cite-form");
  if (!form) return;
  var I = JSON.parse(document.getElementById("cite-i18n").textContent);
  var out = document.getElementById("cite-text");
  var status = document.getElementById("cite-status");
  var KEY = "reg-cite-draft";
  var OUTCOMES = ["PASS", "FAIL", "INCONCLUSIVE", "NOT_APPLICABLE", "ADAPTER_REQUIRED", "IMPLEMENTATION_GAP"];
  var WORD = { FAIL: "failed", INCONCLUSIVE: "inconclusive", NOT_APPLICABLE: "not applicable", ADAPTER_REQUIRED: "adapter required", IMPLEMENTATION_GAP: "implementation gap" };
  var SETS = [["vectors", "REG vectors"], ["probes", "effect probes"], ["checks", "property checks"]];
  var HEX = /^[0-9a-f]{7,40}$/i;
  var defaults = {};
  var keepOnFocus = false; // true while the submit moves focus to the first error
  Array.prototype.forEach.call(form.elements, function (el) {
    if (el.name) defaults[el.name] = el.type === "checkbox" ? el.checked : el.type === "radio" ? (el.checked ? el.value : defaults[el.name]) : el.value;
  });

  var el = function (name) { return form.elements[name]; };
  var val = function (name) { var e = el(name); return e ? String(e.value || "").trim() : ""; };

  function rule(name) {
    var v = val(name);
    switch (name) {
      // Each message says what to write; an empty field gets the same one.
      case "subject": return v ? null : I.subject;
      case "subject_commit":
      case "reg_commit": return HEX.test(v) ? null : I.hex;
      case "bundle": return /^https?:\/\/\S+$/.test(v) ? null : I.url;
      case "bundle_sha": return /^[0-9a-f]{64}$/i.test(v) ? null : I.sha;
      case "reg_version": return el("third").checked && !v ? I.regVersion : null;
      default:
        if (/^(vectors|probes|checks)\./.test(name)) return v === "" || /^\d+$/.test(v) ? null : I.count;
        return null;
    }
  }
  function hintOf(input) {
    var id = (input.getAttribute("aria-describedby") || "").split(" ")[0];
    return id ? document.getElementById(id) : null;
  }
  function showError(input, msg) {
    input.setAttribute("aria-invalid", "true");
    var h = hintOf(input);
    if (h) { h.textContent = msg; h.classList.add("err"); }
    else input.setAttribute("title", msg);
  }
  function clearError(input) {
    input.removeAttribute("aria-invalid");
    input.removeAttribute("title");
    var h = hintOf(input);
    if (h) { h.textContent = h.getAttribute("data-hint") || ""; h.classList.remove("err"); }
  }
  function check(input) {
    var msg = rule(input.name);
    if (msg) showError(input, msg); else clearError(input);
    return !msg;
  }

  function counts(set) {
    var c = {}, total = 0;
    OUTCOMES.forEach(function (o) {
      var v = val(set + "." + o);
      var n = /^\d+$/.test(v) ? parseInt(v, 10) : 0;
      c[o] = n; total += n;
    });
    c.total = total;
    return c;
  }
  function phrase(name, c) {
    if (!c.total) return null;
    var others = OUTCOMES.filter(function (o) { return o !== "PASS" && c[o]; }).map(function (o) { return c[o] + " " + WORD[o]; });
    return c.PASS + " of " + c.total + " " + name + " passed" + (others.length ? " (" + others.join(", ") + ")" : "");
  }
  function level() {
    var r = form.querySelector("input[name=level]:checked");
    return r ? r.value : "2";
  }
  function text() {
    var subject = val("subject"), sc = val("subject_commit"), rc = val("reg_commit");
    SETS.forEach(function (s) { document.getElementById("tot-" + s[0]).textContent = String(counts(s[0]).total); });
    if (!subject || !sc || !rc) return null;
    var parts = SETS.map(function (s) { return phrase(s[1], counts(s[0])); }).filter(Boolean);
    var q = subject + (val("version") ? " " + val("version") : "") + " at commit " + sc +
      ", run with reg-conformance at " + rc + ", evidence level " + level() + ": " +
      (parts.length ? parts.join("; ") : "no test counted") + ".";
    if (el("flag").checked) q += " At least one test went forward on a FLAG whose condition was not observed.";
    if (el("provisional").checked) q += " Provisional: the port was not written or reviewed by the runtime's owner.";
    var b = val("bundle"), sha = val("bundle_sha");
    q += " Bundle: " + (b || "<link>") + (sha ? " (sha256 " + sha + ")" : "") + ".";
    if (el("third").checked) {
      q = "Assessed against REG Conformance " + (val("reg_version") || "<version>") + " at commit " + rc + ", evidence level " + level() + ". " + q;
    }
    return q;
  }
  function refresh() {
    var t = text();
    out.textContent = t || I.empty;
    // The assembled text is English, as CLAIMS.md is; the prompt is not.
    if (t) out.parentNode.setAttribute("lang", "en"); else out.parentNode.removeAttribute("lang");
  }
  function save() {
    var d = {};
    Array.prototype.forEach.call(form.elements, function (e) {
      if (!e.name) return;
      if (e.type === "checkbox") d[e.name] = e.checked;
      else if (e.type === "radio") { if (e.checked) d[e.name] = e.value; }
      else d[e.name] = e.value;
    });
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (err) { /* storage unavailable */ }
  }
  function load(d) {
    Array.prototype.forEach.call(form.elements, function (e) {
      if (!e.name || !(e.name in d)) return;
      if (e.type === "checkbox") e.checked = Boolean(d[e.name]);
      else if (e.type === "radio") e.checked = e.value === d[e.name] && !e.disabled;
      else e.value = d[e.name];
    });
  }

  try { var saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) load(saved); } catch (err) { /* ignore */ }
  refresh();

  form.addEventListener("focusout", function (e) {
    var t = e.target;
    if (!t.name || t.type === "checkbox" || t.type === "radio") return;
    t.dataset.touched = "1";
    check(t);
  });
  form.addEventListener("focusin", function (e) {
    if (keepOnFocus) return;
    if (e.target.getAttribute && e.target.getAttribute("aria-invalid") === "true") clearError(e.target);
  });
  form.addEventListener("input", function (e) {
    if (e.target.getAttribute && e.target.getAttribute("aria-invalid") === "true") clearError(e.target);
    status.textContent = ""; status.classList.remove("ok");
    refresh(); save();
  });
  form.addEventListener("change", function (e) {
    if (e.target.name === "third" && !e.target.checked) clearError(el("reg_version"));
    refresh(); save();
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var first = null;
    Array.prototype.forEach.call(form.elements, function (input) {
      if (!input.name || input.type === "checkbox" || input.type === "radio" || input.tagName === "BUTTON" || input.tagName === "OUTPUT") return;
      if (!check(input) && !first) first = input;
    });
    if (first) {
      status.textContent = I.invalid; status.classList.remove("ok");
      // The message stays on the field the visitor is sent to; it clears
      // when they type.
      keepOnFocus = true; first.focus(); keepOnFocus = false;
      first.scrollIntoView({ block: "center" });
      return;
    }
    var t = text();
    (window.regCopy ? window.regCopy(t) : Promise.reject()).then(function () {
      status.textContent = I.copied; status.classList.add("ok");
    }, function () {
      status.textContent = I.failed; status.classList.remove("ok");
      var r = document.createRange(); r.selectNodeContents(out);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    });
  });
  // Clearing loses what was typed: a form that differs from its defaults asks
  // first, in a dialog that names the draft; "Keep the draft" has the focus
  // and Escape keeps it too.
  var resetBtn = document.getElementById("cite-reset");
  var dlg = document.getElementById("cite-confirm");
  function dirty() {
    return Array.prototype.some.call(form.elements, function (e) {
      if (!e.name || e.tagName === "BUTTON" || e.tagName === "OUTPUT") return false;
      if (e.type === "checkbox") return e.checked !== Boolean(defaults[e.name]);
      if (e.type === "radio") return e.checked && e.value !== defaults[e.name];
      return e.value !== (defaults[e.name] || "");
    });
  }
  function clearAll() {
    try { localStorage.removeItem(KEY); } catch (err) { /* ignore */ }
    Array.prototype.forEach.call(form.elements, function (e) {
      if (!e.name) return;
      if (e.type === "checkbox") e.checked = Boolean(defaults[e.name]);
      else if (e.type === "radio") e.checked = e.value === defaults[e.name];
      else if (e.tagName !== "BUTTON" && e.tagName !== "OUTPUT") e.value = defaults[e.name] || "";
      if (e.getAttribute && e.getAttribute("aria-invalid")) clearError(e);
    });
    refresh();
    status.textContent = I.cleared; status.classList.remove("ok");
  }
  resetBtn.addEventListener("click", function () {
    if (!dirty()) { clearAll(); return; }
    if (dlg && typeof dlg.showModal === "function") dlg.showModal();
    else if (window.confirm(I.confirm)) clearAll();
  });
  if (dlg) {
    dlg.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-dlg]") : null;
      if (b) dlg.close(b.getAttribute("data-dlg"));
    });
    dlg.addEventListener("close", function () {
      if (dlg.returnValue === "clear") clearAll();
      dlg.returnValue = "";
      resetBtn.focus();
    });
  }
})();
