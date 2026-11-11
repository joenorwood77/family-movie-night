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
          // TWO decimals, like the group average beside it. One decimal turned RT critics
          // 81% into "4.0" when the honest figure is 4.05, quietly throwing away precision
          // the sheet actually has. Caught by scripts/check_ratings_block.py.
          c.appendChild(el("b", null, (parseFloat(raw) / div).toFixed(2)));
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

  /* ---------- auto-sync: the live ratings overlaid on the baked list -------------------------
     Joe, 2026-10-22: *"will this then auto sync when new scores are added or how it know when to
     update scores."*

     The baked film list is HISTORY: it ships with the page, works with no network, and is what
     the data-integrity gate counts. This overlays the live sheet on top of it, so a score added
     tonight appears without anybody rebuilding the site.

     🛑 IT ONLY EVER ADDS OR CORRECTS. It never empties a rating, never un-watches a film, and
        never runs at all unless the live read looks sane. A sync that can delete is a sync that
        will eventually delete everything, and this is the family's only record of years of
        ratings.

     ⚠️ Matching is by title and year, which means the sheet's known typos (Pyscho, Aguire,
        Eastwck, Borat 2, Kill Bill Volume 1) will NOT match the project's corrected titles.
        That is harmless: those are all old films whose ratings are already baked in and settled.
        It is the newly watched films that need syncing, and those are typed correctly. The count
        of unmatched rows is returned rather than swallowed, so if it ever grows we find out.
  ------------------------------------------------------------------------------------------- */
  var LIVE_MIN_ROWS = 300;        // same floor as the data gate: fewer means something is wrong

  /* Generated into site/aliases.js from the ALIASES map in scripts/apply_sheet.py, which is the
     ONE copy and carries a reason for every entry. Absent if a page does not load aliases.js,
     in which case the sync still works and simply reports more unmatched rows. */
  var ALIAS = window.FM_SHEET_ALIASES || {};

  function liveRating(v) {
    if (v === "na" || v === null || v === undefined || v === "") return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function applyLive(payload) {
    var res = { ok: false, updated: 0, newlyWatched: [], unmatched: [], read: null };
    if (!payload || !payload.ok || !payload.rows || payload.rows.length < LIVE_MIN_ROWS) {
      // Too few rows to be the real list. Leave the baked data exactly as it is.
      res.reason = !payload || !payload.ok ? "the live read failed" : "the live list was short";
      return res;
    }
    res.read = payload.read || null;

    payload.rows.forEach(function (row) {
      // The sheet names a few films differently from the project, and gets two years wrong.
      // ALIAS is generated from the same map the baked data was built with, so the live sync
      // matches exactly what the build matched. Without it, "La Strada (The Road)" never finds
      // La Strada, and one of the five films about to be watched would never sync.
      var t = row.t, y = row.y;
      var alias = ALIAS[row.t + "|" + row.y];
      if (alias) { t = alias[0]; y = alias[1]; }

      var hit = lookup(t, y);
      var m = hit.exact;
      if (!m) { res.unmatched.push(row.t + " (" + row.y + ")"); return; }

      var scores = (row.r || []).map(liveRating);
      var anyReal = scores.some(function (n) { return n !== null; });
      var changed = false;

      if (anyReal) {
        // Only write a rating that is actually there. A null in the live row leaves whatever is
        // baked alone, so a half-filled sheet row can never wipe a real score.
        var before = (m.r || []).join("|");
        var next = PEOPLE.map(function (p, i) {
          if (scores[i] !== null) return String(scores[i]);
          return m.r ? m.r[i] : null;
        });
        if (next.join("|") !== before) { m.r = next; changed = true; }

        if (m.st !== "Watched") {
          m.st = "Watched";
          res.newlyWatched.push(m.t + " (" + m.y + ")");
          changed = true;
        }

        // Recompute the average from whatever is now there, skipping blanks. Never a zero.
        var got = [];
        (m.r || []).forEach(function (v) {
          var n = parseFloat(v);
          if (!isNaN(n)) got.push(n);
        });
        if (got.length) {
          var t = 0;
          got.forEach(function (n) { t += n; });
          m.a = String(Math.round((t / got.length) * 1000) / 1000);
        }
      }

      // The outside scores. RT arrives divided by ten, the way the sheet stores it.
      var imdb = liveRating(row.i), rt = liveRating(row.rt);
      if (imdb !== null || rt !== null) {
        m.e = m.e || {};
        if (imdb !== null && m.e.imdb !== String(imdb)) { m.e.imdb = String(imdb); changed = true; }
        if (rt !== null) {
          var pct = String(Math.round(rt * 10 * 100) / 100);
          if (m.e.rt !== pct) { m.e.rt = pct; changed = true; }
        }
      }

      if (changed) res.updated++;
    });

    res.ok = true;
    return res;
  }

  /** Fetches the live ratings and overlays them, then calls back. Safe to call on page load:
   *  a failure is silent to the viewer, because the baked data is already correct history. */
  function syncLive(onDone) {
    if (!CFG.endpoint) { onDone({ ok: false, reason: "no endpoint configured" }); return; }
    fetch(CFG.endpoint + "?action=watched")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && !d.ok && String(d.error || "").indexOf("Unknown action") > -1) {
          onDone({ ok: false, reason: "not deployed yet" });
          return;
        }
        onDone(applyLive(d));
      })
      .catch(function () { onDone({ ok: false, reason: "the network call failed" }); });
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

  /* ---------- the schedule ------------------------------------------------------------------
     Joe, 2026-10-22: *"i suggest we schedule everything as if we will always have movie night on
     tuesdays but i want it easy for us to change throughout the season if for a week or a few
     months, and also if we end up taking a week or two break."*

     🛑 DATES ARE COMPUTED, NEVER STORED. Only two things are stored: the slot ORDER and a list
     of ADJUSTMENTS. Everything on screen is derived from those two. That is the whole reason a
     change is easy: altering one adjustment re-derives every later date for free, and removing
     it undoes the change completely. Storing dates would mean rewriting dozens of rows for one
     cancelled week, and undo would be guesswork.

     🛑 NEVER HARDCODE TUESDAY. The default is CFG.movieNight and an adjustment can move it for a
     single week or for months. scripts/check_schedule.py runs all of this on a Wednesday season
     as well as a Tuesday one, for exactly that reason.

     🛑 BIRTHDAY FILMS DO NOT MOVE WHEN A WEEK IS SKIPPED. Regular films flow around them. That
     is why a skip cannot be "add 7 days to everything" and why this is a placement pass rather
     than arithmetic on a list.
  ------------------------------------------------------------------------------------------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /** Local-noon dates everywhere, so a timezone can never shift a day. */
  function parseDay(s) {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate(), 12);
    var d = new Date(String(s).slice(0, 10) + "T12:00:00");
    return isNaN(d) ? null : d;
  }

  function dayKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  }

  function sameDay(a, b) { return a && b && dayKey(a) === dayKey(b); }

  /* The 7 holidays Joe asked to see on the schedule, 2026-09-15. Reference only: they never move
     a film by themselves. Easter and Thanksgiving are computed because they move every year. */
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100;
    var d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day, 12);
  }

  /** Fourth Thursday in November. */
  function thanksgiving(y) {
    var d = new Date(y, 10, 1, 12);
    var first = (4 - d.getDay() + 7) % 7;      // 4 = Thursday
    return new Date(y, 10, 1 + first + 21, 12);
  }

  function holidaysBetween(from, to) {
    var a = parseDay(from), b = parseDay(to);
    if (!a || !b) return [];
    var out = [];
    for (var y = a.getFullYear(); y <= b.getFullYear(); y++) {
      out.push({ name: "New Year's Day", date: new Date(y, 0, 1, 12) });
      out.push({ name: "Easter", date: easter(y) });
      out.push({ name: "Halloween", date: new Date(y, 9, 31, 12) });
      out.push({ name: "Thanksgiving", date: thanksgiving(y) });
      out.push({ name: "Christmas Eve", date: new Date(y, 11, 24, 12) });
      out.push({ name: "Christmas Day", date: new Date(y, 11, 25, 12) });
      out.push({ name: "New Year's Eve", date: new Date(y, 11, 31, 12) });
    }
    return out.filter(function (h) { return h.date >= a && h.date <= b; })
              .sort(function (x, y2) { return x.date - y2.date; });
  }

  /** Normalises a stored adjustment row into dates and numbers. Anything unusable is dropped
   *  rather than guessed at, because a half-understood adjustment would silently move films. */
  function readAdjustments(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || String(r.undone || "").toLowerCase() === "yes") return;
      var kind = String(r.kind || "").toLowerCase();
      var start = parseDay(r.start_date);
      if (!start) return;
      if (kind === "skip") {
        var w = parseInt(r.weeks, 10);
        out.push({
          kind: "skip", start: start, weeks: (w >= 1 && w <= 8) ? w : 1,
          reason: String(r.reason || "").trim() || "Break",
          person: String(r.person || "").trim(), id: String(r.adj_id || "")
        });
      } else if (kind === "night") {
        var wd = parseInt(r.weekday, 10);
        if (isNaN(wd) || wd < 0 || wd > 6) return;
        out.push({
          kind: "night", start: start, end: parseDay(r.end_date) || start, weekday: wd,
          reason: String(r.reason || "").trim(), person: String(r.person || "").trim(),
          id: String(r.adj_id || "")
        });
      }
    });
    return out.sort(function (a, b) { return a.start - b.start; });
  }

  /** Which weekday this week runs on. The BASELINE date is what gets tested, so the answer never
   *  depends on the answer. Always shifts forward within the week, so the order cannot invert. */
  function nightShift(baseline, defaultNight, adjustments) {
    var wd = defaultNight;
    adjustments.forEach(function (a) {
      if (a.kind !== "night") return;
      if (baseline >= a.start && baseline <= a.end) wd = a.weekday;
    });
    return (wd - defaultNight + 7) % 7;
  }

  /**
   * Lays a season of films onto movie nights.
   *
   *   start        first movie night of the season (ISO string or Date)
   *   night        default weekday, 0 = Sunday. NOT a constant; see the banner above.
   *   films        ordered slots: { title, year, person, kind, theme, status }.
   *                kind === "Birthday" marks a film that is date-anchored.
   *   adjustments  from readAdjustments()
   *   birthdays    { name: [month, day] }, used to decide WHICH week is anchored
   *
   * Returns { weeks: [...], unplaced: n }. Each week is one of:
   *   { date, kind: "film",     film, slot }
   *   { date, kind: "birthday", film, slot, person }
   *   { date, kind: "skip",     reason, person, adjId }
   */
  function buildSchedule(opts) {
    var o = opts || {};
    var start = parseDay(o.start);
    var films = (o.films || []).slice();
    var adj = o.adjustments || [];
    var defaultNight = (o.night == null) ? 2 : o.night;
    if (!start) return { weeks: [], unplaced: films.length };

    var skips = adj.filter(function (a) { return a.kind === "skip"; });
    var skipWeeks = 0;
    skips.forEach(function (s) { skipWeeks += s.weeks; });

    // Enough weeks for every film plus every skipped week, with a little headroom so a skip
    // sitting past the end of the season still has somewhere to land.
    var need = films.length + skipWeeks;
    var weeks = [];
    for (var k = 0; k < need + 8 && k < 600; k++) {
      var baseline = addDays(start, 7 * k);
      weeks.push({
        baseline: baseline,
        date: addDays(baseline, nightShift(baseline, defaultNight, adj)),
        kind: null
      });
    }

    // 1. THE ANCHORED BIRTHDAY WEEKS COME FIRST, before the skips. Birthday slots are the only
    //    date-anchored thing in the whole project, so they claim their week by date and a skip
    //    works around them rather than the other way round. Nearest movie night to the birthday,
    //    and when two people want the same night the closer birthday keeps it (Joe, 2026-10-22).
    var open = weeks.slice();
    // 🛑 The season ends at the last week that can hold a film, NOT at the headroom weeks above.
    //    Using the headroom would pull in a birthday that falls after the season really ends and
    //    invent a slot nobody owes a film for. Kathy's 3/29/2028 is exactly that case.
    var lastIdx = Math.max(0, Math.min(weeks.length, need) - 1);
    var last = weeks.length ? weeks[lastIdx].date : start;

    // Only anchor a birthday the film list actually has a slot for, so the week structure
    // follows the data instead of the data being asked to follow the weeks.
    var bdayOwed = {};
    films.forEach(function (f) {
      if (f && f.kind === "Birthday" && f.person) {
        bdayOwed[f.person] = (bdayOwed[f.person] || 0) + 1;
      }
    });
    var anyOwed = Object.keys(bdayOwed).length > 0;

    var wants = [];
    Object.keys(o.birthdays || {}).forEach(function (name) {
      var md = o.birthdays[name];
      for (var y = start.getFullYear(); y <= last.getFullYear(); y++) {
        var b = new Date(y, md[0] - 1, md[1], 12);
        if (b < start || b > last) continue;
        var best = null;
        open.forEach(function (w) {
          if (!best || Math.abs(w.date - b) < Math.abs(best.date - b)) best = w;
        });
        if (best) wants.push({ person: name, birthday: b, week: best });
      }
    });
    wants.sort(function (a, b) { return a.birthday - b.birthday; });
    if (anyOwed) {
      var seenFor = {};
      wants = wants.filter(function (w) {
        seenFor[w.person] = (seenFor[w.person] || 0) + 1;
        return seenFor[w.person] <= (bdayOwed[w.person] || 0);
      });
    }
    wants.forEach(function (want) {
      var taken = wants.filter(function (o2) {
        return o2 !== want && o2.week === want.week && o2.settled;
      });
      if (taken.length) {
        var holder = taken[0];
        var mine = Math.abs(want.week.date - want.birthday);
        var theirs = Math.abs(holder.week.date - holder.birthday);
        var move = mine < theirs ? holder : want;
        var from = weeks.indexOf(move.week);
        for (var i = from + 1; i < weeks.length; i++) {
          if (weeks[i].kind === null && !wants.some(function (o3) { return o3.week === weeks[i]; })) {
            move.week = weeks[i];
            move.moved = true;
            break;
          }
        }
      }
      want.settled = true;
    });
    wants.forEach(function (want) {
      if (want.week.kind === null) {
        want.week.kind = "birthday";
        want.week.person = want.person;
        want.week.birthday = want.birthday;
        want.week.moved = !!want.moved;
      }
    });

    // 2. the skipped weeks. A skip names the night being cancelled; weeks > 1 takes the ones
    //    straight after it too, which is Joe's "a week or two break" as ONE adjustment rather
    //    than two features.
    //
    //    🛑 A SKIP LANDING ON A BIRTHDAY WEEK DOES NOT PUSH THE BIRTHDAY FILM TO ANOTHER WEEK.
    //    Joe, 2026-09-15: a cancelled birthday week means the birthday film *"most likely just
    //    move to later in the week."* He said "most likely", so this is the DEFAULT and the page
    //    says so and lets it be changed; it is not a hard rule. The regular films are unaffected,
    //    because that week still gets watched.
    skips.forEach(function (s) {
      var at = -1;
      for (var i = 0; i < weeks.length; i++) {
        if (sameDay(weeks[i].date, s.start) || sameDay(weeks[i].baseline, s.start)) { at = i; break; }
      }
      if (at < 0) {                      // not a movie night we know: take the next one after it
        for (var j = 0; j < weeks.length; j++) {
          if (weeks[j].date >= s.start) { at = j; break; }
        }
      }
      if (at < 0) return;
      for (var n = 0; n < s.weeks && at + n < weeks.length; n++) {
        var w = weeks[at + n];
        if (w.kind === "skip") continue;
        if (w.kind === "birthday") {
          w.weekSkipped = true;
          w.skipReason = s.reason;
          w.skipPerson = s.person;
          w.skipAdjId = s.id;
          w.date = addDays(w.date, 2);
          continue;
        }
        w.kind = "skip";
        w.reason = s.reason;
        w.person = s.person;
        w.adjId = s.id;
      }
    });

    // 3. the films. Birthday films go only in birthday weeks, everything else flows around them.
    var bdayFilms = films.filter(function (f) { return f && f.kind === "Birthday"; });
    var normal = films.filter(function (f) { return !f || f.kind !== "Birthday"; });
    var slot = 0, placed = 0;
    weeks.forEach(function (w) {
      if (w.kind === "skip") return;
      if (w.kind === "birthday") {
        var mine = null;
        for (var i = 0; i < bdayFilms.length; i++) {
          if (bdayFilms[i] && bdayFilms[i].person === w.person) { mine = bdayFilms.splice(i, 1)[0]; break; }
        }
        w.film = mine || null;
        w.slot = ++slot;
        if (mine) placed++;
        return;
      }
      if (!normal.length) return;
      w.kind = "film";
      w.film = normal.shift();
      w.slot = ++slot;
      placed++;
    });

    var used = [];
    weeks.forEach(function (w) { if (w.kind) used.push(w); });
    // Trim the trailing headroom: weeks past the last real one are not part of the season.
    var lastReal = -1;
    for (var z = used.length - 1; z >= 0; z--) {
      if (used[z].kind !== "skip" || z === 0) { lastReal = z; break; }
    }
    return {
      weeks: used.slice(0, lastReal + 1),
      unplaced: normal.length + bdayFilms.length,
      placed: placed
    };
  }

  /* 🛑 HOW LONG IS A SEASON? IT IS A FIXED POINT, NOT A SUM. Joe settled this 2026-10-22:
     *"if we watch movies a week of anyones bday, they get a free pick, even if they had one
     previously this season."* So 64 is the fixed part (32 Dealer's Choice + 32 Open Choice) and
     every birthday falling inside the season adds a film. But each added film makes the season a
     week longer, which can pull in yet another birthday. Iterate until it stops moving.

     🛑 Do not hardcode 68, or 70, or 17 per person. The 2026-10-22 note records 69 films with no
     skipped weeks and 70 with two or more, converging there. This function reproduces that, and
     scripts/check_schedule.py asserts both numbers. */
  function eligibleBirthdays(opts) {
    var o = opts || {};
    var start = parseDay(o.start);
    var bdays = o.birthdays || {};
    var fixed = o.fixed == null ? 64 : o.fixed;
    var skipWeeks = o.skipWeeks || 0;
    if (!start) return [];

    var found = [], guard = 0;
    while (guard++ < 20) {
      var weeks = fixed + found.length + skipWeeks;
      var end = addDays(start, (weeks - 1) * 7);
      var next = [];
      Object.keys(bdays).forEach(function (name) {
        var md = bdays[name];
        for (var y = start.getFullYear(); y <= end.getFullYear() + 1; y++) {
          var b = new Date(y, md[0] - 1, md[1], 12);
          // The night can sit a few days either side of the birthday, so a birthday just past
          // the final night still counts. Half a week is the honest window.
          if (b < addDays(start, -3) || b > addDays(end, 3)) continue;
          next.push({ person: name, birthday: b });
        }
      });
      next.sort(function (a, b) { return a.birthday - b.birthday; });
      if (next.length === found.length) return next;
      found = next;
    }
    return found;
  }

  /** Placeholder slots for a season whose picks are not in yet, so the schedule can be looked at
   *  before anyone has chosen a film. Pass `birthdayPeople`, or let it work them out. */
  function placeholderSeason(opts) {
    var o = opts || {};
    var fixed = o.fixed == null ? 64 : o.fixed;
    var people = o.birthdayPeople;
    if (!people) {
      people = eligibleBirthdays(o).map(function (b) { return b.person; });
    }
    var out = [];
    for (var i = 0; i < fixed; i++) {
      // The shape the group already uses: 4 Dealer's Choice weeks then 4 Open Choice, proven
      // against Season 4's slots on 2026-10-22. Labels only; nobody has picked anything yet.
      out.push({ title: null, kind: (i % 8) < 4 ? "Dealer's Choice" : "Open Choice" });
    }
    people.forEach(function (p) {
      out.push({ title: null, kind: "Birthday", person: p });
    });
    return out;
  }

  return {
    MOVIES: MOVIES, IMG: IMG, dataOk: dataOk, requireData: requireData,
    parseDay: parseDay, dayKey: dayKey, addDays: addDays, sameDay: sameDay,
    easter: easter, thanksgiving: thanksgiving, holidaysBetween: holidaysBetween,
    readAdjustments: readAdjustments, buildSchedule: buildSchedule,
    eligibleBirthdays: eligibleBirthdays, placeholderSeason: placeholderSeason,
    applyLive: applyLive, syncLive: syncLive,
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
