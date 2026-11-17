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
  /* 🛑 THIS MUST STAY IN STEP WITH norm() IN scripts/match_1001.py, which does the same two
     steps for the same reason. scripts/check_1001.py compares the two matchers on all of the
     family's films and FAILS if they disagree, the same discipline as normTheme() in Code.gs.

     Both steps exist because the family's data and the 1001 list are DIFFERENT SOURCES that
     spell the same film differently. Found 2026-11-11 by that comparison:
       "&" -> " and "   the family sheet writes "Willy Wonka & the Chocolate Factory" and
                        "Kind Hearts & Coronets"; the 1001 list spells both out as "and".
                        Without this, two films the family owns silently dropped off the list.
       apostrophes gone  so "Don't Look Up" meets "Dont Look Up" rather than becoming
                        "don t look up". Dropping the character beats replacing it with a gap. */
  function norm(s) {
    return String(s || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['‘’`]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
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

  /* Takes a film record and gives back either its artwork or a placeholder the same shape.
     `size` is "sm" or "lg" or nothing, so a row and a winner's card can share one component
     instead of each page sizing its own image.

     🛑 ALT IS DELIBERATELY EMPTY. The title is always printed next to the poster in real text,
     so alt text here would make every screen reader say the name twice. The image is
     decoration beside the name, not the name itself.

     🛑 A MISSING POSTER IS A REAL STATE, NOT A FAILURE. TMDB does not hold artwork for
     everything, and this project refuses to guess which film a title means, so "Seven" (1995)
     has no poster on purpose. The placeholder follows the MEDIUM, because a TV series marked
     with a film glyph reads as a film we could not find. */
  function poster(r, size) {
    var cls = size ? " " + size : "";
    if (r && r.poster) {
      var img = el("img", "poster" + cls);
      img.src = IMG + r.poster;
      img.alt = "";
      img.loading = "lazy";
      return img;
    }
    return el("div", "noposter" + cls, (r && r.m === "TV Series") ? "▣" : "☰");
  }

  /* For the pages that hold only a title and a year: the schedule builds its own week objects
     and the claimed list reads rows back from the sheet. Going through lookup() means the
     poster beside a film is the poster of the film the matcher would have matched, and a title
     it cannot place gets the placeholder rather than a near-miss. */
  function posterFor(title, year, size) {
    var hit = lookup(title, year);
    return poster(hit && hit.exact ? hit.exact : null, size);
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


  /* ---------- finding a film to suggest ------------------------------------------------------
     TMDB's own movie genre list, read from /genre/movie/list on 2026-11-16 and not typed from
     memory. All 19 are kept, TV Movie included: this project never quietly drops a list item.

     This is the one copy the dropdown is built from. Code.gs carries the IDS a second time so
     it can refuse an id nobody could have picked, and check_find.py compares the two, because
     two copies of anything drift and the pair that drifts silently is the dangerous one.
  ------------------------------------------------------------------------------------------- */
  var GENRES = [
    { id: 28,    n: "Action" },
    { id: 12,    n: "Adventure" },
    { id: 16,    n: "Animation" },
    { id: 35,    n: "Comedy" },
    { id: 80,    n: "Crime" },
    { id: 99,    n: "Documentary" },
    { id: 18,    n: "Drama" },
    { id: 10751, n: "Family" },
    { id: 14,    n: "Fantasy" },
    { id: 36,    n: "History" },
    { id: 27,    n: "Horror" },
    { id: 10402, n: "Music" },
    { id: 9648,  n: "Mystery" },
    { id: 10749, n: "Romance" },
    { id: 878,   n: "Science Fiction" },
    { id: 10770, n: "TV Movie" },
    { id: 53,    n: "Thriller" },
    { id: 10752, n: "War" },
    { id: 37,    n: "Western" }
  ];

  function genreName(id) {
    for (var i = 0; i < GENRES.length; i++) {
      if (GENRES[i].id === Number(id)) return GENRES[i].n;
    }
    return "";                      // an id we do not know is left blank, never guessed
  }

  /** The ONE caller of the discover endpoint. Filters by genre, year, runtime, language and a
   *  quality floor, all optional, all combining.
   *
   *  `params` keys match what Code.gs validates: g, y1, y2, rt, lang, sort, vc, page.
   *
   *  onState(state, payload) where state is one of:
   *    "off"       there is no endpoint, or this script version does not know the action yet
   *    "searching" the call is in flight
   *    "ok"        payload is the whole answer: results, total, pages, page, applied
   *    "refused"   the server turned the filters down ON PURPOSE; payload.error is its own
   *                sentence and the page shows it as written, because a deliberate refusal is
   *                not a breakage and must not read like one
   *    "error"     the call did not complete
   */
  /** The ONE way this site asks the endpoint a read-only question and reports what came back.
   *  discover, similar, person and credits all go through it, so the five states and the
   *  "Unknown action means OFF" branch exist once rather than four times.
   *
   *  🛑 Empty values are DROPPED rather than sent blank, because a blank parameter can read as
   *     a filter set to nothing rather than a filter nobody asked for. */
  function askAction(action, params, onState) {
    if (!CFG.endpoint) { onState("off", {}); return; }
    onState("searching", {});

    var qs = ["action=" + encodeURIComponent(action)];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === null || v === undefined || v === "") return;
      qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
    });

    fetch(CFG.endpoint + "?" + qs.join("&"))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d) { onState("error", {}); return; }
        if (!d.ok) {
          var err = String(d.error || "");
          // An older deployment answers "Unknown action", which is not a refusal of what was
          // asked: it means this feature is not switched on yet. The page words those two
          // completely differently, so the difference has to survive.
          if (err.indexOf("Unknown action") > -1) { onState("off", {}); return; }
          onState("refused", { error: err });
          return;
        }
        onState("ok", d);
      })
      .catch(function () { onState("error", {}); });
  }

  /** Narrow and order a list of films in the browser.
   *
   *  Used when the films did NOT come from a filtered query: a person's whole filmography
   *  arrives in one call, so the genre, year and quality filters have to be applied here.
   *
   *  opts: { genres: [ids], mode: "and"|"or", y1, y2, minvotes, sort }
   *  Every one is optional. Nothing is mutated; a new array comes back.
   *
   *  🛑 A FILM WITH NO FOUR-DIGIT YEAR IS DROPPED FIRST, ALWAYS. TMDB lists announced projects
   *     in a filmography with no release date at all: 9 of Scorsese's 65 directed credits on
   *     2026-11-17 were things like "Untitled Grateful Dead Film". Offering the family a film
   *     that does not exist is worse than a shorter list.
   *
   *  ⚠ There is deliberately NO runtime filter here. A filmography credit carries no running
   *    time, so one could only ever be faked. The page says so instead.
   */
  function filterFilms(rows, opts) {
    opts = opts || {};
    var out = (rows || []).filter(function (r) {
      return String(r && r.y || "").length === 4;
    });

    var want = opts.genres || [];
    if (want.length) {
      var anyOf = opts.mode === "or";
      out = out.filter(function (r) {
        var has = r.genres || [];
        if (anyOf) {
          return want.some(function (g) { return has.indexOf(g) > -1; });
        }
        return want.every(function (g) { return has.indexOf(g) > -1; });
      });
    }

    if (opts.y1) {
      out = out.filter(function (r) { return parseInt(r.y, 10) >= Number(opts.y1); });
    }
    if (opts.y2) {
      out = out.filter(function (r) { return parseInt(r.y, 10) <= Number(opts.y2); });
    }

    var floor = Number(opts.minvotes || 0);
    if (floor > 0) {
      out = out.filter(function (r) { return (r.votes || 0) >= floor; });
    }

    var sort = opts.sort || "popularity.desc";
    out.sort(function (a, b) {
      if (sort === "vote_average.desc") return (b.score || 0) - (a.score || 0);
      if (sort === "vote_count.desc") return (b.votes || 0) - (a.votes || 0);
      if (sort === "primary_release_date.desc") return String(b.y).localeCompare(String(a.y));
      if (sort === "primary_release_date.asc") return String(a.y).localeCompare(String(b.y));
      if (sort === "title.asc") return String(a.t || "").localeCompare(String(b.t || ""));
      if (sort === "title.desc") return String(b.t || "").localeCompare(String(a.t || ""));
      // popularity and revenue are not on a filmography credit, so the only honest fallback
      // is how many people have rated it.
      return (b.votes || 0) - (a.votes || 0);
    });
    return out;
  }

  /* ---------- the locked order, and the trades on top of it --------------------------------
     The season order is stored as ONE seed plus one row per trade, not as 64 rows of schedule.
     randomizeSeason() is deterministic, so the seed rebuilds the whole order; these two
     functions turn what is on file back into a season.
  ------------------------------------------------------------------------------------------ */

  /** Pull the live shuffle and the live trades out of what the `order` tab returned.
   *  Undone rows are skipped. Trades keep the order they were made in, because two trades
   *  touching the same slot do not commute. */
  function orderState(rows) {
    var live = (rows || []).filter(function (r) {
      return String(r.undone || "").toLowerCase() !== "yes";
    });
    var shuffles = live.filter(function (r) { return String(r.kind) === "shuffle"; });
    var trades = live.filter(function (r) { return String(r.kind) === "trade"; });
    trades.sort(function (a, b) {
      return String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
    });
    return {
      locked: shuffles.length > 0,
      // The sheet should hold at most one live shuffle, because the server refuses a second.
      // If somehow there are two, the LAST is used and `extra` says so rather than hiding it.
      shuffle: shuffles.length ? shuffles[shuffles.length - 1] : null,
      extraShuffles: Math.max(0, shuffles.length - 1),
      trades: trades
    };
  }

  /** Apply trades to a shuffled season.
   *
   *  A trade swaps the PERSON and the FILM between two slots. The slot's own number, kind and
   *  category stay where they are, because a slot is a date and a trade changes who is up that
   *  night, not when the night is. Taken from Joe's Season 4: he took Miriam's slot in Open
   *  Choice 6 so his two Kill Bill films could run back to back.
   *
   *  Returns a NEW array; nothing is mutated. A trade naming a slot that does not exist is
   *  reported in `skipped` rather than ignored, because a trade nobody can see applied is a
   *  trade somebody thinks happened.
   */
  function applyTrades(slots, trades) {
    var out = (slots || []).map(function (s) {
      var c = {};
      Object.keys(s).forEach(function (k) { c[k] = s[k]; });
      return c;
    });
    var byN = {};
    out.forEach(function (s) { byN[String(s.n)] = s; });

    var applied = [], skipped = [];
    (trades || []).forEach(function (tr) {
      var a = byN[String(tr.slot_a)], b = byN[String(tr.slot_b)];
      if (!a || !b || a === b) {
        skipped.push(tr);
        return;
      }
      var ap = a.person, at = a.title, ay = a.year;
      a.person = b.person; a.title = b.title; a.year = b.year;
      b.person = ap; b.title = at; b.year = ay;
      applied.push(tr);
    });
    return { slots: out, applied: applied, skipped: skipped };
  }

  function discover(params, onState) { askAction("discover", params, onState); }

  /** Films TMDB reckons are like this one.
   *  🛑 It is TMDB's judgement, not ours. Any page showing these must say so: we do not compute
   *     similarity and must never look as though we did. */
  function similar(tmdbId, page, onState) {
    askAction("similar", { id: tmdbId, page: page || 1 }, onState);
  }

  /** The people a typed name could mean. The page asks which one; it never picks for them. */
  function person(q, onState) { askAction("person", { q: q }, onState); }

  /** One person's films, with `acted` and `directed` kept apart by TMDB's own job label. */
  function credits(personId, onState) { askAction("credits", { id: personId }, onState); }

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

  /* ---------- the season awards --------------------------------------------------------------
     Joe's three rules, 2026-11-11, in his own words:

       RAZZIE      *"goes to the movie that has our lowest average as a group."*
                   Entirely computed. Nobody votes, nobody submits anything.

       BEST PICTURE *"we narrow down all movies from the season we all rated 5 stars. Then we
                   each rank all of the 5 star movies and we will use a point system... lets
                   pretend there will be 10 movies we had at 5 stars. Then the movie we each
                   rank as the best so 1 out of 10, it gets 10 points per person, and 2nd
                   highest 9, and so on until 1 for 10th place. Most points wins."*
                   He added *"i am sure there is a name for this"* - there is: a BORDA COUNT.

       SLEEPER     *"each nominate which movie surprised and most exceeded our expectations.
                   Then we randomly choose one of those 4."*

     ✅ VERIFIED AGAINST SEASON 1, whose winners are known from Miriam's Movie Awards sheet:
        the Razzie rule picks The Jazz Singer, the single lowest average of 104 films at 1.375,
        and The Green Mile sits in the Best Picture shortlist with all four at 5. Both match.
        scripts/check_awards.py asserts it, so the rules are tested against a real answer rather
        than only against themselves.

     ⚠️ "All four rated 5" and "averages exactly 5" are the SAME SET in every season, because an
        average of 5 is only possible when all four gave a 5. So there was nothing to decide
        between the two readings, and that is worth knowing rather than guessing at.
  ------------------------------------------------------------------------------------------- */
  function seasonFilms(season) {
    return MOVIES.filter(function (m) {
      return String(m.s) === String(season) && m.st === "Watched" && m.r;
    });
  }

  function scoresOf(m) {
    var out = [];
    (m.r || []).forEach(function (v) {
      var n = parseFloat(v);
      if (!isNaN(n)) out.push(n);
    });
    return out;
  }

  function avgOf(m) {
    var got = scoresOf(m);
    return got.length ? mean(got) : null;
  }

  /** The Razzie: lowest group average in the season. Ties are returned as ties, never broken by
   *  picking the first one, because a tie is a real result the group should settle itself. */
  function razzie(season) {
    var rated = seasonFilms(season).filter(function (m) { return scoresOf(m).length; });
    if (!rated.length) return null;
    var scored = rated.map(function (m) { return { film: m, avg: avgOf(m) }; });
    scored.sort(function (a, b) { return a.avg - b.avg; });
    var low = scored[0].avg;
    return {
      avg: low,
      films: scored.filter(function (x) { return x.avg === low; })
                   .map(function (x) { return x.film; }),
      runnersUp: scored.slice(1, 6).filter(function (x) { return x.avg > low; })
    };
  }

  /** The Best Picture shortlist: every film in the season that ALL FOUR rated 5.
   *  🛑 A film nobody has finished rating cannot qualify, so a season still in progress can have
   *     its shortlist grow. `pending` says how many films are still unrated, and the page warns
   *     about it, because a ballot cast against a shortlist that later grows is not a ballot
   *     for the same contest. */
  function bestPictureShortlist(season) {
    var all = MOVIES.filter(function (m) { return String(m.s) === String(season); });
    var pending = all.filter(function (m) {
      return m.st !== "Watched" || !m.r || !scoresOf(m).length;
    });
    var short = all.filter(function (m) {
      if (m.st !== "Watched" || !m.r) return false;
      var got = scoresOf(m);
      return got.length === PEOPLE.length && got.every(function (n) { return n === 5; });
    });
    short.sort(function (a, b) { return a.t.localeCompare(b.t); });
    return { films: short, pending: pending.length, total: all.length };
  }

  function filmKey(t, y) { return norm(t) + "|" + (y || ""); }

  /**
   * The Borda count Joe described. `ballots` is { person: [filmKey, ...] } best first.
   * With N films on the shortlist, 1st place scores N and last place scores 1.
   *
   * 🛑 A ballot that does not cover exactly the current shortlist is IGNORED, and named in
   *    `stale`, rather than being counted partially. Half-counting a ballot would hand the award
   *    to whoever happened to rank the most films.
   */
  function borda(ballots, shortlist) {
    var keys = shortlist.map(function (m) { return filmKey(m.t, m.y); });
    var N = keys.length;
    var points = {}, firsts = {};
    keys.forEach(function (k) { points[k] = 0; firsts[k] = 0; });

    var counted = [], stale = [];
    Object.keys(ballots || {}).forEach(function (person) {
      var order = (ballots[person] || []).filter(function (k) { return keys.indexOf(k) > -1; });
      var unique = [];
      order.forEach(function (k) { if (unique.indexOf(k) === -1) unique.push(k); });
      if (unique.length !== N) { stale.push(person); return; }
      counted.push(person);
      unique.forEach(function (k, i) {
        points[k] += (N - i);
        if (i === 0) firsts[k]++;
      });
    });

    var table = shortlist.map(function (m) {
      var k = filmKey(m.t, m.y);
      return { film: m, points: points[k], firsts: firsts[k] };
    });
    // Points decide it. A tie on points is shown as a tie; first-place votes are displayed as
    // extra information, never used to break it, because Joe's rule says "most points wins".
    table.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      return a.film.t.localeCompare(b.film.t);
    });
    var top = table.length ? table[0].points : 0;
    return {
      table: table,
      counted: counted,
      stale: stale,
      complete: counted.length === PEOPLE.length,
      maxPoints: N * PEOPLE.length,
      winners: table.filter(function (r) { return r.points === top && top > 0; })
                    .map(function (r) { return r.film; })
    };
  }

  /**
   * The Sleeper. Each person nominates one film; one nomination is then drawn.
   *
   * ⚠️ JOE ASKED FOR A DECISION HERE: *"If a movie is nominated by 2+, then we needed to decide
   *    if it auto wins or if it just gets extra chance of winning."* The default below is EXTRA
   *    CHANCE, because it is what his own sentence already describes - *"we randomly choose one
   *    of those 4"* draws from four nominations, so a film nominated twice simply holds two of
   *    the four tickets. It keeps the draw he likes and still rewards agreement, and if all four
   *    name the same film it wins outright by arithmetic. Switch `autoWin` to true for the other
   *    rule; everything else is unchanged.
   */
  function sleeperTickets(nominations, autoWin) {
    var tickets = [];
    Object.keys(nominations || {}).forEach(function (person) {
      var n = nominations[person];
      if (n && n.key) tickets.push({ person: person, key: n.key, title: n.title, year: n.year });
    });
    var byFilm = {};
    tickets.forEach(function (t) {
      byFilm[t.key] = byFilm[t.key] || { key: t.key, title: t.title, year: t.year, who: [] };
      byFilm[t.key].who.push(t.person);
    });
    var films = Object.keys(byFilm).map(function (k) { return byFilm[k]; });
    films.sort(function (a, b) { return b.who.length - a.who.length; });

    var most = films.length ? films[0].who.length : 0;
    var auto = (autoWin && most > 1)
      ? films.filter(function (f) { return f.who.length === most; })
      : [];

    return {
      tickets: tickets,
      films: films.map(function (f) {
        return {
          key: f.key, title: f.title, year: f.year, who: f.who,
          tickets: autoWin ? (f.who.length === most ? 1 : 0) : f.who.length,
          chance: autoWin
            ? (f.who.length === most ? 1 / Math.max(1, auto.length) : 0)
            : f.who.length / Math.max(1, tickets.length)
        };
      }),
      autoWin: !!autoWin,
      autoWinners: auto,
      ready: tickets.length === PEOPLE.length
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

  /* ---------- the 1001 Movies list -----------------------------------------------------------
     Joe, 2026-11-11: "i still want to find the official list of books for the 1001 movies to
     watch before you die. so we can add it to the family movie site."

     🛑 ONE COPY. Both the family's own films and a film somebody types into search are
        labelled by the functions below. A second copy in a page would let the site answer
        "is this on the list" two different ways depending which page you were looking at.

     TWO WAYS TO MATCH, and the better one is used when it is available:
       1. BY IMDb ID. Exact, and it cannot confuse two films that share a title. Every film on
          the list has an ID as of 2026-11-11. Search gets an ID from TMDB through the Apps
          Script proxy, so this is the path for a film the family has not seen.
       2. BY TITLE AND YEAR, within one year, the same rule lookup() uses. This is the path for
          the family's own 356 films, which carry no IMDb ID. scripts/check_1001.py proves it
          returns exactly what the Python matcher returns, so the two cannot drift.

     🛑 A SHARED TITLE WITH A YEAR GAP OF MORE THAN ONE IS NOT A MATCH. The list holds
        Sunshine (1999, Szabo); the family watched Sunshine (2007, Boyle). Different films.
        That case is returned as `near` so a page can show the caution, and is never counted.

     `status` in data/1001_editions.csv says whether the BOOK can be proved to exist. It does
     NOT decide whether a film counts, because the roster is the same either way. Tier does.
  ----------------------------------------------------------------------------------------- */
  var K = window.FM_1001 || { meta: {}, films: [] };
  var K_MIN = 1000;                       // same idea as EXPECTED_MIN: a short file is a fault
  var kOk = (K.films || []).length >= K_MIN;
  var K_INDEX = {}, K_BY_ID = {};

  function kAdd(key, f) {
    if (!key) return;
    (K_INDEX[key] = K_INDEX[key] || []).push(f);
  }
  (K.films || []).forEach(function (f) {
    [f.t, f.o].concat(String(f.alt || "").split("|")).forEach(function (t) {
      t = String(t || "").trim();
      if (!t) return;
      kAdd(norm(t), f);
      kAdd(compact(t), f);
      kAdd(noart(t), f);
    });
    if (f.i) K_BY_ID[f.i] = f;
  });

  /** Which editions a film is in, as a sentence. Reads the shipped roster, hardcodes nothing. */
  function k1001Scope(f) {
    var n = (K.meta && K.meta.usEditions) || 0;
    if (f.u >= n && n) return "in all " + n + " numbered editions, so it was never dropped";
    if (f.u) return "in " + f.u + " of the " + n + " numbered editions";
    if (f.p) return "only in an in-between yearly reprint, not a numbered edition";
    return "only in a foreign national edition";
  }

  /** The 1001 entry for a film, or null.
   *
   *  Returns {film, by, scope, numbered, near} where `by` is "imdb" or "title", `numbered` is
   *  true when the film is in the site's default scope, and `near` holds same-title films whose
   *  year is too far off to count. A caller that ignores `near` loses the Sunshine warning.
   */
  function on1001(title, year, imdbId) {
    if (!kOk) return null;
    if (imdbId && K_BY_ID[imdbId]) {
      var f = K_BY_ID[imdbId];
      return { film: f, by: "imdb", scope: k1001Scope(f), numbered: !!f.u, near: [] };
    }
    var pool = [], seen = {};
    [norm(title), compact(title), noart(title)].forEach(function (k) {
      (K_INDEX[k] || []).forEach(function (f) {
        var id = f.i || (f.t + "|" + f.y);
        if (!seen[id]) { seen[id] = 1; pool.push(f); }
      });
    });
    if (!pool.length) return null;
    var y = parseInt(year, 10), hit = null;
    if (!isNaN(y)) {
      for (var i = 0; i < pool.length; i++) {
        var fy = parseInt(pool[i].y, 10);
        if (!isNaN(fy) && Math.abs(fy - y) <= 1) { hit = pool[i]; break; }
      }
    } else if (pool.length === 1) {
      hit = pool[0];
    }
    var near = pool.filter(function (f) { return f !== hit; });
    if (!hit) return { film: null, by: "title", scope: "", numbered: false, near: near };
    return { film: hit, by: "title", scope: k1001Scope(hit), numbered: !!hit.u, near: near };
  }

  /** The 1001 badge for a title, appended to `box`. Returns true when something was added. */
  function badge1001(box, title, year, imdbId) {
    var r = on1001(title, year, imdbId);
    if (!r) return false;
    if (!r.film) {
      // A film of this name IS on the list, but it is a different film. Say so plainly rather
      // than claiming a match or staying silent.
      var n = el("div", "k1001 k-near");
      n.appendChild(el("strong", null, "Not on the 1001 list."));
      n.appendChild(document.createTextNode(
        " A different film called " + r.near[0].t + " (" + r.near[0].y + ") is on it."));
      box.appendChild(n);
      return true;
    }
    var d = el("div", "k1001" + (r.numbered ? "" : " k-held"));
    d.appendChild(el("strong", null, "On the 1001 Movies list"));
    d.appendChild(document.createTextNode(" · " + r.scope));
    box.appendChild(d);
    return true;
  }

  /** How many of the family's own films are on the list, for the progress line. */
  function k1001Progress(films) {
    var list = films || MOVIES, on = 0, never = 0;
    list.forEach(function (m) {
      var r = on1001(m.t, m.y, m.i);
      if (r && r.film && r.film.u) {
        on++;
        if (r.film.all) never++;
      }
    });
    return {
      ok: kOk,
      on: on, never: never,
      total: (K.meta && K.meta.numbered) || 0,
      neverTotal: (K.meta && K.meta.neverDropped) || 0
    };
  }


  /* ==========================================================================================
     THE SEASON RANDOMIZER
     Joe's rules, settled 2026-11-15 from Season 4's own dated schedule (6/3/2025 to 9/15/2026).

       1. Shuffle the four of them into ONE rotation, which may never be identical to the
          previous season's. Season 4 was Juli, Kathy, Joe, Miriam.
       2. That one rotation drives everything: who owns each of the eight category blocks, the
          four weeks inside every block, and the Open Choice runs.
       3. Each person's two themes are assigned AT RANDOM to their first-half and second-half
          block. 🛑 Rank does NOT decide this. That was a guess written down as a fact and Joe
          corrected it: "WE NEVER CHOSE WHICH FIRST AND WHICH SECOND. IT WAS RANDOM ONCE OUT
          OUR ORDER WAS SET."
       4. Category films never move: each person's film for a category stays in that category
          and plays in rotation order.
       5. Each person's eight Open Choice films are shuffled across the eight Open Choice runs.
       6. Runs alternate, category then Open Choice, eight of each: 32 and 32, the fixed 64.

     🛑 BIRTHDAYS ARE NOT THIS FUNCTION'S JOB. It returns the 64 ordered slots and nothing else.
        buildSchedule() already reserves birthday nights against real dates and pushes the rest
        of the season back a week, which is exactly rule 6 of the spec. Teaching two pieces of
        code about birthdays is how they start to disagree.

     🛑 IT REFUSES RATHER THAN GUESSES. A missing theme, a missing film or a short Open Choice
        list stops the draw with a plain reason. A season order quietly built on incomplete
        picks would be discovered weeks later, by which point people have watched films.

     🛑 IT IS SEEDED, SO A DRAW IS REPRODUCIBLE. The same seed always yields the same season.
        That is what makes it checkable afterwards and testable at all, and it is the same
        reasoning as the Sleeper draw recording its ticket list.
     ======================================================================================== */

  /** mulberry32: a small, fast, well-behaved seeded generator. Not cryptography, and it does
   *  not need to be: this shuffles a family's film order. */
  function rngFrom(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Fisher-Yates, unbiased, using the supplied generator. Returns a new array. */
  function shuffled(list, rnd) {
    var out = (list || []).slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function sameOrder(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return false; }
    return true;
  }

  /**
   * Draw a season order.
   *
   * opts.people        four names. Defaults to PEOPLE.
   * opts.prevOrder     last season's rotation, which the new one may not match. Optional.
   * opts.themes        { person: [themeA, themeB] }, two per person.
   * opts.categoryFilms { theme: { person: {title, year} } }, one film per person per theme.
   * opts.openFilms     { person: [ {title, year} x8 ] }.
   * opts.seed          integer. Omit and one is taken from the clock.
   *
   * Returns { ok, error?, seed, rotation, blocks, slots, counts }.
   */
  function randomizeSeason(opts) {
    opts = opts || {};
    var people = opts.people || PEOPLE;
    var themes = opts.themes || {};
    var catFilms = opts.categoryFilms || {};
    var openFilms = opts.openFilms || {};

    function no(msg) { return { ok: false, error: msg }; }

    if (!people || people.length !== 4) return no("The randomizer expects four people.");

    // ---- refuse on anything incomplete, naming what is missing ----------------------------
    var missing = [];
    people.forEach(function (p) {
      var t = themes[p] || [];
      if (t.length !== 2) missing.push(p + " has " + t.length + " categories, not 2");
      var o = openFilms[p] || [];
      if (o.length !== 8) missing.push(p + " has " + o.length + " Open Choice films, not 8");
    });
    if (missing.length) return no("Not everyone is ready: " + missing.join("; ") + ".");

    var allThemes = [];
    people.forEach(function (p) { allThemes = allThemes.concat(themes[p]); });
    if (allThemes.length !== 8) return no("There should be 8 categories, found " + allThemes.length + ".");

    allThemes.forEach(function (th) {
      var row = catFilms[th] || {};
      people.forEach(function (p) {
        var f = row[p];
        if (!f || !f.title) missing.push(p + " has no film for " + th);
      });
    });
    if (missing.length) return no("Category films are incomplete: " + missing.join("; ") + ".");

    // ---- 1. the rotation, never identical to last season's --------------------------------
    var seed = (opts.seed === undefined || opts.seed === null)
      ? (Date.now() % 2147483647) : opts.seed;
    var rnd = rngFrom(seed);
    var rotation = shuffled(people, rnd);
    // 24 possible orders and at most one is barred, so this ends quickly. The cap exists so a
    // bad prevOrder can never spin forever.
    var guard = 0;
    while (sameOrder(rotation, opts.prevOrder) && guard < 200) {
      rotation = shuffled(people, rnd);
      guard++;
    }
    if (sameOrder(rotation, opts.prevOrder)) {
      return no("Could not find an order different from last season's.");
    }

    // ---- 2 and 3. the eight blocks ---------------------------------------------------------
    // Position in the rotation decides WHICH block a person owns in each half. Which of their
    // two themes lands in which half is a coin flip, per Joe.
    var blocks = [];
    rotation.forEach(function (p, i) {
      var pair = shuffled(themes[p], rnd);
      blocks[i] = { owner: p, theme: pair[0], half: 1, index: i + 1 };
      blocks[i + 4] = { owner: p, theme: pair[1], half: 2, index: i + 5 };
    });

    // ---- 5. each person's Open Choice films, shuffled across the eight runs ----------------
    var openByPerson = {};
    people.forEach(function (p) { openByPerson[p] = shuffled(openFilms[p], rnd); });

    // ---- 4 and 6. lay out the 64 slots -----------------------------------------------------
    var slots = [];
    for (var b = 0; b < 8; b++) {
      var blk = blocks[b];
      rotation.forEach(function (p) {
        var f = catFilms[blk.theme][p];
        slots.push({
          n: slots.length + 1, person: p, kind: "Dealer's Choice",
          theme: blk.theme, owner: blk.owner, block: blk.index,
          title: f.title, year: f.year
        });
      });
      rotation.forEach(function (p) {
        var f = openByPerson[p][b];
        slots.push({
          n: slots.length + 1, person: p, kind: "Open Choice",
          theme: "", owner: "", run: b + 1,
          title: f.title, year: f.year
        });
      });
    }

    return {
      ok: true,
      seed: seed,
      rotation: rotation,
      blocks: blocks,
      slots: slots,
      counts: {
        total: slots.length,
        dealer: slots.filter(function (s) { return s.kind === "Dealer's Choice"; }).length,
        open: slots.filter(function (s) { return s.kind === "Open Choice"; }).length
      }
    };
  }


  /* ==========================================================================================
     THE SITE'S OWN NAVIGATION - THE ONE COPY

     🛑 ONE COPY, for the same reason lib.js holds the only title matcher and theme.css the only
        palette. Seven pages each hand-listing the other six is 42 links to keep in step, and
        the failure is silent: a page simply stops being reachable from somewhere.

     Found 2026-11-15, the day before the family were emailed the link: index.html, the ONE page
     we know they will open, carried a single link (to search). Everything else on the site was
     undiscoverable from the page they land on.

     Each entry says what the page IS, in one short line, because a menu of bare names does not
     tell someone who has never seen the site what any of it does. Joe: *"make it intuitive,
     clear what the site offers and how to get to each spot but never too wordy."*
     ======================================================================================== */
  var HUB = [
    { f: "index.html",         t: "Submit categories",
      d: "Name the categories you want for next season" },
    { f: "picks.html",         t: "Submit movie picks",
      d: "Choose your films once the categories are set" },
    /* 🛑 "Have we watched it?" was 19 characters and WRAPPED to a second line on Joe's phone,
       2026-11-16, while "Submit movie picks" at 18 sat on one. The page's own <h1> keeps the
       full question; only the MENU label is shortened. check_hub.py now caps every label at 18,
       because a label nobody measures is a label that wraps on the next one somebody adds. */
    { f: "search.html",        t: "Search movies",
      d: "Look up any film and see all four of our ratings" },
    { f: "schedule.html",      t: "Schedule",
      d: "Who picks which week, birthdays included" },
    { f: "season-stats.html",  t: "Season stats",
      d: "How every season turned out, one by one" },
    { f: "season-awards.html", t: "Season awards",
      d: "Best Picture, the Razzie and the Sleeper" },
    { f: "trivia.html",        t: "Trivia",
      d: "Questions to read out on movie night" },
    { f: "find.html",          t: "Find a movie",
      d: "Find films by genre, year or length to suggest" },
    { f: "randomize.html",     t: "Shuffle season",
      d: "Deal out the season once everyone has submitted" },
    /* 🛑 THE ONE WIDE ENTRY. Joe asked for the book's real title on the button, 2026-11-16, and
       asked for the button to be long enough to hold it. 39 characters cannot share a row with
       anything, so `w` makes this one span the whole row and the 18-character cap skips it.
       Every other label stays capped, because that cap was measured on his actual phone. */
    { f: "1001.html",          t: "1001 Movies You Must See Before You Die", w: 1,
      d: "The book's list, and how much of it we have seen" }
  ];

  /**
   * Draw the hub into `host` (an element or an id), leaving out the page you are already on.
   * Returns how many links were drawn, which is what the test asserts against.
   */
  function hub(host, current) {
    var box = (typeof host === "string") ? $(host) : host;
    if (!box) return 0;
    box.textContent = "";

    var head = el("p", "fm-hub-head", "The rest of the site");
    box.appendChild(head);

    var grid = el("div", "fm-hub-grid");
    var n = 0;
    HUB.forEach(function (item) {
      if (current && item.f === current) return;      // never link a page to itself
      var a = el("a", "fm-hub-card");
      a.href = item.f;
      a.appendChild(el("span", "fm-hub-t", item.t));
      a.appendChild(el("span", "fm-hub-d", item.d));
      grid.appendChild(a);
      n++;
    });
    box.appendChild(grid);
    return n;
  }

  /* ==========================================================================================
     HOW ONE SEASON TURNED OUT

     The existing "How we rate" view answers a different question: how each PERSON rates across
     everything, for all time. This answers how a SEASON went.

     🛑 A BLANK RATING IS NEVER A ZERO, here as everywhere. A person's season average is taken
        over the films THEY rated, and the group average over the films that HAVE a rating. A
        season still being watched is reported as partly rated rather than quietly averaged.

     🛑 A SEASON WITH NOTHING IN IT STILL GETS AN ANSWER, with zeroes and empty lists, so the
        page can give it a line that says so. Joe's rule: an empty group still needs a line.
     ======================================================================================== */
  /* The page links across the TOP of every page, drawn from the SAME HUB list as the cards at
     the bottom. 🛑 Before 2026-11-15 each page hand-wrote this row and FOUR OF THEM HAD ALREADY
     GONE STALE: not one of them listed season-stats.html, and season-awards.html had also lost
     index.html. Nothing failed and nothing warned, because a hand-written menu cannot notice a
     page it was never told about. One list, two renderings, and a test proves both. */
  function topnav(host, current) {
    var box = (typeof host === "string") ? $(host) : host;
    if (!box) return 0;
    box.textContent = "";
    var n = 0;
    HUB.forEach(function (item) {
      if (current && item.f === current) return;      // never link a page to itself
      var a = el("a", item.w ? "wide" : null, item.t);
      a.href = item.f;
      box.appendChild(a);
      n++;
    });
    return n;
  }

  function seasonStats(season) {
    var all = MOVIES.filter(function (m) { return String(m.s) === String(season); });
    var watched = all.filter(function (m) { return m.st === "Watched"; });
    var rated = watched.filter(function (m) { return m.r && scoresOf(m).length; });

    var people = PEOPLE.map(function (p, i) {
      var mine = [];
      rated.forEach(function (m) {
        var n = num(m.r[i]);
        if (n !== null) mine.push(n);
      });
      return { person: p, rated: mine.length, avg: mean(mine) };
    });

    var scored = rated.map(function (m) { return { film: m, avg: avgOf(m) }; });
    scored.sort(function (a, b) { return b.avg - a.avg; });

    // Ties are returned as ties. Two films really can share the season's best average, and
    // picking whichever sorted first would invent a winner that the ratings do not name.
    var top = [], low = [];
    if (scored.length) {
      var hi = scored[0].avg, lo = scored[scored.length - 1].avg;
      top = scored.filter(function (x) { return x.avg === hi; });
      low = scored.filter(function (x) { return x.avg === lo; });
    }

    var cats = ((window.FM_THEMES) || []).filter(function (t) {
      return String(t.s) === String(season);
    });

    return {
      season: String(season),
      total: all.length,
      watched: watched.length,
      rated: rated.length,
      unrated: watched.length - rated.length,
      groupAvg: mean(scored.map(function (x) { return x.avg; })),
      people: people,
      top: top,
      low: low,
      unanimous: bestPictureShortlist(season).films.length,
      categories: cats,
      k1001: k1001Progress(rated)
    };
  }

  /** Every season label in the data, in order, with "Outside" left out. */
  function seasonList() {
    var out = [];
    MOVIES.forEach(function (m) {
      var s = String(m.s);
      if (s !== "Outside" && out.indexOf(s) === -1) out.push(s);
    });
    out.sort(function (a, b) { return (+a) - (+b); });
    return out;
  }

  return {
    MOVIES: MOVIES, IMG: IMG, dataOk: dataOk, requireData: requireData,
    K1001: K, k1001Ok: kOk, on1001: on1001, badge1001: badge1001,
    k1001Progress: k1001Progress, k1001Scope: k1001Scope,
    parseDay: parseDay, dayKey: dayKey, addDays: addDays, sameDay: sameDay,
    easter: easter, thanksgiving: thanksgiving, holidaysBetween: holidaysBetween,
    readAdjustments: readAdjustments, buildSchedule: buildSchedule,
    eligibleBirthdays: eligibleBirthdays, placeholderSeason: placeholderSeason,
    applyLive: applyLive, syncLive: syncLive,
    razzie: razzie, bestPictureShortlist: bestPictureShortlist, borda: borda,
    randomizeSeason: randomizeSeason, rngFrom: rngFrom, shuffled: shuffled,
    hub: hub, topnav: topnav, HUB: HUB, seasonStats: seasonStats, seasonList: seasonList,
    sleeperTickets: sleeperTickets, filmKey: filmKey, avgOf: avgOf, seasonFilms: seasonFilms,
    nearestNight: nearestNight, birthdayNights: birthdayNights,
    birthdaysFor: birthdaysFor, niceDate: niceDate,
    $: $, el: el,
    norm: norm, compact: compact, noart: noart,
    lookup: lookup, seasonName: seasonName,
    tag: tag, letterboxd: letterboxd, poster: poster, posterFor: posterFor,
    verdict: verdict,
    PEOPLE: PEOPLE, ratings: ratings, careerStats: careerStats,
    tmdb: tmdb, liveSearch: liveSearch,
    GENRES: GENRES, genreName: genreName, discover: discover,
    askAction: askAction, similar: similar, person: person, credits: credits,
    filterFilms: filterFilms, orderState: orderState, applyTrades: applyTrades
  };
})();
