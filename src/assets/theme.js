(function () {
  "use strict";
  var b = document.querySelector("[data-theme-toggle]");
  if (!b) return;
  function now() {
    var d = document.documentElement.dataset.theme;
    if (d) return d;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  b.setAttribute("aria-pressed", now() === "light" ? "true" : "false");
  b.addEventListener("click", function () {
    var next = now() === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    b.setAttribute("aria-pressed", next === "light" ? "true" : "false");
    try { localStorage.setItem("reg-theme", next); } catch (e) {}
  });
})();
