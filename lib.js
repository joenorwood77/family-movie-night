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

  /* 🛑 DATA INTEGRITY GATE. If movies.js did not load, or loaded truncated, MOVIES is empty or
     short and every lookup would answer "free to pick" - including for films the family watched
     years ago. A confidently wrong answer is far worse than no answer, so the pages check this
     and refuse to give a verdict at all rather than give a false one.
     The floor is a sanity check, not the exact count: the real list was 354 on 2026-10-22 and
     only grows. A number below this means something is wrong with the file, not with the data. */
  var EXPECTED_MIN = 300;
  var dataOk = MOVIES.length >= EXPECTED_MIN;

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

  /* ---------- birthday movie nights ---------------------------------------------------------
     The rule Joe chose on 2026-10-22, from three options shown with their real dates: a birthday
     film goes on the NEAREST movie night either side of the birthday. If two people land on the
     same night, whoever's birthday is closer keeps it and the other moves to the following night.
     On a Tuesday season that tie-break never fires; on a Wednesday one it does, because Juli and
     Joe both land on 13 October 2027.

     Dates are APPROXIMATE and the page must say so: skipped weeks push the season's end later,
     which can pull another birthday inside it, and the movie night itself can move.

     🛑 NEVER HARDCODE TUESDAY. CFG.movieNight is the season DEFAULT only. Joe, 2026-10-22: the
        night sometimes moves to Wednesday for a few months, and sometimes for a single week.
        Every past season happening to start on a Tuesday is exactly what makes it look fixed.
  ------------------------------------------------------------------------------------------- */
  function nearestNight(d, weekday) {
    var back = (d.getDay() - weekday + 7) % 7;
    var before = new Date(d.getTime() - back * 864e5);
    var after = new Date(before.getTime() + 7 * 864e5);
    return (d - before) <= (after - d) ? before : after;
  }

  function birthdayNights() {
    var start = CFG.seasonStart ? new Date(CFG.seasonStart + "T12:00:00") : null;
    var bdays = CFG.birthdays || {};
    if (!start || isNaN(start)) return [];
    var night = (CFG.movieNight == null) ? 2 : CFG.movieNight;
    var end = new Date(start.getTime() + (CFG.weeks || 70) * 7 * 864e5);

    var out = [];
    Object.keys(bdays).forEach(function (name) {
      var md = bdays[name];
      for (var y = start.getFullYear(); y <= end.getFullYear(); y++) {
        var b = new Date(y, md[0] - 1, md[1], 12);
        if (b < start || b > end) continue;
        out.push({ person: name, birthday: b, night: nearestNight(b, night) });
      }
    });

    // The tie-break: closer birthday keeps the night, the other moves on a week.
    out.sort(function (a, b) { return a.night - b.night; });
    for (var i = 0; i < out.length; i++) {
      for (var j = i + 1; j < out.length; j++) {
        if (+out[i].night !== +out[j].night) continue;
        var gi = Math.abs(out[i].night - out[i].birthday);
        var gj = Math.abs(out[j].night - out[j].birthday);
        var loser = gi <= gj ? out[j] : out[i];
        loser.night = new Date(loser.night.getTime() + 7 * 864e5);
        loser.moved = true;
      }
    }
    out.sort(function (a, b) { return a.night - b.night; });
    return out;
  }

  /** Just this person's, soonest first. */
  function birthdaysFor(person) {
    return birthdayNights().filter(function (r) { return r.person === person; });
  }

  function niceDate(d) {
    return d.toLocaleDateString(undefined,
      { weekday: "short", month: "long", day: "numeric", year: "numeric" });
  }

  /* ---------- the rating block ---------------------------------------------------------------
     Joe's layout, settled 2026-10-22 after five rounds: the TIGHTEST card, a big group average
     with NO "/5", four people as compact chips, then the three outside sources. Colour is
     WAY C - the NAME is coloured and nothing else. No fill, no dot, and 🛑 NO STAR ICONS, which
     he killed for a real reason: a partial-fill star draws all five outlines, so a 3.5 reads as
     five stars until you measure the gold.

     All the colours come from site/theme.css. 🛑 Never put a hex value in here;
     scripts/check_palette.py fails if a page or this file hardcodes one.

     Returns false and renders NOTHING when the payload carries no ratings, which is the public
     build's deliberate state (INCLUDE_RATINGS in scripts/build_site.py). A caller must not
     assume a block appeared.
  ------------------------------------------------------------------------------------------- */
  var PEOPLE = ["Joe", "Juli", "Kathy", "Miriam"];

  function fmt2(v) {
    var n = parseFloat(v);
    return isNaN(n) ? null : n.toFixed(2);
  }

  function chip(cls) { return el("span", "fm-chip" + (cls ? " " + cls : "")); }

  function ratings(box, m) {
    if (!m.r) return false;

    var scores = m.r.map(function (v) {
      var n = parseFloat(v);
      return isNaN(n) ? null : n;
    });
    var rated = scores.filter(function (n) { return n !== null; }).length;
    if (!rated) return false;

    var wrap = el("div", "fm-rate");

    var avg = el("div", "fm-avg");
    var shown = fmt2(m.a);
    if (shown === null) {                      // no stored average: derive it, never invent it
      var tot = 0;
      scores.forEach(function (n) { if (n !== null) tot += n; });
      shown = (tot / rated).toFixed(2);
    }
    avg.appendChild(el("span", "fm-avg-num", shown));
    if (rated === PEOPLE.length) {
      avg.appendChild(el("p", "fm-avg-lbl", "Group average"));
    } else {
      // A blank rating is never counted as a zero, and the card says so out loud rather than
      // quietly averaging three numbers as though they were four. Kathy on [REC] is the case.
      var missing = PEOPLE.filter(function (p, i) { return scores[i] === null; });
      avg.appendChild(el("p", "fm-avg-lbl", "Group average of " + rated));
      avg.appendChild(el("p", "fm-avg-note",
        missing.join(" and ") + (missing.length > 1 ? " did not rate this one" : " sat this one out")));
    }
    wrap.appendChild(avg);

    var who = el("div", "fm-chips");
    PEOPLE.forEach(function (p, i) {
      var c = chip(scores[i] === null ? "fm-norating" : null);
      c.appendChild(el("span", scores[i] === null ? null : "fm-p-" + p, p));
      c.appendChild(el("b", null, scores[i] === null ? "no rating" : String(scores[i])));
      who.appendChild(c);
    });
    wrap.appendChild(who);

    /* The outside sources. With nothing fetched yet, three "not loaded" chips on every one of
       354 films is a lot of noise about information nobody has, so until the OMDb key is in
       they collapse to one quiet line. Flagged to Joe 2026-10-22 and he has the screenshot. */
    var ext = m.e;
    if (ext && (ext.imdb || ext.rt || ext.lb)) {
      var src = el("div", "fm-chips");
      [["IMDb", ext.imdb, "/10", 2], ["RT critics", ext.rt, "%", 20],
       ["Letterboxd", ext.lb, "/5", 1]].forEach(function (row) {
        var name = row[0], raw = row[1], unit = row[2], div = row[3];
        var c = chip("fm-source" + (raw == null ? " fm-missing" : ""));
        c.appendChild(el("span", null, name));
        if (raw == null) {
          c.appendChild(el("b", null, name === "Letterboxd" ? "not added" : "not loaded"));
        } else {
          c.appendChild(el("b", null, (parseFloat(raw) / div).toFixed(1)));
          c.appendChild(el("i", null, String(raw) + unit));
        }
        src.appendChild(c);
      });
      wrap.appendChild(src);
    } else {
      wrap.appendChild(el("p", "fm-avg-note",
        "IMDb and RT critics load once the key is in. Letterboxd is by hand; the link is below."));
    }

    box.appendChild(wrap);
    return true;
  }

  /* ---------- how each of us rates, across everything ---------------------------------------
     Joe, 2026-10-22: *"somewhere each of us 4 should show our total average across all movies we
     have watched together and can even compare to what rotten tomatoes, imdb and letterbodx has
     for the same movies."*

     Two things make this honest rather than just arithmetic:
       * A person's average is compared to the group average over EXACTLY the films THEY rated,
         not over all 345. Otherwise Kathy, who sat one out, would be measured against a group
         figure that includes a film she never saw.
       * Blank ratings are skipped everywhere, never counted as zero.

     Returns null when the payload has no ratings, which is the public build's state until Joe
     says to publish them.
  ------------------------------------------------------------------------------------------- */
  function num(v) {
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function mean(a) {
    if (!a.length) return null;
    var t = 0;
    a.forEach(function (n) { t += n; });
    return t / a.length;
  }

  function careerStats() {
    var seen = MOVIES.filter(function (m) { return m.r && m.st === "Watched"; });
    if (!seen.length) return null;

    var high = {}, low = {};
    PEOPLE.forEach(function (p) { high[p] = 0; low[p] = 0; });
    seen.forEach(function (m) {
      var got = {};
      PEOPLE.forEach(function (p, i) {
        var n = num(m.r[i]);
        if (n !== null) got[p] = n;
      });
      var vals = Object.keys(got).map(function (k) { return got[k]; });
      if (vals.length < 2) return;
      var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
      if (mx === mn) return;            // unanimous, so nobody is the high or the low
      Object.keys(got).forEach(function (p) {
        if (got[p] === mx) high[p]++;
        if (got[p] === mn) low[p]++;
      });
    });

    var people = PEOPLE.map(function (p, i) {
      var mine = [], grp = [];
      seen.forEach(function (m) {
        var n = num(m.r[i]);
        if (n === null) return;
        mine.push(n);
        var got = [];
        m.r.forEach(function (v) { var x = num(v); if (x !== null) got.push(x); });
        grp.push(mean(got));
      });
      var avg = mean(mine);
      return {
        person: p, rated: mine.length, avg: avg,
        vsGroup: avg === null ? null : avg - mean(grp),
        high: high[p], low: low[p]
      };
    });

    /* The outside sources, averaged over the SAME films, so the comparison is like for like.
       Every one of them is null until the OMDb key is in. 🛑 Never substitute a plausible
       number here: a made-up average would silently become the thing Joe compares himself to. */
    function srcAvg(key, div) {
      var vals = [];
      seen.forEach(function (m) {
        var raw = m.e && m.e[key];
        var n = num(raw);
        if (n !== null) vals.push(n / div);
      });
      return { avg: mean(vals), count: vals.length, of: seen.length };
    }

    return {
      films: seen.length,
      people: people,
      everyRating: mean(seen.reduce(function (acc, m) {
        m.r.forEach(function (v) { var n = num(v); if (n !== null) acc.push(n); });
        return acc;
      }, [])),
      sources: {
        "IMDb": srcAvg("imdb", 2),
        "RT critics": srcAvg("rt", 20),
        "Letterboxd": srcAvg("lb", 1)
      }
    };
  }

  /** Puts an unmissable warning at the top of a page and returns false when the film list did
   *  not load. Call it before anything that depends on knowing what has been watched. */
  function requireData(hostId) {
    if (dataOk) return true;
    var host = document.getElementById(hostId);
    if (host) {
      host.hidden = false;
      host.className = "banner stop";
      host.innerHTML = "<strong>The film list did not load, so this page cannot tell you what we "
        + "have already watched.</strong> Please reload the page. If it keeps happening, tell Joe "
        + "rather than relying on what you see here, because without that list everything would "
        + "look free to pick.";
    }
    return false;
  }

  return {
    MOVIES: MOVIES, IMG: IMG, dataOk: dataOk, requireData: requireData,
    nearestNight: nearestNight, birthdayNights: birthdayNights,
    birthdaysFor: birthdaysFor, niceDate: niceDate,
    $: $, el: el,
    norm: norm, compact: compact, noart: noart,
    lookup: lookup, seasonName: seasonName,
    tag: tag, letterboxd: letterboxd, poster: poster, verdict: verdict,
    PEOPLE: PEOPLE, ratings: ratings, careerStats: careerStats,
    tmdb: tmdb, liveSearch: liveSearch
  };
})();
