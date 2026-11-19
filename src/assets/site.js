// Shared behaviour: theme, narrow-screen menu, copy buttons, tabs.
(function () {
  "use strict";

  // Theme
  var themeBtn = document.querySelector("[data-theme-toggle]");
  function currentTheme() {
    var d = document.documentElement.dataset.theme;
    if (d) return d;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  // The button says what it will do: "Switch to light" in the dark theme.
  function labelTheme() {
    themeBtn.textContent = themeBtn.getAttribute(currentTheme() === "light" ? "data-to-dark" : "data-to-light");
  }
  if (themeBtn) {
    labelTheme();
    themeBtn.addEventListener("click", function () {
      var next = currentTheme() === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      labelTheme();
      try { localStorage.setItem("reg-theme", next); } catch (e) { /* private mode */ }
    });
  }

  // Menu (narrow screens only; the CSS shows the button below 768px)
  var menuBtn = document.querySelector(".menu-btn");
  var navWrap = document.getElementById("site-nav");
  if (menuBtn && navWrap) {
    menuBtn.addEventListener("click", function () {
      var open = menuBtn.getAttribute("aria-expanded") !== "true";
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      navWrap.classList.toggle("open", open);
      if (open) { var first = navWrap.querySelector("a"); if (first) first.focus(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && menuBtn.getAttribute("aria-expanded") === "true") {
        menuBtn.setAttribute("aria-expanded", "false");
        navWrap.classList.remove("open");
        menuBtn.focus();
      }
    });
  }

  // Copy: any button with data-copy="<id of the element holding the text>"
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy")); } catch (err) { reject(err); }
      document.body.removeChild(ta);
    });
  }
  window.regCopy = copyText;
  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-copy]") : null;
    if (!btn) return;
    var src = document.getElementById(btn.getAttribute("data-copy"));
    if (!src) return;
    var status = btn.parentNode.querySelector(".copy-status");
    copyText(src.textContent).then(function () {
      if (status) { status.textContent = btn.getAttribute("data-copied"); status.classList.add("ok"); }
    }, function () {
      if (status) { status.textContent = btn.getAttribute("data-failed"); status.classList.remove("ok"); }
      var r = document.createRange(); r.selectNodeContents(src);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    });
  });

  // Tabs: [data-tabs] holds a .tab-list of links to its .tab-panel sections.
  // Without JavaScript every panel shows and the links jump to them.
  var tabsRoot = document.querySelector("[data-tabs]");
  if (tabsRoot) {
    var links = Array.prototype.slice.call(tabsRoot.querySelectorAll("[data-tab]"));
    var panels = links.map(function (a) { return document.getElementById(a.getAttribute("data-tab")); });
    var list = tabsRoot.querySelector(".tab-list ul");
    list.setAttribute("role", "tablist");
    links.forEach(function (a, i) {
      a.parentNode.setAttribute("role", "presentation");
      a.setAttribute("role", "tab");
      a.id = "tab-" + a.getAttribute("data-tab");
      a.setAttribute("aria-controls", panels[i].id);
      panels[i].setAttribute("role", "tabpanel");
      panels[i].setAttribute("aria-labelledby", a.id);
      panels[i].setAttribute("tabindex", "-1");
    });
    function show(i, focusTab, scrollTo) {
      links.forEach(function (a, j) {
        var on = i === j;
        a.setAttribute("aria-selected", on ? "true" : "false");
        a.setAttribute("tabindex", on ? "0" : "-1");
        panels[j].hidden = !on;
      });
      if (focusTab) links[i].focus();
      if (scrollTo) { scrollTo.scrollIntoView(); }
    }
    function fromHash() {
      var id = decodeURIComponent(location.hash.slice(1));
      if (!id) return show(0);
      var el = document.getElementById(id);
      for (var i = 0; i < panels.length; i++) {
        if (panels[i] === el || (el && panels[i].contains(el))) return show(i, false, el === panels[i] ? null : el);
      }
      show(0);
    }
    links.forEach(function (a, i) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        history.replaceState(null, "", "#" + a.getAttribute("data-tab"));
        show(i);
      });
      a.addEventListener("keydown", function (e) {
        var k = e.key, n = links.length, j = null;
        if (k === "ArrowRight") j = (i + 1) % n;
        else if (k === "ArrowLeft") j = (i - 1 + n) % n;
        else if (k === "Home") j = 0;
        else if (k === "End") j = n - 1;
        if (j === null) return;
        e.preventDefault();
        history.replaceState(null, "", "#" + links[j].getAttribute("data-tab"));
        show(j, true);
      });
    });
    window.addEventListener("hashchange", fromHash);
    fromHash();
  }
})();
