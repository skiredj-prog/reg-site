// Verify page: download the manifest, then every file it lists, bypassing
// the cache, and compare each sha256 with the manifest. Reads this site
// only; sends nothing.
(function () {
  "use strict";
  var root = document.getElementById("vrun");
  if (!root) return;
  var I = JSON.parse(document.getElementById("vrun-i18n").textContent);
  var base = root.getAttribute("data-base");
  var manifestName = root.getAttribute("data-manifest");
  var go = document.getElementById("vrun-go");
  var prog = document.getElementById("vrun-prog");
  var bar = document.getElementById("vrun-bar");
  var label = document.getElementById("vrun-label");
  var res = document.getElementById("vrun-res");
  var detail = document.getElementById("vrun-detail");
  var mhash = document.getElementById("vrun-mhash");
  var badList = document.getElementById("vrun-bad");
  var LINE = /^([0-9a-f]{64}) {2}(.+)$/;
  var CONCURRENCY = 6;
  var running = false;

  function fmt(s, v) { return s.replace(/\{(\w+)\}/g, function (_, k) { return v[k] == null ? "" : String(v[k]); }); }
  function num(n, d) { return Number(n).toLocaleString(I.locale, d == null ? {} : { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function hex(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
    return s;
  }
  function url(path) { return base + path.split("/").map(encodeURIComponent).join("/"); }
  function get(path) {
    return fetch(url(path), { cache: "no-store", credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.arrayBuffer();
    });
  }
  function digest(buf) { return crypto.subtle.digest("SHA-256", buf).then(hex); }

  function finish(text) {
    running = false;
    go.removeAttribute("aria-disabled");
    go.textContent = I.again;
    prog.hidden = true;
    res.textContent = text;
  }

  go.addEventListener("click", function () {
    if (running) return;
    if (!window.isSecureContext || !window.crypto || !crypto.subtle) { res.textContent = I.crypto; return; }
    running = true;
    go.setAttribute("aria-disabled", "true");
    detail.hidden = true;
    badList.textContent = "";
    res.textContent = "";
    var t0 = Date.now();
    var bytes = 0;
    get(manifestName).then(function (buf) {
      bytes += buf.byteLength;
      return digest(buf).then(function (h) {
        var text = new TextDecoder().decode(buf);
        var rows = [];
        var lines = text.split("\n");
        if (lines[lines.length - 1] === "") lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var m = LINE.exec(lines[i]);
          if (!m) throw new Error("line " + (i + 1));
          rows.push({ sha: m[1], path: m[2] });
        }
        if (!rows.length) throw new Error("empty");
        return { hash: h, rows: rows };
      });
    }).then(function (man) {
      var total = man.rows.length, done = 0, next = 0, ok = 0, bad = [], unread = [];
      prog.hidden = false;
      bar.max = total;
      bar.value = 0;
      label.textContent = fmt(I.running, { done: num(0), total: num(total) });
      function one() {
        if (next >= total) return Promise.resolve();
        var row = man.rows[next++];
        return get(row.path).then(function (buf) {
          bytes += buf.byteLength;
          return digest(buf);
        }).then(function (h) {
          if (h === row.sha) ok++; else bad.push(row.path);
        }, function () { unread.push(row.path); }).then(function () {
          done++;
          bar.value = done;
          label.textContent = fmt(I.running, { done: num(done), total: num(total) });
          return one();
        });
      }
      var workers = [];
      for (var w = 0; w < Math.min(CONCURRENCY, total); w++) workers.push(one());
      return Promise.all(workers).then(function () {
        mhash.textContent = man.hash;
        var shown = bad.map(function (p) { return [p, I.differs]; }).concat(unread.map(function (p) { return [p, I.unread]; })).slice(0, 50);
        shown.forEach(function (x) {
          var li = document.createElement("li");
          var c = document.createElement("code");
          c.textContent = x[0];
          li.appendChild(c);
          li.appendChild(document.createTextNode(" " + x[1]));
          badList.appendChild(li);
        });
        detail.hidden = false;
        var text = fmt(I.ok, { ok: num(ok), total: num(total), mb: num(bytes / 1e6, 1), s: num((Date.now() - t0) / 1000, 1) });
        if (bad.length) text += " " + fmt(I.diff, { n: num(bad.length) });
        if (unread.length) text += " " + fmt(I.err, { n: num(unread.length) });
        root.setAttribute("data-result", bad.length || unread.length ? "differs" : "match");
        finish(text);
      });
    }).catch(function (e) {
      root.setAttribute("data-result", "error");
      finish(fmt(I.manifest, { why: String(e && e.message || e) }));
    });
  });
})();
