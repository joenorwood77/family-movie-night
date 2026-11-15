# Family Movie Night

The website for our weekly family movie night. **No accounts, no logins, nothing to install, and
it is built for a phone.**

**Live site:** https://joenorwood77.github.io/family-movie-night/

Four of us have watched a film together almost every week since 31 October 2020. This site is
where we choose what comes next, look up whether we have already seen something, and settle the
end-of-season awards.

## The six pages

| Page | What it does |
|---|---|
| `index.html` | Submit your categories for the coming season. Checks each idea against every category we have already used, and against what the others have sent, without revealing whose. |
| `picks.html` | Choose your films, change one later, and see everything already claimed this season. Also lists films we have all seen but never together. |
| `search.html` | Search any film and find out whether we have watched it, what we each rated it, and whether it is on the 1001 Movies list. Browse the whole history too. |
| `schedule.html` | Every movie night on the calendar: who picked each film, holidays, cancelled weeks, and a different night for a stretch. |
| `trivia.html` | A trivia board per film. Paste it in, star the good ones, keep notes. |
| `season-awards.html` | The three season awards: Best Picture, the Razzie and the Sleeper. |

## The three awards

- **Best Picture.** Every film all four of us rated 5 makes the shortlist. We each rank the whole
  shortlist, first place scoring as many points as there are films and last place scoring 1.
  Most points wins.
- **Razzie.** The lowest group average of the season. Nobody votes; it is worked out from the
  ratings.
- **Sleeper.** We each nominate the film that most exceeded our expectations, then one of the
  four nominations is drawn at random. The draw happens once and is recorded with the full list
  it drew from.

## Our ratings are published here, on purpose

Every film carries what each of us gave it and the group average, alongside IMDb and the Rotten
Tomatoes critics score for comparison. That was a deliberate choice, not an oversight.

**There are no star icons anywhere**, by decision: a half-filled star still reads as five stars
at phone size, so everything is shown as a number.

**Letterboxd is deliberately empty.** There is no API we are allowed to use, so rather than
invent an average, every film links out to its Letterboxd page.

## How it is built

This repo is **generated output**. The season data and the build scripts live in a separate
project that is not public.

- **Generated, never edit here:** `movies.js`, `themes.js`, `awards.js`, `aliases.js`,
  `thousand.js`, `extras.js`.
- **Hand-written:** the six pages, `lib.js`, `theme.css`, `config.js`.
- `config.js` is the only file that normally changes: the backend URL, the season label, the
  deadline shown on the page, and the night of the week.
- `.nojekyll` tells GitHub Pages to serve the files exactly as they are.

Every deploy runs the full test suite first, proves no secret appears in any published file, and
then checks that each published file actually serves and matches the source byte for byte.

## What is deliberately not here

**No API keys, no email addresses, and nothing private.** This repo is public. The movie database
lookups go through a small Google Apps Script so the key never reaches the browser, and the
spreadsheet behind the ratings is private and is only ever read, never written to.
