/* Family Movies site configuration.
 *
 * This is the ONE file to edit when something changes. The pages read it, so nothing else has to
 * be touched.
 *
 * endpoint: the Apps Script web app URL, ending in /exec. Paste it between the quotes.
 *           While it is empty the page still works for filling in and checking themes, but says
 *           plainly that saving is not switched on yet. It never pretends a submission was saved.
 * season:   the label stored with every submission, and shown in the page heading.
 * due:      the deadline shown on the page. ISO date, or empty to hide it.
 */
window.FM_CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfycbz3AWj7YSsOYhp3DLGvLr-Vv1gaZDl6G1MFY0XJIb5P3IFjmqT9_xfznT_fgRYxFqcr/exec",
  season: "Season 5",
  /* -------------------------------------------------------------------------------------
     THE TWO DATES THE FAMILY SEES: `due` here, and `seasonStart` below.

     🛑 CHANGE THEM WITH THE SCRIPT, NOT BY HAND:

         python scripts/shift_dates.py 1        push everything back one week
         python scripts/shift_dates.py -1       pull it a week forward
         python scripts/shift_dates.py --due 2026-12-08 --start 2026-12-15
         python scripts/shift_dates.py --show   print what is set now, change nothing

     It keeps the weekday, REFUSES a pair that breaks the schedule rules, runs the suite,
     puts the old file back if the suite fails, prints the sentence the family will read,
     and adds one line to the log below. Add --deploy to ship it in the same command.

     🔑 BOTH PAGES READ THESE AND NEITHER FORMATS THEM. index.html and picks.html
     call FM.dueText and FM.startText in lib.js, so the two pages cannot name different
     days. Nothing else in the project holds either date, `Code.gs` included, which is why
     a date change has never needed an Apps Script redeploy and never will.

     ⚠ THE DEADLINE IS NOT ALWAYS A SUNDAY. It was one three times running and then was
     not. Nothing may assume a weekday for it; the suite checks it against `seasonStart`.

     DATE HISTORY, newest first. One line each, nothing dropped.
       2026-11-17  due 11/29 -> 12/8. LOCKED by Joe: the categories and the movie picks now
                   share one date, and picks.html began showing it the same day, having
                   never shown a date at all. seasonStart unchanged. First deadline that is
                   not a Sunday.
       2026-11-16  due 11/22 -> 11/29, start 12/8 -> 12/15. Joe: "pushed back one more week
                   in our schedule."
       2026-11-14  due 11/15 -> 11/22, start 12/1 -> 12/8. Joe: "we pushed everything back
                   1 week due to mom being sick." (The comment this log replaces dated this
                   11/15; the commit is 11/14. git is the authority.)
       2026-11-12  due 11/1 -> 11/15. The original 11/1 deadline had passed with nobody
                   having submitted anything, because the link had not gone out yet.
  ------------------------------------------------------------------------------------- */
  due: "2026-12-08",
  themesPerPerson: 2,

  /* Birthday movie nights are worked out from these.
   *   seasonStart  first movie of the season, ISO date
   *   movieNight   0 = Sunday, 2 = Tuesday. 🛑 The DEFAULT only. Joe, 2026-10-22: the night
   *                sometimes moves to Wednesday for months, or for a single week. When the
   *                schedule feature exists it will override this; nothing may hardcode Tuesday.
   *   weeks        roughly how long the season runs, used only to decide which birthdays fall
   *                inside it. Approximate on purpose: skipped weeks push the real end later.
   *   birthdays    month and day. Joe 10/16, Juli 10/13, Miriam 2/3, Kathy 3/29.
   */
  // Moves WITH `due` when shift_dates.py pushes a week, and keeps its weekday by
  // construction. The history for both dates is the one log above; it settles what the
  // records had carried as "most likely" since Joe's note of 2026-11-10.
  seasonStart: "2026-12-15",
  movieNight: 2,
  weeks: 70,
  birthdays: { Joe: [10, 16], Juli: [10, 13], Miriam: [2, 3], Kathy: [3, 29] }
};
