# Family Movie Night

The submission site for our weekly family movie night. No accounts, no logins, works on a phone.

**Live site:** https://joenorwood77.github.io/family-movie-night/

## What is here

| File | What it does |
|---|---|
| `index.html` | The theme submission page. Checks every idea against the themes we have already used. |
| `config.js` | The only file that normally needs editing: the Apps Script URL, the season label, the deadline. |
| `themes.js` | Generated. The 28 themes used in Seasons 1 to 4. |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are. |

## Source of truth

This repo is **generated output**. The real project, with the season data and the build scripts,
lives outside it. Do not hand-edit `themes.js` here; it is rebuilt from the season data by
`scripts/build_site.py` in the main project and overwritten on the next push.

## Switching on saving

The page is usable the moment it loads, but the Submit button cannot save anything until
`config.js` has the Apps Script web app URL. Until then the page says so plainly rather than
pretending a submission went through.

## What is deliberately not here

No API keys, and no ratings. This repo is public, so nothing private belongs in it.
