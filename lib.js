/* Shared logic for the family movie night site.
 *
 * 🛑 THIS FILE HOLDS THE ONE COPY OF THE "HAVE WE WATCHED IT" LOGIC.
 *    Both search.html and picks.html use it. Do NOT paste a second copy of norm/lookup into a
 *    page: two copies drift, and when they drift the site starts giving two different answers to
 *    the only question it exists to answer. scripts/check_search_page.py slices its tests from
 *    THIS file, so logic that lives here is the logic that gets tested.
 *
 * Loaded after config.js, themes.js and movies.js, which it reads from window.
 */
window.FM = (function () {
  "use strict";

  var MOVIES = window.FM_MOVIES || [];
  var CFG = window.FM_CONFIG || {};

  var IMG = "https://image.tmdb.org/t/p/w154";

  /* ---------- small DOM helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- title matching ---------------------------------------------------------------
     A film is identified by title AND year. Several titles genuinely repeat in this
     collection: Speak No Evil (2022 and 2024), and All Quiet on the Western Front three times.
     The 1001 list once produced a false match on Sunshine for exactly this reason, so the year
     is never ignored.
       norm()    folds accents, drops punctuation, collapses spaces
       compact() also removes spaces, so "M*A*S*H" meets "mash"
       noart()   drops a leading article, so "The Prestige" meets "Prestige"
     A year within 1 counts as the same film, because release years differ between countries and
     between TMDB and the family's own sheet.
  ----------------------------------------------------------------------------------------- */
  function norm(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function compact(s) { return norm(s).replace(/ /g, ""); }
  function noart(s) { return norm(s).replace(/^(the|a|an) /, ""); }

  var INDEX = {};
  function addKey(k, m) {
    if (!k) return;
    (INDEX[k] = INDEX[k] || []).push(m);
  }
  MOVIES.forEach(function (m) {
    addKey(norm(m.t), m);
    addKey(compact(m.t), m);
    addKey(noart(m.t), m);
  });

  /** {exact: movie|null, sameTitle: [movies]} for a title and year. */
  function lookup(title, year) {
    var keys = [norm(title), compact(title), noart(title)];
    var pool = [], seenIds = {};
    keys.forEach(function (k) {
      (INDEX[k] || []).forEach(function (m) {
        var id = m.s + "-" + m.o;
        if (!seenIds[id]) { seenIds[id] = 1; pool.push(m); }
      });
    });
    if (!pool.length) return { exact: null, sameTitle: [] };
    var y = parseInt(year, 10);
    var exact = null;
    if (!isNaN(y)) {
      for (var i = 0; i < pool.length; i++) {
        var my = parseInt(pool[i].y, 10);
        if (!isNaN(my) && Math.abs(my - y) <= 1) { exact = pool[i]; break; }
      }
    } else if (pool.length === 1) {
      exact = pool[0];
    }
    return { exact: exact, sameTitle: pool.filter(function (m) { return m !== exact; }) };
  }

  function seasonName(s) { return s === "Outside" ? "outside a season" : "Season " + s; }

  function tag(kind, text) { return el("span", "tag " + kind, text); }

  /** Letterboxd has no usable API for a project like this, so the site links out rather than
   *  pretending to know their rating. One tap gets the real number. */
  function letterboxd(title, year) {
    var a = el("a", "lbxd", "Letterboxd ↗");
    a.href = "https://letterboxd.com/search/films/"
           + encodeURIComponent(title + (year ? " " + year : "")) + "/";
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function poster(r) {
    if (r && r.poster) {
      var img = el("img", "poster");
      img.src = IMG + r.poster;
      img.alt = "";
      img.loading = "lazy";
      return img;
    }
    return el("div", "noposter", "☰");
  }

  /** Appends the verdict for a title+year: watched, already picked, or free. */
  function verdict(box, title, year) {
    var hit = lookup(title, year);
    if (hit.exact) {
      var m = hit.exact;
      if (m.st === "Watched") {
        box.appendChild(tag("seen", "Already watched"));
        box.appendChild(el("p", "meta", "Watched in " + seasonName(m.s) + ", picked by " + m.p
          + (m.th ? ', for the category "' + m.th + '"' : "")));
      } else {
        box.appendChild(tag("picked", "Already picked"));
        box.appendChild(el("p", "meta", "Chosen by " + m.p + " for " + seasonName(m.s)
          + ", not watched yet"));
      }
    } else {
      box.appendChild(tag("free", "Free to pick"));
      if (hit.sameTitle.length) {
        var other = hit.sameTitle[0];
        box.appendChild(tag("near", "but check this"));
        box.appendChild(el("p", "meta", "We watched a different film with this title: "
          + other.t + " (" + other.y + "), picked by " + other.p + ". "
          + "Same name, different movie, so this one is still free."));
      }
    }
    return hit;
  }

  /* ---------- the TMDB proxy -----------------------------------------------------------------
     The page never calls TMDB directly; the key lives in Joe's Apps Script. `onState` is given
     one of: "searching", "off" (the proxy is not deployed), "error", or "ok" with the results.
     "off" matters: telling someone to try again when a setup step is missing would be a lie.
  ------------------------------------------------------------------------------------------- */
  function tmdb(q, onState) {
    if (!CFG.endpoint) { onState("off", []); return; }
    onState("searching", []);
    fetch(CFG.endpoint + "?action=tmdb&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) {
          var err = String((d && d.error) || "");
          onState(err.indexOf("Unknown action") > -1 ? "off" : "error", []);
          return;
        }
        onState("ok", d.results || []);
      })
      .catch(function () { onState("error", []); });
  }

  /** Debounces a text input into tmdb(), ignoring answers that arrive after newer typing. */
  function liveSearch(input, minChars, onState) {
    var timer = null, last = "";
    input.addEventListener("input", function () {
      var q = input.value.trim();
      last = q;
      clearTimeout(timer);
      if (q.length < minChars) { onState("idle", []); return; }
      timer = setTimeout(function () {
        tmdb(q, function (state, results) {
          if (input.value.trim() !== last) return;   // stale: they kept typing
          onState(state, results);
        });
      }, 400);
    });
  }

  return {
    MOVIES: MOVIES, IMG: IMG,
    $: $, el: el,
    norm: norm, compact: compact, noart: noart,
    lookup: lookup, seasonName: seasonName,
    tag: tag, letterboxd: letterboxd, poster: poster, verdict: verdict,
    tmdb: tmdb, liveSearch: liveSearch
  };
})();
