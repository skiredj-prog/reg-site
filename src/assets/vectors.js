(function () {
  "use strict";
  var form = document.querySelector("[data-filters]");
  if (!form) return;
  var rows = Array.prototype.slice.call(document.querySelectorAll("table.vectors tbody tr"));
  var count = document.querySelector("[data-count]");
  var empty = document.querySelector("[data-empty]");
  var table = document.querySelector("table.vectors");
  var tpl = form.getAttribute("data-count-tpl");
  var total = form.getAttribute("data-total");
  var KEYS = ["q", "category", "status", "result"];

  function apply() {
    var q = form.q.value.trim().toLowerCase();
    var f = { category: form.category.value, status: form.status.value, result: form.result.value };
    var n = 0;
    rows.forEach(function (r) {
      var ok = (!q || r.textContent.toLowerCase().indexOf(q) >= 0) &&
        (!f.category || r.dataset.category === f.category) &&
        (!f.status || r.dataset.status === f.status) &&
        (!f.result || r.dataset.result === f.result);
      r.hidden = !ok;
      if (ok) n++;
    });
    count.textContent = tpl.replace("{n}", n).replace("{total}", total);
    empty.hidden = n !== 0;
    table.hidden = n === 0;
    try {
      var u = new URL(location.href);
      KEYS.forEach(function (k) { var v = form[k].value; if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); });
      history.replaceState(null, "", u);
    } catch (e) {}
  }

  try {
    var p = new URL(location.href).searchParams;
    KEYS.forEach(function (k) { if (p.get(k)) form[k].value = p.get(k); });
  } catch (e) {}

  form.addEventListener("input", apply);
  form.addEventListener("change", apply);
  document.querySelector("[data-clear]").addEventListener("click", function () {
    KEYS.forEach(function (k) { form[k].value = ""; });
    apply();
    form.q.focus();
  });
  apply();
})();
